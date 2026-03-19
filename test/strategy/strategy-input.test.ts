import { describe, expect, it } from "vitest";

import type { ClassifiedComponentData } from "../../src/classification/types.js";
import { assembleStrategyInput } from "../../src/strategy/strategy-input.js";
import type { RepositoryAnalysis } from "../../src/types/analysis.js";
import {
  mixedLanguageRepoAnalysis,
  smallRepoAnalysis,
  standardTsRepoAnalysis,
} from "../fixtures/classification-fixtures.js";

/**
 * Builds a classification map for the standard TS repo fixture.
 * Uses realistic role/zone assignments matching what classifyComponents() would produce.
 */
function buildStandardTsClassificationMap(): Map<
  string,
  ClassifiedComponentData
> {
  return new Map<string, ClassifiedComponentData>([
    [
      "src/services/user-service.ts",
      { role: "service", roleConfidence: "confirmed", zone: "production" },
    ],
    [
      "src/services/auth-service.ts",
      { role: "service", roleConfidence: "confirmed", zone: "production" },
    ],
    [
      "src/handlers/user-handler.ts",
      { role: "handler", roleConfidence: "confirmed", zone: "production" },
    ],
    [
      "src/controllers/api-controller.ts",
      { role: "controller", roleConfidence: "confirmed", zone: "production" },
    ],
    [
      "src/models/user.ts",
      { role: "model", roleConfidence: "confirmed", zone: "production" },
    ],
    [
      "src/models/session.ts",
      { role: "model", roleConfidence: "confirmed", zone: "production" },
    ],
    [
      "src/repositories/user-repository.ts",
      { role: "repository", roleConfidence: "confirmed", zone: "production" },
    ],
    [
      "src/adapters/email-adapter.ts",
      { role: "adapter", roleConfidence: "confirmed", zone: "production" },
    ],
    [
      "src/utils/hash.ts",
      { role: "utility", roleConfidence: "likely", zone: "production" },
    ],
    [
      "src/utils/format.ts",
      { role: "utility", roleConfidence: "likely", zone: "production" },
    ],
    [
      "src/config/database.ts",
      {
        role: "configuration",
        roleConfidence: "likely",
        zone: "configuration",
      },
    ],
    [
      "src/middleware/auth-middleware.ts",
      { role: "middleware", roleConfidence: "confirmed", zone: "production" },
    ],
    [
      "src/validators/user-validator.ts",
      { role: "validator", roleConfidence: "likely", zone: "production" },
    ],
    [
      "src/types/common.ts",
      {
        role: "type-definition",
        roleConfidence: "confirmed",
        zone: "production",
      },
    ],
    [
      "src/index.ts",
      { role: "entry-point", roleConfidence: "likely", zone: "production" },
    ],
    [
      "src/factories/service-factory.ts",
      { role: "factory", roleConfidence: "likely", zone: "production" },
    ],
    [
      "test/services/user-service.test.ts",
      { role: "test", roleConfidence: "confirmed", zone: "test" },
    ],
    [
      "test/handlers/user-handler.test.ts",
      { role: "test", roleConfidence: "confirmed", zone: "test" },
    ],
    [
      "test/fixtures/mock-users.ts",
      { role: "fixture", roleConfidence: "confirmed", zone: "test" },
    ],
    [
      "scripts/seed-db.ts",
      { role: "script", roleConfidence: "confirmed", zone: "build-script" },
    ],
    [
      ".github/workflows/ci.ts",
      { role: "unknown", roleConfidence: "unresolved", zone: "infrastructure" },
    ],
    [
      "docs/api-reference.ts",
      { role: "unknown", roleConfidence: "unresolved", zone: "documentation" },
    ],
  ]);
}

function buildMixedLangClassificationMap(): Map<
  string,
  ClassifiedComponentData
> {
  return new Map<string, ClassifiedComponentData>([
    [
      "src/api/server.ts",
      { role: "entry-point", roleConfidence: "likely", zone: "production" },
    ],
    [
      "src/api/routes.ts",
      { role: "handler", roleConfidence: "likely", zone: "production" },
    ],
    [
      "src/types/api.ts",
      {
        role: "type-definition",
        roleConfidence: "confirmed",
        zone: "production",
      },
    ],
    [
      "scripts/process_data.py",
      { role: "script", roleConfidence: "confirmed", zone: "build-script" },
    ],
    [
      "scripts/train_model.py",
      { role: "script", roleConfidence: "confirmed", zone: "build-script" },
    ],
    [
      "src/utils/logger.ts",
      { role: "utility", roleConfidence: "likely", zone: "production" },
    ],
    [
      "test/api/routes.test.ts",
      { role: "test", roleConfidence: "confirmed", zone: "test" },
    ],
    [
      "src/config/app.ts",
      {
        role: "configuration",
        roleConfidence: "likely",
        zone: "configuration",
      },
    ],
  ]);
}

function buildSmallRepoClassificationMap(): Map<
  string,
  ClassifiedComponentData
