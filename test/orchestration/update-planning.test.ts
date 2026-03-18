import { describe, expect, it } from "vitest";

import { mapToAffectedModules } from "../../src/orchestration/update/affected-module-mapper.js";
import type {
  ChangedFile,
  ModulePlan,
  RepositoryAnalysis,
} from "../../src/types/index.js";

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

const LARGE_PLAN: ModulePlan = {
  modules: Array.from({ length: 9 }, (_, index) => ({
    components: [`src/module-${index + 1}/index.ts`],
    description: `Module ${index + 1}`,
    name: `module-${index + 1}`,
  })),
  unmappedComponents: [],
};

const buildAnalysis = (
  plan: ModulePlan,
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
          linesOfCode: 10 + index,
        },
      ]),
    ),
    focusDirs: ["src"],
    relationships: overrides.relationships ?? [],
    repoPath: "/tmp/liminal-docgen",
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

describe("update planning", () => {
  it("regenerates overview and module tree for structural module changes", () => {
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

    const result = mapToAffectedModules(
      [{ changeType: "added", path: "src/core/new-file.ts" }],
      BASE_PLAN,
      buildAnalysis(currentPlan),
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.affectedModules.modulesToRegenerate).toEqual(["core"]);
    expect(result.value.affectedModules.overviewNeedsRegeneration).toBe(true);
    expect(result.value.affectedModules.moduleTreeNeedsRewrite).toBe(true);
    expect(result.value.affectedModules.requiresFullRegeneration).toBe(false);
  });

  it("propagates relationship impacts from either side of the relationship", () => {
    const changedFiles: ChangedFile[] = [
      { changeType: "modified", path: "src/utils/format.ts" },
    ];
    const analysis = buildAnalysis(BASE_PLAN, {
      relationships: [
        {
          source: "src/core/index.ts",
          target: "src/utils/format.ts",
          type: "import",
        },
      ],
    });

    const result = mapToAffectedModules(changedFiles, BASE_PLAN, analysis);

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.affectedModules.modulesToRegenerate).toEqual([
      "core",
      "utils",
    ]);
    expect(result.value.affectedModules.overviewNeedsRegeneration).toBe(true);
  });

  it("requires full regeneration for broad churn in large plans", () => {
    const changedFiles: ChangedFile[] = [
      { changeType: "modified", path: "src/module-1/index.ts" },
      { changeType: "modified", path: "src/module-2/index.ts" },
      { changeType: "modified", path: "src/module-3/index.ts" },
      { changeType: "modified", path: "src/module-4/index.ts" },
      { changeType: "modified", path: "src/module-5/index.ts" },
    ];

    const result = mapToAffectedModules(
      changedFiles,
      LARGE_PLAN,
      buildAnalysis(LARGE_PLAN),
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.affectedModules.requiresFullRegeneration).toBe(true);
    expect(result.value.affectedModules.fullRegenerationReason).toContain(
      "Run full generation",
    );
  });

  it("requires full regeneration for unmappable new files in large plans", () => {
    const currentPlan: ModulePlan = {
      ...LARGE_PLAN,
      unmappedComponents: ["src/new-area/entry.ts"],
    };

    const result = mapToAffectedModules(
      [{ changeType: "added", path: "src/new-area/entry.ts" }],
      LARGE_PLAN,
      buildAnalysis(currentPlan),
    );

    expect(result.ok).toBe(true);

    if (!result.ok) {
      return;
    }

    expect(result.value.affectedModules.unmappableFiles).toEqual([
      "src/new-area/entry.ts",
    ]);
    expect(result.value.affectedModules.requiresFullRegeneration).toBe(true);
  });
});
