import type { InferenceProvider } from "../inference/types.js";
import type { EngineResult } from "../types/common.js";
import type { DocumentationStrategy, StrategyInput } from "./types.js";

export interface StrategySelectionOptions {
  /** Directory where .doc-strategy.json is read from / written to */
  readonly outputDir: string;
  /** When true, load prior strategy for comparison (update mode) */
  readonly loadPrior: boolean;
}

/**
 * Runs the documentation strategy selection stage. Makes a one-shot
 * inference call with the assembled strategy input and returns a
 * validated DocumentationStrategy.
 *
 * On success, persists the strategy to .doc-strategy.json in the output directory.
 * On failure, returns an EngineResult error with code STRATEGY_ERROR.
 *
 * Supports: AC-2.1, AC-2.2, AC-2.4
 *
 * @param provider - The inference provider for the one-shot call
 * @param strategyInput - The deterministic input from assembleStrategyInput()
 * @param options - Output directory and update-mode flag
 * @returns The documentation strategy or an error
 */
export function selectStrategy(
  _provider: InferenceProvider,
  _strategyInput: StrategyInput,
  _options: StrategySelectionOptions,
): Promise<EngineResult<DocumentationStrategy>> {
  throw new Error("Not implemented: selectStrategy");
}

/**
 * Loads a previously persisted strategy from .doc-strategy.json.
 * Returns null if the file doesn't exist or can't be parsed.
 *
 * Supports: AC-2.2 (update mode)
 *
 * @param outputDir - Directory containing the prior .doc-strategy.json
 * @returns The prior strategy or null
 */
export function loadPriorStrategy(
  _outputDir: string,
): Promise<DocumentationStrategy | null> {
  throw new Error("Not implemented: loadPriorStrategy");
}
