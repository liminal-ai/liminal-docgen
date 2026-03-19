import { readFileSync } from "node:fs";
import path from "node:path";
import * as analysisModule from "../../src/analysis/analyze.js";
import * as environmentModule from "../../src/environment/check.js";
import { generateDocumentation } from "../../src/index.js";
import * as inferenceRuntimeModule from "../../src/inference/runtime.js";
import * as modulePlanningStage from "../../src/orchestration/stages/module-planning.js";
import { ok } from "../../src/types/common.js";
import type {
  AnalysisOptions,
  DocumentationProgressEvent,
  DocumentationRunRequest,
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

const tempDirs: string[] = [];

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

const buildModulePage = (
  moduleName: string,
  title: string = moduleName,
): ModuleGenerationResult => ({
  crossLinks: [],
  pageContent: `# ${title}\n\nDocumentation for ${moduleName}.\n`,
  title,
});

const setupPipelineMocks = (
  repoPath: string,
  {
    analysis = buildAnalysis(CLUSTERING_PLAN, { repoPath }),
    sdkConfig = {},
  }: {
    analysis?: RepositoryAnalysis;
    sdkConfig?: MockSDKConfig;
  } = {},
): { capturedAnalysisOptions: AnalysisOptions[] } => {
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
    qualityReview: {
      output: [],
      usage: { inputTokens: 300, outputTokens: 120 },
    },
    ...sdkConfig,
  });

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

  return { capturedAnalysisOptions };
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

const withInference = (
  value: Omit<DocumentationRunRequest, "inference">,
): DocumentationRunRequest => ({
  ...value,
  inference: TEST_INFERENCE_CONFIGURATION,
});

const runWithProgress = async (
  repoPath: string,
): Promise<{
  events: DocumentationProgressEvent[];
  result: ReturnType<typeof expectSuccess>;
}> => {
  const events: DocumentationProgressEvent[] = [];
  const result = expectSuccess(
    await generateDocumentation(
      withInference({ mode: "full", repoPath }),
      (event) => {
        events.push(event);
      },
    ),
  );

  return { events, result };
};

afterEach(() => {
  vi.restoreAllMocks();

  for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
    cleanupTempDir(tempDir);
  }
});

