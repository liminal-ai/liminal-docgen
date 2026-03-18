import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  err,
  generateDocumentation,
  getDocumentationStatus,
  type ModuleGenerationResult,
  type ModulePlan,
  type OverviewGenerationResult,
  ok,
  type RepositoryAnalysis,
} from "../../src/index.js";
import {
  createMockSDK,
  type MockSDKConfig,
} from "../helpers/agent-sdk-mock.js";
import { DOCS_OUTPUT } from "../helpers/fixtures.js";
import { TEST_INFERENCE_CONFIGURATION } from "../helpers/inference.js";
import { createGitFixtureRepo } from "../helpers/story5-fixtures.js";

const mockCreateAgentSDKAdapter = vi.hoisted(() => vi.fn());
const mockAnalyzeRepository = vi.hoisted(() => vi.fn());
const mockCheckEnvironment = vi.hoisted(() => vi.fn());
const mockGetHeadCommitHash = vi.hoisted(() => vi.fn());

vi.mock("../../src/inference/runtime.js", () => ({
  createInferenceRuntime: mockCreateAgentSDKAdapter,
}));

vi.mock("../../src/analysis/analyze.js", () => ({
  analyzeRepository: mockAnalyzeRepository,
}));

vi.mock("../../src/environment/check.js", () => ({
  checkEnvironment: mockCheckEnvironment,
}));

vi.mock("../../src/adapters/git.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/adapters/git.js")>();

  return {
    ...actual,
    getHeadCommitHash: mockGetHeadCommitHash,
  };
});

const FIXTURE_BASE_URL = new URL("../fixtures/agent-sdk/", import.meta.url);

const loadJsonFixture = <T>(fileName: string): T =>
  JSON.parse(readFileSync(new URL(fileName, FIXTURE_BASE_URL), "utf8")) as T;

const CLUSTERING_PLAN = loadJsonFixture<ModulePlan>(
  "clustering-3-modules.json",
);
const MODULE_PAGE = loadJsonFixture<ModuleGenerationResult>(
  "module-gen-api.json",
);
const OVERVIEW_PAGE = loadJsonFixture<OverviewGenerationResult>(
  "overview-success.json",
);

const buildAnalysis = (
  repoPath: string,
  plan: ModulePlan = CLUSTERING_PLAN,
): RepositoryAnalysis => {
  const componentPaths = [
    ...plan.modules.flatMap((module) => module.components),
    ...plan.unmappedComponents,
  ];

  return {
    commitHash: "0123456789abcdef0123456789abcdef01234567",
    components: Object.fromEntries(
      componentPaths.map((filePath, index) => [
        filePath,
        {
          exportedSymbols: [
            {
              kind: "function",
              lineNumber: index + 1,
              name: `symbol${index + 1}`,
            },
          ],
          filePath,
          language: "typescript",
          linesOfCode: 10 + index,
        },
      ]),
    ),
    focusDirs: ["src"],
    relationships: [],
    repoPath,
    summary: {
      languagesFound: ["typescript"],
      languagesSkipped: [],
      totalComponents: componentPaths.length,
      totalFilesAnalyzed: componentPaths.length,
      totalRelationships: 0,
    },
  };
};

const setupPipelineMocks = (
  repoPath: string,
  {
    analysis = buildAnalysis(repoPath),
    sdkConfig = {},
  }: {
    analysis?: RepositoryAnalysis;
    sdkConfig?: MockSDKConfig;
  } = {},
): void => {
  const sdkAdapter = createMockSDK({
    clustering: {
      output: CLUSTERING_PLAN,
      usage: { inputTokens: 900, outputTokens: 350 },
    },
    moduleGeneration: CLUSTERING_PLAN.modules.map(() => ({
      output: MODULE_PAGE,
      usage: { inputTokens: 700, outputTokens: 300 },
    })),
    overview: {
      output: OVERVIEW_PAGE,
      usage: { inputTokens: 400, outputTokens: 160 },
    },
    qualityReview: {
      output: [],
      usage: { inputTokens: 200, outputTokens: 80 },
    },
    ...sdkConfig,
  });

  mockCreateAgentSDKAdapter.mockReturnValue(sdkAdapter);
  mockCheckEnvironment.mockResolvedValue(
    ok({
      detectedLanguages: ["typescript"],
      findings: [],
      passed: true,
    }),
  );
  mockAnalyzeRepository.mockImplementation(async (options) =>
    ok({
      ...analysis,
      repoPath: options.repoPath,
    }),
  );
};

const expectFailure = (
  result: Awaited<ReturnType<typeof generateDocumentation>>,
) => {
  expect(result.success).toBe(false);

  if (result.success) {
    throw new Error("Expected generation to fail");
  }

  return result;
};

afterEach(() => {
  vi.restoreAllMocks();
  mockCreateAgentSDKAdapter.mockReset();
  mockAnalyzeRepository.mockReset();
  mockCheckEnvironment.mockReset();
  mockGetHeadCommitHash.mockReset();
});

