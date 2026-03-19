import { describe, expect, it } from "vitest";
import { classifyModules } from "../../src/classification/module-classifier.js";
import type { ClassifiedComponentData } from "../../src/classification/types.js";
import type { AnalyzedRelationship } from "../../src/types/analysis.js";
import type { PlannedModule } from "../../src/types/planning.js";

describe("classifyModules", () => {
  // --- AC-1.3: Module Archetype Assignment ---

  it("TC-1.3a: assigns orchestration archetype from handler/controller roles with high cross-module edges", () => {
    const modules: PlannedModule[] = [
      {
        name: "api",
        description: "API layer",
        components: ["handler1.ts", "controller1.ts", "util.ts", "handler2.ts"],
      },
      {
        name: "data",
        description: "Data layer",
        components: ["model1.ts", "model2.ts"],
      },
    ];
    const classificationMap = new Map<string, ClassifiedComponentData>([
      [
        "handler1.ts",
        { role: "handler", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "controller1.ts",
        {
          role: "controller",
          roleConfidence: "confirmed",
          zone: "production",
        },
      ],
      [
        "util.ts",
        { role: "utility", roleConfidence: "likely", zone: "production" },
      ],
      [
        "handler2.ts",
        { role: "handler", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "model1.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "model2.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
    ]);
    // 3/4 = 75% handler/controller in api module
    // 3 cross-module edges (all outbound from api to data)
    const relationships: AnalyzedRelationship[] = [
      { source: "handler1.ts", target: "model1.ts", type: "import" },
      { source: "controller1.ts", target: "model2.ts", type: "import" },
      { source: "handler2.ts", target: "model1.ts", type: "import" },
    ];
    const result = classifyModules(modules, classificationMap, relationships);
    expect(result.get("api")).toBe("orchestration");
  });

  it("TC-1.3b: assigns type-definitions archetype from all type-definition roles", () => {
    const modules: PlannedModule[] = [
      {
        name: "types",
        description: "Types",
        components: ["user.ts", "order.ts", "common.ts"],
      },
    ];
    const classificationMap = new Map<string, ClassifiedComponentData>([
      [
        "user.ts",
        {
          role: "type-definition",
          roleConfidence: "confirmed",
          zone: "production",
        },
      ],
      [
        "order.ts",
        {
          role: "type-definition",
          roleConfidence: "confirmed",
          zone: "production",
        },
      ],
      [
        "common.ts",
        {
          role: "type-definition",
          roleConfidence: "confirmed",
          zone: "production",
        },
      ],
    ]);
    const result = classifyModules(modules, classificationMap, []);
    expect(result.get("types")).toBe("type-definitions");
  });

  it("TC-1.3c: assigns mixed archetype when no dominant pattern", () => {
    const modules: PlannedModule[] = [
      {
        name: "mixed",
        description: "Mixed module",
        components: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"],
      },
    ];
    const classificationMap = new Map<string, ClassifiedComponentData>([
      [
        "a.ts",
        { role: "service", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "b.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "c.ts",
        { role: "utility", roleConfidence: "likely", zone: "production" },
      ],
      [
        "d.ts",
        { role: "handler", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "e.ts",
        { role: "adapter", roleConfidence: "likely", zone: "production" },
      ],
    ]);
    const result = classifyModules(modules, classificationMap, []);
    // Each role is 20% — no threshold met
    expect(result.get("mixed")).toBe("mixed");
  });

  it("TC-1.3d: assigns domain-model archetype from model-heavy module with few cross-module deps", () => {
    const modules: PlannedModule[] = [
      {
        name: "domain",
        description: "Domain models",
        components: ["user.ts", "order.ts", "product.ts", "helper.ts"],
      },
      {
        name: "api",
        description: "API",
        components: ["handler.ts"],
      },
    ];
    const classificationMap = new Map<string, ClassifiedComponentData>([
      [
        "user.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "order.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "product.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "helper.ts",
        { role: "utility", roleConfidence: "likely", zone: "production" },
      ],
      [
        "handler.ts",
        { role: "handler", roleConfidence: "confirmed", zone: "production" },
      ],
    ]);
    // Only 1 cross-module edge (≤2)
    const relationships: AnalyzedRelationship[] = [
      { source: "handler.ts", target: "user.ts", type: "import" },
    ];
    const result = classifyModules(modules, classificationMap, relationships);
    // 3/4 = 75% model, cross-module edges = 1 ≤ 2
    expect(result.get("domain")).toBe("domain-model");
  });

  it("TC-1.3e: assigns test-suite archetype from all-test-zone module", () => {
    const modules: PlannedModule[] = [
      {
        name: "tests",
        description: "Test suite",
        components: ["test/a.test.ts", "test/b.test.ts"],
      },
    ];
    const classificationMap = new Map<string, ClassifiedComponentData>([
      [
        "test/a.test.ts",
        { role: "test", roleConfidence: "confirmed", zone: "test" },
      ],
      [
        "test/b.test.ts",
        { role: "test", roleConfidence: "confirmed", zone: "test" },
      ],
    ]);
    const result = classifyModules(modules, classificationMap, []);
    expect(result.get("tests")).toBe("test-suite");
  });

  // --- Additional: Zone-based priority over role-based ---

  it("zone-based archetypes take precedence over role-based", () => {
    // Module with all test zone but all type-definition roles
    // test-suite (zone) should win over type-definitions (role)
    const modules: PlannedModule[] = [
      {
        name: "test-types",
        description: "Test types",
        components: ["test/types.ts", "test/utils.ts"],
      },
    ];
    const classificationMap = new Map<string, ClassifiedComponentData>([
      [
        "test/types.ts",
        {
          role: "type-definition",
          roleConfidence: "confirmed",
          zone: "test",
        },
      ],
      [
        "test/utils.ts",
        {
          role: "type-definition",
          roleConfidence: "confirmed",
          zone: "test",
        },
      ],
    ]);
    const result = classifyModules(modules, classificationMap, []);
    expect(result.get("test-types")).toBe("test-suite");
  });

  // --- Additional: Threshold Boundaries ---

  it("exactly 60% model roles triggers domain-model", () => {
    const modules: PlannedModule[] = [
      {
        name: "domain",
        description: "Domain",
        components: ["m1.ts", "m2.ts", "m3.ts", "u1.ts", "u2.ts"],
      },
    ];
    const classificationMap = new Map<string, ClassifiedComponentData>([
      [
        "m1.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "m2.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "m3.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "u1.ts",
        { role: "utility", roleConfidence: "likely", zone: "production" },
      ],
      [
        "u2.ts",
        { role: "utility", roleConfidence: "likely", zone: "production" },
      ],
    ]);
    const result = classifyModules(modules, classificationMap, []);
    // 3/5 = 60% model, 0 cross-module edges ≤ 2
    expect(result.get("domain")).toBe("domain-model");
  });

  it("below 60% model roles does not trigger domain-model", () => {
    const modules: PlannedModule[] = [
      {
        name: "mostly-models",
        description: "Mostly models",
        components: [
          "m1.ts",
          "m2.ts",
          "m3.ts",
          "m4.ts",
          "u1.ts",
          "u2.ts",
          "u3.ts",
        ],
      },
    ];
    const classificationMap = new Map<string, ClassifiedComponentData>([
      [
        "m1.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "m2.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "m3.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "m4.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "u1.ts",
        { role: "utility", roleConfidence: "likely", zone: "production" },
      ],
      [
        "u2.ts",
        { role: "utility", roleConfidence: "likely", zone: "production" },
      ],
      [
        "u3.ts",
        { role: "utility", roleConfidence: "likely", zone: "production" },
      ],
    ]);
    const result = classifyModules(modules, classificationMap, []);
    // 4/7 ≈ 57.1% < 60% — does not trigger domain-model
    expect(result.get("mostly-models")).not.toBe("domain-model");
  });

  // --- Additional: Cross-module Edge Counting ---

  it("only edges between different modules count as cross-module", () => {
    const modules: PlannedModule[] = [
      {
        name: "api",
        description: "API",
        components: ["h1.ts", "h2.ts", "c1.ts", "h3.ts"],
      },
      {
        name: "data",
        description: "Data",
        components: ["m1.ts"],
      },
    ];
    const classificationMap = new Map<string, ClassifiedComponentData>([
      [
        "h1.ts",
        { role: "handler", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "h2.ts",
        { role: "handler", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "c1.ts",
        {
          role: "controller",
          roleConfidence: "confirmed",
          zone: "production",
        },
      ],
      [
        "h3.ts",
        { role: "handler", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "m1.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
    ]);
    const relationships: AnalyzedRelationship[] = [
      // 3 within-module edges (should NOT count as cross-module)
      { source: "h1.ts", target: "h2.ts", type: "import" },
      { source: "h2.ts", target: "c1.ts", type: "import" },
      { source: "c1.ts", target: "h3.ts", type: "import" },
      // Only 2 cross-module edges
      { source: "h1.ts", target: "m1.ts", type: "import" },
      { source: "h2.ts", target: "m1.ts", type: "import" },
    ];
    const result = classifyModules(modules, classificationMap, relationships);
    // api: 100% handler/controller. Total edges=5 but cross-module=2.
    // Orchestration needs cross-module ≥3 → NOT orchestration.
    expect(result.get("api")).not.toBe("orchestration");
  });

  // --- Additional: All Modules Covered ---

  it("output map covers every module", () => {
    const modules: PlannedModule[] = [
      { name: "a", description: "A", components: ["a.ts"] },
      { name: "b", description: "B", components: ["b.ts"] },
      { name: "c", description: "C", components: ["c.ts"] },
    ];
    const classificationMap = new Map<string, ClassifiedComponentData>([
      [
        "a.ts",
        { role: "service", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "b.ts",
        { role: "model", roleConfidence: "confirmed", zone: "production" },
      ],
      [
        "c.ts",
        { role: "utility", roleConfidence: "likely", zone: "production" },
      ],
    ]);
    const result = classifyModules(modules, classificationMap, []);
    expect(result.size).toBe(modules.length);
    for (const mod of modules) {
      expect(result.has(mod.name)).toBe(true);
    }
  });
});
