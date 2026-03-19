import { describe, expect, it } from "vitest";

import { SectionBuffer } from "../../src/agent/section-buffer.js";
import { executeWriteSection } from "../../src/agent/tools/write-section.js";

describe("executeWriteSection", () => {
  it("writes valid section to buffer", () => {
    const buffer = new SectionBuffer();
    const result = executeWriteSection(
      { section: "overview", content: "Module overview content" },
      buffer,
    );

    expect(result).toEqual({ written: true });
    expect(buffer.get("overview")).toBe("Module overview content");
  });

  it("returns error for invalid section kind", () => {
    const buffer = new SectionBuffer();
    const result = executeWriteSection(
      {
        section: "invalid-section" as "overview",
        content: "content",
      },
      buffer,
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Invalid section kind");
    }
  });

  it("supports last-write-wins", () => {
    const buffer = new SectionBuffer();

    executeWriteSection({ section: "overview", content: "first" }, buffer);
    executeWriteSection({ section: "overview", content: "second" }, buffer);

    expect(buffer.get("overview")).toBe("second");
  });
});
