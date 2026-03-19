import { describe, expect, it } from "vitest";

import {
  buildModuleDocumentationFacts,
  selectModuleDocumentationPacket,
} from "../../src/orchestration/module-doc-packet.js";
import type {
  ModulePlan,
  PlannedModule,
  RepositoryAnalysis,
} from "../../src/types/index.js";

const buildAnalysis = (
  modules: PlannedModule[],
  relationships: RepositoryAnalysis["relationships"],
  overrides: Partial<RepositoryAnalysis> = {},
): RepositoryAnalysis => {
  const componentPaths = modules.flatMap((module) => module.components);

  return {
    commitHash: "0123456789abcdef0123456789abcdef01234567",
    components: Object.fromEntries(
      componentPaths.map((filePath, index) => [
        filePath,
        {
          exportedSymbols: [
            {
              kind: /Analyzer|Orchestrator/u.test(filePath)
                ? "class"
                : "function",
              lineNumber: index + 1,
              name:
                filePath
                  .split("/")
                  .at(-1)
                  ?.replace(/\.[^.]+$/u, "") ?? `symbol${index + 1}`,
            },
          ],
          filePath,
          language: filePath.endsWith(".py") ? "python" : "typescript",
          linesOfCode: 40 + index,
        },
      ]),
    ),
    focusDirs: [],
    relationships,
    repoPath: "/tmp/liminal-docgen",
    summary: {
      languagesFound: ["typescript"],
      languagesSkipped: [],
      totalComponents: componentPaths.length,
      totalFilesAnalyzed: componentPaths.length,
      totalRelationships: relationships.length,
    },
    ...overrides,
  };
};

describe("module documentation packet selection", () => {
  it("promotes a strong orchestration subsystem to full-packet", () => {
    const module: PlannedModule = {
      components: [
        "src/orchestration/generate.ts",
        "src/orchestration/stages/module-generation.ts",
        "src/orchestration/stages/overview-generation.ts",
      ],
      description: "Coordinates end-to-end documentation generation",
      name: "orchestration",
    };
    const modulePlan: ModulePlan = {
      modules: [module],
      unmappedComponents: [],
    };
    const analysis = buildAnalysis(modulePlan.modules, [
      {
        source: "src/orchestration/generate.ts",
        target: "src/orchestration/stages/module-generation.ts",
        type: "usage",
      },
      {
        source: "src/orchestration/stages/module-generation.ts",
        target: "src/orchestration/stages/overview-generation.ts",
        type: "usage",
      },
    ]);

    const selection = selectModuleDocumentationPacket(
      module,
      modulePlan,
      analysis,
    );

    expect(selection.packetMode).toBe("full-packet");
    expect(selection.recommendSequenceDiagram).toBe(true);
    expect(selection.structureScore).toBeGreaterThanOrEqual(3);
    expect(selection.flowScore).toBeGreaterThanOrEqual(2);
  });

  it("downgrades vendored analyzer-family modules to summary-only", () => {
    const module: PlannedModule = {
      components: [
        "vendor/skill-scanner/analyzers/static_analyzer.py",
        "vendor/skill-scanner/analyzers/behavioral_analyzer.py",
        "vendor/skill-scanner/analyzers/llm_analyzer.py",
        "vendor/skill-scanner/analyzers/bytecode_analyzer.py",
      ],
      description: "Skill scanner analyzer family",
      name: "Skill Scanner Analyzers",
    };
    const modulePlan: ModulePlan = {
      modules: [module],
      unmappedComponents: [],
    };
    const analysis = buildAnalysis(
      modulePlan.modules,
      [
        {
          source: "vendor/skill-scanner/analyzers/static_analyzer.py",
          target: "vendor/skill-scanner/analyzers/behavioral_analyzer.py",
          type: "import",
        },
        {
          source: "vendor/skill-scanner/analyzers/behavioral_analyzer.py",
          target: "vendor/skill-scanner/analyzers/llm_analyzer.py",
          type: "import",
        },
      ],
      {
        summary: {
          languagesFound: ["python"],
          languagesSkipped: [],
          totalComponents: 220,
          totalFilesAnalyzed: 220,
          totalRelationships: 80,
        },
      },
    );

    const selection = selectModuleDocumentationPacket(
      module,
      modulePlan,
      analysis,
    );

    expect(selection.packetMode).toBe("summary-only");
    expect(selection.recommendSequenceDiagram).toBe(false);
    expect(selection.conservativeMode).toBe(true);
    expect(selection.downgradeReason).toContain("analyzer family");
  });

  it("enables conservative mode for large repos and keeps borderline modules summary-only", () => {
    const targetModule: PlannedModule = {
      components: [
        "src/helpers/cache.ts",
        "src/helpers/format.ts",
        "src/helpers/index.ts",
      ],
      description: "Helper utilities",
      name: "helpers",
    };
    const fillerModules: PlannedModule[] = Array.from(
      { length: 24 },
      (_, index) => ({
        components: [`src/module-${index + 1}/index.ts`],
        description: `Module ${index + 1}`,
        name: `module-${index + 1}`,
      }),
    );
    const modulePlan: ModulePlan = {
      modules: [targetModule, ...fillerModules],
      unmappedComponents: [],
    };
    const analysis = buildAnalysis(
      modulePlan.modules,
      [
        {
          source: "src/helpers/index.ts",
          target: "src/helpers/cache.ts",
          type: "import",
        },
        {
          source: "src/helpers/index.ts",
          target: "src/helpers/format.ts",
          type: "import",
        },
      ],
      {
        summary: {
          languagesFound: ["typescript"],
          languagesSkipped: [],
          totalComponents: 180,
          totalFilesAnalyzed: 180,
          totalRelationships: 90,
        },
      },
    );

    const selection = selectModuleDocumentationPacket(
      targetModule,
      modulePlan,
      analysis,
    );

    expect(selection.conservativeMode).toBe(true);
    expect(selection.packetMode).toBe("summary-only");
    expect(selection.flowScore).toBeLessThan(3);
  });

  it("produces deterministic selection and facts for the same input", () => {
    const module: PlannedModule = {
      components: [
        "src/server/router.ts",
        "src/server/controller.ts",
        "src/server/service.ts",
      ],
      description: "Server routing layer",
      name: "server-routes",
    };
    const modulePlan: ModulePlan = {
      modules: [module],
      unmappedComponents: [],
    };
    const analysis = buildAnalysis(modulePlan.modules, [
      {
        source: "src/server/router.ts",
        target: "src/server/controller.ts",
        type: "usage",
      },
      {
        source: "src/server/controller.ts",
        target: "src/server/service.ts",
        type: "usage",
      },
    ]);

    const firstSelection = selectModuleDocumentationPacket(
      module,
      modulePlan,
      analysis,
    );
    const secondSelection = selectModuleDocumentationPacket(
      module,
      modulePlan,
      analysis,
    );
    const firstFacts = buildModuleDocumentationFacts(
      module,
      modulePlan,
      analysis,
    );
    const secondFacts = buildModuleDocumentationFacts(
      module,
      modulePlan,
      analysis,
    );

    expect(secondSelection).toEqual(firstSelection);
    expect(secondFacts).toEqual(firstFacts);
  });
});
