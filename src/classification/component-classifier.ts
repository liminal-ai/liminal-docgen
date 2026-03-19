import type { RepositoryAnalysis } from "../types/analysis.js";
import type { ClassifiedComponentData } from "./types.js";

/**
 * Classifies every component in the analysis output with a role and zone.
 * Deterministic: same input always produces same output.
 * Three-pass strategy: path conventions -> export patterns -> relationship shapes.
 *
 * Supports: AC-1.1, AC-1.2, AC-1.4
 *
 * @param analysis - The structural analysis output
 * @returns A map from file path to classification data, covering every component
 */
export function classifyComponents(
  _analysis: RepositoryAnalysis,
): Map<string, ClassifiedComponentData> {
  throw new Error("Not implemented: classifyComponents");
}
