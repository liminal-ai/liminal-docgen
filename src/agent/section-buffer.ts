import {
  PAGE_SECTION_KINDS,
  type PageSectionKind,
  REQUIRED_SECTIONS,
} from "./types.js";

/**
 * Accumulates section content during an agent conversation.
 * Last-write-wins per section kind.
 *
 * The buffer is local to a single module's agent run.
 * After the conversation ends, the generation stage reads the buffer
 * via toSectionRecord() and passes it to the renderer.
 *
 * References: AC-4.2 (section accumulation), AC-4.3e (flow-notes constraint)
 */
export class SectionBuffer {
  private readonly sections: Map<PageSectionKind, string> = new Map();

  /** Write a section. Replaces any previous content for this kind. */
  set(kind: PageSectionKind, content: string): void {
    this.sections.set(kind, content);
  }

  /** Read a section's current content, if any. */
  get(kind: PageSectionKind): string | undefined {
    return this.sections.get(kind);
  }

  /** Check whether a section has been written. */
  has(kind: PageSectionKind): boolean {
    return this.sections.has(kind);
  }

  /** Number of sections written. */
  get size(): number {
    return this.sections.size;
  }

  /**
   * Check whether all required sections have been written.
   * Required: overview, source-coverage (per AC-4.3c).
   */
  hasRequiredSections(): boolean {
    return REQUIRED_SECTIONS.every((kind) => this.sections.has(kind));
  }

  /** Returns the names of required sections that have not been written. */
  getMissingRequired(): PageSectionKind[] {
    return REQUIRED_SECTIONS.filter((kind) => !this.sections.has(kind));
  }

  /**
   * Export sections as a plain record, in canonical order.
   * Sections not written by the agent are omitted.
   *
   * Applies the flow-notes constraint (AC-4.3e):
   * flow-notes are stripped if no sequence-diagram is present.
   */
  toSectionRecord(): Record<string, string> {
    const record: Record<string, string> = {};

    for (const kind of PAGE_SECTION_KINDS) {
      if (!this.sections.has(kind)) {
        continue;
      }

      // AC-4.3e: flow notes without a sequence diagram are stripped
      if (kind === "flow-notes" && !this.sections.has("sequence-diagram")) {
        continue;
      }

      const content = this.sections.get(kind);
      if (content !== undefined) {
        record[kind] = content;
      }
    }

    return record;
  }
}
