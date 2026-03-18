import type { InferenceConfiguration } from "../../src/inference/types.js";

export const TEST_INFERENCE_CONFIGURATION: InferenceConfiguration = {
  auth: { mode: "oauth" },
  provider: "claude-sdk",
};

export const buildTestInferenceConfiguration = (
  provider: InferenceConfiguration["provider"],
  auth: InferenceConfiguration["auth"],
  model?: string,
): InferenceConfiguration => ({
  ...(model ? { model } : {}),
  auth,
  provider,
});
