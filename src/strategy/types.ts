import type { CodeZone } from "../classification/types.js";

/**
 * High-level classification of the repository's purpose and structure.
 * Guides documentation conventions and page templates.
 *
 * Supports: AC-2.1
 */
export type RepoClassification =
  | "service-app"
  | "library"
  | "cli-tool"
  | "monolith"
  | "monorepo"
  | "mixed";

/**
 * Page shape controls the level of detail in a module's documentation page.
 *
 * Supports: AC-2.1
 */
export type PageShape = "full-structured" | "summary-only" | "overview-only";

/**
 * A boundary represents a natural subsystem in the repository that
 * should be documented as a cohesive unit. Boundaries guide module
 * clustering — they are suggestions, not hard constraints.
 *
 * Supports: AC-2.1
 */
export interface DocumentationBoundary {
  readonly name: string;
  readonly componentPatterns: string[];
  readonly recommendedPageShape: PageShape;
}

/**
 * Guidance for how a particular code zone should be treated in documentation.
 * Zones that are "excluded" should not generate their own module pages.
 * Zones that are "summarized" get summary-only treatment.
 *
 * Supports: AC-2.1
 */
export interface ZoneGuidance {
  readonly zone: CodeZone;
  readonly treatment: "document" | "summarize" | "exclude";
  readonly reason: string;
}

/**
 * The complete documentation strategy for a repository. Produced by a
 * one-shot inference call and persisted to .doc-strategy.json.
 *
 * Supports: AC-2.1, AC-2.2
 */
export interface DocumentationStrategy {
  readonly repoClassification: RepoClassification;
  readonly boundaries: DocumentationBoundary[];
  readonly zoneGuidance: ZoneGuidance[];
}

/**
 * The deterministic input assembled from classified analysis output.
 * Passed to the inference provider as the structured data for strategy selection.
 * Not persisted — exists only as a function argument.
 *
 * Supports: AC-2.3
 */
export interface StrategyInput {
  readonly componentCount: number;
  readonly languageDistribution: Record<string, number>;
  readonly directoryTreeSummary: string[];
  readonly relationshipDensity: number;
  readonly zoneDistribution: Record<string, number>;
  readonly roleDistribution: Record<string, number>;
}
