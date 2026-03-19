import { readFileSync, writeFileSync } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import * as analysisModule from "../../src/analysis/analyze.js";
import * as environmentModule from "../../src/environment/check.js";
import { generateDocumentation } from "../../src/index.js";
import * as inferenceRuntimeModule from "../../src/inference/runtime.js";
import * as modulePlanningStage from "../../src/orchestration/stages/module-planning.js";
import { ok } from "../../src/types/common.js";
import type {
  AnalysisOptions,
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

const createRepo = (config?: Record<string, unknown>): string => {
  const repoPath = createTempDir();
  tempDirs.push(repoPath);

  if (config) {
    writeFileSync(
      path.join(repoPath, ".liminal-docgen.json"),
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );
  }

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

const runHappyPath = async (repoPath = createRepo()) => {
  setupPipelineMocks(repoPath);
  return expectSuccess(
    await generateDocumentation(withInference({ mode: "full", repoPath })),
  );
};

afterEach(() => {
  vi.restoreAllMocks();

  for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
    cleanupTempDir(tempDir);
  }
});

describe("generateDocumentation", () => {
  it("TC-1.1a: successful full generation", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath);

    const result = expectSuccess(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    expect(result.mode).toBe("full");
    expect(result.commitHash).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(result.outputPath).toBe(path.join(repoPath, "docs/wiki"));
    expect(result.modulePlan).toEqual(CLUSTERING_PLAN);
    expect(result.generatedFiles).toEqual([
      ".doc-meta.json",
      ".module-plan.json",
      "api.md",
      "core.md",
      "module-tree.json",
      "overview.md",
      "utils.md",
    ]);
    expect(result.validationResult.status).toBe("pass");
    expect(result.qualityReviewPasses).toBe(0);
    expect(result.costUsd).toBeGreaterThan(0);

    const [corePage, overview, moduleTree, metadata, persistedPlan] =
      await Promise.all([
        readFile(path.join(result.outputPath, "core.md"), "utf8"),
        readFile(path.join(result.outputPath, "overview.md"), "utf8"),
        readFile(path.join(result.outputPath, "module-tree.json"), "utf8"),
        readFile(path.join(result.outputPath, ".doc-meta.json"), "utf8"),
        readFile(path.join(result.outputPath, ".module-plan.json"), "utf8"),
      ]);

    expect(corePage).toContain("src/index.ts");
    expect(corePage).toContain("src/config/resolver.ts");
    expect(overview).toContain("Core");
    expect(overview).toContain("API");
    expect(overview).toContain("Utils");
    expect(overview).toContain("```mermaid");
    expect(JSON.parse(moduleTree)).toEqual([
      { name: "api", page: "api.md" },
      { name: "core", page: "core.md" },
      { name: "utils", page: "utils.md" },
    ]);
    expect(JSON.parse(metadata)).toMatchObject({
      commitHash: result.commitHash,
      filesGenerated: result.generatedFiles,
      mode: "full",
      outputPath: "docs/wiki",
    });
    expect(JSON.parse(metadata)).toHaveProperty("generatedAt");
    expect(JSON.parse(persistedPlan)).toEqual(result.modulePlan);
  });

  it("TC-1.2a: request fields override config", async () => {
    const repoPath = createRepo({ outputPath: "docs/generated" });
    setupPipelineMocks(repoPath);

    const result = expectSuccess(
      await generateDocumentation({
        inference: TEST_INFERENCE_CONFIGURATION,
        mode: "full",
        outputPath: "docs/custom",
        repoPath,
      }),
    );

    expect(result.outputPath).toBe(path.join(repoPath, "docs/custom"));
    await expect(
      access(path.join(repoPath, "docs/custom", "overview.md")),
    ).resolves.toBeUndefined();
  });

  it("TC-1.4a: module pages written", async () => {
    const result = await runHappyPath();

    await expect(
      access(path.join(result.outputPath, "core.md")),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(result.outputPath, "api.md")),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(result.outputPath, "utils.md")),
    ).resolves.toBeUndefined();
  });

  it("TC-1.4b: module page references components", async () => {
    const result = await runHappyPath();
    const corePage = await readFile(
      path.join(result.outputPath, "core.md"),
      "utf8",
    );

    expect(corePage).toContain("src/index.ts");
    expect(corePage).toContain("src/config/resolver.ts");
  });

  it("TC-1.2b: defaults fill unset fields", async () => {
    const repoPath = createRepo();
    const { capturedAnalysisOptions } = setupPipelineMocks(repoPath);

    expectSuccess(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    expect(capturedAnalysisOptions).toHaveLength(1);
    expect(capturedAnalysisOptions[0]?.excludePatterns).toEqual(
      expect.arrayContaining(["**/node_modules/**", "**/.git/**"]),
    );
  });

  it("TC-1.2c: invalid request produces structured error", async () => {
    const createSdkSpy = vi.spyOn(
      inferenceRuntimeModule,
      "createInferenceRuntime",
    );
    const environmentSpy = vi.spyOn(environmentModule, "checkEnvironment");
    const analysisSpy = vi.spyOn(analysisModule, "analyzeRepository");

    const result = expectFailure(
      await generateDocumentation(
        withInference({ mode: "full", repoPath: "" }),
      ),
    );

    expect(result.failedStage).toBe("resolving-configuration");
    expect(result.error.code).toBe("CONFIGURATION_ERROR");
    expect(createSdkSpy).not.toHaveBeenCalled();
    expect(environmentSpy).not.toHaveBeenCalled();
    expect(analysisSpy).not.toHaveBeenCalled();
  });

  // Exercises a defensive code path: in production, the planner rejects empty
  // modules before the generator sees them. This test validates the fallback
  // placeholder page for zero-component modules.
  it("TC-1.4c: empty module handled", async () => {
    const repoPath = createRepo();
    const analysis = buildAnalysis(CLUSTERING_PLAN, { repoPath });

    setupPipelineMocks(repoPath, {
      analysis,
      sdkConfig: {
        moduleGeneration: [
          {
            output: {
              crossLinks: [],
              pageContent: "# Core\n\nCore module page.\n",
              title: "Core",
            },
          },
        ],
        overview: {
          output: {
            content:
              "# Repository Overview\n\nModules: empty and core.\n\n```mermaid\ngraph TD\n  empty --> core\n```",
            mermaidDiagram: "graph TD\n  empty --> core",
          },
        },
      },
    });

    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(
      ok({
        modules: [
          {
            components: [],
            description: "Placeholder module",
            name: "empty",
          },
          {
            components: ["src/index.ts"],
            description: "Core runtime",
            name: "core",
          },
        ],
        unmappedComponents: [],
      }),
    );

    const result = expectSuccess(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    const emptyPage = await readFile(
      path.join(result.outputPath, "empty.md"),
      "utf8",
    );
    expect(emptyPage).toContain("No repository components were assigned");
  });

  it("TC-1.5a: overview written", async () => {
    const result = await runHappyPath();

    await expect(
      access(path.join(result.outputPath, "overview.md")),
    ).resolves.toBeUndefined();
  });

  it("TC-1.5b: overview references modules", async () => {
    const result = await runHappyPath();
    const overview = await readFile(
      path.join(result.outputPath, "overview.md"),
      "utf8",
    );

    expect(overview).toContain("Core");
    expect(overview).toContain("API");
    expect(overview).toContain("Utils");
  });

  it("TC-1.5c: overview includes Mermaid", async () => {
    const result = await runHappyPath();
    const overview = await readFile(
      path.join(result.outputPath, "overview.md"),
      "utf8",
    );

    expect(overview).toContain("```mermaid");
  });

  it("renders structured documentation packets into stable module sections", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath, {
      sdkConfig: {
        moduleGeneration: [
          {
            output: {
              crossLinks: ["utils"],
              entityTable: [
                {
                  dependsOn: ["src/types/common.ts"],
                  kind: "function",
                  name: "bootstrapAuth",
                  publicEntrypoints: ["src/index.ts:bootstrapAuth"],
                  role: "Coordinates the authentication bootstrap entrypoint.",
                  usedBy: ["src/auth.ts"],
                },
              ],
              flowNotes: [
                {
                  action: "Starts the auth bootstrap flow",
                  actor: "src/index.ts",
                  output: "Initializes the runtime auth path",
                  step: 1,
                },
              ],
              overview:
                "Coordinates the top-level auth runtime and points readers to the core entrypoints.",
              packetMode: "full-packet",
              responsibilities: [
                "Initialize the auth runtime",
                "Delegate session setup to collaborators",
              ],
              sequenceDiagram:
                "sequenceDiagram\n  participant Index as src/index.ts\n  participant Auth as src/auth.ts\n  Index->>Auth: bootstrapAuth()",
              structureDiagram:
                "flowchart TD\n  Index[src/index.ts] --> Auth[src/auth.ts]",
              structureDiagramKind: "flowchart",
              title: "Core",
            },
            usage: { inputTokens: 1200, outputTokens: 700 },
          },
          {
            output: CORE_PAGE,
            usage: { inputTokens: 1400, outputTokens: 900 },
          },
          {
            output: UTILS_PAGE,
            usage: { inputTokens: 1100, outputTokens: 650 },
          },
        ],
      },
    });

    const result = expectSuccess(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );
    const corePage = await readFile(
      path.join(result.outputPath, "api.md"),
      "utf8",
    );

    expect(corePage).toContain("## Overview");
    expect(corePage).toContain("## Responsibilities");
    expect(corePage).toContain("## Structure Diagram");
    expect(corePage).toContain("## Entity Table");
    expect(corePage).toContain("## Key Flow");
    expect(corePage).toContain("## Flow Notes");
    expect(corePage).toContain("## Source Coverage");
    expect(corePage).toContain("sequenceDiagram");
    expect(corePage).toContain("bootstrapAuth");
  });

  it("repairs recoverable full-packet mismatches instead of failing the run", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath, {
      sdkConfig: {
        moduleGeneration: [
          {
            output: {
              crossLinks: [],
              entityTable: [
                {
                  dependsOn: [],
                  kind: "class",
                  name: "Analyzer",
                  publicEntrypoints: ["src/analyzer.ts:Analyzer"],
                  role: "Primary analyzer boundary.",
                  usedBy: [],
                },
              ],
              flowNotes: [],
              overview: "Analyzes structured module packets.",
              packetMode: "full-packet",
              responsibilities: ["Analyze module packet contracts"],
              sequenceDiagram: "",
              structureDiagram: "flowchart TD\n  Analyzer --> Packet",
              structureDiagramKind: "flowchart",
              title: "API",
            },
            usage: { inputTokens: 1200, outputTokens: 700 },
          },
          {
            output: {
              crossLinks: [],
              overview: "Analyzes structured module packets.",
              packetMode: "summary-only",
              responsibilities: ["Analyze module packet contracts"],
              title: "API",
            },
            usage: { inputTokens: 600, outputTokens: 300 },
          },
          {
            output: CORE_PAGE,
            usage: { inputTokens: 1400, outputTokens: 900 },
          },
          {
            output: UTILS_PAGE,
            usage: { inputTokens: 1100, outputTokens: 650 },
          },
        ],
      },
    });

    const result = expectSuccess(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );
    const apiPage = await readFile(
      path.join(result.outputPath, "api.md"),
      "utf8",
    );

    expect(apiPage).toContain("## Overview");
    expect(apiPage).toContain("## Responsibilities");
    expect(apiPage).not.toContain("## Key Flow");
    expect(apiPage).not.toContain("sequenceDiagram");
  });

  it("coerces repeated packet mismatches to summary-only after repair fails", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath, {
      sdkConfig: {
        moduleGeneration: [
          {
            output: {
              crossLinks: [],
              entityTable: [
                {
                  dependsOn: [],
                  kind: "class",
                  name: "Analyzer",
                  publicEntrypoints: ["src/analyzer.ts:Analyzer"],
                  role: "Primary analyzer boundary.",
                  usedBy: [],
                },
              ],
              flowNotes: [],
              overview: "Analyzes structured module packets.",
              packetMode: "full-packet",
              responsibilities: ["Analyze module packet contracts"],
              sequenceDiagram: "",
              structureDiagram: "flowchart TD\n  Analyzer --> Packet",
              structureDiagramKind: "flowchart",
              title: "API",
            },
            usage: { inputTokens: 1200, outputTokens: 700 },
          },
          {
            output: {
              crossLinks: [],
              entityTable: [
                {
                  dependsOn: [],
                  kind: "class",
                  name: "Analyzer",
                  publicEntrypoints: ["src/analyzer.ts:Analyzer"],
                  role: "Primary analyzer boundary.",
                  usedBy: [],
                },
              ],
              flowNotes: [],
              overview: "Analyzes structured module packets.",
              packetMode: "full-packet",
              responsibilities: ["Analyze module packet contracts"],
              sequenceDiagram: "",
              structureDiagram: "flowchart TD\n  Analyzer --> Packet",
              structureDiagramKind: "flowchart",
              title: "API",
            },
            usage: { inputTokens: 600, outputTokens: 300 },
          },
          {
            output: CORE_PAGE,
            usage: { inputTokens: 1400, outputTokens: 900 },
          },
          {
            output: UTILS_PAGE,
            usage: { inputTokens: 1100, outputTokens: 650 },
          },
        ],
      },
    });

    const result = expectSuccess(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );
    const apiPage = await readFile(
      path.join(result.outputPath, "api.md"),
      "utf8",
    );

    expect(apiPage).toContain("## Overview");
    expect(apiPage).not.toContain("## Structure Diagram");
    expect(apiPage).not.toContain("## Key Flow");
  });

  it("normalizes empty optional packet fields on summary-only modules", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath, {
      sdkConfig: {
        moduleGeneration: [
          {
            output: {
              crossLinks: [],
              entityTable: [
                {
                  dependsOn: [],
                  kind: "class",
                  name: "Analyzer",
                  publicEntrypoints: ["src/analyzer.ts:Analyzer"],
                  role: "Primary analyzer boundary.",
                  usedBy: [],
                },
              ],
              flowNotes: [],
              overview: "Analyzes structured module packets.",
              packetMode: "summary-only",
              responsibilities: ["Analyze module packet contracts"],
              sequenceDiagram: "",
              structureDiagram: "flowchart TD\n  Analyzer --> Packet",
              structureDiagramKind: "flowchart",
              title: "API",
            },
            usage: { inputTokens: 1200, outputTokens: 700 },
          },
          {
            output: CORE_PAGE,
            usage: { inputTokens: 1400, outputTokens: 900 },
          },
          {
            output: UTILS_PAGE,
            usage: { inputTokens: 1100, outputTokens: 650 },
          },
        ],
      },
    });

    const result = expectSuccess(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );
    const apiPage = await readFile(
      path.join(result.outputPath, "api.md"),
      "utf8",
    );

    expect(apiPage).toContain("## Overview");
    expect(apiPage).toContain("## Responsibilities");
    expect(apiPage).not.toContain("## Key Flow");
    expect(apiPage).not.toContain("sequenceDiagram");
  });

  it("strips sequence fields from summary-only packets even when the model returns placeholders", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath, {
      sdkConfig: {
        moduleGeneration: [
          {
            output: {
              crossLinks: [],
              flowNotes: [],
              overview: "Analyzes structured module packets.",
              packetMode: "summary-only",
              responsibilities: ["Analyze module packet contracts"],
              sequenceDiagram: "N/A",
              title: "API",
            },
            usage: { inputTokens: 1200, outputTokens: 700 },
          },
          {
            output: CORE_PAGE,
            usage: { inputTokens: 1400, outputTokens: 900 },
          },
          {
            output: UTILS_PAGE,
            usage: { inputTokens: 1100, outputTokens: 650 },
          },
        ],
      },
    });

    const result = expectSuccess(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );
    const apiPage = await readFile(
      path.join(result.outputPath, "api.md"),
      "utf8",
    );

    expect(apiPage).toContain("## Overview");
    expect(apiPage).not.toContain("## Key Flow");
    expect(apiPage).not.toContain("N/A");
  });

  it("TC-1.6a: module tree matches plan", async () => {
    const result = await runHappyPath();

    expect(
      JSON.parse(
        await readFile(
          path.join(result.outputPath, "module-tree.json"),
          "utf8",
        ),
      ),
    ).toEqual([
      { name: "api", page: "api.md" },
      { name: "core", page: "core.md" },
      { name: "utils", page: "utils.md" },
    ]);
  });

  it("TC-1.6b: hierarchical modules preserved", async () => {
    const repoPath = createRepo();
    const plan: ModulePlan = {
      modules: [
        {
          components: ["src/core/index.ts"],
          description: "Core area",
          name: "core",
        },
        {
          components: ["src/core/config.ts"],
          description: "Nested config",
          name: "core/config",
          parentModule: "core",
        },
      ],
      unmappedComponents: [],
    };

    setupPipelineMocks(repoPath, {
      analysis: buildAnalysis(plan, { repoPath }),
      sdkConfig: {
        moduleGeneration: [
          {
            output: {
              crossLinks: ["core/config"],
              pageContent: "# Core\n\nTop-level module.\n",
              title: "Core",
            },
          },
          {
            output: {
              crossLinks: ["core"],
              pageContent: "# Core Config\n\nNested module.\n",
              title: "Core Config",
            },
          },
        ],
        overview: {
          output: {
            content:
              "# Repository Overview\n\n```mermaid\ngraph TD\n  core --> core_config\n```",
            mermaidDiagram: "graph TD\n  core --> core_config",
          },
        },
      },
    });

    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(ok(plan));

    const result = expectSuccess(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    expect(
      JSON.parse(
        await readFile(
          path.join(result.outputPath, "module-tree.json"),
          "utf8",
        ),
      ),
    ).toEqual([
      {
        children: [{ name: "core/config", page: "coreconfig.md" }],
        name: "core",
        page: "core.md",
      },
    ]);
  });

  it("TC-1.7b: file names derived from module names", async () => {
    const repoPath = createRepo();
    const plan: ModulePlan = {
      modules: [
        {
          components: ["src/middleware/auth.ts"],
          description: "Auth middleware",
          name: "auth-middleware",
        },
      ],
      unmappedComponents: [],
    };

    setupPipelineMocks(repoPath, {
      analysis: buildAnalysis(plan, { repoPath }),
      sdkConfig: {
        moduleGeneration: [
          {
            output: {
              crossLinks: [],
              pageContent: "# Auth Middleware\n\nMiddleware details.\n",
              title: "Auth Middleware",
            },
          },
        ],
        overview: {
          output: {
            content:
              "# Repository Overview\n\n```mermaid\ngraph TD\n  auth_middleware\n```",
            mermaidDiagram: "graph TD\n  auth_middleware",
          },
        },
      },
    });

    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(ok(plan));

    const result = expectSuccess(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    await expect(
      access(path.join(result.outputPath, "auth-middleware.md")),
    ).resolves.toBeUndefined();
  });

  it("TC-1.7a: structural convention", async () => {
    const result = await runHappyPath();
    const actualFiles = await readdir(result.outputPath);

    expect(new Set(actualFiles)).toEqual(
      new Set([
        ".doc-meta.json",
        ".module-plan.json",
        "api.md",
        "core.md",
        "module-tree.json",
        "overview.md",
        "utils.md",
      ]),
    );
  });

  it("TC-1.8a: successful result includes validationResult", async () => {
    const result = await runHappyPath();

    expect(result.validationResult).toBeDefined();
    expect(result.validationResult.status).toBe("pass");
    expect(result.validationResult).toHaveProperty("errorCount");
    expect(result.validationResult).toHaveProperty("warningCount");
    expect(result.validationResult).toHaveProperty("findings");
  });

  it("TC-1.8b: validation failures fail the run", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath, {
      sdkConfig: {
        overview: {
          output: {
            content:
              "# Repository Overview\n\n[Broken](./missing.md)\n\n```mermaid\ngraph TD\n  Core --> API\n```",
            mermaidDiagram: "graph TD\n  Core --> API",
          },
        },
      },
    });

    const result = expectFailure(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    expect(result.failedStage).toBe("validating-output");
    expect(result.validationResult).toMatchObject({
      errorCount: 1,
      status: "fail",
    });
    await expect(
      access(path.join(repoPath, "docs/wiki", ".doc-meta.json")),
    ).rejects.toBeDefined();
    await expect(
      access(path.join(repoPath, "docs/wiki", ".module-plan.json")),
    ).rejects.toBeDefined();
    await expect(
      access(path.join(repoPath, "docs/wiki", "core.md")),
    ).resolves.toBeUndefined();
  });

  it("TC-1.9a: metadata reflects generation", async () => {
    const result = await runHappyPath();

    const metadata = JSON.parse(
      await readFile(path.join(result.outputPath, ".doc-meta.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      commitHash: result.commitHash,
      filesGenerated: result.generatedFiles,
      mode: "full",
    });
    expect(typeof metadata.generatedAt).toBe("string");
  });

  it("TC-1.10a: module plan persisted", async () => {
    const result = await runHappyPath();

    await expect(
      access(path.join(result.outputPath, ".module-plan.json")),
    ).resolves.toBeUndefined();
  });

  it("TC-1.10b: persisted plan matches result", async () => {
    const result = await runHappyPath();
    const persistedPlan = JSON.parse(
      await readFile(path.join(result.outputPath, ".module-plan.json"), "utf8"),
    ) as ModulePlan;

    expect(persistedPlan).toEqual(result.modulePlan);
  });

  it("non-TC: module generation session timeout", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath, {
      sdkConfig: {
        callOverrides: {
          1: {
            code: "ORCHESTRATION_ERROR",
            details: { timeoutMs: 30_000 },
            message: "Module generation timed out",
          },
        },
      },
    });

    const result = expectFailure(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    expect(result.failedStage).toBe("generating-module");
    expect(result.error.message).toContain("Module generation failed");
  });

  it("non-TC: overview with zero cross-links", async () => {
    const repoPath = createRepo();
    const plan: ModulePlan = {
      modules: [
        {
          components: ["src/index.ts"],
          description: "Standalone module",
          name: "standalone",
        },
      ],
      unmappedComponents: [],
    };

    setupPipelineMocks(repoPath, {
      analysis: buildAnalysis(plan, { repoPath }),
      sdkConfig: {
        moduleGeneration: [
          {
            output: {
              crossLinks: [],
              pageContent: "# Standalone\n\nSingle isolated module.\n",
              title: "Standalone",
            },
          },
        ],
        overview: {
          output: {
            content:
              "# Repository Overview\n\nStandalone repo.\n\n```mermaid\ngraph TD\n  standalone\n```",
            mermaidDiagram: "graph TD\n  standalone",
          },
        },
      },
    });

    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(ok(plan));

    const result = expectSuccess(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    expect(result.validationResult.status).toBe("pass");
    expect(result.generatedFiles).toContain("standalone.md");
  });

  it("non-TC: output directory creation", async () => {
    const repoPath = createRepo();
    const outputPath = path.join(repoPath, "docs/wiki");

    await expect(access(outputPath)).rejects.toBeDefined();

    await runHappyPath(repoPath);

    await expect(access(outputPath)).resolves.toBeUndefined();
  });

  it("non-TC: filename collision fails deterministically", async () => {
    const repoPath = createRepo();
    const plan: ModulePlan = {
      modules: [
        {
          components: ["src/one.ts"],
          description: "First colliding module",
          name: "my/module",
        },
        {
          components: ["src/two.ts"],
          description: "Second colliding module",
          name: "mymodule",
        },
      ],
      unmappedComponents: [],
    };

    setupPipelineMocks(repoPath, {
      analysis: buildAnalysis(plan, { repoPath }),
      sdkConfig: {
        moduleGeneration: [],
        overview: {
          output: OVERVIEW_PAGE,
        },
      },
    });

    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(ok(plan));

    const result = expectFailure(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    expect(result.failedStage).toBe("generating-module");
    expect(result.error.code).toBe("ORCHESTRATION_ERROR");
    expect(result.error.details).toMatchObject({
      collisions: [
        {
          fileName: "mymodule.md",
          moduleNames: ["my/module", "mymodule"],
        },
      ],
    });
  });

  it("non-TC: empty module plan fails before generation", async () => {
    const repoPath = createRepo();
    setupPipelineMocks(repoPath);

    vi.spyOn(modulePlanningStage, "planModules").mockResolvedValue(
      ok({ modules: [], unmappedComponents: [] }),
    );

    const result = expectFailure(
      await generateDocumentation(withInference({ mode: "full", repoPath })),
    );

    expect(result.failedStage).toBe("planning-modules");
    expect(result.error.code).toBe("ORCHESTRATION_ERROR");
  });
});