> {
  return new Map<string, ClassifiedComponentData>([
    [
      "src/index.ts",
      { role: "entry-point", roleConfidence: "likely", zone: "production" },
    ],
    [
      "src/utils.ts",
      { role: "utility", roleConfidence: "likely", zone: "production" },
    ],
    [
      "src/types.ts",
      {
        role: "type-definition",
        roleConfidence: "confirmed",
        zone: "production",
      },
    ],
    [
      "test/index.test.ts",
      { role: "test", roleConfidence: "confirmed", zone: "test" },
    ],
  ]);
}

describe("assembleStrategyInput", () => {
  describe("TC-2.3a: determinism", () => {
    it("produces byte-identical output from identical inputs", () => {
      const classMap = buildStandardTsClassificationMap();
      const result1 = assembleStrategyInput(standardTsRepoAnalysis, classMap);
      const result2 = assembleStrategyInput(standardTsRepoAnalysis, classMap);
      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  describe("TC-2.3b: includes all six dimensions", () => {
    it("includes componentCount, languageDistribution, directoryTreeSummary, relationshipDensity, zoneDistribution, roleDistribution", () => {
      const classMap = buildStandardTsClassificationMap();
      const result = assembleStrategyInput(standardTsRepoAnalysis, classMap);
      expect(result).toHaveProperty("componentCount");
      expect(result).toHaveProperty("languageDistribution");
      expect(result).toHaveProperty("directoryTreeSummary");
      expect(result).toHaveProperty("relationshipDensity");
      expect(result).toHaveProperty("zoneDistribution");
      expect(result).toHaveProperty("roleDistribution");
    });
  });

  it("componentCount matches number of components in analysis", () => {
    const classMap = buildStandardTsClassificationMap();
    const result = assembleStrategyInput(standardTsRepoAnalysis, classMap);
    expect(result.componentCount).toBe(22);
  });

  it("languageDistribution sums to componentCount", () => {
    const classMap = buildStandardTsClassificationMap();
    const result = assembleStrategyInput(standardTsRepoAnalysis, classMap);
    const sum = Object.values(result.languageDistribution).reduce(
      (a, b) => a + b,
      0,
    );
    expect(sum).toBe(result.componentCount);
  });

  it("directoryTreeSummary is sorted alphabetically", () => {
    const classMap = buildStandardTsClassificationMap();
    const result = assembleStrategyInput(standardTsRepoAnalysis, classMap);
    const sorted = [...result.directoryTreeSummary].sort();
    expect(result.directoryTreeSummary).toEqual(sorted);
  });

  it("relationshipDensity equals totalEdges / componentCount", () => {
    const classMap = buildStandardTsClassificationMap();
    const result = assembleStrategyInput(standardTsRepoAnalysis, classMap);
    expect(result.relationshipDensity).toBe(18 / 22);
  });

  it("zoneDistribution sums to componentCount", () => {
    const classMap = buildStandardTsClassificationMap();
    const result = assembleStrategyInput(standardTsRepoAnalysis, classMap);
    const sum = Object.values(result.zoneDistribution).reduce(
      (a, b) => a + b,
      0,
    );
    expect(sum).toBe(result.componentCount);
  });

  it("roleDistribution sums to componentCount", () => {
    const classMap = buildStandardTsClassificationMap();
    const result = assembleStrategyInput(standardTsRepoAnalysis, classMap);
    const sum = Object.values(result.roleDistribution).reduce(
      (a, b) => a + b,
      0,
    );
    expect(sum).toBe(result.componentCount);
  });

  it("handles empty analysis without division by zero", () => {
    const emptyAnalysis: RepositoryAnalysis = {
      repoPath: "/repo/empty",
      commitHash: "000000",
      focusDirs: [],
      summary: {
        totalFilesAnalyzed: 0,
        totalComponents: 0,
        totalRelationships: 0,
        languagesFound: [],
        languagesSkipped: [],
      },
      components: {},
      relationships: [],
    };
    const emptyMap = new Map<string, ClassifiedComponentData>();
    const result = assembleStrategyInput(emptyAnalysis, emptyMap);
    expect(result.componentCount).toBe(0);
    expect(result.relationshipDensity).toBe(0);
    expect(result.directoryTreeSummary).toEqual([]);
    expect(result.languageDistribution).toEqual({});
    expect(result.zoneDistribution).toEqual({});
    expect(result.roleDistribution).toEqual({});
  });

  it("handles mixed-language repo correctly", () => {
    const classMap = buildMixedLangClassificationMap();
    const result = assembleStrategyInput(mixedLanguageRepoAnalysis, classMap);
    expect(result.componentCount).toBe(8);
    expect(result.languageDistribution).toEqual({
      python: 2,
      typescript: 6,
    });
  });

  it("handles small repo correctly", () => {
    const classMap = buildSmallRepoClassificationMap();
    const result = assembleStrategyInput(smallRepoAnalysis, classMap);
    expect(result.componentCount).toBe(4);
    expect(result.relationshipDensity).toBe(2 / 4);
  });
});
