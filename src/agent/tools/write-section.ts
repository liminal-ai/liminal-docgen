import type { SectionBuffer } from "../section-buffer.js";
import {
  PAGE_SECTION_KINDS,
  type PageSectionKind,
  type WriteSectionInput,
  type WriteSectionOutput,
} from "../types.js";

/**
 * Execute a write_section tool call. Validates the section kind and
 * writes to the buffer. Last-write-wins.
 *
 * References: AC-4.2 (agent decides sections), AC-4.3 (valid output)
 */
export function executeWriteSection(
  input: WriteSectionInput,
  buffer: SectionBuffer,
): WriteSectionOutput | { error: string } {
  if (!isValidSectionKind(input.section)) {
    return {
      error: `Invalid section kind "${input.section}". Valid kinds: ${PAGE_SECTION_KINDS.join(", ")}`,
    };
  }

  buffer.set(input.section, input.content);
  return { written: true };
}

function isValidSectionKind(value: string): value is PageSectionKind {
  return (PAGE_SECTION_KINDS as readonly string[]).includes(value);
}