describe("generateDocumentation progress and result assembly", () => {
  it("TC-1.1b: run ID assigned", async () => {
    const firstRepoPath = createRepo();
    setupPipelineMocks(firstRepoPath);

    const firstRun = await runWithProgress(firstRepoPath);

    vi.restoreAllMocks();

    const secondRepoPath = createRepo();
    setupPipelineMocks(secondRepoPath);

    const secondRun = await runWithProgress(secondRepoPath);

    expect(firstRun.result.runId).toEqual(expect.any(String));
    expect(firstRun.result.runId.length).toBeGreaterThan(0);
    expect(firstRun.events).not.toHaveLength(0);
    expect(
      firstRun.events.every((event) => event.runId === firstRun.result.runId),
    ).toBe(true);
    expect(secondRun.result.runId).not.toBe(firstRun.result.runId);
  });

  it("TC-3.1a: progress events per stage", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath);

    const { events } = await runWithProgress(repoPath);
    const emittedStages = new Set(events.map((event) => event.stage));

    expect(emittedStages).toEqual(
      new Set([
        "checking-environment",
        "analyzing-structure",
        "planning-modules",
        "generating-module",
        "generating-overview",
        "validating-output",
        "writing-metadata",
        "complete",
      ]),
    );
  });

  it("TC-3.1b: stage sequence for full generation", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath);

    const { events } = await runWithProgress(repoPath);

    expect(events.map((event) => event.stage)).toEqual([
      "checking-environment",
      "analyzing-structure",
      "planning-modules",
      "generating-module",
      "generating-module",
      "generating-module",
      "generating-overview",
      "validating-output",
      "writing-metadata",
      "complete",
    ]);
  });

  it("TC-3.2a: per-module progress", async () => {
    const repoPath = createRepo();
    const fiveModulePlan: ModulePlan = {
      modules: Array.from({ length: 5 }, (_, index) => ({
        components: [`src/module-${index + 1}/index.ts`],
        description: `Module ${index + 1} description`,
        name: `module-${index + 1}`,
      })),
      unmappedComponents: [],
    };

    setupPipelineMocks(repoPath, {
      analysis: buildAnalysis(fiveModulePlan, { repoPath }),
      sdkConfig: {
        moduleGeneration: fiveModulePlan.modules.map((module) => ({
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
    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(
      ok(fiveModulePlan),
    );

    const { events } = await runWithProgress(repoPath);
    const moduleEvents = events.filter(
      (event) => event.stage === "generating-module",
    );

    expect(moduleEvents).toHaveLength(5);
    expect(moduleEvents).toEqual(
      fiveModulePlan.modules.map((module, index) => ({
        completed: index + 1,
        moduleName: module.name,
        runId: expect.any(String),
        stage: "generating-module",
        timestamp: expect.any(String),
        total: 5,
      })),
    );
  });

  it("TC-3.3a: runId consistent", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath);

    const { events, result } = await runWithProgress(repoPath);
    const runIds = new Set(events.map((event) => event.runId));

    expect(runIds).toEqual(new Set([result.runId]));
  });

  it("TC-3.4a: complete successful result", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath);

    const { result } = await runWithProgress(repoPath);

    expect(result.status).not.toBe("failure");
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
    expect(result.modulePlan).toEqual(CLUSTERING_PLAN);
    expect(result.validationResult).toEqual({
      errorCount: 0,
      findings: [],
      status: "pass",
      warningCount: 0,
    });
    expect(result.totalDurationMs).toBeGreaterThan(0);
    expect(result.commitHash).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(result.qualityReviewPasses).toBe(0);
  });

  it("TC-3.4b: cost when available", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath);

    const { result } = await runWithProgress(repoPath);

    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("TC-3.4c: cost when unavailable", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath, {
      sdkConfig: {
        overview: {
          output: OVERVIEW_PAGE,
        },
      },
    });

    const { result } = await runWithProgress(repoPath);

    expect(result.costUsd).toBeNull();
  });

  it("TC-3.4d: warnings surfaced", async () => {
    const repoPath = createRepo();
    const warningPlan: ModulePlan = {
      modules: [
        {
          components: ["src/core/index.ts", "src/core/service.ts"],
          description: "Core module",
          name: "core",
        },
        {
          components: ["src/thin/index.ts"],
          description: "Thin module",
          name: "thin",
        },
      ],
      unmappedComponents: [],
    };

    setupPipelineMocks(repoPath, {
      analysis: buildAnalysis(warningPlan, { repoPath }),
      sdkConfig: {
        moduleGeneration: [
          {
            output: buildModulePage("core", "Core"),
            usage: { inputTokens: 600, outputTokens: 300 },
          },
          {
            output: buildModulePage("thin", "Thin"),
            usage: { inputTokens: 500, outputTokens: 250 },
          },
        ],
        overview: {
          output: {
            content: "# Repository Overview\n\nWarning path.\n",
            mermaidDiagram: "broken[",
          },
          usage: { inputTokens: 450, outputTokens: 225 },
        },
      },
    });
    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(
      ok(warningPlan),
    );

    const { result } = await runWithProgress(repoPath);

    expect(result.validationResult!.status).toBe("warn");
    expect(result.validationResult!.warningCount).toBe(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Thin module "thin"'),
        expect.stringContaining("Malformed Mermaid block"),
      ]),
    );
  });

  it("no progress callback provided", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath);

    const result = expectSuccess(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    expect(result.status).not.toBe("failure");
  });

  it("progress callback errors are swallowed", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath);
    const events: DocumentationProgressEvent[] = [];

    const result = expectSuccess(
      await generateDocumentation(
        withInference({ mode: "full", repoPath }),
        (event) => {
          events.push(event);

          if (event.stage === "planning-modules") {
            throw new Error("progress callback failure");
          }
        },
      ),
    );

    expect(result.status).not.toBe("failure");
    expect(events.some((event) => event.stage === "complete")).toBe(true);
  });

  it("progress event timestamps ordered", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath);

    const { events } = await runWithProgress(repoPath);
    const timestamps = events.map((event) => Date.parse(event.timestamp));

    expect(
      timestamps.every(
        (timestamp, index) =>
          index === 0 || timestamp >= (timestamps[index - 1] ?? timestamp),
      ),
    ).toBe(true);
  });

  it("cost with mixed sessions (some with usage, some without)", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath, {
      sdkConfig: {
        moduleGeneration: [
          { output: API_PAGE, usage: { inputTokens: 1200, outputTokens: 700 } },
          { output: CORE_PAGE },
          {
            output: UTILS_PAGE,
            usage: { inputTokens: 1100, outputTokens: 650 },
          },
        ],
      },
    });

    const { result } = await runWithProgress(repoPath);

    expect(result.costUsd).toBeNull();
  });
});
