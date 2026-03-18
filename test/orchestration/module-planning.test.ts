import { readFileSync } from "node:fs";

import type { InferenceProvider } from "../../src/inference/index.js";
import { planModules } from "../../src/orchestration/stages/module-planning.js";
import type {
  AnalyzedRelationship,
  RepositoryAnalysis,
} from "../../src/types/analysis.js";
import type { ModulePlan } from "../../src/types/planning.js";
import { createMockSDK } from "../helpers/agent-sdk-mock.js";

const FIXTURE_BASE_URL = new URL("../fixtures/agent-sdk/", import.meta.url);

const loadPlanFixture = (fileName: string): ModulePlan =>
  JSON.parse(
    readFileSync(new URL(fileName, FIXTURE_BASE_URL), "utf8"),
  ) as ModulePlan;

const buildAnalysis = (
  componentPaths: string[],
  relationships: AnalyzedRelationship[] = [],
): RepositoryAnalysis => ({
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
  focusDirs: ["src/analysis", "src/config"],
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

const expectPlannedModules = (
  result: Awaited<ReturnType<typeof planModules>>,
): ModulePlan => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(
      `Expected module planning to succeed: ${result.error.code} ${result.error.message}`,
    );
  }

  return result.value;
};

describe("planModules", () => {
  it("TC-1.3a: components grouped into modules", async () => {
    const fixture = loadPlanFixture("clustering-3-modules.json");
    const analysis = buildAnalysis([
      ...fixture.modules.flatMap((module) => module.components),
      ...fixture.unmappedComponents,
    ]);
    const sdk = createMockSDK({
      clustering: {
        output: fixture,
      },
    });

    const value = expectPlannedModules(await planModules(analysis, sdk));
    const assignedComponents = value.modules.flatMap(
      (module) => module.components,
    );

    expect(value.modules).toHaveLength(3);
    expect(new Set(assignedComponents)).toHaveLength(assignedComponents.length);
    expect(
      new Set([...assignedComponents, ...value.unmappedComponents]),
    ).toEqual(new Set(Object.keys(analysis.components)));
  });

  it("TC-1.3b: small repo bypass", async () => {
    const analysis = buildAnalysis([
      "src/config/resolver.ts",
      "src/config/defaults.ts",
      "src/analysis/analyze.ts",
      "src/analysis/normalizer.ts",
      "src/adapters/git.ts",
      "src/types/common.ts",
    ]);
    const query = vi.fn();
    const sdk: InferenceProvider & { query: typeof query } = {
      computeCost: () => 0,
      getAccumulatedUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
      infer: query,
      query,
    };

    const value = expectPlannedModules(await planModules(analysis, sdk));

    expect(query).not.toHaveBeenCalled();
    expect(value.modules).toEqual([
      expect.objectContaining({
        components: ["src/adapters/git.ts"],
        name: "adapters",
      }),
      expect.objectContaining({
        components: ["src/analysis/analyze.ts", "src/analysis/normalizer.ts"],
        name: "analysis",
      }),
      expect.objectContaining({
        components: ["src/config/defaults.ts", "src/config/resolver.ts"],
        name: "config",
      }),
      expect.objectContaining({
        components: ["src/types/common.ts"],
        name: "types",
      }),
    ]);
    expect(value.unmappedComponents).toEqual([]);
  });

  it("TC-1.3c: modules have names and descriptions", async () => {
    const fixture = loadPlanFixture("clustering-3-modules.json");
    const analysis = buildAnalysis([
      ...fixture.modules.flatMap((module) => module.components),
      ...fixture.unmappedComponents,
    ]);
    const sdk = createMockSDK({
      clustering: {
        output: fixture,
      },
    });

    const value = expectPlannedModules(await planModules(analysis, sdk));

    for (const module of value.modules) {
      expect(module.name.trim()).not.toBe("");
      expect(module.description.trim()).not.toBe("");
    }
  });

  it("TC-1.3d: unmapped components tracked", async () => {
    const fixture = loadPlanFixture("clustering-3-modules.json");
    const analysis = buildAnalysis([
      ...fixture.modules.flatMap((module) => module.components),
      ...fixture.unmappedComponents,
    ]);
    const sdk = createMockSDK({
      clustering: {
        output: fixture,
      },
    });

    const value = expectPlannedModules(await planModules(analysis, sdk));

    expect(value.unmappedComponents).toEqual([
      "src/analysis/raw-output.ts",
      "src/analysis/scripts/analyze_repository.py",
    ]);
  });

  it("clustering returns invalid plan (overlap)", async () => {
    const fixture = loadPlanFixture("clustering-invalid.json");
    const analysis = buildAnalysis([
      "src/index.ts",
      "src/config/resolver.ts",
      "src/types/common.ts",
      "src/languages.ts",
      "src/analysis/raw-output.ts",
      "src/analysis/analyze.ts",
      "src/analysis/normalizer.ts",
      "src/adapters/git.ts",
      "src/adapters/python.ts",
    ]);
    const sdk = createMockSDK({
      clustering: {
        output: {
          ...fixture,
          unmappedComponents: [
            ...fixture.unmappedComponents,
            "src/analysis/analyze.ts",
            "src/analysis/normalizer.ts",
            "src/adapters/git.ts",
            "src/adapters/python.ts",
          ],
        },
      },
    });

    const result = await planModules(analysis, sdk);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("ORCHESTRATION_ERROR");
    expect(result.error.details).toMatchObject({
      overlappingComponents: [
        expect.objectContaining({
          component: "src/types/common.ts",
        }),
      ],
    });
  });

  it("clustering returns empty modules array", async () => {
    const analysis = buildAnalysis([
      "src/index.ts",
      "src/config/resolver.ts",
      "src/config/defaults.ts",
      "src/analysis/analyze.ts",
      "src/analysis/normalizer.ts",
      "src/adapters/git.ts",
      "src/adapters/python.ts",
      "src/types/common.ts",
      "src/languages.ts",
    ]);
    const sdk = createMockSDK({
      clustering: {
        output: {
          modules: [],
          unmappedComponents: Object.keys(analysis.components),
        },
      },
    });

    const result = await planModules(analysis, sdk);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("ORCHESTRATION_ERROR");
    expect(result.error.message).toContain("must contain at least one module");
  });

  it("plan validation rejects duplicate module names", async () => {
    const analysis = buildAnalysis([
      "src/index.ts",
      "src/config/resolver.ts",
      "src/config/defaults.ts",
      "src/analysis/analyze.ts",
      "src/analysis/normalizer.ts",
      "src/adapters/git.ts",
      "src/adapters/python.ts",
      "src/types/common.ts",
      "src/languages.ts",
    ]);
    const sdk = createMockSDK({
      clustering: {
        output: {
          modules: [
            {
              components: [
                "src/index.ts",
                "src/config/resolver.ts",
                "src/config/defaults.ts",
              ],
              description: "First shared module",
              name: "shared",
            },
            {
              components: [
                "src/analysis/analyze.ts",
                "src/analysis/normalizer.ts",
                "src/adapters/git.ts",
                "src/adapters/python.ts",
              ],
              description: "Second shared module",
              name: "shared",
            },
          ],
          unmappedComponents: ["src/types/common.ts", "src/languages.ts"],
        },
      },
    });

    const result = await planModules(analysis, sdk);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("ORCHESTRATION_ERROR");
    expect(result.error.details).toMatchObject({
      duplicateModuleNames: ["shared"],
    });
  });

  it("small-repo bypass with flat layout", async () => {
    const analysis = buildAnalysis([
      "index.ts",
      "config.ts",
      "cli.ts",
      "types.ts",
    ]);
    const query = vi.fn();
    const sdk: InferenceProvider & { query: typeof query } = {
      computeCost: () => 0,
      getAccumulatedUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
      infer: query,
      query,
    };

    const value = expectPlannedModules(await planModules(analysis, sdk));

    expect(query).not.toHaveBeenCalled();
    expect(value.modules).toEqual([
      expect.objectContaining({
        components: ["cli.ts", "config.ts", "index.ts", "types.ts"],
      }),
    ]);
    expect(value.unmappedComponents).toEqual([]);
  });

  it("small-repo bypass groups deeply nested paths by the first two segments", async () => {
    const analysis = buildAnalysis([
      "src/features/auth/login.ts",
      "src/features/auth/logout.ts",
      "src/features/billing/invoice.ts",
      "packages/api/client.ts",
      "packages/api/server.ts",
      "README.ts",
    ]);
    const query = vi.fn();
    const sdk: InferenceProvider & { query: typeof query } = {
      computeCost: () => 0,
      getAccumulatedUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
      infer: query,
      query,
    };

    const value = expectPlannedModules(await planModules(analysis, sdk));

    expect(query).not.toHaveBeenCalled();
    expect(value.modules).toEqual([
      expect.objectContaining({
        components: [
          "src/features/auth/login.ts",
          "src/features/auth/logout.ts",
        ],
        name: "features/auth",
      }),
      expect.objectContaining({
        components: ["src/features/billing/invoice.ts"],
        name: "features/billing",
      }),
      expect.objectContaining({
        components: ["packages/api/client.ts", "packages/api/server.ts"],
        name: "packages/api",
      }),
    ]);
    expect(value.unmappedComponents).toEqual(["README.ts"]);
  });

  it("empty analysis returns ORCHESTRATION_ERROR", async () => {
    const analysis = buildAnalysis([]);
    const query = vi.fn();
    const sdk: InferenceProvider & { query: typeof query } = {
      computeCost: () => 0,
      getAccumulatedUsage: () => ({ inputTokens: 0, outputTokens: 0 }),
      infer: query,
      query,
    };

    const result = await planModules(analysis, sdk);

    expect(query).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("ORCHESTRATION_ERROR");
    expect(result.error.message).toContain("no components");
  });

  it("Agent SDK failure returns ORCHESTRATION_ERROR", async () => {
    const analysis = buildAnalysis([
      "src/index.ts",
      "src/config/resolver.ts",
      "src/config/defaults.ts",
      "src/analysis/analyze.ts",
      "src/analysis/normalizer.ts",
      "src/adapters/git.ts",
      "src/adapters/python.ts",
      "src/types/common.ts",
      "src/languages.ts",
    ]);
    const sdk = createMockSDK({
      globalError: {
        code: "ORCHESTRATION_ERROR",
        message: "Inference provider network timeout",
      },
    });

    const result = await planModules(analysis, sdk);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("ORCHESTRATION_ERROR");
    expect(result.error.message).toContain("clustering failed");
  });

  it("schema validation failure includes raw response", async () => {
    const analysis = buildAnalysis([
      "src/index.ts",
      "src/config/resolver.ts",
      "src/config/defaults.ts",
      "src/analysis/analyze.ts",
      "src/analysis/normalizer.ts",
      "src/adapters/git.ts",
      "src/adapters/python.ts",
      "src/types/common.ts",
      "src/languages.ts",
    ]);
    const malformedResponse = {
      modules: "not-an-array",
      unmappedComponents: 42,
    };
    const sdk = createMockSDK({
      clustering: {
        output: malformedResponse as unknown as ModulePlan,
      },
    });

    const result = await planModules(analysis, sdk);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe("ORCHESTRATION_ERROR");
    expect(result.error.message).toContain(
      "does not match the expected schema",
    );
    expect(result.error.details).toMatchObject({
      rawResponse: malformedResponse,
      validationErrors: expect.objectContaining({
        fieldErrors: expect.any(Object),
      }),
    });
  });
});
