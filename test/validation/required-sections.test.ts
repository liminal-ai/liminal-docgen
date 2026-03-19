import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkRequiredSections } from "../../src/validation/checks/required-sections.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await cleanupTempDir(dir);
  }
  tempDirs.length = 0;
});

describe("checkRequiredSections", () => {
  it("passes when page has all required sections", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const page = [
      "# Module Name",
      "",
      "## Overview",
      "",
      "This is the overview.",
      "",
      "## Source Coverage",
      "",
      "- src/file.ts",
    ].join("\n");

    await writeFile(path.join(outputDir, "module.md"), page, "utf8");

    const findings = await checkRequiredSections(outputDir);
    expect(findings).toEqual([]);
  });

  it("fails when page is missing overview", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const page = [
      "# Module Name",
      "",
      "## Source Coverage",
      "",
      "- src/file.ts",
    ].join("\n");

    await writeFile(path.join(outputDir, "module.md"), page, "utf8");

    const findings = await checkRequiredSections(outputDir);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.category).toBe("required-section");
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.message).toContain("Overview");
  });

  it("fails when page is missing source-coverage", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const page = [
      "# Module Name",
      "",
      "## Overview",
      "",
      "This is the overview.",
    ].join("\n");

    await writeFile(path.join(outputDir, "module.md"), page, "utf8");

    const findings = await checkRequiredSections(outputDir);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.category).toBe("required-section");
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.message).toContain("Source Coverage");
  });
});