describe("Story 6 SDK failure verification", () => {
  it("TC-6.1a: SDK error for nonexistent path returns PATH_ERROR", async () => {
    const nonexistentPath = "/nonexistent-repo-path";
    mockCheckEnvironment.mockResolvedValue(
      ok({
        detectedLanguages: [],
        findings: [
          {
            category: "invalid-path",
            message: `Path does not exist or is not a directory: ${nonexistentPath}`,
            path: nonexistentPath,
            severity: "error",
          },
        ],
        passed: false,
      }),
    );

    const result = expectFailure(
      await generateDocumentation({
        inference: TEST_INFERENCE_CONFIGURATION,
        mode: "full",
        repoPath: nonexistentPath,
      }),
    );

    expect(result.failedStage).toBe("checking-environment");
    expect(result.error.code).toBe("PATH_ERROR");
    expect(result.error.message).toBe(
      `Path does not exist or is not a directory: ${nonexistentPath}`,
    );
    expect(mockCreateAgentSDKAdapter).not.toHaveBeenCalled();
    expect(mockAnalyzeRepository).not.toHaveBeenCalled();
  });

  it("TC-6.2a: failed stage identified for analysis failure", async () => {
    const fixture = createGitFixtureRepo();

    try {
      setupPipelineMocks(fixture.repoPath);
      mockAnalyzeRepository.mockResolvedValue(
        err("ANALYSIS_ERROR", "Structural analysis crashed"),
      );

      const result = expectFailure(
        await generateDocumentation({
          inference: TEST_INFERENCE_CONFIGURATION,
          mode: "full",
          repoPath: fixture.repoPath,
        }),
      );

      expect(result.failedStage).toBe("analyzing-structure");
      expect(result.error.code).toBe("ANALYSIS_ERROR");
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-6.2c: update missing module plan suggests full generation recovery", async () => {
    const fixture = createGitFixtureRepo();

    try {
      setupPipelineMocks(fixture.repoPath);

      const result = expectFailure(
        await generateDocumentation({
          inference: TEST_INFERENCE_CONFIGURATION,
          mode: "update",
          outputPath: DOCS_OUTPUT.missingModulePlan,
          repoPath: fixture.repoPath,
        }),
      );

      expect(result.error.code).toBe("METADATA_ERROR");
      expect(result.error.message).toContain("Run full generation");
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-6.3a: failed generation leaves no metadata file", async () => {
    const fixture = createGitFixtureRepo();

    try {
      setupPipelineMocks(fixture.repoPath, {
        sdkConfig: {
          callOverrides: {
            1: {
              code: "ORCHESTRATION_ERROR",
              message: "Module generation failed",
            },
          },
        },
      });

      const result = expectFailure(
        await generateDocumentation({
          inference: TEST_INFERENCE_CONFIGURATION,
          mode: "full",
          repoPath: fixture.repoPath,
        }),
      );

      expect(result.failedStage).toBe("generating-module");
      expect(
        existsSync(path.join(fixture.repoPath, "docs/wiki", ".doc-meta.json")),
      ).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-6.3b/TC-6.3c: status preserves prior metadata on update failure and returns not_generated after first failed run", async () => {
    const updateFixture = createGitFixtureRepo();
    const firstRunFixture = createGitFixtureRepo();

    try {
      const outputPath = path.join(updateFixture.repoPath, "docs/wiki");
      mkdirSync(path.dirname(outputPath), { recursive: true });
      cpSync(DOCS_OUTPUT.valid, outputPath, { recursive: true });

      const metadataPath = path.join(outputPath, ".doc-meta.json");
      const priorMetadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
        commitHash: string;
        generatedAt: string;
      };
      priorMetadata.commitHash = updateFixture.commitHash;
      writeFileSync(
        metadataPath,
        `${JSON.stringify(priorMetadata, null, 2)}\n`,
        "utf8",
      );

      setupPipelineMocks(updateFixture.repoPath);
      mockGetHeadCommitHash.mockResolvedValue(updateFixture.commitHash);
      mockAnalyzeRepository.mockResolvedValue(
        err("ANALYSIS_ERROR", "Analysis failed during update"),
      );

      expectFailure(
        await generateDocumentation({
          inference: TEST_INFERENCE_CONFIGURATION,
          mode: "update",
          repoPath: updateFixture.repoPath,
        }),
      );

      const preservedStatus = await getDocumentationStatus({
        repoPath: updateFixture.repoPath,
      });
      expect(preservedStatus.ok).toBe(true);

      if (!preservedStatus.ok) {
        throw new Error(preservedStatus.error.message);
      }

      expect(preservedStatus.value.lastGeneratedCommitHash).toBe(
        updateFixture.commitHash,
      );
      expect(preservedStatus.value.lastGeneratedAt).toBe(
        priorMetadata.generatedAt,
      );

      setupPipelineMocks(firstRunFixture.repoPath);
      mockAnalyzeRepository.mockResolvedValue(
        err("ANALYSIS_ERROR", "Initial generation failed"),
      );

      expectFailure(
        await generateDocumentation({
          inference: TEST_INFERENCE_CONFIGURATION,
          mode: "full",
          repoPath: firstRunFixture.repoPath,
        }),
      );

      const firstFailureStatus = await getDocumentationStatus({
        repoPath: firstRunFixture.repoPath,
      });
      expect(firstFailureStatus.ok).toBe(true);

      if (!firstFailureStatus.ok) {
        throw new Error(firstFailureStatus.error.message);
      }

      expect(firstFailureStatus.value.state).toBe("not_generated");
    } finally {
      updateFixture.cleanup();
      firstRunFixture.cleanup();
    }
  });
});
