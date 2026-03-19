import { readFile } from "node:fs/promises";

import type { ValidationFinding } from "../../types/index.js";
import { listMarkdownFiles } from "./shared.js";

const ENTITY_TABLE_HEADER_PATTERN = /\|\s*Name\s*\|\s*Kind\s*\|\s*Role\s*\|/i;
const TABLE_ROW_PATTERN = /^\|(.+)\|$/;

/**
 * Check that entity table rows have non-empty name, kind, and role fields.
 * AC-4.3d: if an entity table section exists, each row must have non-empty
 * values in the first three columns (Name, Kind, Role).
 *
 * Produces "warning" severity findings for malformed rows.
 */
export const checkEntityTableRows = async (
  outputPath: string,
): Promise<ValidationFinding[]> => {
  const markdownFiles = await listMarkdownFiles(outputPath);

  if (markdownFiles.length === 0) {
    return [];
  }

  const findings: ValidationFinding[] = [];

  for (const filePath of markdownFiles) {
    const contents = await readFile(filePath, "utf8");
    const lines = contents.split("\n");

    let inEntityTable = false;
    let headerSkipped = false;

    for (const line of lines) {
      if (ENTITY_TABLE_HEADER_PATTERN.test(line)) {
        inEntityTable = true;
        headerSkipped = false;
        continue;
      }

      if (inEntityTable && !headerSkipped) {
        // Skip the separator row (| --- | --- | --- |)
        headerSkipped = true;
        continue;
      }

      if (inEntityTable) {
        const match = TABLE_ROW_PATTERN.exec(line.trim());

        if (!match) {
          // End of table
          inEntityTable = false;
          headerSkipped = false;
          continue;
        }

        const cells = match[1]?.split("|").map((c) => c.trim()) ?? [];
        const name = cells[0] ?? "";
        const kind = cells[1] ?? "";
        const role = cells[2] ?? "";

        if (!name || !kind || !role) {
          findings.push({
            category: "entity-table",
            filePath,
            message: `Entity table row has empty field(s) — name: "${name}", kind: "${kind}", role: "${role}" in ${filePath}`,
            severity: "warning",
          });
        }
      }
    }
  }

  return findings;
};
