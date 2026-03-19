import { err } from "../types/common.js";
import type { EngineResult } from "../types/index.js";
import type { InferenceResponse, InferenceUsage } from "./types.js";

export interface InferenceAccumulator {
  add(result: { usage: InferenceUsage | null; costUsd: number | null }): void;
  getAccumulatedUsage(): InferenceUsage;
  computeCost(): number | null;
}

export const createAccumulator = (): InferenceAccumulator => {
  let accumulatedCostUsd = 0;
  let hasMissingCost = false;
  const usage: InferenceUsage = {
    inputTokens: 0,
    outputTokens: 0,
  };

  return {
    add(result) {
      if (result.usage) {
        usage.inputTokens += result.usage.inputTokens;
        usage.outputTokens += result.usage.outputTokens;
      }

      if (result.costUsd === null) {
        hasMissingCost = true;
      } else {
        accumulatedCostUsd += result.costUsd;
      }
    },

    computeCost(): number | null {
      if (hasMissingCost) {
        return null;
      }

      return Number(accumulatedCostUsd.toFixed(6));
    },

    getAccumulatedUsage(): InferenceUsage {
      return { ...usage };
    },
  };
};

export const extractJsonCandidate = (value: string): unknown => {
  const trimmedValue = value.trim();
  const outerFencedBlock = extractOutermostFencedCodeBlock(trimmedValue);

  for (const candidate of [
    trimmedValue,
    ...(outerFencedBlock ? [outerFencedBlock] : []),
    ...extractFencedCodeBlocks(trimmedValue),
  ]) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep trying fallback candidates.
    }
  }

  return undefined;
};

export const extractFencedCodeBlocks = (value: string): string[] =>
  [...value.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)]
    .map((match) => match[1]?.trim())
    .filter((match): match is string => Boolean(match));

const extractOutermostFencedCodeBlock = (value: string): string | null => {
  if (!value.startsWith("```")) {
    return null;
  }

  const firstNewlineIndex = value.indexOf("\n");
  const lastFenceIndex = value.lastIndexOf("```");

  if (firstNewlineIndex === -1 || lastFenceIndex <= firstNewlineIndex) {
    return null;
  }

  return value.slice(firstNewlineIndex + 1, lastFenceIndex).trim();
};

export const okInference = <T>(
  result: InferenceResponse<T>,
): EngineResult<InferenceResponse<T>> => ({
  ok: true,
  value: result,
});

export const errInference = (
  message: string,
  details?: unknown,
): EngineResult<never> => err("ORCHESTRATION_ERROR", message, details);

export const errToolUseUnsupported = (
  providerId: string,
): EngineResult<never> =>
  err(
    "TOOL_USE_UNSUPPORTED",
    `Provider "${providerId}" does not support tool-use conversations. ` +
      `Use a provider with tool-use support (e.g., claude-sdk) for agentic generation, ` +
      `or the system will fall back to one-shot generation.`,
    { providerId },
  );
