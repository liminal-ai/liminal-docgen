import type { ClassifiedComponentData } from "../classification/types.js";
import type { RepositoryAnalysis } from "../types/analysis.js";
import type { StrategyInput } from "./types.js";

/**
 * Assembles a deterministic strategy input from classified analysis output.
 * Same inputs always produce the same output — no randomness, no timestamps.
 *
 * Supports: AC-2.3
 *
 * @param analysis - The structural analysis output
 * @param classificationMap - Component classifications from classifyComponents()
 * @returns A StrategyInput suitable for the strategy inference call
 */
export function assembleStrategyInput(
  _analysis: RepositoryAnalysis,
  _classificationMap: Map<string, ClassifiedComponentData>,
): StrategyInput {
  throw new Error("Not implemented: assembleStrategyInput");
}
