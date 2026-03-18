import { readFileSync } from "node:fs";
import { mkdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

import * as agentSdkModule from "../../src/adapters/agent-sdk.js";
import * as gitModule from "../../src/adapters/git.js";
import * as analysisModule from "../../src/analysis/analyze.js";
import * as environmentModule from "../../src/environment/check.js";
import { writeMetadata } from "../../src/metadata/writer.js";
import { generateDocumentation } from "../../src/orchestration/generate.js";
import { ok } from "../../src/types/common.js";
import { moduleNameToFileName } from "../../src/types/generation.js";
import type {
  ChangedFile,
  DocumentationProgressEvent,
  ModuleGenerationResult,
  ModulePlan,
  OverviewGenerationResult,
  RepositoryAnalysis,
} from "../../src/types/index.js";
import * as validationModule from "../../src/validation/validate.js";
import {
  createMockSDK,
  type MockSDKConfig,
} from "../helpers/agent-sdk-mock.js";
import { TEST_INFERENCE_CONFIGURATION } from "../helpers/inference.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const FIXTURE_BASE_URL = new URL("../fixtures/agent-sdk/", import.meta.url);
const FIXED_PRIOR_TIME = new Date("2026-01-01T00:00:00.000Z");
const PRIOR_COMMIT = "1111111111111111111111111111111111111111";
const CURRENT_COMMIT = "2222222222222222222222222222222222222222";

const loadJsonFixture = <T>(fileName: string): T =>
  JSON.parse(readFileSync(new URL(fileName, FIXTURE_BASE_URL), "utf8")) as T;

const OVERVIEW_PAGE = loadJsonFixture<OverviewGenerationResult>(
  "overview-success.json",
);

const BASE_PLAN: ModulePlan = {
  modules: [
    {
      components: ["src/core/index.ts", "src/core/service.ts"],
      description: "Core module",
      name: "core",
    },
    {
      components: ["src/api/index.ts", "src/api/client.ts"],
      description: "API module",
      name: "api",
    },
    {
      components: ["src/utils/format.ts", "src/utils/types.ts"],
      description: "Utils module",
      name: "utils",
    },
  ],
  unmappedComponents: ["scripts/dev.ts"],
};

const FIVE_MODULE_PLAN: ModulePlan = {
  modules: Array.from({ length: 5 }, (_, index) => ({
    components: [`src/module-${index + 1}/index.ts`],
    description: `Module ${index + 1}`,
    name: `module-${index + 1}`,
  })),
  unmappedComponents: [],
};

const LEGACY_PLAN: ModulePlan = {
  modules: [
    ...BASE_PLAN.modules,
    {
      components: ["src/legacy/index.ts"],
      description: "Legacy module",
      name: "legacy",
    },
  ],
  unmappedComponents: [],
};

const tempDirs: string[] = [];

const createRepo = (): string => {
  const repoPath = createTempDir();
  tempDirs.push(repoPath);
  return repoPath;
};

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
    commitHash: overrides.commitHash ?? CURRENT_COMMIT,
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
    relationships: overrides.relationships ?? [],
    repoPath,
    summary: {
      languagesFound: ["typescript"],
      languagesSkipped: [],
      totalComponents: componentPaths.length,
      totalFilesAnalyzed: componentPaths.length,
      totalRelationships: (overrides.relationships ?? []).length,
    },
    ...overrides,
  };
};

const buildModulePage = (
  moduleName: string,
  components: string[],
): ModuleGenerationResult => ({
  crossLinks: [],
  pageContent: [
    `# ${moduleName}`,
    "",
    "## Components",
    "",
    ...components.map((componentPath) => `- ${componentPath}`),
  ].join("\n"),
  title: moduleName,
});

const buildOverviewPage = (
  moduleNames: string[],
): OverviewGenerationResult => ({
  content: [
    "# Repository Overview",
    "",
    ...moduleNames.map(
      (moduleName) =>
        `- [${moduleName}](./${moduleNameToFileName(moduleName)})`,
    ),
  ].join("\n"),
  mermaidDiagram: `graph TD\n${moduleNames
    .map((moduleName) => `  ${moduleName.replace(/[^a-z0-9]/gi, "_")}`)
    .join("\n")}`,
});

