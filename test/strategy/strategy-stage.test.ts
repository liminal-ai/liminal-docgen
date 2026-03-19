import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ClassifiedComponentData } from "../../src/classification/types.js";
import type {
  InferenceProvider,
  InferenceRequest,
  InferenceUsage,
} from "../../src/inference/types.js";
import { assembleStrategyInput } from "../../src/strategy/strategy-input.js";
import {
  loadPriorStrategy,
  selectStrategy,
} from "../../src/strategy/strategy-stage.js";
import type {
  DocumentationStrategy,
  StrategyInput,
} from "../../src/strategy/types.js";
import type { EngineResult } from "../../src/types/common.js";
import {
  mixedLanguageRepoAnalysis,
  smallRepoAnalysis,
  standardTsRepoAnalysis,
} from "../fixtures/classification-fixtures.js";

const standardStrategy: DocumentationStrategy = {
  repoClassification: "service-app",
  boundaries: [
    {
      name: "Core Services",
      componentPatterns: ["src/services/*"],
      recommendedPageShape: "full-structured",
    },
    {
      name: "API Layer",
      componentPatterns: ["src/controllers/*", "src/handlers/*"],
      recommendedPageShape: "full-structured",
    },
    {
      name: "Utilities",
      componentPatterns: ["src/utils/*"],
      recommendedPageShape: "summary-only",
    },
  ],
  zoneGuidance: [
    { zone: "production", treatment: "document", reason: "Core source code" },
    {
      zone: "test",
      treatment: "summarize",
      reason: "Test code supports production",
    },
    {
      zone: "infrastructure",
      treatment: "exclude",
      reason: "CI/CD config not relevant to code documentation",
    },
    {
      zone: "build-script",
      treatment: "summarize",
      reason: "Build scripts are secondary",
    },
    {
      zone: "documentation",
      treatment: "exclude",
      reason: "Documentation files managed separately",
    },
    {
      zone: "configuration",
      treatment: "summarize",
      reason: "Configuration is secondary to core logic",
    },
  ],
};

const mixedLangStrategy: DocumentationStrategy = {
  repoClassification: "mixed",
  boundaries: [
    {
      name: "API",
      componentPatterns: ["src/api/*"],
      recommendedPageShape: "full-structured",
    },
    {
      name: "Data Processing",
      componentPatterns: ["scripts/*.py"],
      recommendedPageShape: "summary-only",
    },
  ],
  zoneGuidance: [
    { zone: "production", treatment: "document", reason: "Core source code" },
    {
      zone: "test",
      treatment: "summarize",
      reason: "Test code supports production",
    },
    {
      zone: "build-script",
      treatment: "summarize",
      reason: "Python scripts are secondary",
    },
    {
      zone: "configuration",
      treatment: "summarize",
      reason: "Config is secondary",
    },
  ],
};

const smallRepoStrategy: DocumentationStrategy = {
  repoClassification: "cli-tool",
  boundaries: [
    {
      name: "Application",
      componentPatterns: ["src/*"],
      recommendedPageShape: "summary-only",
    },
  ],
  zoneGuidance: [
    {
      zone: "production",
      treatment: "document",
      reason: "Small repo, document everything",
    },
    {
      zone: "test",
      treatment: "summarize",
      reason: "Test code is secondary",
    },
  ],
};

function createMockProvider(
  strategyToReturn: DocumentationStrategy,
): InferenceProvider {
  return {
    infer: async <T>(
      _request: InferenceRequest,
    ): Promise<
      EngineResult<{
        output: T;
        usage: InferenceUsage | null;
        costUsd: number | null;
      }>
    > => ({
      ok: true,
      value: {
        output: strategyToReturn as unknown as T,
        usage: { inputTokens: 100, outputTokens: 200 },
        costUsd: 0.01,
      },
    }),
    getAccumulatedUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
    computeCost: () => null,
    supportsToolUse: () => false,
    inferWithTools: () => {
      throw new Error("Not supported");
    },
  };
}

function createFailingProvider(): InferenceProvider {
  return {
    infer: async () => ({
      ok: false as const,
      error: {
        code: "STRATEGY_ERROR" as const,
        message: "Provider failed",
      },
    }),
    getAccumulatedUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
    computeCost: () => null,
    supportsToolUse: () => false,
    inferWithTools: () => {
      throw new Error("Not supported");
    },
  };
}

