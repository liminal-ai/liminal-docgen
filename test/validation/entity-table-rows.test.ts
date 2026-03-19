import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkEntityTableRows } from "../../src/validation/checks/entity-table-rows.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await cleanupTempDir(dir);
  }
  tempDirs.length = 0;
});

describe("checkEntityTableRows", () => {
  it("passes with valid entity table", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const page = [
      "# Module",
      "",
      "## Entity Table",
      "",
      "| Name | Kind | Role |",
      "| --- | --- | --- |",
      "| UserService | class | Manages users |",
      "| UserRepo | class | Data access |",
    ].join("\n");

    await writeFile(path.join(outputDir, "module.md"), page, "utf8");

    const findings = await checkEntityTableRows(outputDir);
    expect(findings).toEqual([]);
  });

  it("warns when entity table row has empty fields", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const page = [
      "# Module",
      "",
      "## Entity Table",
      "",
      "| Name | Kind | Role |",
      "| --- | --- | --- |",
      "| UserService | class | Manages users |",
      "|  | class | Missing name |",
    ].join("\n");

    await writeFile(path.join(outputDir, "module.md"), page, "utf8");

    const findings = await checkEntityTableRows(outputDir);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.category).toBe("entity-table");
    expect(findings[0]!.severity).toBe("warning");
  });

  it("no findings when no entity table exists", async () => {
    const outputDir = createTempDir();
    tempDirs.push(outputDir);

    const page = [
      "# Module",
      "",
      "## Overview",
      "",
      "Simple module with no entity table.",
    ].join("\n");

    await writeFile(path.join(outputDir, "module.md"), page, "utf8");

    const findings = await checkEntityTableRows(outputDir);
    expect(findings).toEqual([]);
  });
});