const writePriorOutput = async (
  repoPath: string,
  plan: ModulePlan,
  options: {
    commitHash?: string;
    generatedAt?: string;
    includeMetadata?: boolean;
    includeModulePlan?: boolean;
  } = {},
): Promise<string> => {
  const outputPath = path.join(repoPath, "docs/wiki");
  await mkdir(outputPath, { recursive: true });

  for (const module of plan.modules) {
    await writeFile(
      path.join(outputPath, moduleNameToFileName(module.name)),
      `${buildModulePage(module.name, module.components).pageContent}\n`,
      "utf8",
    );
  }

  await writeFile(
    path.join(outputPath, "overview.md"),
    `${buildOverviewPage(plan.modules.map((module) => module.name)).content}\n`,
    "utf8",
  );
  await writeFile(
    path.join(outputPath, "module-tree.json"),
    `${JSON.stringify(
      plan.modules.map((module) => ({
        name: module.name,
        page: moduleNameToFileName(module.name),
      })),
      null,
      2,
    )}\n`,
    "utf8",
  );

  if (options.includeModulePlan ?? true) {
    await writeFile(
      path.join(outputPath, ".module-plan.json"),
      `${JSON.stringify(plan, null, 2)}\n`,
      "utf8",
    );
  }

  if (options.includeMetadata ?? true) {
    await writeMetadata({
      metadata: {
        commitHash: options.commitHash ?? PRIOR_COMMIT,
        componentCount: countComponents(plan),
        filesGenerated: [
          ...plan.modules.map((module) => moduleNameToFileName(module.name)),
          "module-tree.json",
          "overview.md",
        ].sort(),
        generatedAt: options.generatedAt ?? "2026-01-01T00:00:00.000Z",
        mode: "full",
        outputPath: "docs/wiki",
      },
      outputPath,
    });
  }

  await setFixedTimes(outputPath, [
    ...plan.modules.map((module) => moduleNameToFileName(module.name)),
    ".doc-meta.json",
    ".module-plan.json",
    "module-tree.json",
    "overview.md",
  ]);

  return outputPath;
};

const countComponents = (plan: ModulePlan): number =>
  plan.modules.reduce(
    (total, module) => total + module.components.length,
    plan.unmappedComponents.length,
  );

const setFixedTimes = async (
  outputPath: string,
  fileNames: string[],
): Promise<void> => {
  await Promise.all(
    fileNames.map(async (fileName) => {
      const filePath = path.join(outputPath, fileName);

      try {
        await utimes(filePath, FIXED_PRIOR_TIME, FIXED_PRIOR_TIME);
      } catch {
        // Some tests intentionally omit files.
      }
    }),
  );
};

const setupUpdateMocks = ({
  analysis,
  changedFiles = [],
  currentCommitHash = CURRENT_COMMIT,
  sdkConfig = {},
}: {
  analysis: RepositoryAnalysis;
  changedFiles?: ChangedFile[];
  currentCommitHash?: string;
  sdkConfig?: MockSDKConfig;
}) => {
  const sdk = createMockSDK({
    moduleGeneration: [],
    overview: {
      output: OVERVIEW_PAGE,
      usage: { inputTokens: 400, outputTokens: 200 },
    },
    qualityReview: {
      output: [],
      usage: { inputTokens: 200, outputTokens: 100 },
    },
    ...sdkConfig,
  });

  vi.spyOn(agentSdkModule, "createAgentSDKAdapter").mockReturnValue(sdk);
  vi.spyOn(environmentModule, "checkEnvironment").mockResolvedValue(
    ok({
      detectedLanguages: ["typescript"],
      findings: [],
      passed: true,
    }),
  );
  vi.spyOn(analysisModule, "analyzeRepository").mockResolvedValue(ok(analysis));
  vi.spyOn(gitModule, "getHeadCommitHash").mockResolvedValue(currentCommitHash);
  vi.spyOn(gitModule, "getChangedFilesBetweenCommits").mockResolvedValue(
    changedFiles,
  );

  return {
    changedFilesSpy: vi.mocked(gitModule.getChangedFilesBetweenCommits),
  };
};

