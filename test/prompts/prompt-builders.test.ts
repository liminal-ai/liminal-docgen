import { buildClusteringPrompt } from "../../src/prompts/clustering.js";
import { buildModuleDocPrompt } from "../../src/prompts/module-doc.js";
import { buildOverviewPrompt } from "../../src/prompts/overview.js";
import { buildQualityReviewPrompt } from "../../src/prompts/quality-review.js";
import type {
  AnalyzedRelationship,
  RepositoryAnalysis,
} from "../../src/types/analysis.js";
import type { GeneratedModuleSet } from "../../src/types/generation.js";
import type { ModulePlan, PlannedModule } from "../../src/types/planning.js";
import type { ValidationResult } from "../../src/types/validation.js";

const buildAnalysis = (
  componentPaths: string[],
  relationships: AnalyzedRelationship[],
): RepositoryAnalysis => ({
  commitHash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
  components: Object.fromEntries(
    componentPaths.map((filePath, index) => [
      filePath,
      {
        exportedSymbols: [
          {
            kind: index % 2 === 0 ? "function" : "type",
            lineNumber: index + 2,
            name: `export${index + 1}`,
          },
        ],
        filePath,
        language: "typescript",
        linesOfCode: (index + 1) * 12,
      },
    ]),
  ),
  focusDirs: ["src/config", "src/analysis"],
  relationships,
  repoPath: "/tmp/liminal-docgen",
  summary: {
    languagesFound: ["typescript"],
    languagesSkipped: [],
    totalComponents: componentPaths.length,
    totalFilesAnalyzed: componentPaths.length,
    totalRelationships: relationships.length,
  },
});

describe("prompt builders", () => {
  it("clustering prompt includes component list", () => {
    const analysis = buildAnalysis(
      ["src/index.ts", "src/config/resolver.ts", "src/analysis/analyze.ts"],
      [
        {
          source: "src/index.ts",
          target: "src/config/resolver.ts",
          type: "import",
        },
      ],
    );

    const value = buildClusteringPrompt(analysis);

    expect(value.userMessage).toContain("src/index.ts");
    expect(value.userMessage).toContain("src/config/resolver.ts");
    expect(value.userMessage).toContain("src/analysis/analyze.ts");
    expect(value.userMessage).toContain("export1");
    expect(value.userMessage).toContain("12 LOC");
  });

  it("clustering prompt includes relationship graph", () => {
    const analysis = buildAnalysis(
      ["src/index.ts", "src/config/resolver.ts", "src/analysis/analyze.ts"],
      [
        {
          source: "src/index.ts",
          target: "src/config/resolver.ts",
          type: "import",
        },
        {
          source: "src/analysis/analyze.ts",
          target: "src/config/resolver.ts",
          type: "usage",
        },
      ],
    );

    const value = buildClusteringPrompt(analysis);

    expect(value.userMessage).toContain(
      "src/index.ts -> src/config/resolver.ts (import)",
    );
    expect(value.userMessage).toContain(
      "src/analysis/analyze.ts -> src/config/resolver.ts (usage)",
    );
    expect(value.userMessage).toContain(
      "Focus directories: src/analysis, src/config",
    );
  });

  it("module-doc prompt includes cross-module context", () => {
    const module: PlannedModule = {
      components: ["src/index.ts"],
      description: "Core runtime",
      name: "core",
    };
    const modulePlan: ModulePlan = {
      modules: [
        module,
        {
          components: ["src/api/client.ts"],
          description: "API boundary",
          name: "api",
        },
      ],
      unmappedComponents: [],
    };
    const analysis = buildAnalysis(
      ["src/index.ts", "src/api/client.ts"],
      [
        {
          source: "src/index.ts",
          target: "src/api/client.ts",
          type: "import",
        },
      ],
    );

    const value = buildModuleDocPrompt(module, modulePlan, analysis);

    expect(value.userMessage).toContain("Module name: core");
    expect(value.userMessage).toContain("src/index.ts");
    expect(value.userMessage).toContain("Depends on modules: api");
    expect(value.userMessage).toContain(
      "src/index.ts -> src/api/client.ts (import)",
    );
  });

  it("overview prompt includes module summaries", () => {
    const modulePlan: ModulePlan = {
      modules: [
        {
          components: ["src/index.ts"],
          description: "Core runtime",
          name: "core",
        },
        {
          components: ["src/api/client.ts"],
          description: "API boundary",
          name: "api",
        },
      ],
      unmappedComponents: [],
    };
    const generatedModules: GeneratedModuleSet = new Map([
      [
        "core",
        {
          content: "# Core\n\nCoordinates the runtime.\n",
          description: "Core runtime",
          fileName: "core.md",
          filePath: "/tmp/core.md",
          moduleName: "core",
        },
      ],
      [
        "api",
        {
          content: "# API\n\nWraps external integrations.\n",
          description: "API boundary",
          fileName: "api.md",
          filePath: "/tmp/api.md",
          moduleName: "api",
        },
      ],
    ]);
    const analysis = buildAnalysis(
      ["src/index.ts", "src/api/client.ts"],
      [
        {
          source: "src/index.ts",
          target: "src/api/client.ts",
          type: "usage",
        },
      ],
    );

    const value = buildOverviewPrompt(modulePlan, generatedModules, analysis);

    expect(value.userMessage).toContain("- core");
    expect(value.userMessage).toContain("description: Core runtime");
    expect(value.userMessage).toContain("- api");
    expect(value.userMessage).toContain("description: API boundary");
    expect(value.userMessage).toContain("page: core.md");
  });

  it("quality-review prompt includes fix scope constraints", () => {
    const validationResult: ValidationResult = {
      errorCount: 1,
      findings: [
        {
          category: "broken-link",
          filePath: "docs/overview.md",
          message: "Broken link",
          severity: "error",
        },
      ],
      status: "fail",
      warningCount: 0,
    };

    const value = buildQualityReviewPrompt(
      validationResult,
      {},
      {
        secondModelReview: false,
        selfReview: true,
      },
    );

    expect(value.systemPrompt).toContain("broken links");
    expect(value.systemPrompt).toContain("Mermaid");
    expect(value.systemPrompt).toContain("Do not re-cluster");
  });

  it("quality-review prompt includes validation findings", () => {
    const validationResult: ValidationResult = {
      errorCount: 0,
      findings: [
        {
          category: "mermaid",
          filePath: "docs/overview.md",
          message: "Malformed Mermaid block",
          severity: "warning",
        },
      ],
      status: "warn",
      warningCount: 1,
    };

    const value = buildQualityReviewPrompt(
      validationResult,
      { "docs/overview.md": "# Overview" },
      {
        secondModelReview: true,
        selfReview: true,
      },
    );

    expect(value.userMessage).toContain("Malformed Mermaid block");
    expect(value.userMessage).toContain("docs/overview.md");
  });
});
