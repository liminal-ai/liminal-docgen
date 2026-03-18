import { readFileSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as analysisModule from "../../src/analysis/analyze.js";
import * as environmentModule from "../../src/environment/check.js";
import * as inferenceRuntimeModule from "../../src/inference/runtime.js";
import { METADATA_FILE_NAME } from "../../src/metadata/file.js";
import * as metadataWriterModule from "../../src/metadata/writer.js";
import { writeMetadata } from "../../src/metadata/writer.js";
import { generateDocumentation } from "../../src/orchestration/generate.js";
import { MODULE_PLAN_FILE_NAME } from "../../src/orchestration/stages/metadata-write.js";
import * as modulePlanningStage from "../../src/orchestration/stages/module-planning.js";
import { err, ok } from "../../src/types/common.js";
import type {
  AnalysisOptions,
  DocumentationProgressEvent,
  DocumentationRunRequest,
  GeneratedDocumentationMetadata,
  ModuleGenerationResult,
  ModulePlan,
  OverviewGenerationResult,
  RepositoryAnalysis,
} from "../../src/types/index.js";
import {
  createMockSDK,
  type MockSDKConfig,
} from "../helpers/agent-sdk-mock.js";
import { TEST_INFERENCE_CONFIGURATION } from "../helpers/inference.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const FIXTURE_BASE_URL = new URL("../fixtures/agent-sdk/", import.meta.url);
const FIXED_GENERATED_AT = "2026-03-15T12:00:00.000Z";

const loadJsonFixture = <T>(fileName: string): T =>
  JSON.parse(readFileSync(new URL(fileName, FIXTURE_BASE_URL), "utf8")) as T;

const CLUSTERING_PLAN = loadJsonFixture<ModulePlan>(
  "clustering-3-modules.json",
);
const OVERVIEW_PAGE = loadJsonFixture<OverviewGenerationResult>(
  "overview-success.json",
);

const BAD_MERMAID_OVERVIEW: OverviewGenerationResult = {
  content: "# Repository Overview\n\nRepository map.\n",
  mermaidDiagram: "graph TD\n  Core[Start --> API[End]",
};

const BROKEN_LINK_OVERVIEW: OverviewGenerationResult = {
  content: "# Repository Overview\n\nSee the [Missing module](./missing.md).\n",
  mermaidDiagram: "graph TD\n  Core --> API\n  API --> Utils",
};

const FIVE_MODULE_PLAN: ModulePlan = {
  modules: Array.from({ length: 5 }, (_, index) => ({
    components: [`src/module-${index + 1}/index.ts`],
    description: `Module ${index + 1}`,
    name: `module-${index + 1}`,
  })),
  unmappedComponents: [],
};

const LARGE_PLAN: ModulePlan = {
  modules: Array.from({ length: 16 }, (_, index) => ({
    components: [`src/area-${index + 1}/index.ts`],
    description: `Area ${index + 1}`,
    name: `area-${index + 1}`,
  })),
  unmappedComponents: [],
};

const tempDirs: string[] = [];

const buildAnalysis = (
  plan: ModulePlan,
  repoPath: string,
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
          language: "typescript",
          linesOfCode: (index + 1) * 10,
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
    ...overrides,
  };
};

const buildModulePage = (moduleName: string): ModuleGenerationResult => ({
  crossLinks: [],
  pageContent: [
    `# ${moduleName}`,
    "",
    "## Components",
    "",
    `- src/${moduleName}/index.ts`,
  ].join("\n"),
  title: moduleName,
});

const createRepo = (): string => {
  const repoPath = createTempDir();
  tempDirs.push(repoPath);
  return repoPath;
};

const buildMetadata = (
  overrides: Partial<GeneratedDocumentationMetadata> = {},
): GeneratedDocumentationMetadata => ({
  commitHash: "1111111111111111111111111111111111111111",
  componentCount: 3,
  filesGenerated: ["api.md", "core.md", "module-tree.json", "overview.md"],
  generatedAt: FIXED_GENERATED_AT,
  mode: "full",
  outputPath: "docs/wiki",
  ...overrides,
});

