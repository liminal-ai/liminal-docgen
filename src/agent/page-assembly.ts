import { PAGE_SECTION_KINDS } from "./types.js";

/** Heading text for each section kind. */
const SECTION_HEADINGS: Record<string, string> = {
  overview: "Overview",
  responsibilities: "Responsibilities",
  "structure-diagram": "Structure Diagram",
  "entity-table": "Entity Table",
  "sequence-diagram": "Key Flow",
  "flow-notes": "Flow Notes",
  "source-coverage": "Source Coverage",
  "cross-module-context": "Cross-Module Context",
};

/**
 * Assemble a markdown page from the agent's section buffer output.
 *
 * Prepends `# moduleName` as the title (title is not an agent-written section).
 * Concatenates sections in canonical order with `## Heading` prefixes.
 *
 * This is NOT the same as renderModuleDocumentationPacket() — that renderer
 * expects structured data. This function concatenates pre-formatted markdown.
 *
 * References: AC-4.3c (required sections), Flow A Step 5
 */
export function assembleAgentPage(
  moduleName: string,
  sections: Record<string, string>,
): string {
  const lines: string[] = [`# ${moduleName}`];

  for (const kind of PAGE_SECTION_KINDS) {
    const content = sections[kind];
    if (content === undefined) {
      continue;
    }

    const heading = SECTION_HEADINGS[kind] ?? kind;
    lines.push("", `## ${heading}`, "", content.trim());
  }

  return lines.join("\n");
}