function createInvalidResponseProvider(): InferenceProvider {
  return {
    infer: async <T>(): Promise<
      EngineResult<{
        output: T;
        usage: InferenceUsage | null;
        costUsd: number | null;
      }>
    > => ({
      ok: true,
      value: {
        output: { invalid: "not a strategy" } as unknown as T,
        usage: null,
        costUsd: null,
      },
    }),
    getAccumulatedUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
    computeCost: () => null,
    supportsToolUse: () => false,
    inferWithTools: () => {
      throw new Error("Not supported");
    },
  };
}

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

let outputDir: string;

beforeEach(async () => {
  outputDir = path.join(
    tmpdir(),
    `strategy-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  const { mkdir } = await import("node:fs/promises");
  await mkdir(outputDir, { recursive: true });
});

afterEach(async () => {
  await rm(outputDir, { recursive: true, force: true });
});

describe("selectStrategy", () => {
  function buildStrategyInput(
    analysis: typeof standardTsRepoAnalysis,
    classMap: Map<string, ClassifiedComponentData>,
  ): StrategyInput {
    return assembleStrategyInput(analysis, classMap);
  }

  describe("TC-2.1a: strategy for standard TS repo", () => {
    it("produces strategy for standard TS repo with 20+ components", async () => {
      const provider = createMockProvider(standardStrategy);
      const input = buildStrategyInput(
        standardTsRepoAnalysis,
        buildStandardTsClassificationMap(),
      );
      const result = await selectStrategy(provider, input, {
        outputDir,
        loadPrior: false,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.repoClassification).toBe("service-app");
        expect(result.value.boundaries.length).toBeGreaterThan(0);
        expect(result.value.zoneGuidance.length).toBeGreaterThan(0);
      }
    });
  });

  describe("TC-2.1b: strategy for mixed-language repo", () => {
    it("produces strategy for mixed-language repo", async () => {
      const provider = createMockProvider(mixedLangStrategy);
      const input = buildStrategyInput(
        mixedLanguageRepoAnalysis,
        buildMixedLangClassificationMap(),
      );
      const result = await selectStrategy(provider, input, {
        outputDir,
        loadPrior: false,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.repoClassification).toBe("mixed");
      }
    });
  });

  describe("TC-2.1c: strategy for small repo", () => {
    it("produces strategy for small repo (< 8 components)", async () => {
      const provider = createMockProvider(smallRepoStrategy);
      const input = buildStrategyInput(
        smallRepoAnalysis,
        buildSmallRepoClassificationMap(),
      );
      const result = await selectStrategy(provider, input, {
        outputDir,
        loadPrior: false,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.repoClassification).toBe("cli-tool");
      }
    });
  });

  describe("TC-2.2a: strategy file written to output directory", () => {
    it("writes .doc-strategy.json to output directory on success", async () => {
      const provider = createMockProvider(standardStrategy);
      const input = buildStrategyInput(
        standardTsRepoAnalysis,
        buildStandardTsClassificationMap(),
      );
      await selectStrategy(provider, input, { outputDir, loadPrior: false });

      const filePath = path.join(outputDir, ".doc-strategy.json");
      const content = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(content);
      expect(parsed.repoClassification).toBe("service-app");
      expect(parsed.boundaries).toBeDefined();
      expect(parsed.zoneGuidance).toBeDefined();
    });
  });

  describe("TC-2.2b: loads prior strategy in update mode", () => {
    it("loads prior strategy when loadPrior is true", async () => {
      const provider = createMockProvider(standardStrategy);
      const input = buildStrategyInput(
        standardTsRepoAnalysis,
        buildStandardTsClassificationMap(),
      );

      // First run: persist a strategy
      await selectStrategy(provider, input, { outputDir, loadPrior: false });

      // Second run: update mode loads prior
      const result = await selectStrategy(provider, input, {
        outputDir,
        loadPrior: true,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe("TC-2.2c: fresh strategy replaces stale strategy", () => {
    it("fresh strategy replaces stale strategy when structure changes", async () => {
      const input = buildStrategyInput(
        standardTsRepoAnalysis,
        buildStandardTsClassificationMap(),
      );

      // First run: standard strategy
      const provider1 = createMockProvider(standardStrategy);
      await selectStrategy(provider1, input, { outputDir, loadPrior: false });

      // Second run: different strategy (simulating repo change)
      const updatedStrategy: DocumentationStrategy = {
        ...standardStrategy,
        repoClassification: "monolith",
      };
      const provider2 = createMockProvider(updatedStrategy);
      await selectStrategy(provider2, input, { outputDir, loadPrior: true });

      // Verify the file contains the fresh strategy
      const content = await readFile(
        path.join(outputDir, ".doc-strategy.json"),
        "utf-8",
      );
      const parsed = JSON.parse(content);
      expect(parsed.repoClassification).toBe("monolith");
    });
  });

  it("returns STRATEGY_ERROR when inference fails", async () => {
    const provider = createFailingProvider();
    const input = buildStrategyInput(
      standardTsRepoAnalysis,
      buildStandardTsClassificationMap(),
    );
    const result = await selectStrategy(provider, input, {
      outputDir,
      loadPrior: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("STRATEGY_ERROR");
    }
  });

  it("returns STRATEGY_ERROR when response fails Zod validation", async () => {
    const provider = createInvalidResponseProvider();
    const input = buildStrategyInput(
      standardTsRepoAnalysis,
      buildStandardTsClassificationMap(),
    );
    const result = await selectStrategy(provider, input, {
      outputDir,
      loadPrior: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("STRATEGY_ERROR");
    }
  });

  it(".doc-strategy.json is valid JSON with 2-space indentation", async () => {
    const provider = createMockProvider(standardStrategy);
    const input = buildStrategyInput(
      standardTsRepoAnalysis,
      buildStandardTsClassificationMap(),
    );
    await selectStrategy(provider, input, { outputDir, loadPrior: false });

    const content = await readFile(
      path.join(outputDir, ".doc-strategy.json"),
      "utf-8",
    );
    // Verify it parses as valid JSON
    const parsed = JSON.parse(content);
    // Verify 2-space indent: re-serialize and compare
    const expected = `${JSON.stringify(parsed, null, 2)}\n`;
    expect(content).toBe(expected);
  });
});

describe("loadPriorStrategy", () => {
  it("returns null when file doesn't exist", async () => {
    const result = await loadPriorStrategy(outputDir);
    expect(result).toBeNull();
  });

  it("returns null when file is malformed JSON", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      path.join(outputDir, ".doc-strategy.json"),
      "not valid json {{{",
      "utf-8",
    );
    const result = await loadPriorStrategy(outputDir);
    expect(result).toBeNull();
  });

  it("returns null when file is valid JSON but invalid schema", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      path.join(outputDir, ".doc-strategy.json"),
      JSON.stringify({ foo: "bar" }),
      "utf-8",
    );
    const result = await loadPriorStrategy(outputDir);
    expect(result).toBeNull();
  });

  it("returns strategy when file is valid", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      path.join(outputDir, ".doc-strategy.json"),
      JSON.stringify(standardStrategy, null, 2),
      "utf-8",
    );
    const result = await loadPriorStrategy(outputDir);
    expect(result).not.toBeNull();
    expect(result?.repoClassification).toBe("service-app");
  });
});

describe("TC-2.4a: strategy context in planning prompt", () => {
  it("clustering prompt includes strategy guidance when provided", async () => {
    const { buildClusteringPrompt } = await import(
      "../../src/prompts/clustering.js"
    );

    const promptWithStrategy = buildClusteringPrompt(
      standardTsRepoAnalysis,
      standardStrategy,
    );

    // Verify strategy boundaries appear in the prompt
    expect(promptWithStrategy.systemPrompt).toContain("Core Services");
    expect(promptWithStrategy.systemPrompt).toContain("API Layer");
    expect(promptWithStrategy.systemPrompt).toContain("service-app");

    // Verify zone treatments appear
    expect(promptWithStrategy.systemPrompt).toContain("production");
    expect(promptWithStrategy.systemPrompt).toContain("document");
    expect(promptWithStrategy.systemPrompt).toContain("exclude");
  });

  it("clustering prompt does not include strategy section when not provided", async () => {
    const { buildClusteringPrompt } = await import(
      "../../src/prompts/clustering.js"
    );

    const promptWithout = buildClusteringPrompt(standardTsRepoAnalysis);

    expect(promptWithout.systemPrompt).not.toContain(
      "Documentation Strategy Context",
    );
    expect(promptWithout.systemPrompt).not.toContain(
      "Boundary recommendations",
    );
  });
});