const setupPipelineMocks = (
  repoPath: string,
  {
    analysis = buildAnalysis(CLUSTERING_PLAN, repoPath),
    plan = CLUSTERING_PLAN,
    sdkConfig = {},
  }: {
    analysis?: RepositoryAnalysis;
    plan?: ModulePlan;
    sdkConfig?: MockSDKConfig;
  } = {},
) => {
  const capturedAnalysisOptions: AnalysisOptions[] = [];
  const moduleGeneration =
    sdkConfig.moduleGeneration ??
    plan.modules.map((module) => ({
      output: buildModulePage(module.name),
      usage: { inputTokens: 400, outputTokens: 200 },
    }));
  const sdk = createMockSDK({
    clustering: {
      output: plan,
      usage: { inputTokens: 900, outputTokens: 400 },
    },
    moduleGeneration,
    overview: {
      output: OVERVIEW_PAGE,
      usage: { inputTokens: 500, outputTokens: 250 },
    },
    qualityReview: {
      output: [],
      usage: { inputTokens: 200, outputTokens: 100 },
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
  expect(result.success).toBe(true);

  if (!result.success) {
    throw new Error(
      `Expected success but received ${result.error.code}: ${result.error.message}`,
    );
  }

  return result;
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

const withInference = (
  value: Omit<DocumentationRunRequest, "inference">,
): DocumentationRunRequest => ({
  ...value,
  inference: TEST_INFERENCE_CONFIGURATION,
});

const seedPriorMetadata = async (repoPath: string): Promise<string> => {
  const outputPath = path.join(repoPath, "docs/wiki");
  await mkdir(outputPath, { recursive: true });
  await writeMetadata({
    metadata: buildMetadata(),
    outputPath,
  });
  await writeFile(
    path.join(outputPath, MODULE_PLAN_FILE_NAME),
    `${JSON.stringify(CLUSTERING_PLAN, null, 2)}\n`,
    "utf8",
  );

  return outputPath;
};

afterEach(() => {
  vi.restoreAllMocks();

  for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
    cleanupTempDir(tempDir);
  }
});

describe("generateDocumentation failure handling", () => {
  it("TC-5.1a: env check failure", async () => {
    const repoPath = createRepo();
    const { querySpy } = setupPipelineMocks(repoPath);

    vi.spyOn(environmentModule, "checkEnvironment").mockResolvedValue(
      ok({
        detectedLanguages: ["typescript"],
        findings: [
          {
            category: "missing-dependency",
            dependencyName: "python",
            message: "Python is not installed",
            severity: "error",
          },
        ],
        passed: false,
      }),
    );

    const result = expectFailure(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    expect(result.failedStage).toBe("checking-environment");
    expect(result.error.code).toBe("DEPENDENCY_MISSING");
    expect(querySpy).not.toHaveBeenCalled();
  });

  it("TC-5.1b: analysis failure", async () => {
    const repoPath = createRepo();
    const { querySpy } = setupPipelineMocks(repoPath);

    vi.spyOn(analysisModule, "analyzeRepository").mockResolvedValue(
      err("ANALYSIS_ERROR", "Structural analysis crashed"),
    );

    const result = expectFailure(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    expect(result.failedStage).toBe("analyzing-structure");
    expect(result.error.code).toBe("ANALYSIS_ERROR");
    expect(querySpy).not.toHaveBeenCalled();
  });

  it("TC-5.2a: module generation failure", async () => {
    const repoPath = createRepo();
    const events: DocumentationProgressEvent[] = [];

    setupPipelineMocks(repoPath, {
      analysis: buildAnalysis(FIVE_MODULE_PLAN, repoPath),
      plan: FIVE_MODULE_PLAN,
      sdkConfig: {
        moduleGeneration: FIVE_MODULE_PLAN.modules.map((module) => ({
          output: buildModulePage(module.name),
          usage: { inputTokens: 400, outputTokens: 200 },
        })),
        callOverrides: {
          2: {
            code: "ORCHESTRATION_ERROR",
            message: "Module generation timed out",
          },
        },
      },
    });
    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(
      ok(FIVE_MODULE_PLAN),
    );

    const result = expectFailure(
      await generateDocumentation(
        withInference({ mode: "full", repoPath }),
        (event) => {
          events.push(event);
        },
      ),
    );

    expect(result.failedStage).toBe("generating-module");
    expect(result.error.message).toBe("Module generation failed");
    expect(result.error.details).toMatchObject({
      moduleName: "module-3",
    });
    expect(
      events.filter((event) => event.stage === "generating-module"),
    ).toEqual([
      expect.objectContaining({
        completed: 1,
        moduleName: "module-1",
        total: 5,
      }),
      expect.objectContaining({
        completed: 2,
        moduleName: "module-2",
        total: 5,
      }),
    ]);
  });

  it("TC-5.2b: overview failure preserves module docs on disk", async () => {
    const repoPath = createRepo();

    setupPipelineMocks(repoPath, {
      sdkConfig: {
        callOverrides: {
          3: {
            code: "ORCHESTRATION_ERROR",
            message: "Overview request timed out",
          },
        },
      },
    });
    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(
      ok(CLUSTERING_PLAN),
    );

    const result = expectFailure(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );
    const outputPath = path.join(repoPath, "docs/wiki");

    expect(result.failedStage).toBe("generating-overview");
    await expect(
      access(path.join(outputPath, "api.md")),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(outputPath, "core.md")),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(outputPath, "utils.md")),
    ).resolves.toBeUndefined();
    expect(result.generatedFiles).toEqual(["api.md", "core.md", "utils.md"]);
  });

  it("TC-5.2c: clustering failure", async () => {
    const repoPath = createRepo();

    setupPipelineMocks(repoPath, {
      analysis: buildAnalysis(LARGE_PLAN, repoPath),
      plan: LARGE_PLAN,
      sdkConfig: {
        clustering: {
          output: LARGE_PLAN,
          usage: { inputTokens: 1000, outputTokens: 500 },
        },
        callOverrides: {
          0: {
            code: "ORCHESTRATION_ERROR",
            message: "Module clustering timed out",
          },
        },
      },
    });

    const result = expectFailure(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    expect(result.failedStage).toBe("planning-modules");
    expect(result.error.code).toBe("ORCHESTRATION_ERROR");
  });

  it("TC-5.3a: validation warnings do not fail the run", async () => {
    const repoPath = createRepo();

    setupPipelineMocks(repoPath, {
      sdkConfig: {
        overview: {
          output: BAD_MERMAID_OVERVIEW,
          usage: { inputTokens: 500, outputTokens: 250 },
        },
      },
    });

    const result = expectSuccess(
      await generateDocumentation({
        inference: TEST_INFERENCE_CONFIGURATION,
        mode: "full",
        qualityReview: { selfReview: false },
        repoPath,
      }),
    );

    expect(result.validationResult.status).toBe("warn");
    expect(result.validationResult.errorCount).toBe(0);
    expect(result.warnings).not.toHaveLength(0);
  });

  it("TC-5.3b: validation errors fail run", async () => {
    const repoPath = createRepo();

    setupPipelineMocks(repoPath, {
      sdkConfig: {
        overview: {
          output: BROKEN_LINK_OVERVIEW,
          usage: { inputTokens: 500, outputTokens: 250 },
        },
      },
    });

    const result = expectFailure(
      await generateDocumentation({
        inference: TEST_INFERENCE_CONFIGURATION,
        mode: "full",
        qualityReview: { selfReview: false },
        repoPath,
      }),
    );

    expect(result.failedStage).toBe("validating-output");
    expect(result.validationResult?.status).toBe("fail");
    await expect(
      access(path.join(repoPath, "docs/wiki", METADATA_FILE_NAME)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("TC-5.4a: partial output remains on disk after module failure", async () => {
    const repoPath = createRepo();

    setupPipelineMocks(repoPath, {
      analysis: buildAnalysis(FIVE_MODULE_PLAN, repoPath),
      plan: FIVE_MODULE_PLAN,
      sdkConfig: {
        moduleGeneration: FIVE_MODULE_PLAN.modules.map((module) => ({
          output: buildModulePage(module.name),
          usage: { inputTokens: 400, outputTokens: 200 },
        })),
        callOverrides: {
          3: {
            code: "ORCHESTRATION_ERROR",
            message: "Module generation timed out",
          },
        },
      },
    });
    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(
      ok(FIVE_MODULE_PLAN),
    );

    const result = expectFailure(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );
    const outputPath = path.join(repoPath, "docs/wiki");

    expect(result.generatedFiles).toEqual([
      "module-1.md",
      "module-2.md",
      "module-3.md",
    ]);
    await expect(
      access(path.join(outputPath, "module-1.md")),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(outputPath, "module-2.md")),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(outputPath, "module-3.md")),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(outputPath, METADATA_FILE_NAME)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("TC-5.4b: failed runs do not update prior metadata", async () => {
    const repoPath = createRepo();
    const outputPath = await seedPriorMetadata(repoPath);
    const priorMetadata = await readFile(
      path.join(outputPath, METADATA_FILE_NAME),
      "utf8",
    );

    setupPipelineMocks(repoPath, {
      sdkConfig: {
        overview: {
          output: BROKEN_LINK_OVERVIEW,
          usage: { inputTokens: 500, outputTokens: 250 },
        },
      },
    });

    expectFailure(
      await generateDocumentation({
        inference: TEST_INFERENCE_CONFIGURATION,
        mode: "full",
        qualityReview: { selfReview: false },
        repoPath,
      }),
    );

    expect(
      await readFile(path.join(outputPath, METADATA_FILE_NAME), "utf8"),
    ).toBe(priorMetadata);
  });

  it("TC-5.5a: failed event emitted as the final progress event", async () => {
    const repoPath = createRepo();
    const events: DocumentationProgressEvent[] = [];

    setupPipelineMocks(repoPath);
    vi.spyOn(analysisModule, "analyzeRepository").mockResolvedValue(
      err("ANALYSIS_ERROR", "Structural analysis crashed"),
    );

    expectFailure(
      await generateDocumentation(
        withInference({ mode: "full", repoPath }),
        (event) => {
          events.push(event);
        },
      ),
    );

    expect(events.at(-1)?.stage).toBe("failed");
  });

  it("TC-3.5a: failed result structure", async () => {
    const repoPath = createRepo();

    setupPipelineMocks(repoPath, {
      analysis: buildAnalysis(FIVE_MODULE_PLAN, repoPath),
      plan: FIVE_MODULE_PLAN,
      sdkConfig: {
        moduleGeneration: FIVE_MODULE_PLAN.modules.map((module) => ({
          output: buildModulePage(module.name),
          usage: { inputTokens: 400, outputTokens: 200 },
        })),
        callOverrides: {
          2: {
            code: "ORCHESTRATION_ERROR",
            message: "Module generation timed out",
          },
        },
      },
    });
    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(
      ok(FIVE_MODULE_PLAN),
    );

    const result = expectFailure(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    expect(result.failedStage).toBe("generating-module");
    expect(result.error.code).toBe("ORCHESTRATION_ERROR");
    expect(result.error.message).toBeTruthy();
  });

  it("failure at metadata-write stage returns partial artifacts without metadata", async () => {
    const repoPath = createRepo();

    setupPipelineMocks(repoPath);
    vi.spyOn(metadataWriterModule, "writeMetadata").mockResolvedValue(
      err("METADATA_ERROR", "Disk full while writing metadata"),
    );

    const result = expectFailure(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );
    const outputPath = path.join(repoPath, "docs/wiki");

    expect(result.failedStage).toBe("writing-metadata");
    expect(result.generatedFiles).toEqual([
      "api.md",
      "core.md",
      "module-tree.json",
      "overview.md",
      "utils.md",
    ]);
    await expect(
      access(path.join(outputPath, "overview.md")),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(outputPath, METADATA_FILE_NAME)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      access(path.join(outputPath, MODULE_PLAN_FILE_NAME)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("inference provider timeout is surfaced with the failing stage", async () => {
    const planningRepoPath = createRepo();
    setupPipelineMocks(planningRepoPath, {
      analysis: buildAnalysis(LARGE_PLAN, planningRepoPath),
      plan: LARGE_PLAN,
      sdkConfig: {
        callOverrides: {
          0: {
            code: "ORCHESTRATION_ERROR",
            message: "Inference provider network timeout during planning",
          },
        },
      },
    });

    const planningFailure = expectFailure(
      await generateDocumentation(
        withInference({ mode: "full", repoPath: planningRepoPath }),
      ),
    );

    const overviewRepoPath = createRepo();
    setupPipelineMocks(overviewRepoPath, {
      sdkConfig: {
        callOverrides: {
          3: {
            code: "ORCHESTRATION_ERROR",
            message: "Inference provider network timeout during overview",
          },
        },
      },
    });
    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(
      ok(CLUSTERING_PLAN),
    );

    const overviewFailure = expectFailure(
      await generateDocumentation(
        withInference({ mode: "full", repoPath: overviewRepoPath }),
      ),
    );

    expect(planningFailure.failedStage).toBe("planning-modules");
    expect(planningFailure.error.details).toMatchObject({
      code: "ORCHESTRATION_ERROR",
      message: "Inference provider network timeout during planning",
    });
    expect(overviewFailure.failedStage).toBe("generating-overview");
    expect(overviewFailure.error.details).toMatchObject({
      providerError: {
        message: "Inference provider network timeout during overview",
      },
    });
  });

  it("double failure still returns the primary stage error", async () => {
    const repoPath = createRepo();

    setupPipelineMocks(repoPath, {
      analysis: buildAnalysis(FIVE_MODULE_PLAN, repoPath),
      plan: FIVE_MODULE_PLAN,
      sdkConfig: {
        moduleGeneration: FIVE_MODULE_PLAN.modules.map((module) => ({
          output: buildModulePage(module.name),
          usage: { inputTokens: 400, outputTokens: 200 },
        })),
        callOverrides: {
          2: {
            code: "ORCHESTRATION_ERROR",
            message: "Module generation timed out",
          },
        },
      },
    });
    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(
      ok(FIVE_MODULE_PLAN),
    );

    const result = expectFailure(
      await generateDocumentation(
        withInference({ mode: "full", repoPath }),
        (event) => {
          if (event.stage === "failed") {
            throw new Error("progress callback failed");
          }
        },
      ),
    );

    expect(result.failedStage).toBe("generating-module");
    expect(result.error.message).toBe("Module generation failed");
  });
});
