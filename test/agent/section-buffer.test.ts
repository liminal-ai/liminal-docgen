import { describe, expect, it } from "vitest";

import { assembleAgentPage } from "../../src/agent/page-assembly.js";
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

describe("assembleAgentPage — page assembly from agent sections (Story 6)", () => {
  it("TC-6.2a: full sections produce correct markdown with proper order", () => {
    const sections: Record<string, string> = {
      overview: "This module handles core logic.",
      responsibilities: "- Parse input\n- Validate output",
      "structure-diagram": "```mermaid\nclassDiagram\n  ClassA --> ClassB\n```",
      "entity-table":
        "| Name | Kind | Role |\n| --- | --- | --- |\n| Foo | class | Main entry |",
      "sequence-diagram": "```mermaid\nsequenceDiagram\n  A->>B: request\n```",
      "flow-notes":
        "| Step | Actor | Action | Output |\n| --- | --- | --- | --- |\n| 1 | A | calls B | response |",
      "source-coverage": "- src/core.ts\n- src/utils.ts",
      "cross-module-context": "- src/core.ts -> src/api.ts (import)",
    };

    const result = assembleAgentPage("Core Module", sections);

    // Title is prepended
    expect(result).toMatch(/^# Core Module\n/);

    // All section headings present in canonical order
    const headingOrder = [
      "## Overview",
      "## Responsibilities",
      "## Structure Diagram",
      "## Entity Table",
      "## Key Flow",
      "## Flow Notes",
      "## Source Coverage",
      "## Cross-Module Context",
    ];
    let lastIndex = -1;
    for (const heading of headingOrder) {
      const idx = result.indexOf(heading);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }

    // Content is present
    expect(result).toContain("This module handles core logic.");
    expect(result).toContain("- src/core.ts");
  });

  it("TC-6.2b: partial sections produce markdown without empty placeholders", () => {
    const sections: Record<string, string> = {
      overview: "A simple utility module.",
      responsibilities: "- Format strings",
      "source-coverage": "- src/utils.ts",
    };

    const result = assembleAgentPage("Utils", sections);

    // Present sections
    expect(result).toContain("# Utils");
    expect(result).toContain("## Overview");
    expect(result).toContain("## Responsibilities");
    expect(result).toContain("## Source Coverage");

    // Absent sections should NOT appear at all — no empty placeholders
    expect(result).not.toContain("## Structure Diagram");
    expect(result).not.toContain("## Entity Table");
    expect(result).not.toContain("## Key Flow");
    expect(result).not.toContain("## Flow Notes");
    expect(result).not.toContain("## Cross-Module Context");

    // No empty lines between heading and next heading (no placeholder gaps)
    expect(result).not.toMatch(/## \w+\n\n\n## /);
  });
});
