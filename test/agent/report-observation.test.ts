import { describe, expect, it } from "vitest";

import { ObservationCollector } from "../../src/agent/observation-collector.js";
import { executeReportObservation } from "../../src/agent/tools/report-observation.js";

describe("executeReportObservation", () => {
  it("reports observation for unclassified component with classification-gap category", () => {
    const collector = new ObservationCollector("test-run");
    const result = executeReportObservation(
      {
        category: "classification-gap",
        subject: "src/data/user-store.ts",
        observation:
          "Component labeled utility but implements repository pattern",
        suggestedCategory: "repository",
      },
      "Data Access",
      collector,
    );

    expect(result).toEqual({ recorded: true });
    expect(collector.count()).toBe(1);

    const obs = collector.getAll()[0]!;
    expect(obs.moduleName).toBe("Data Access");
    expect(obs.category).toBe("classification-gap");
    expect(obs.subjectKind).toBe("component");
    expect(obs.subject).toBe("src/data/user-store.ts");
    expect(obs.suggestedCategory).toBe("repository");
  });

  it("reports observation for misclassified zone with zone-ambiguity category", () => {
    const collector = new ObservationCollector("test-run");
    const result = executeReportObservation(
      {
        category: "zone-ambiguity",
        subject: "src/helpers/test-utils.ts",
        observation:
          "File in production zone but is clearly test infrastructure",
      },
      "Utilities",
      collector,
    );

    expect(result).toEqual({ recorded: true });
    const obs = collector.getAll()[0]!;
    expect(obs.category).toBe("zone-ambiguity");
    expect(obs.subjectKind).toBe("component");
  });

  it("returns recorded:true even when collector throws", () => {
    // Create a collector-like object whose add() throws
    const brokenCollector = {
      add() {
        throw new Error("Collector is broken");
      },
      getAll: () => [],
      count: () => 0,
      persist: async () => {},
    } as unknown as ObservationCollector;

    const result = executeReportObservation(
      {
        category: "classification-gap",
        subject: "src/test.ts",
        observation: "test",
      },
      "Test",
      brokenCollector,
    );

    expect(result).toEqual({ recorded: true });
  });

  it("infers subject kind correctly", () => {
    const collector = new ObservationCollector("test-run");

    // File path → component
    executeReportObservation(
      {
        category: "classification-gap",
        subject: "src/file.ts",
        observation: "test",
      },
      "Module",
      collector,
    );

    // Relationship arrow → relationship
    executeReportObservation(
      {
        category: "relationship-gap",
        subject: "ModuleA -> ModuleB",
        observation: "test",
      },
      "Module",
      collector,
    );

    // Plain name → module
    executeReportObservation(
      {
        category: "archetype-mismatch",
        subject: "Core Engine",
        observation: "test",
      },
      "Module",
      collector,
    );

    const observations = collector.getAll();
    expect(observations[0]!.subjectKind).toBe("component");
    expect(observations[1]!.subjectKind).toBe("relationship");
    expect(observations[2]!.subjectKind).toBe("module");
  });
});
