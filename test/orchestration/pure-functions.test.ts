import { mapToAffectedModules } from "../../src/orchestration/update/affected-module-mapper.js";
import { moduleNameToFileName } from "../../src/types/generation.js";
import type {
  ChangedFile,
  ModulePlan,
  RepositoryAnalysis,
} from "../../src/types/index.js";

describe("moduleNameToFileName", () => {
  it("lowercases and appends .md", () => {
    expect(moduleNameToFileName("core")).toBe("core.md");
  });

  it("replaces spaces with hyphens", () => {
    expect(moduleNameToFileName("Auth Middleware")).toBe("auth-middleware.md");
  });

  it("strips non-alphanumeric non-hyphen characters", () => {
    expect(moduleNameToFileName("my/module")).toBe("mymodule.md");
  });

  it("produces .md for empty string", () => {
    expect(moduleNameToFileName("")).toBe(".md");
  });

  it("reserved name 'overview' maps to overview.md (collision caught upstream)", () => {
    expect(moduleNameToFileName("overview")).toBe("overview.md");
  });
});

const buildMinimalAnalysis = (
  componentPaths: string[],
  relationships: RepositoryAnalysis["relationships"] = [],
): RepositoryAnalysis => ({
  commitHash: "abc123",
  components: Object.fromEntries(
    componentPaths.map((filePath) => [
      filePath,
      {
        exportedSymbols: [
          { kind: "function" as const, lineNumber: 1, name: "fn" },
        ],
        filePath,
        language: "typescript",
        linesOfCode: 10,
      },
    ]),
  ),
  focusDirs: [],
  relationships,
  repoPath: "/tmp/repo",
  summary: {
    languagesFound: ["typescript"],
    languagesSkipped: [],
    totalComponents: componentPaths.length,
    totalFilesAnalyzed: componentPaths.length,
    totalRelationships: relationships.length,
  },
});

describe("mapToAffectedModules", () => {
  it("returns empty regeneration sets for no changed files", () => {
    const plan: ModulePlan = {
      modules: [
        { name: "core", description: "Core", components: ["src/index.ts"] },
      ],
      unmappedComponents: [],
    };
    const analysis = buildMinimalAnalysis(["src/index.ts"]);

    const result = mapToAffectedModules([], plan, analysis);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.value.affectedModules.modulesToRegenerate).toEqual([]);
    expect(result.value.affectedModules.modulesToRemove).toEqual([]);
    expect(result.value.affectedModules.unchangedModules).toEqual(["core"]);
  });

  it("marks all unmapped when changed files don't match any module", () => {
    const plan: ModulePlan = {
      modules: [
        { name: "core", description: "Core", components: ["src/index.ts"] },
      ],
      unmappedComponents: [],
    };
    const analysis = buildMinimalAnalysis(["src/index.ts", "lib/other.ts"]);
    const changedFiles: ChangedFile[] = [
      { path: "lib/other.ts", changeType: "added" },
    ];

    const result = mapToAffectedModules(changedFiles, plan, analysis);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.value.affectedModules.unmappableFiles).toContain(
      "lib/other.ts",
    );
  });

  it("propagates cross-module relationship impacts", () => {
    const plan: ModulePlan = {
      modules: [
        { name: "core", description: "Core", components: ["src/core.ts"] },
        { name: "api", description: "API", components: ["src/api.ts"] },
      ],
      unmappedComponents: [],
    };
    const analysis = buildMinimalAnalysis(
      ["src/core.ts", "src/api.ts"],
      [{ source: "src/core.ts", target: "src/api.ts", type: "import" }],
    );
    const changedFiles: ChangedFile[] = [
      { path: "src/core.ts", changeType: "modified" },
    ];

    const result = mapToAffectedModules(changedFiles, plan, analysis);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.value.affectedModules.modulesToRegenerate).toContain("core");
    expect(result.value.affectedModules.modulesToRegenerate).toContain("api");
  });

  it("handles deleted components by removing empty modules", () => {
    const plan: ModulePlan = {
      modules: [
        { name: "core", description: "Core", components: ["src/index.ts"] },
        { name: "utils", description: "Utils", components: ["src/removed.ts"] },
      ],
      unmappedComponents: [],
    };
    // Only src/index.ts exists in fresh analysis (src/removed.ts was deleted)
    const analysis = buildMinimalAnalysis(["src/index.ts"]);
    const changedFiles: ChangedFile[] = [
      { path: "src/removed.ts", changeType: "deleted" },
    ];

    const result = mapToAffectedModules(changedFiles, plan, analysis);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.value.affectedModules.modulesToRemove).toContain("utils");
    expect(result.value.affectedModules.overviewNeedsRegeneration).toBe(true);
  });
});
