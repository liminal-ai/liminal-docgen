import { describe, expect, it } from "vitest";

import { SectionBuffer } from "../../src/agent/section-buffer.js";

describe("SectionBuffer", () => {
  it("requires overview and source-coverage for hasRequiredSections", () => {
    const buffer = new SectionBuffer();

    buffer.set("entity-table", "| Name | Kind | Role |");
    expect(buffer.hasRequiredSections()).toBe(false);
    expect(buffer.getMissingRequired()).toEqual([
      "overview",
      "source-coverage",
    ]);

    buffer.set("overview", "This module does things.");
    expect(buffer.hasRequiredSections()).toBe(false);
    expect(buffer.getMissingRequired()).toEqual(["source-coverage"]);

    buffer.set("source-coverage", "- src/foo.ts");
    expect(buffer.hasRequiredSections()).toBe(true);
    expect(buffer.getMissingRequired()).toEqual([]);
  });

  it("strips flow-notes when no sequence-diagram is present", () => {
    const buffer = new SectionBuffer();
    buffer.set("overview", "overview content");
    buffer.set("flow-notes", "Step 1: do thing");

    const record = buffer.toSectionRecord();
    expect(record["flow-notes"]).toBeUndefined();
    expect(record.overview).toBe("overview content");
  });

  it("keeps flow-notes when sequence-diagram is present", () => {
    const buffer = new SectionBuffer();
    buffer.set("overview", "overview content");
    buffer.set("sequence-diagram", "sequenceDiagram\nA->>B: call");
    buffer.set("flow-notes", "Step 1: do thing");

    const record = buffer.toSectionRecord();
    expect(record["flow-notes"]).toBe("Step 1: do thing");
    expect(record["sequence-diagram"]).toBe("sequenceDiagram\nA->>B: call");
  });

  it("exports sections in canonical order", () => {
    const buffer = new SectionBuffer();
    // Write in reverse order
    buffer.set("source-coverage", "coverage");
    buffer.set("entity-table", "table");
    buffer.set("overview", "overview");

    const record = buffer.toSectionRecord();
    const keys = Object.keys(record);
    expect(keys).toEqual(["overview", "entity-table", "source-coverage"]);
  });

  it("supports last-write-wins and tracks size", () => {
    const buffer = new SectionBuffer();
    buffer.set("overview", "first version");
    expect(buffer.get("overview")).toBe("first version");
    expect(buffer.size).toBe(1);

    buffer.set("overview", "second version");
    expect(buffer.get("overview")).toBe("second version");
    expect(buffer.size).toBe(1);

    expect(buffer.has("overview")).toBe(true);
    expect(buffer.has("entity-table")).toBe(false);
  });
});
