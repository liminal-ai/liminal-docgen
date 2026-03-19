import { describe, expect, it } from "vitest";
import { classifyComponents } from "../../src/classification/component-classifier.js";
import { mergeComponentView } from "../../src/classification/types.js";
import type {
  AnalyzedRelationship,
  RepositoryAnalysis,
} from "../../src/types/analysis.js";
import {
  standardTsRepoAnalysis,
  typeOnlyRepoAnalysis,
} from "../fixtures/classification-fixtures.js";

function makeAnalysis(
  components: RepositoryAnalysis["components"],
  relationships: AnalyzedRelationship[] = [],
): RepositoryAnalysis {
  const paths = Object.keys(components);
  return {
    repoPath: "/test",
    commitHash: "test",
    focusDirs: [],
    summary: {
      totalFilesAnalyzed: paths.length,
      totalComponents: paths.length,
      totalRelationships: relationships.length,
      languagesFound: ["typescript"],
      languagesSkipped: [],
    },
    components,
    relationships,
  };
}

describe("classifyComponents", () => {
  // --- AC-1.1: Role Classification ---

  it("TC-1.1a: classifies service role from export pattern", () => {
    const result = classifyComponents(standardTsRepoAnalysis);
    expect(result.get("src/services/user-service.ts")?.role).toBe("service");
    expect(result.get("src/services/user-service.ts")?.roleConfidence).toBe(
      "confirmed",
    );
  });

  it("TC-1.1b: classifies type-definition role from type-only exports", () => {
    const result = classifyComponents(standardTsRepoAnalysis);
    // src/types/common.ts exports only types and enums — no path match,
    // so Pass 2 detects type-definition from exports
    expect(result.get("src/types/common.ts")?.role).toBe("type-definition");
    expect(result.get("src/types/common.ts")?.roleConfidence).toBe("confirmed");
  });

  it("TC-1.1c: assigns unknown role when no pattern matches", () => {
    const result = classifyComponents(standardTsRepoAnalysis);
    // docs/api-reference.ts has no exports, no role-matching path
    expect(result.get("docs/api-reference.ts")?.role).toBe("unknown");
    expect(result.get("docs/api-reference.ts")?.roleConfidence).toBe(
      "unresolved",
    );
  });

  it("TC-1.1d: produces identical output for identical input", () => {
    const result1 = classifyComponents(standardTsRepoAnalysis);
    const result2 = classifyComponents(standardTsRepoAnalysis);
    expect([...result1.entries()]).toEqual([...result2.entries()]);
  });

  // --- AC-1.2: Zone Classification ---

  it("TC-1.2a: classifies test zone from test/ directory", () => {
    const result = classifyComponents(standardTsRepoAnalysis);
    expect(result.get("test/services/user-service.test.ts")?.zone).toBe("test");
  });

  it("TC-1.2b: classifies production zone as default", () => {
    const result = classifyComponents(standardTsRepoAnalysis);
    expect(result.get("src/services/user-service.ts")?.zone).toBe("production");
  });

  it("TC-1.2c: classifies generated zone from generated/ directory", () => {
    const analysis = makeAnalysis({
      "src/generated/schema.ts": {
        filePath: "src/generated/schema.ts",
        language: "typescript",
        linesOfCode: 100,
        exportedSymbols: [],
      },
    });
    const result = classifyComponents(analysis);
    expect(result.get("src/generated/schema.ts")?.zone).toBe("generated");
  });

  it("TC-1.2d: classifies vendored zone from vendor/ directory", () => {
    const analysis = makeAnalysis({
      "vendor/lodash/index.ts": {
        filePath: "vendor/lodash/index.ts",
        language: "typescript",
        linesOfCode: 500,
        exportedSymbols: [],
      },
    });
    const result = classifyComponents(analysis);
    expect(result.get("vendor/lodash/index.ts")?.zone).toBe("vendored");
  });

  it("TC-1.2e: classifies infrastructure zone from .github/workflows/", () => {
    const result = classifyComponents(standardTsRepoAnalysis);
    expect(result.get(".github/workflows/ci.ts")?.zone).toBe("infrastructure");
  });

  it("TC-1.2f: classifies build-script zone from scripts/ directory", () => {
    const result = classifyComponents(standardTsRepoAnalysis);
    expect(result.get("scripts/seed-db.ts")?.zone).toBe("build-script");
  });

  // --- AC-1.4: Coverage ---

  it("TC-1.4a: classification map covers every component in analysis", () => {
    const result = classifyComponents(standardTsRepoAnalysis);
    const componentPaths = Object.keys(standardTsRepoAnalysis.components);
    expect(result.size).toBe(componentPaths.length);
    for (const path of componentPaths) {
      expect(result.has(path)).toBe(true);
    }
  });

  it("TC-1.4b: mergeComponentView produces correct view for classified component", () => {
    const result = classifyComponents(standardTsRepoAnalysis);
    const component =
      standardTsRepoAnalysis.components["src/services/user-service.ts"];
    if (!component) throw new Error("fixture missing expected component");
    const view = mergeComponentView(component, result);
    expect(view).not.toBeNull();
    expect(view?.filePath).toBe("src/services/user-service.ts");
    expect(view?.language).toBe("typescript");
    expect(view?.role).toBe("service");
    expect(view?.zone).toBe("production");
    expect(view?.linesOfCode).toBe(120);
  });

  // --- Additional: Path Convention Rules ---

  it("correctly classifies all directory-based path convention roles", () => {
    const result = classifyComponents(standardTsRepoAnalysis);
    expect(result.get("src/services/user-service.ts")?.role).toBe("service");
    expect(result.get("src/handlers/user-handler.ts")?.role).toBe("handler");
    expect(result.get("src/controllers/api-controller.ts")?.role).toBe(
      "controller",
    );
    expect(result.get("src/models/user.ts")?.role).toBe("model");
    expect(result.get("src/repositories/user-repository.ts")?.role).toBe(
      "repository",
    );
    expect(result.get("src/adapters/email-adapter.ts")?.role).toBe("adapter");
    expect(result.get("src/factories/service-factory.ts")?.role).toBe(
      "factory",
    );
    expect(result.get("src/utils/hash.ts")?.role).toBe("utility");
    expect(result.get("src/config/database.ts")?.role).toBe("configuration");
    expect(result.get("src/middleware/auth-middleware.ts")?.role).toBe(
      "middleware",
    );
    expect(result.get("src/validators/user-validator.ts")?.role).toBe(
      "validator",
    );
    expect(result.get("scripts/seed-db.ts")?.role).toBe("script");
    expect(result.get("test/fixtures/mock-users.ts")?.role).toBe("fixture");
  });

  // --- Additional: File Suffix Rules ---

  it("classifies test role from .test.ts suffix", () => {
    const result = classifyComponents(standardTsRepoAnalysis);
    // These are in test/services/ and test/handlers/ directories but the
    // .test.ts suffix takes priority for role detection
    expect(result.get("test/services/user-service.test.ts")?.role).toBe("test");
    expect(result.get("test/handlers/user-handler.test.ts")?.role).toBe("test");
  });

  // --- Additional: Export Pattern Overrides Ambiguous Path ---

  it("export pattern overrides ambiguous path when confidence is higher", () => {
    const analysis = makeAnalysis({
      "src/lib/data-service.ts": {
        filePath: "src/lib/data-service.ts",
        language: "typescript",
        linesOfCode: 100,
        exportedSymbols: [
          { name: "DataService", kind: "class", lineNumber: 5 },
        ],
      },
    });
    const result = classifyComponents(analysis);
    // Path: lib → utility (likely). Export: DataService class → service (confirmed).
    // Pass 2 promotes from likely to confirmed.
    expect(result.get("src/lib/data-service.ts")?.role).toBe("service");
    expect(result.get("src/lib/data-service.ts")?.roleConfidence).toBe(
      "confirmed",
    );
  });

  // --- Additional: Relationship Tiebreaker ---

  it("relationship tiebreaker assigns controller to high fan-out component", () => {
    const components: RepositoryAnalysis["components"] = {
      "src/app/orchestrator.ts": {
        filePath: "src/app/orchestrator.ts",
        language: "typescript",
        linesOfCode: 200,
        // Single variable export — no export pattern match
        exportedSymbols: [
          { name: "appConfig", kind: "variable", lineNumber: 1 },
        ],
      },
    };
    // Add 6 target components (fan-out >= 5)
    for (let i = 0; i < 6; i++) {
      const path = `src/modules/mod${i}.ts`;
      components[path] = {
        filePath: path,
        language: "typescript",
        linesOfCode: 50,
        exportedSymbols: [],
      };
    }
    const relationships: AnalyzedRelationship[] = Array.from(
      { length: 6 },
      (_, i) => ({
        source: "src/app/orchestrator.ts",
        target: `src/modules/mod${i}.ts`,
        type: "import" as const,
      }),
    );
    const analysis = makeAnalysis(components, relationships);
    const result = classifyComponents(analysis);
    // Pass 1: no path match → unresolved
    // Pass 2: single variable export → no match → still unresolved
    // Pass 3: fan-out=6 ≥ 5, fan-in=0 ≤ 2 → controller (likely)
    expect(result.get("src/app/orchestrator.ts")?.role).toBe("controller");
    expect(result.get("src/app/orchestrator.ts")?.roleConfidence).toBe(
      "likely",
    );
  });

  it("relationship tiebreaker assigns entry-point when no inbound and targets services", () => {
    const analysis = makeAnalysis(
      {
        "src/boot.ts": {
          filePath: "src/boot.ts",
          language: "typescript",
          linesOfCode: 30,
          // Single variable export — no export pattern match
          exportedSymbols: [
            { name: "config", kind: "variable", lineNumber: 1 },
          ],
        },
        "src/services/api.ts": {
          filePath: "src/services/api.ts",
          language: "typescript",
          linesOfCode: 100,
          exportedSymbols: [
            { name: "ApiService", kind: "class", lineNumber: 5 },
          ],
        },
      },
      [
        {
          source: "src/boot.ts",
          target: "src/services/api.ts",
          type: "import",
        },
      ],
    );
    const result = classifyComponents(analysis);
    // boot.ts: no path match, single variable → no export match,
    // no inbound edges, outbound target is service → entry-point (likely)
    expect(result.get("src/boot.ts")?.role).toBe("entry-point");
    expect(result.get("src/boot.ts")?.roleConfidence).toBe("likely");
  });

  // --- Additional: Pass Ordering ---

  it("confirmed path classification is not overridden by export patterns", () => {
    const analysis = makeAnalysis({
      "src/services/types.ts": {
        filePath: "src/services/types.ts",
        language: "typescript",
        linesOfCode: 30,
        // All type exports — Pass 2 would say type-definition (confirmed)
        exportedSymbols: [
          { name: "ServiceConfig", kind: "interface", lineNumber: 1 },
          { name: "ServiceOptions", kind: "type", lineNumber: 10 },
        ],
      },
    });
    const result = classifyComponents(analysis);
    // Path: services → service (confirmed). Pass 2 skipped because already confirmed.
    expect(result.get("src/services/types.ts")?.role).toBe("service");
    expect(result.get("src/services/types.ts")?.roleConfidence).toBe(
      "confirmed",
    );
  });

  // --- Additional: Zone Priority ---

  it("vendored zone outranks test zone", () => {
    const analysis = makeAnalysis({
      "vendor/testing-lib/test/helper.test.ts": {
        filePath: "vendor/testing-lib/test/helper.test.ts",
        language: "typescript",
        linesOfCode: 50,
        exportedSymbols: [],
      },
    });
    const result = classifyComponents(analysis);
    // Has both vendor/ and test/ directories plus .test.ts suffix.
    // Vendored zone takes priority.
    expect(result.get("vendor/testing-lib/test/helper.test.ts")?.zone).toBe(
      "vendored",
    );
  });

  // --- Additional: Type-only repo ---

  it("classifies all components in type-only repo as type-definition", () => {
    const result = classifyComponents(typeOnlyRepoAnalysis);
    for (const [, data] of result) {
      expect(data.role).toBe("type-definition");
      expect(data.roleConfidence).toBe("confirmed");
    }
  });

  // --- Additional: Entry-point from path ---

  it("classifies src/index.ts as entry-point from path convention", () => {
    const result = classifyComponents(standardTsRepoAnalysis);
    expect(result.get("src/index.ts")?.role).toBe("entry-point");
    expect(result.get("src/index.ts")?.roleConfidence).toBe("likely");
  });
});
