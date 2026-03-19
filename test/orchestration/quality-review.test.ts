import { readFileSync } from "node:fs";
import { access, cp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as analysisModule from "../../src/analysis/analyze.js";
import * as environmentModule from "../../src/environment/check.js";
import { generateDocumentation } from "../../src/index.js";
import * as inferenceRuntimeModule from "../../src/inference/runtime.js";
import { resolveAndValidateRequest } from "../../src/orchestration/stages/resolve-and-validate.js";
import { validateAndReview } from "../../src/orchestration/stages/validation-and-review.js";
import { ok } from "../../src/types/common.js";
import type {
  AnalysisOptions,
  DocumentationProgressEvent,
  ModuleGenerationResult,
  ModulePlan,
  OverviewGenerationResult,
  RepositoryAnalysis,
  ReviewFilePatch,
} from "../../src/types/index.js";
import * as validationModule from "../../src/validation/validate.js";
import {
  createMockSDK,
  type MockSDKConfig,
} from "../helpers/agent-sdk-mock.js";
import { DOCS_OUTPUT } from "../helpers/fixtures.js";
import { TEST_INFERENCE_CONFIGURATION } from "../helpers/inference.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const FIXTURE_BASE_URL = new URL("../fixtures/agent-sdk/", import.meta.url);

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
const REVIEW_FIX_LINK = loadJsonFixture<ReviewFilePatch[]>(
  "review-fix-link.json",
);
const REVIEW_NO_FIXES = loadJsonFixture<ReviewFilePatch[]>(
  "review-no-fixes.json",
);

const tempDirs: string[] = [];

const FIXED_OVERVIEW = `# Project Overview

- [Auth](./auth.md)
- [Session](./session.md)
- [Storage](./storage.md)
`;

const FIXED_OVERVIEW_WITH_MERMAID = `# Project Overview

- [Auth](./auth.md)
- [Session](./session.md)
- [Storage](./storage.md)

\`\`\`mermaid
flowchart TD
  Auth --> Session
  Session --> Storage
\`\`\`
`;

const BROKEN_LINK_OVERVIEW = `# Project Overview

- [Auth](./auth.md)
- [Session](./missing.md)
- [Storage](./storage.md)
`;

const BAD_MERMAID_OVERVIEW = `# Project Overview

- [Auth](./auth.md)
- [Session](./session.md)
- [Storage](./storage.md)

\`\`\`mermaid
flowchart TD
  Auth[Start --> Session[Token]
\`\`\`
`;

const BROKEN_LINK_PIPELINE_OVERVIEW: OverviewGenerationResult = {
  content: "# Repository Overview\n\nSee the [Missing module](./missing.md).\n",
  mermaidDiagram: "graph TD\n  Core --> API\n  API --> Utils",
};

const BAD_MERMAID_PIPELINE_OVERVIEW: OverviewGenerationResult = {
  content: "# Repository Overview\n\nRepository map.\n",
  mermaidDiagram: "graph TD\n  Core[Start --> API[End]",
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

const createRepo = (): string => {
  const repoPath = createTempDir();
  tempDirs.push(repoPath);
  return repoPath;
};

const cloneOutputFixture = async (
  fixturePath: string = DOCS_OUTPUT.valid,
): Promise<string> => {
  const outputPath = createTempDir();
  tempDirs.push(outputPath);
  await cp(fixturePath, outputPath, { recursive: true });
  return outputPath;
};

const writeOverview = async (
  outputPath: string,
  content: string,
): Promise<void> => {
  await writeFile(path.join(outputPath, "overview.md"), content, "utf8");
};

const seedBrokenLinkOutput = async (): Promise<string> => {
  const outputPath = await cloneOutputFixture();
  await writeOverview(outputPath, BROKEN_LINK_OVERVIEW);
  return outputPath;
};

const seedBadMermaidOutput = async (): Promise<string> => {
  const outputPath = await cloneOutputFixture();
  await writeOverview(outputPath, BAD_MERMAID_OVERVIEW);
  return outputPath;
};

const seedBrokenLinkAndMermaidOutput = async (): Promise<string> => {
  const outputPath = await cloneOutputFixture();
  await writeOverview(
    outputPath,
    `${BROKEN_LINK_OVERVIEW.trim()}\n\n\`\`\`mermaid\nflowchart TD\n  Auth[Start --> Session[Token]\n\`\`\`\n`,
  );
  return outputPath;
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
) => {
  const capturedAnalysisOptions: AnalysisOptions[] = [];
  const sdk = createMockSDK({
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
    ...sdkConfig,
  });

  const querySpy = vi.spyOn(sdk, "query");

  vi.spyOn(inferenceRuntimeModule, "createInferenceRuntime").mockReturnValue(
    sdk,
  );
  vi.spyOn(environmentModule, "checkEnvironment").mockResolvedValue(
    ok({
      detectedLanguages: ["typescript"],
      findings: [],
      passed: true,
    }),
  );
  vi.spyOn(analysisModule, "analyzeRepository").mockImplementation(
    async (options) => {
      capturedAnalysisOptions.push(options);
      return ok({
        ...analysis,
        repoPath: options.repoPath,
      });
    },
  );

  return { capturedAnalysisOptions, querySpy, sdk };
};

const expectSuccess = (
  result: Awaited<ReturnType<typeof generateDocumentation>>,
) => {
  expect(result.status).not.toBe("failure");

  if (result.status === "failure") {
    throw new Error(
      `Expected success but received ${result.error!.code}: ${result.error!.message}`,
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

const runPipeline = async ({
  onProgress,
  overview = OVERVIEW_PAGE,
  qualityReview,
  sdkConfig = {},
}: {
  onProgress?: (event: DocumentationProgressEvent) => void;
  overview?: OverviewGenerationResult;
  qualityReview?: { selfReview?: boolean; secondModelReview?: boolean };
  sdkConfig?: MockSDKConfig;
} = {}) => {
  const repoPath = createRepo();
  const { querySpy } = setupPipelineMocks(repoPath, {
    sdkConfig: {
      overview: {
        output: overview,
        usage: { inputTokens: 900, outputTokens: 500 },
      },
      ...sdkConfig,
    },
  });

  const result = await generateDocumentation(
    {
      inference: TEST_INFERENCE_CONFIGURATION,
      mode: "full",
      qualityReview,
      repoPath,
    },
    onProgress,
  );

  return { querySpy, repoPath, result };
};

afterEach(() => {
  vi.restoreAllMocks();

  for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
    cleanupTempDir(tempDir);
  }
});

describe("validateAndReview", () => {
  it("TC-4.1a: validation runs post-generation", async () => {
    const outputPath = await cloneOutputFixture();
    const sdk = createMockSDK({});
    const validationSpy = vi.spyOn(validationModule, "validateDocumentation");

    const result = await validateAndReview(outputPath, {}, sdk);

    expect(validationSpy).toHaveBeenCalledTimes(1);
    expect(validationSpy).toHaveBeenCalledWith({
      outputPath,
      requirePersistedArtifacts: false,
    });
    expect(result.validationResult.status).toBe("pass");
  });

  it("TC-4.2a: self-review fixes broken link", async () => {
    const outputPath = await seedBrokenLinkOutput();
    const sdk = createMockSDK({
      qualityReview: {
        output: [
          {
            filePath: "overview.md",
            newContent: FIXED_OVERVIEW,
          },
        ],
      },
    });

    const result = await validateAndReview(outputPath, {}, sdk);
    const overview = await readFile(
      path.join(outputPath, "overview.md"),
      "utf8",
    );

    expect(result.validationResult.status).toBe("pass");
    expect(result.qualityReviewPasses).toBe(1);
    expect(overview).toBe(FIXED_OVERVIEW);
  });

  it("TC-4.2b: self-review fixes malformed Mermaid", async () => {
    const outputPath = await seedBadMermaidOutput();
    const sdk = createMockSDK({
      qualityReview: {
        output: [
          {
            filePath: "overview.md",
            newContent: FIXED_OVERVIEW_WITH_MERMAID,
          },
        ],
      },
    });

    const result = await validateAndReview(outputPath, {}, sdk);

    expect(result.validationResult.status).toBe("pass");
    expect(result.validationResult.warningCount).toBe(0);
  });

  it("TC-4.2c: self-review skipped no issues", async () => {
    const outputPath = await cloneOutputFixture();
    const sdk = createMockSDK({});
    const querySpy = vi.spyOn(sdk, "query");

    const result = await validateAndReview(outputPath, {}, sdk);

    expect(querySpy).not.toHaveBeenCalled();
    expect(result.qualityReviewPasses).toBe(0);
  });

  it("TC-4.2d: self-review skipped when disabled", async () => {
    const outputPath = await seedBrokenLinkOutput();
    const sdk = createMockSDK({});
    const querySpy = vi.spyOn(sdk, "query");

    const result = await validateAndReview(
      outputPath,
      { selfReview: false },
      sdk,
    );

    expect(querySpy).not.toHaveBeenCalled();
    expect(result.validationResult.status).toBe("fail");
  });

  it("TC-4.3a: allowed fix categories", async () => {
    const outputPath = await seedBrokenLinkAndMermaidOutput();
    const sdk = createMockSDK({
      qualityReview: {
        output: [
          {
            filePath: "overview.md",
            newContent: FIXED_OVERVIEW_WITH_MERMAID,
          },
        ],
      },
    });

    const result = await validateAndReview(outputPath, {}, sdk);

    expect(result.validationResult.status).toBe("pass");
    expect(result.validationResult.findings).toEqual([]);
  });

  it("TC-4.3b: no re-clustering", async () => {
    const outputPath = await seedBrokenLinkOutput();
    const modulePlanPath = path.join(outputPath, ".module-plan.json");
    const originalModulePlan = await readFile(modulePlanPath, "utf8");
    const sdk = createMockSDK({
      qualityReview: {
        output: [
          {
            filePath: ".module-plan.json",
            newContent: '{"modules":[]}\n',
          },
          {
            filePath: "overview.md",
            newContent: FIXED_OVERVIEW,
          },
        ],
      },
    });

    await validateAndReview(outputPath, {}, sdk);

    expect(await readFile(modulePlanPath, "utf8")).toBe(originalModulePlan);
  });

  it("TC-4.3c: no unbounded iteration", async () => {
    const outputPath = await seedBrokenLinkOutput();
    const sdk = createMockSDK({
      qualityReview: {
        output: REVIEW_NO_FIXES,
      },
    });
    const querySpy = vi.spyOn(sdk, "query");

    const result = await validateAndReview(outputPath, {}, sdk);

    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(result.qualityReviewPasses).toBe(1);
    expect(result.validationResult.status).toBe("fail");
  });

  it("TC-4.4a: revalidation after self-review", async () => {
    const outputPath = await seedBrokenLinkOutput();
    const sdk = createMockSDK({
      qualityReview: {
        output: [
          {
            filePath: "overview.md",
            newContent: FIXED_OVERVIEW,
          },
        ],
      },
    });
    const validationSpy = vi.spyOn(validationModule, "validateDocumentation");

    await validateAndReview(outputPath, {}, sdk);

    expect(validationSpy).toHaveBeenCalledTimes(2);
  });

  it("TC-4.4b: revalidation after second-model", async () => {
    const outputPath = await seedBrokenLinkOutput();
    const sdk = createMockSDK({
      callOverrides: {
        0: { output: REVIEW_NO_FIXES },
        1: {
          output: [
            {
              filePath: "overview.md",
              newContent: FIXED_OVERVIEW,
            },
          ],
        },
      },
    });
    const validationSpy = vi.spyOn(validationModule, "validateDocumentation");

    await validateAndReview(outputPath, { secondModelReview: true }, sdk);

    expect(validationSpy).toHaveBeenCalledTimes(3);
  });

  it("TC-4.5a: second-model runs when enabled", async () => {
    const outputPath = await seedBrokenLinkOutput();
    const sdk = createMockSDK({
      callOverrides: {
        0: { output: REVIEW_NO_FIXES },
        1: {
          output: [
            {
              filePath: "overview.md",
              newContent: FIXED_OVERVIEW,
            },
          ],
        },
      },
    });
    const querySpy = vi.spyOn(sdk, "query");

    const result = await validateAndReview(
      outputPath,
      { secondModelReview: true },
      sdk,
    );

    expect(querySpy).toHaveBeenCalledTimes(2);
    expect(result.qualityReviewPasses).toBe(2);
    expect(result.validationResult.status).toBe("pass");
  });

  it("TC-4.5b: second-model skipped when disabled", async () => {
    const outputPath = await seedBrokenLinkOutput();
    const sdk = createMockSDK({
      qualityReview: {
        output: REVIEW_NO_FIXES,
      },
    });
    const querySpy = vi.spyOn(sdk, "query");

    await validateAndReview(outputPath, { secondModelReview: false }, sdk);

    expect(querySpy).toHaveBeenCalledTimes(1);
  });

  it("TC-4.5c: second-model skipped no issues", async () => {
    const outputPath = await seedBrokenLinkOutput();
    const sdk = createMockSDK({
      qualityReview: {
        output: [
          {
            filePath: "overview.md",
            newContent: FIXED_OVERVIEW,
          },
        ],
      },
    });
    const querySpy = vi.spyOn(sdk, "query");

    await validateAndReview(outputPath, { secondModelReview: true }, sdk);

    expect(querySpy).toHaveBeenCalledTimes(1);
  });

  it("TC-4.6a: clean validation after review", async () => {
    const outputPath = await seedBrokenLinkOutput();
    const sdk = createMockSDK({
      qualityReview: {
        output: [
          {
            filePath: "overview.md",
            newContent: FIXED_OVERVIEW,
          },
        ],
      },
    });

    const result = await validateAndReview(outputPath, {}, sdk);

    expect(result.validationResult.status).toBe("pass");
    expect(result.qualityReviewPasses).toBe(1);
  });

  it("review returns patches for nonexistent files", async () => {
    const outputPath = await seedBrokenLinkOutput();
    const sdk = createMockSDK({
      qualityReview: {
        output: [
          {
            filePath: "missing.md",
            newContent: "# Missing\n",
          },
          {
            filePath: "overview.md",
            newContent: FIXED_OVERVIEW,
          },
        ],
      },
    });

    const result = await validateAndReview(outputPath, {}, sdk);

    expect(result.validationResult.status).toBe("pass");
    await expect(
      access(path.join(outputPath, "missing.md")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("review returns empty patches", async () => {
    const outputPath = await seedBrokenLinkOutput();
    const sdk = createMockSDK({
      qualityReview: {
        output: REVIEW_NO_FIXES,
      },
    });

    const result = await validateAndReview(outputPath, {}, sdk);

    expect(result.qualityReviewPasses).toBe(1);
    expect(result.validationResult.status).toBe("fail");
  });
});

describe("quality review integration", () => {
  it("TC-4.6b: warnings remain after review", async () => {
    const { result } = await runPipeline({
      overview: BAD_MERMAID_PIPELINE_OVERVIEW,
      sdkConfig: {
        qualityReview: {
          output: REVIEW_NO_FIXES,
        },
      },
    });
    const success = expectSuccess(result);

    expect(success.validationResult!.status).toBe("warn");
    expect(success.validationResult!.warningCount).toBeGreaterThan(0);
    expect(success.qualityReviewPasses).toBe(1);
  });

  it("TC-4.6c: errors remain after review", async () => {
    const { result } = await runPipeline({
      overview: BROKEN_LINK_PIPELINE_OVERVIEW,
      sdkConfig: {
        qualityReview: {
          output: REVIEW_NO_FIXES,
        },
      },
    });
    const failure = expectFailure(result);

    expect(failure.failedStage).toBe("validating-output");
    expect(failure.qualityReviewPasses).toBe(1);
    expect(failure.validationResult?.status).toBe("fail");
  });

  it("quality-review progress event emitted when review runs", async () => {
    const events: DocumentationProgressEvent[] = [];
    const { result } = await runPipeline({
      onProgress: (event) => {
        events.push(event);
      },
      overview: BROKEN_LINK_PIPELINE_OVERVIEW,
      sdkConfig: {
        qualityReview: {
          output: REVIEW_FIX_LINK,
        },
      },
    });

    expectSuccess(result);
    expect(events.map((event) => event.stage)).toContain("quality-review");
  });

  it("self-review timeout", async () => {
    const { result } = await runPipeline({
      overview: BROKEN_LINK_PIPELINE_OVERVIEW,
      sdkConfig: {
        callOverrides: {
          5: {
            code: "ORCHESTRATION_ERROR",
            details: { timeoutMs: 30_000 },
            message: "Quality review timed out",
          },
        },
      },
    });
    const failure = expectFailure(result);

    expect(failure.failedStage).toBe("quality-review");
    expect(failure.error!.code).toBe("ORCHESTRATION_ERROR");
  });

  it("secondModelReview defaults to false", async () => {
    const repoPath = createRepo();
    const result = await resolveAndValidateRequest({
      inference: TEST_INFERENCE_CONFIGURATION,
      mode: "full",
      repoPath,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.qualityReview.selfReview).toBe(true);
    expect(result.value.qualityReview.secondModelReview).toBe(false);
  });
});
