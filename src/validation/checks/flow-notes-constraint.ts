import { readFile } from "node:fs/promises";

import type { ValidationFinding } from "../../types/index.js";
import { listMarkdownFiles } from "./shared.js";

/**
 * Check that flow notes sections are accompanied by a sequence diagram.
 * AC-4.3e: if flow notes exist in a page, a sequence diagram must also exist.
 * The SectionBuffer already strips flow-notes without sequence-diagram at
 * assembly time; this catches edge cases.
 *
 * Produces "warning" severity findings.
 */
export const checkFlowNotesConstraint = async (
  outputPath: string,
): Promise<ValidationFinding[]> => {
  const markdownFiles = await listMarkdownFiles(outputPath);

  if (markdownFiles.length === 0) {
    return [];
  }

  const findings: ValidationFinding[] = [];

  for (const filePath of markdownFiles) {
    const contents = await readFile(filePath, "utf8");

    const hasFlowNotes = contents.includes("## Flow Notes");
    const hasSequenceDiagram = contents.includes("## Key Flow");

    if (hasFlowNotes && !hasSequenceDiagram) {
      findings.push({
        category: "flow-notes",
        filePath,
        message: `Flow notes section exists without a sequence diagram in ${filePath}`,
        severity: "warning",
      });
    }
  }

  return findings;
};
