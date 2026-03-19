import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import * as sdk from "../../src/index.js";
import {
  type AnalysisOptions,
  analyzeRepository,
  checkEnvironment,
  type DocumentationProgressEvent,
  type DocumentationRunRequest,
  type DocumentationRunResult,
  type DocumentationStage,
  type DocumentationStatus,
  type DocumentationStatusRequest,
  type EngineError,
  type EnvironmentCheckRequest,
  err,
  generateDocumentation,
  getDocumentationStatus,
  type ModuleGenerationResult,
  type ModulePlan,
  type OverviewGenerationResult,
  ok,
  type PublishRequest,
  type PublishResult,
  publishDocumentation,
  type RepositoryAnalysis,
  type ValidationRequest,
  type ValidationResult,
  validateDocumentation,
} from "../../src/index.js";
import {
  createMockSDK,
  type MockSDKConfig,
} from "../helpers/agent-sdk-mock.js";
import { DOCS_OUTPUT, REPOS } from "../helpers/fixtures.js";
import { TEST_INFERENCE_CONFIGURATION } from "../helpers/inference.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

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
const VALID_FIXTURE_COMMIT_HASH = "1111111111111111111111111111111111111111";
const STALE_FIXTURE_COMMIT_HASH = "def456def456def456def456def456def456def4";
const DOCUMENTATION_STAGES: DocumentationStage[] = [
  "resolving-configuration",
  "checking-environment",
  "analyzing-structure",
  "computing-changes",
  "planning-modules",
  "generating-module",
  "generating-overview",
  "writing-module-tree",
  "validating-output",
  "quality-review",
  "writing-metadata",
  "complete",
  "failed",
];

const tempDirs: string[] = [];

const loadJsonFixture = <T>(fileName: string): T =>
  JSON.parse(readFileSync(new URL(fileName, FIXTURE_BASE_URL), "utf8")) as T;

const CLUSTERING_PLAN = loadJsonFixture<ModulePlan>(
  "clustering-3-modules.json",
);
const CORE_PAGE = loadJsonFixture<ModuleGenerationResult>(
  "module-gen-core.json",
);
const API_PAGE = loadJsonFixture<ModuleGenerationResult>("module-gen-api.json");
const UTILS_PAGE = loadJsonFixture<ModuleGenerationResult>(
  "module-gen-utils.json",
);
const OVERVIEW_PAGE = loadJsonFixture<OverviewGenerationResult>(
  "overview-success.json",
);
const FIVE_MODULE_PLAN: ModulePlan = {
  modules: Array.from({ length: 5 }, (_, index) => ({
    components: [`src/module-${index + 1}/index.ts`],
    description: `Module ${index + 1} description`,
    name: `module-${index + 1}`,
  })),
  unmappedComponents: [],
};

const buildAnalysis = (
  plan: ModulePlan = CLUSTERING_PLAN,
  overrides: Partial<RepositoryAnalysis> = {},
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
          language: filePath.endsWith(".py") ? "python" : "typescript",
          linesOfCode: (index + 1) * 10,
        },
      ]),
    ),
    focusDirs: ["src/config", "src/analysis"],
    relationships: [
      {
        source: "src/index.ts",
        target: "src/adapters/git.ts",
        type: "import",
      },
      {
        source: "src/config/resolver.ts",
        target: "src/types/common.ts",
        type: "usage",
      },
      {
        source: "src/adapters/git.ts",
        target: "src/types/common.ts",
        type: "usage",
      },
    ],
    repoPath: overrides.repoPath ?? "/tmp/liminal-docgen",
    summary: {
      languagesFound: ["typescript"],
      languagesSkipped: [],
      totalComponents: componentPaths.length,
      totalFilesAnalyzed: componentPaths.length,
      totalRelationships: 3,
    },
    ...overrides,
  };
};

const buildModulePage = (
  moduleName: string,
  title: string = moduleName,
): ModuleGenerationResult => ({
  crossLinks: [],
  pageContent: `# ${title}\n\nDocumentation for ${moduleName}.\n`,
  title,
});