const runUpdate = async (
  repoPath: string,
  onProgress?: (event: DocumentationProgressEvent) => void,
) =>
  generateDocumentation(
    {
      inference: TEST_INFERENCE_CONFIGURATION,
      mode: "update",
      repoPath,
    },
    onProgress,
  );

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
    throw new Error("Expected update to fail");
  }

  return result;
};

const getModuleResponses = (
  plan: ModulePlan,
  moduleNames: string[],
): MockSDKConfig["moduleGeneration"] =>
  moduleNames.toSorted().map((moduleName) => {
    const module = plan.modules.find(
      (candidate) => candidate.name === moduleName,
    );

    if (!module) {
      throw new Error(`Missing module "${moduleName}" in plan`);
    }

    return {
      output: buildModulePage(module.name, module.components),
      usage: { inputTokens: 500, outputTokens: 250 },
    };
  });

afterEach(() => {
  vi.restoreAllMocks();

  for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
    cleanupTempDir(tempDir);
  }
});

describe("generateDocumentation update mode", () => {
  it("TC-2.1a: no prior metadata", async () => {
    const repoPath = createRepo();
    setupUpdateMocks({
      analysis: buildAnalysis(BASE_PLAN, repoPath),
    });

    const result = expectFailure(await runUpdate(repoPath));

    expect(result.error.code).toBe("METADATA_ERROR");
  });

  it("TC-2.1b: invalid prior metadata", async () => {
    const repoPath = createRepo();
    const outputPath = path.join(repoPath, "docs/wiki");
    await mkdir(outputPath, { recursive: true });
    await writeFile(
      path.join(outputPath, ".doc-meta.json"),
      "{bad json",
      "utf8",
    );
    await writeFile(
      path.join(outputPath, ".module-plan.json"),
      `${JSON.stringify(BASE_PLAN, null, 2)}\n`,
      "utf8",
    );
    setupUpdateMocks({
      analysis: buildAnalysis(BASE_PLAN, repoPath),
    });

    const result = expectFailure(await runUpdate(repoPath));

    expect(result.error.code).toBe("METADATA_ERROR");
  });

  it("TC-2.1c: missing persisted module plan", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN, { includeModulePlan: false });
    setupUpdateMocks({
      analysis: buildAnalysis(BASE_PLAN, repoPath),
    });

    const result = expectFailure(await runUpdate(repoPath));

    expect(result.error.code).toBe("METADATA_ERROR");
    expect(result.error.message).toContain("persisted module plan");
  });

  it("TC-3.1c: stage sequence for update", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    const analysis = buildAnalysis(BASE_PLAN, repoPath);
    setupUpdateMocks({
      analysis,
      changedFiles: [{ changeType: "modified", path: "src/core/index.ts" }],
      sdkConfig: {
        moduleGeneration: getModuleResponses(BASE_PLAN, ["core"]),
      },
    });

    const events: DocumentationProgressEvent[] = [];
    expectSuccess(await runUpdate(repoPath, (event) => events.push(event)));

    expect(events.map((event) => event.stage)).toEqual([
      "checking-environment",
      "computing-changes",
      "analyzing-structure",
      "planning-modules",
      "generating-module",
      "validating-output",
      "writing-metadata",
      "complete",
    ]);
  });

  it("TC-3.2b: update per-module progress", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, FIVE_MODULE_PLAN);
    const analysis = buildAnalysis(FIVE_MODULE_PLAN, repoPath);
    setupUpdateMocks({
      analysis,
      changedFiles: [
        { changeType: "modified", path: "src/module-2/index.ts" },
        { changeType: "modified", path: "src/module-4/index.ts" },
      ],
      sdkConfig: {
        moduleGeneration: getModuleResponses(FIVE_MODULE_PLAN, [
          "module-2",
          "module-4",
        ]),
      },
    });

    const events: DocumentationProgressEvent[] = [];
    expectSuccess(await runUpdate(repoPath, (event) => events.push(event)));

    expect(
      events.filter((event) => event.stage === "generating-module"),
    ).toEqual([
      {
        completed: 1,
        moduleName: "module-2",
        runId: expect.any(String),
        stage: "generating-module",
        timestamp: expect.any(String),
        total: 2,
      },
      {
        completed: 2,
        moduleName: "module-4",
        runId: expect.any(String),
        stage: "generating-module",
        timestamp: expect.any(String),
        total: 2,
      },
    ]);
  });

  it("TC-2.2a: changed files detected", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    const analysis = buildAnalysis(BASE_PLAN, repoPath);
    const changedFiles = [
      { changeType: "modified", path: "src/core/index.ts" },
      { changeType: "modified", path: "src/api/client.ts" },
      { changeType: "modified", path: "src/utils/types.ts" },
    ] satisfies ChangedFile[];
    const { changedFilesSpy } = setupUpdateMocks({
      analysis,
      changedFiles,
      sdkConfig: {
        moduleGeneration: getModuleResponses(BASE_PLAN, [
          "api",
          "core",
          "utils",
        ]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(changedFilesSpy).toHaveBeenCalledWith(
      repoPath,
      PRIOR_COMMIT,
      CURRENT_COMMIT,
    );
    expect(result.updatedModules).toEqual(["api", "core", "utils"]);
  });

  it("TC-2.2b: no changes", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    const analysis = buildAnalysis(BASE_PLAN, repoPath, {
      commitHash: PRIOR_COMMIT,
    });
    setupUpdateMocks({
      analysis,
      changedFiles: [],
      currentCommitHash: PRIOR_COMMIT,
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.updatedModules).toEqual([]);
    expect(result.unchangedModules).toEqual(["api", "core", "utils"]);
    expect(result.overviewRegenerated).toBe(false);
  });

  it("TC-2.2c: new files added", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    const currentPlan: ModulePlan = {
      ...BASE_PLAN,
      modules: BASE_PLAN.modules.map((module) =>
        module.name === "core"
          ? {
              ...module,
              components: [...module.components, "src/core/new-feature.ts"],
            }
          : module.name === "api"
            ? {
                ...module,
                components: [...module.components, "src/api/new-client.ts"],
              }
            : module,
      ),
    };
    setupUpdateMocks({
      analysis: buildAnalysis(currentPlan, repoPath),
      changedFiles: [
        { changeType: "added", path: "src/core/new-feature.ts" },
        { changeType: "added", path: "src/api/new-client.ts" },
      ],
      sdkConfig: {
        moduleGeneration: getModuleResponses(currentPlan, ["api", "core"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.updatedModules).toEqual(["api", "core"]);
    expect(
      result.modulePlan.modules.find((module) => module.name === "core"),
    ).toMatchObject({
      components: expect.arrayContaining(["src/core/new-feature.ts"]),
    });
    expect(
      result.modulePlan.modules.find((module) => module.name === "api"),
    ).toMatchObject({
      components: expect.arrayContaining(["src/api/new-client.ts"]),
    });
  });

  it("TC-2.2d: files deleted", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    const currentPlan: ModulePlan = {
      ...BASE_PLAN,
      modules: BASE_PLAN.modules.map((module) =>
        module.name === "api"
          ? {
              ...module,
              components: module.components.filter(
                (component) => component !== "src/api/client.ts",
              ),
            }
          : module,
      ),
    };
    setupUpdateMocks({
      analysis: buildAnalysis(currentPlan, repoPath),
      changedFiles: [{ changeType: "deleted", path: "src/api/client.ts" }],
      sdkConfig: {
        moduleGeneration: getModuleResponses(currentPlan, ["api"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.updatedModules).toEqual(["api"]);
  });

  it("TC-2.3a: change maps to specific module", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    setupUpdateMocks({
      analysis: buildAnalysis(BASE_PLAN, repoPath),
      changedFiles: [{ changeType: "modified", path: "src/core/service.ts" }],
      sdkConfig: {
        moduleGeneration: getModuleResponses(BASE_PLAN, ["core"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.updatedModules).toEqual(["core"]);
    expect(result.unchangedModules).toEqual(["api", "utils"]);
  });

  it("TC-2.3b: change in unmapped component", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    setupUpdateMocks({
      analysis: buildAnalysis(BASE_PLAN, repoPath),
      changedFiles: [{ changeType: "modified", path: "scripts/dev.ts" }],
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.updatedModules).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("scripts/dev.ts"),
        expect.stringContaining("unmapped component"),
      ]),
    );
  });

  it("TC-2.3c: new file maps to existing module", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    const currentPlan: ModulePlan = {
      ...BASE_PLAN,
      modules: BASE_PLAN.modules.map((module) =>
        module.name === "core"
          ? {
              ...module,
              components: [...module.components, "src/core/new-file.ts"],
            }
          : module,
      ),
    };
    setupUpdateMocks({
      analysis: buildAnalysis(currentPlan, repoPath),
      changedFiles: [{ changeType: "added", path: "src/core/new-file.ts" }],
      sdkConfig: {
        moduleGeneration: getModuleResponses(currentPlan, ["core"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.updatedModules).toEqual(["core"]);
    expect(
      result.modulePlan.modules.find((module) => module.name === "core"),
    ).toMatchObject({
      components: expect.arrayContaining(["src/core/new-file.ts"]),
    });
  });

  it("TC-2.3d: new file not mappable to any existing module", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    const currentPlan: ModulePlan = {
      ...BASE_PLAN,
      unmappedComponents: [
        ...BASE_PLAN.unmappedComponents,
        "src/new-area/file.ts",
      ],
    };
    setupUpdateMocks({
      analysis: buildAnalysis(currentPlan, repoPath),
      changedFiles: [{ changeType: "added", path: "src/new-area/file.ts" }],
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.updatedModules).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("src/new-area/file.ts"),
        expect.stringContaining("Run full generation"),
      ]),
    );
  });

  it("TC-2.4a: targeted regeneration", async () => {
    const repoPath = createRepo();
    const outputPath = await writePriorOutput(repoPath, BASE_PLAN);
    const corePath = path.join(outputPath, "core.md");
    const apiPath = path.join(outputPath, "api.md");
    const utilsPath = path.join(outputPath, "utils.md");
    setupUpdateMocks({
      analysis: buildAnalysis(BASE_PLAN, repoPath),
      changedFiles: [{ changeType: "modified", path: "src/core/index.ts" }],
      sdkConfig: {
        moduleGeneration: getModuleResponses(BASE_PLAN, ["core"]),
      },
    });

    expectSuccess(await runUpdate(repoPath));

    expect((await stat(corePath)).mtimeMs).toBeGreaterThan(
      FIXED_PRIOR_TIME.getTime(),
    );
    expect((await stat(apiPath)).mtimeMs).toBe(FIXED_PRIOR_TIME.getTime());
    expect((await stat(utilsPath)).mtimeMs).toBe(FIXED_PRIOR_TIME.getTime());
  });

  it("TC-2.4b: multiple affected modules", async () => {
    const repoPath = createRepo();
    const outputPath = await writePriorOutput(repoPath, BASE_PLAN);
    const corePath = path.join(outputPath, "core.md");
    const apiPath = path.join(outputPath, "api.md");
    const utilsPath = path.join(outputPath, "utils.md");
    setupUpdateMocks({
      analysis: buildAnalysis(BASE_PLAN, repoPath),
      changedFiles: [
        { changeType: "modified", path: "src/core/index.ts" },
        { changeType: "modified", path: "src/api/index.ts" },
      ],
      sdkConfig: {
        moduleGeneration: getModuleResponses(BASE_PLAN, ["api", "core"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.updatedModules).toEqual(["api", "core"]);
    expect((await stat(corePath)).mtimeMs).toBeGreaterThan(
      FIXED_PRIOR_TIME.getTime(),
    );
    expect((await stat(apiPath)).mtimeMs).toBeGreaterThan(
      FIXED_PRIOR_TIME.getTime(),
    );
    expect((await stat(utilsPath)).mtimeMs).toBe(FIXED_PRIOR_TIME.getTime());
  });

  it("TC-2.5a: new file triggers module regeneration", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    const currentPlan: ModulePlan = {
      ...BASE_PLAN,
      modules: BASE_PLAN.modules.map((module) =>
        module.name === "core"
          ? {
              ...module,
              components: [...module.components, "src/core/new-worker.ts"],
            }
          : module,
      ),
    };
    setupUpdateMocks({
      analysis: buildAnalysis(currentPlan, repoPath),
      changedFiles: [{ changeType: "added", path: "src/core/new-worker.ts" }],
      sdkConfig: {
        moduleGeneration: getModuleResponses(currentPlan, ["core"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));
    const corePage = await readFile(
      path.join(result.outputPath, "core.md"),
      "utf8",
    );

    expect(corePage).toContain("src/core/new-worker.ts");
  });

  it("TC-2.5b: deleted file triggers module regeneration", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    const currentPlan: ModulePlan = {
      ...BASE_PLAN,
      modules: BASE_PLAN.modules.map((module) =>
        module.name === "api"
          ? {
              ...module,
              components: module.components.filter(
                (component) => component !== "src/api/client.ts",
              ),
            }
          : module,
      ),
    };
    setupUpdateMocks({
      analysis: buildAnalysis(currentPlan, repoPath),
      changedFiles: [{ changeType: "deleted", path: "src/api/client.ts" }],
      sdkConfig: {
        moduleGeneration: getModuleResponses(currentPlan, ["api"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));
    const apiPage = await readFile(
      path.join(result.outputPath, "api.md"),
      "utf8",
    );

    expect(apiPage).not.toContain("src/api/client.ts");
  });

  it("TC-2.5c: relationship change affects both sides", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    setupUpdateMocks({
      analysis: buildAnalysis(BASE_PLAN, repoPath, {
        relationships: [
          {
            source: "src/core/index.ts",
            target: "src/utils/format.ts",
            type: "import",
          },
        ],
      }),
      changedFiles: [{ changeType: "modified", path: "src/core/index.ts" }],
      sdkConfig: {
        moduleGeneration: getModuleResponses(BASE_PLAN, ["core", "utils"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.updatedModules).toEqual(["core", "utils"]);
  });

  it("TC-2.6a: module removed triggers overview regeneration", async () => {
    const repoPath = createRepo();
    const outputPath = await writePriorOutput(repoPath, LEGACY_PLAN);
    const currentPlan: ModulePlan = {
      modules: LEGACY_PLAN.modules.filter((module) => module.name !== "legacy"),
      unmappedComponents: [],
    };
    setupUpdateMocks({
      analysis: buildAnalysis(currentPlan, repoPath),
      changedFiles: [{ changeType: "deleted", path: "src/legacy/index.ts" }],
      sdkConfig: {
        overview: {
          output: buildOverviewPage(["api", "core", "utils"]),
          usage: { inputTokens: 450, outputTokens: 225 },
        },
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.overviewRegenerated).toBe(true);
    await expect(
      stat(path.join(outputPath, moduleNameToFileName("legacy"))),
    ).rejects.toThrow();
    expect(
      JSON.parse(
        await readFile(path.join(outputPath, ".module-plan.json"), "utf8"),
      ),
    ).toEqual(result.modulePlan);
    expect(
      result.modulePlan.modules.map((module) => module.name).sort(),
    ).toEqual(["api", "core", "utils"]);
    expect(
      JSON.parse(
        await readFile(path.join(outputPath, "module-tree.json"), "utf8"),
      ),
    ).toEqual([
      { name: "api", page: "api.md" },
      { name: "core", page: "core.md" },
      { name: "utils", page: "utils.md" },
    ]);
  });

  it("TC-2.6b: content changes skip overview", async () => {
    const repoPath = createRepo();
    const outputPath = await writePriorOutput(repoPath, BASE_PLAN);
    setupUpdateMocks({
      analysis: buildAnalysis(BASE_PLAN, repoPath),
      changedFiles: [{ changeType: "modified", path: "src/core/index.ts" }],
      sdkConfig: {
        moduleGeneration: getModuleResponses(BASE_PLAN, ["core"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.overviewRegenerated).toBe(false);
    expect((await stat(path.join(outputPath, "overview.md"))).mtimeMs).toBe(
      FIXED_PRIOR_TIME.getTime(),
    );
  });

  it("TC-2.6c: unmappable files do not create modules", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    const currentPlan: ModulePlan = {
      ...BASE_PLAN,
      unmappedComponents: [
        ...BASE_PLAN.unmappedComponents,
        "src/brand-new/index.ts",
      ],
    };
    setupUpdateMocks({
      analysis: buildAnalysis(currentPlan, repoPath),
      changedFiles: [{ changeType: "added", path: "src/brand-new/index.ts" }],
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.modulePlan.modules.map((module) => module.name)).toEqual([
      "core",
      "api",
      "utils",
    ]);
    expect(result.overviewRegenerated).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("src/brand-new/index.ts"),
      ]),
    );
  });

  it("TC-2.7a: metadata updated after successful update", async () => {
    const repoPath = createRepo();
    const outputPath = await writePriorOutput(repoPath, BASE_PLAN, {
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    setupUpdateMocks({
      analysis: buildAnalysis(BASE_PLAN, repoPath),
      changedFiles: [{ changeType: "modified", path: "src/core/index.ts" }],
      sdkConfig: {
        moduleGeneration: getModuleResponses(BASE_PLAN, ["core"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));
    const metadata = JSON.parse(
      await readFile(path.join(outputPath, ".doc-meta.json"), "utf8"),
    );

    expect(metadata.mode).toBe("update");
    expect(metadata.commitHash).toBe(CURRENT_COMMIT);
    expect(metadata.generatedAt).not.toBe("2026-01-01T00:00:00.000Z");
    expect(result.commitHash).toBe(CURRENT_COMMIT);
  });

  it("TC-2.8a: update result fields", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    setupUpdateMocks({
      analysis: buildAnalysis(BASE_PLAN, repoPath),
      changedFiles: [
        { changeType: "modified", path: "src/core/index.ts" },
        { changeType: "modified", path: "src/api/index.ts" },
      ],
      sdkConfig: {
        moduleGeneration: getModuleResponses(BASE_PLAN, ["api", "core"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.updatedModules).toEqual(["api", "core"]);
    expect(result.unchangedModules).toEqual(["utils"]);
    expect(result.overviewRegenerated).toBe(false);
  });

  it("TC-4.1b: validation runs post-update against the full output directory", async () => {
    const repoPath = createRepo();
    const outputPath = await writePriorOutput(repoPath, BASE_PLAN);
    const validationSpy = vi.spyOn(validationModule, "validateDocumentation");
    setupUpdateMocks({
      analysis: buildAnalysis(BASE_PLAN, repoPath),
      changedFiles: [{ changeType: "modified", path: "src/core/index.ts" }],
      sdkConfig: {
        moduleGeneration: getModuleResponses(BASE_PLAN, ["core"]),
      },
    });

    expectSuccess(await runUpdate(repoPath));

    expect(validationSpy).toHaveBeenCalledWith({
      outputPath,
      requirePersistedArtifacts: false,
    });
  });

  it("non-TC: >50% components affected triggers recommendation warning", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    setupUpdateMocks({
      analysis: buildAnalysis(BASE_PLAN, repoPath),
      changedFiles: [
        { changeType: "modified", path: "src/core/index.ts" },
        { changeType: "modified", path: "src/core/service.ts" },
        { changeType: "modified", path: "src/api/index.ts" },
        { changeType: "modified", path: "src/api/client.ts" },
      ],
      sdkConfig: {
        moduleGeneration: getModuleResponses(BASE_PLAN, ["api", "core"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "More than 50% of the prior components were affected",
        ),
      ]),
    );
  });

  it("non-TC: renamed file maps to the correct module", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    const currentPlan: ModulePlan = {
      ...BASE_PLAN,
      modules: BASE_PLAN.modules.map((module) =>
        module.name === "core"
          ? {
              ...module,
              components: module.components.map((component) =>
                component === "src/core/service.ts"
                  ? "src/core/service-renamed.ts"
                  : component,
              ),
            }
          : module,
      ),
    };
    setupUpdateMocks({
      analysis: buildAnalysis(currentPlan, repoPath),
      changedFiles: [
        {
          changeType: "renamed",
          oldPath: "src/core/service.ts",
          path: "src/core/service-renamed.ts",
        },
      ],
      sdkConfig: {
        moduleGeneration: getModuleResponses(currentPlan, ["core"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.updatedModules).toEqual(["core"]);
    expect(
      result.modulePlan.modules.find((module) => module.name === "core"),
    ).toMatchObject({
      components: expect.arrayContaining(["src/core/service-renamed.ts"]),
    });
  });

  it("non-TC: change detection with merge commits", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN, {
      commitHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const changedFilesSpy = vi
      .spyOn(gitModule, "getChangedFilesBetweenCommits")
      .mockResolvedValue([
        { changeType: "modified", path: "src/core/index.ts" },
      ]);
    vi.spyOn(agentSdkModule, "createAgentSDKAdapter").mockReturnValue(
      createMockSDK({
        moduleGeneration: getModuleResponses(BASE_PLAN, ["core"]),
        qualityReview: {
          output: [],
          usage: { inputTokens: 200, outputTokens: 100 },
        },
      }),
    );
    vi.spyOn(environmentModule, "checkEnvironment").mockResolvedValue(
      ok({
        detectedLanguages: ["typescript"],
        findings: [],
        passed: true,
      }),
    );
    vi.spyOn(analysisModule, "analyzeRepository").mockResolvedValue(
      ok(
        buildAnalysis(BASE_PLAN, repoPath, {
          commitHash: "mergecommit1234567890abcdef1234567890abcdef",
        }),
      ),
    );
    vi.spyOn(gitModule, "getHeadCommitHash").mockResolvedValue(
      "mergecommit1234567890abcdef1234567890abcdef",
    );

    expectSuccess(await runUpdate(repoPath));

    expect(changedFilesSpy).toHaveBeenCalledWith(
      repoPath,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "mergecommit1234567890abcdef1234567890abcdef",
    );
  });

  it("non-TC: fresh analysis detects a new cross-module relationship", async () => {
    const repoPath = createRepo();
    await writePriorOutput(repoPath, BASE_PLAN);
    const currentPlan: ModulePlan = {
      ...BASE_PLAN,
      modules: BASE_PLAN.modules.map((module) =>
        module.name === "core"
          ? {
              ...module,
              components: [...module.components, "src/core/new-importer.ts"],
            }
          : module,
      ),
    };
    setupUpdateMocks({
      analysis: buildAnalysis(currentPlan, repoPath, {
        relationships: [
          {
            source: "src/core/new-importer.ts",
            target: "src/utils/types.ts",
            type: "import",
          },
        ],
      }),
      changedFiles: [{ changeType: "added", path: "src/core/new-importer.ts" }],
      sdkConfig: {
        moduleGeneration: getModuleResponses(currentPlan, ["core", "utils"]),
      },
    });

    const result = expectSuccess(await runUpdate(repoPath));

    expect(result.updatedModules).toEqual(["core", "utils"]);
  });
});
