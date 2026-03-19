import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkFlowNotesConstraint } from "../../src/validation/checks/flow-notes-constraint.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await cleanupTempDir(dir);
  }
  tempDirs.length = 0;
});

describe("checkFlowNotesConstraint", () => {
  it("passes when flow notes accompany sequence diagram", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const page = [
      "# Module",
      "",
      "## Key Flow",
      "",
      "```mermaid",
      "sequenceDiagram",
      "  A->>B: call",
      "```",
      "",
      "## Flow Notes",
      "",
      "| Step | Actor | Action | Output |",
      "| --- | --- | --- | --- |",
      "| 1 | A | Calls B | Response |",
    ].join("\n");

    await writeFile(path.join(outputDir, "module.md"), page, "utf8");

    const findings = await checkFlowNotesConstraint(outputDir);
    expect(findings).toEqual([]);
  });

  it("warns when flow notes exist without sequence diagram", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const page = [
      "# Module",
      "",
      "## Overview",
      "",
      "Some content.",
      "",
      "## Flow Notes",
      "",
      "| Step | Actor | Action | Output |",
      "| --- | --- | --- | --- |",
      "| 1 | A | Calls B | Response |",
    ].join("\n");

    await writeFile(path.join(outputDir, "module.md"), page, "utf8");

    const findings = await checkFlowNotesConstraint(outputDir);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.category).toBe("flow-notes");
    expect(findings[0]!.severity).toBe("warning");
  });

  it("no findings when neither flow notes nor sequence diagram exist", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const page = ["# Module", "", "## Overview", "", "Simple module."].join(
      "\n",
    );

    await writeFile(path.join(outputDir, "module.md"), page, "utf8");

    const findings = await checkFlowNotesConstraint(outputDir);
    expect(findings).toEqual([]);
  });
});
