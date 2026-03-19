import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  ObservationCollector,
  type RunObservations,
} from "../../src/agent/observation-collector.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await cleanupTempDir(dir);
  }
  tempDirs.length = 0;
});

describe("ObservationCollector", () => {
  it("writes .doc-observations.json with correct observation count", async () => {
    const collector = new ObservationCollector("test-run-1");
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    for (let i = 0; i < 5; i++) {
      collector.add({
        moduleName: `Module ${i}`,
        category: "classification-gap",
        subjectKind: "component",
        subject: `src/file${i}.ts`,
        observation: `Observation ${i}`,
      });
    }

    await collector.persist(outputDir);

    const filePath = path.join(outputDir, ".doc-observations.json");
    const content = JSON.parse(
      await readFile(filePath, "utf8"),
    ) as RunObservations;

    expect(content.observationCount).toBe(5);
    expect(content.observations).toHaveLength(5);
    expect(content.runId).toBe("test-run-1");
  });

  it("does not write file when no observations reported", async () => {
    const collector = new ObservationCollector("test-run-2");
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    await collector.persist(outputDir);

    const filePath = path.join(outputDir, ".doc-observations.json");
    await expect(access(filePath)).rejects.toThrow();
  });

  it("persisted observations include all required metadata fields", async () => {
    const collector = new ObservationCollector("test-run-3");
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    collector.add({
      moduleName: "Data Access",
      category: "zone-ambiguity",
      subjectKind: "component",
      subject: "src/data/store.ts",
      observation: "Component in production zone is test infrastructure",
      suggestedCategory: "test",
    });

    await collector.persist(outputDir);

    const filePath = path.join(outputDir, ".doc-observations.json");
    const content = JSON.parse(
      await readFile(filePath, "utf8"),
    ) as RunObservations;

    expect(content.runId).toBe("test-run-3");
    expect(content.timestamp).toBeDefined();
    expect(content.observations[0]).toMatchObject({
      moduleName: "Data Access",
      category: "zone-ambiguity",
      subjectKind: "component",
      subject: "src/data/store.ts",
      observation: "Component in production zone is test infrastructure",
      suggestedCategory: "test",
    });
  });

  it("handles persistence errors silently", async () => {
    const collector = new ObservationCollector("test-run-4");
    collector.add({
      moduleName: "Test",
      category: "classification-gap",
      subjectKind: "component",
      subject: "src/test.ts",
      observation: "test",
    });

    // Write to a nonexistent deeply nested path — should not throw
    await expect(
      collector.persist("/nonexistent/deeply/nested/path"),
    ).resolves.toBeUndefined();
  });
});