const createRepo = (): string => {
  const repoPath = createTempDir();
  tempDirs.push(repoPath);
  return repoPath;
};

const setupPipelineMocks = (
  repoPath: string,
  {
    analysis = buildAnalysis(CLUSTERING_PLAN, { repoPath }),
    sdkConfig = {},
  }: {
    analysis?: RepositoryAnalysis;
    sdkConfig?: MockSDKConfig;
  } = {},
): void => {
  const sdkAdapter = createMockSDK({
    clustering: {
      output: CLUSTERING_PLAN,
      usage: { inputTokens: 1000, outputTokens: 400 },
    },
    moduleGeneration: [
      { output: API_PAGE, usage: { inputTokens: 1200, outputTokens: 700 } },
      { output: CORE_PAGE, usage: { inputTokens: 1400, outputTokens: 900 } },
      { output: UTILS_PAGE, usage: { inputTokens: 1100, outputTokens: 650 } },
    ],
    overview: {
      output: OVERVIEW_PAGE,
      usage: { inputTokens: 900, outputTokens: 500 },
    },
    qualityReview: {
      output: [],
      usage: { inputTokens: 300, outputTokens: 120 },
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

const expectSuccess = (
  result: Awaited<ReturnType<typeof generateDocumentation>>,
) => {
  expect(result.status).not.toBe("failure");

  if (result.status === "failure") {
    throw new Error(
      `Expected success but received ${result.error?.code}: ${result.error?.message}`,
    );
  }

  return result;
};

const expectFailure = (
  result: Awaited<ReturnType<typeof generateDocumentation>>,
) => {
  expect(result.status).toBe("failure");

  if (result.status !== "failure") {
    throw new Error("Expected generation to fail");
  }

  return result;
};

const expectStatus = (
  result: Awaited<ReturnType<typeof getDocumentationStatus>>,
): DocumentationStatus => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(
      `Expected status query to succeed: ${result.error.message}`,
    );
  }

  return result.value;
};

afterEach(() => {
  vi.restoreAllMocks();
  mockCreateAgentSDKAdapter.mockReset();
  mockAnalyzeRepository.mockReset();
  mockCheckEnvironment.mockReset();
  mockGetHeadCommitHash.mockReset();

  for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
    cleanupTempDir(tempDir);
  }
});

describe("public SDK integration contract", () => {
  it("TC-3.1a: operations importable", () => {
    expect(checkEnvironment).toBeTypeOf("function");
    expect(analyzeRepository).toBeTypeOf("function");
    expect(generateDocumentation).toBeTypeOf("function");
    expect(getDocumentationStatus).toBeTypeOf("function");
    expect(validateDocumentation).toBeTypeOf("function");
    expect(publishDocumentation).toBeTypeOf("function");
  });

  it("TC-5.2a: all operations importable from package entry point", () => {
    expect(sdk).toMatchObject({
      analyzeRepository: expect.any(Function),
      checkEnvironment: expect.any(Function),
      generateDocumentation: expect.any(Function),
      getDocumentationStatus: expect.any(Function),
      publishDocumentation: expect.any(Function),
      validateDocumentation: expect.any(Function),
    });
  });

  it("TC-3.1b: types importable", () => {
    const environmentRequest: EnvironmentCheckRequest = {
      repoPath: REPOS.validTs,
    };
    const analysisOptions: AnalysisOptions = {
      repoPath: REPOS.validTs,
    };
    const runRequest: DocumentationRunRequest = {
      inference: TEST_INFERENCE_CONFIGURATION,
      mode: "full",
      repoPath: REPOS.validTs,
    };
    const progressEvent: DocumentationProgressEvent = {
      runId: "run-1",
      stage: "complete",
      timestamp: "2026-03-16T12:00:00.000Z",
    };
    const statusRequest: DocumentationStatusRequest = {
      repoPath: REPOS.validTs,
    };
    const status: DocumentationStatus = {
      currentHeadCommitHash: null,
      lastGeneratedAt: null,
      lastGeneratedCommitHash: null,
      outputPath: "docs/wiki",
      state: "not_generated",
    };
    const validationRequest: ValidationRequest = {
      outputPath: DOCS_OUTPUT.valid,
    };
    const validationResult: ValidationResult = {
      errorCount: 0,
      findings: [],
      status: "pass",
      warningCount: 0,
    };
    const publishRequest: PublishRequest = {
      repoPath: REPOS.validTs,
    };
    const publishResult: PublishResult = {
      branchName: "docs/wiki",
      commitHash: VALID_FIXTURE_COMMIT_HASH,
      filesCommitted: ["overview.md"],
      pullRequestNumber: null,
      pullRequestUrl: null,
      pushedToRemote: false,
    };
    const engineError: EngineError = {
      code: "ORCHESTRATION_ERROR",
      message: "Generation failed",
    };
    const runResult: DocumentationRunResult = {
      status: "failure",
      error: engineError,
      failedStage: "analyzing-structure",
      mode: "full",
      runId: "run-1",
      moduleOutcomes: [],
      successCount: 0,
      failureCount: 0,
      totalDurationMs: 1000,
      observationCount: 0,
      costUsd: null,
      warnings: [],
    };

    expectTypeOf(environmentRequest).toEqualTypeOf<EnvironmentCheckRequest>();
    expectTypeOf(analysisOptions).toEqualTypeOf<AnalysisOptions>();
    expectTypeOf(runRequest).toEqualTypeOf<DocumentationRunRequest>();
    expectTypeOf(runResult).toMatchTypeOf<DocumentationRunResult>();
    expectTypeOf(progressEvent).toEqualTypeOf<DocumentationProgressEvent>();
    expectTypeOf(statusRequest).toEqualTypeOf<DocumentationStatusRequest>();
    expectTypeOf(status).toEqualTypeOf<DocumentationStatus>();
    expectTypeOf(validationRequest).toEqualTypeOf<ValidationRequest>();
    expectTypeOf(validationResult).toEqualTypeOf<ValidationResult>();
    expectTypeOf(publishRequest).toEqualTypeOf<PublishRequest>();
    expectTypeOf(publishResult).toEqualTypeOf<PublishResult>();
    expectTypeOf(engineError).toEqualTypeOf<EngineError>();
    expect(progressEvent.stage).toBe("complete");
  });

  it("TC-3.2a: progress events identify stage", async () => {
    const repoPath = createRepo();
    const events: DocumentationProgressEvent[] = [];

    setupPipelineMocks(repoPath);

    expectSuccess(
      await generateDocumentation(
        {
          inference: TEST_INFERENCE_CONFIGURATION,
          mode: "full",
          repoPath,
        },
        (event) => {
          events.push(event);
        },
      ),
    );

    expect(events.length).toBeGreaterThan(0);

    for (const event of events) {
      expect(DOCUMENTATION_STAGES).toContain(event.stage);
    }
  });

  it("TC-3.2b: module-level progress includes name and count", async () => {
    const repoPath = createRepo();

    setupPipelineMocks(repoPath, {
      analysis: buildAnalysis(FIVE_MODULE_PLAN, { repoPath }),
      sdkConfig: {
        clustering: {
          output: FIVE_MODULE_PLAN,
          usage: { inputTokens: 1000, outputTokens: 400 },
        },
        moduleGeneration: FIVE_MODULE_PLAN.modules.map((module) => ({
          output: buildModulePage(module.name, `Module ${module.name}`),
          usage: { inputTokens: 500, outputTokens: 250 },
        })),
        overview: {
          output: {
            content: "# Repository Overview\n\nGenerated for five modules.\n",
            mermaidDiagram:
              "graph TD\n  module_1 --> module_2\n  module_3 --> module_4",
          },
          usage: { inputTokens: 400, outputTokens: 200 },
        },
      },
    });

    const events: DocumentationProgressEvent[] = [];
    expectSuccess(
      await generateDocumentation(
        {
          inference: TEST_INFERENCE_CONFIGURATION,
          mode: "full",
          repoPath,
        },
        (event) => {
          events.push(event);
        },
      ),
    );

    const moduleEvents = events.filter(
      (event) => event.stage === "generating-module",
    );

    expect(moduleEvents).toHaveLength(5);
    expect(moduleEvents).toEqual(
      FIVE_MODULE_PLAN.modules.map((module, index) => ({
        completed: index + 1,
        moduleName: module.name,
        runId: expect.any(String),
        stage: "generating-module",
        timestamp: expect.any(String),
        total: 5,
      })),
    );
  });

  it("TC-3.2c: final event signals completion or failure", async () => {
    const successRepoPath = createRepo();
    const successEvents: DocumentationProgressEvent[] = [];

    setupPipelineMocks(successRepoPath);

    expectSuccess(
      await generateDocumentation(
        {
          inference: TEST_INFERENCE_CONFIGURATION,
          mode: "full",
          repoPath: successRepoPath,
        },
        (event) => {
          successEvents.push(event);
        },
      ),
    );

    expect(successEvents.at(-1)?.stage).toBe("complete");

    vi.restoreAllMocks();
    mockCreateAgentSDKAdapter.mockReset();
    mockAnalyzeRepository.mockReset();
    mockCheckEnvironment.mockReset();
    mockGetHeadCommitHash.mockReset();

    const failureRepoPath = createRepo();
    const failureEvents: DocumentationProgressEvent[] = [];

    setupPipelineMocks(failureRepoPath);
    mockAnalyzeRepository.mockResolvedValue(
      err("ANALYSIS_ERROR", "Structural analysis crashed"),
    );

    expectFailure(
      await generateDocumentation(
        {
          inference: TEST_INFERENCE_CONFIGURATION,
          mode: "full",
          repoPath: failureRepoPath,
        },
        (event) => {
          failureEvents.push(event);
        },
      ),
    );

    expect(failureEvents.at(-1)?.stage).toBe("failed");
  });

  it("TC-3.3a: not-generated state for empty tab render", async () => {
    const status = expectStatus(
      await getDocumentationStatus({
        outputPath: DOCS_OUTPUT.missingMeta,
        repoPath: REPOS.validTs,
      }),
    );

    expect(status).toEqual({
      currentHeadCommitHash: null,
      lastGeneratedAt: null,
      lastGeneratedCommitHash: null,
      outputPath: DOCS_OUTPUT.missingMeta,
      state: "not_generated",
    });
  });

  it("TC-3.3b: stale state provides comparison data", async () => {
    mockGetHeadCommitHash.mockResolvedValue(STALE_FIXTURE_COMMIT_HASH);

    const status = expectStatus(
      await getDocumentationStatus({
        outputPath: DOCS_OUTPUT.valid,
        repoPath: REPOS.validTs,
      }),
    );

    expect(status.state).toBe("stale");
    expect(status.lastGeneratedCommitHash).toBe(VALID_FIXTURE_COMMIT_HASH);
    expect(status.currentHeadCommitHash).toBe(STALE_FIXTURE_COMMIT_HASH);
  });

  it("TC-3.3c: current state provides generation metadata", async () => {
    mockGetHeadCommitHash.mockResolvedValue(VALID_FIXTURE_COMMIT_HASH);

    const status = expectStatus(
      await getDocumentationStatus({
        outputPath: DOCS_OUTPUT.valid,
        repoPath: REPOS.validTs,
      }),
    );

    expect(status.state).toBe("current");
    expect(status.lastGeneratedAt).toBe("2026-03-15T12:00:00.000Z");
    expect(status.lastGeneratedCommitHash).toBe(VALID_FIXTURE_COMMIT_HASH);
    expect(status.currentHeadCommitHash).toBe(VALID_FIXTURE_COMMIT_HASH);
  });

  it("TC-3.4a: successful result has persistence-ready fields", async () => {
    const repoPath = createRepo();

    setupPipelineMocks(repoPath);

    const result = expectSuccess(
      await generateDocumentation({
        inference: TEST_INFERENCE_CONFIGURATION,
        mode: "full",
        repoPath,
      }),
    );

    expect(result.mode).toBe("full");
    expect(result.commitHash).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(result.totalDurationMs).toBeGreaterThan(0);
    expect(result.costUsd).toBeTypeOf("number");
    expect(result.generatedFiles).toEqual([
      ".doc-meta.json",
      ".module-plan.json",
      "api.md",
      "core.md",
      "module-tree.json",
      "overview.md",
      "utils.md",
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.validationResult).toEqual({
      errorCount: 0,
      findings: [],
      status: "pass",
      warningCount: 0,
    });
  });

  it("TC-3.4b: failed result has diagnostic fields", async () => {
    const repoPath = createRepo();

    setupPipelineMocks(repoPath);
    mockAnalyzeRepository.mockResolvedValue(
      err("ANALYSIS_ERROR", "Structural analysis crashed"),
    );

    const result = expectFailure(
      await generateDocumentation({
        inference: TEST_INFERENCE_CONFIGURATION,
        mode: "full",
        repoPath,
      }),
    );

    expect(result.status).toBe("failure");
    expect(result.failedStage).toBe("analyzing-structure");
    expect(result.error!.code).toBe("ANALYSIS_ERROR");
    expect(result.error!.message).toBe("Structural analysis crashed");
  });

  it("TC-3.4c: cost is null when unavailable", async () => {
    const repoPath = createRepo();

    setupPipelineMocks(repoPath, {
      sdkConfig: {
        clustering: {
          output: CLUSTERING_PLAN,
        },
        moduleGeneration: [
          { output: API_PAGE },
          { output: CORE_PAGE },
          { output: UTILS_PAGE },
        ],
        overview: {
          output: OVERVIEW_PAGE,
        },
      },
    });

    const result = expectSuccess(
      await generateDocumentation({
        inference: TEST_INFERENCE_CONFIGURATION,
        mode: "full",
        repoPath,
      }),
    );

    expect(result.costUsd).toBeNull();
  });

  it("TC-3.5a: status available without reading filesystem", async () => {
    mockGetHeadCommitHash.mockResolvedValue(VALID_FIXTURE_COMMIT_HASH);

    const status = expectStatus(
      await getDocumentationStatus({
        outputPath: DOCS_OUTPUT.valid,
        repoPath: REPOS.validTs,
      }),
    );

    expect(status).toEqual({
      currentHeadCommitHash: VALID_FIXTURE_COMMIT_HASH,
      lastGeneratedAt: "2026-03-15T12:00:00.000Z",
      lastGeneratedCommitHash: VALID_FIXTURE_COMMIT_HASH,
      outputPath: DOCS_OUTPUT.valid,
      state: "current",
    });
  });

  it("TC-3.5b: generation result available without reading output", async () => {
    const repoPath = createRepo();

    setupPipelineMocks(repoPath);

    const result = expectSuccess(
      await generateDocumentation({
        inference: TEST_INFERENCE_CONFIGURATION,
        mode: "full",
        repoPath,
      }),
    );

    expect(result.outputPath).toBe(path.join(repoPath, "docs/wiki"));
    expect(result.generatedFiles).toEqual([
      ".doc-meta.json",
      ".module-plan.json",
      "api.md",
      "core.md",
      "module-tree.json",
      "overview.md",
      "utils.md",
    ]);
    expect(result.validationResult!.status).toBe("pass");
    expect(result.commitHash).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(result.mode).toBe("full");
    expect(result.warnings).toEqual([]);
  });

  it("TC-5.2b: operations callable without application context", async () => {
    const result = await getDocumentationStatus({
      repoPath: REPOS.validTs,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        currentHeadCommitHash: null,
        lastGeneratedAt: null,
        lastGeneratedCommitHash: null,
        outputPath: "docs/wiki",
        state: "not_generated",
      },
    });
  });

  it("package entry point does not export internal modules", () => {
    const exportKeys = Object.keys(sdk);

    expect(exportKeys).not.toContain("createInferenceRuntime");
    expect(exportKeys).not.toContain("getHeadCommitHash");
    expect(exportKeys).not.toContain("planModules");
    expect(exportKeys).not.toContain("RunContext");
    expect(
      exportKeys.some(
        (key) => key.includes("orchestration/") || key.includes("adapters/"),
      ),
    ).toBe(false);
  });
});
