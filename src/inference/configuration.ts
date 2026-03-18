import type {
  InferenceAuthConfiguration,
  InferenceAuthMode,
  InferenceConfiguration,
  InferenceProviderId,
} from "./types.js";

export interface InferenceCliOverrides {
  apiKeyEnv?: string;
  authMode?: Extract<InferenceAuthMode, "env" | "oauth">;
  model?: string;
  provider?: InferenceProviderId;
}

export const normalizeOptionalModelSelection = (
  value: string | undefined,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length === 0 || trimmedValue.startsWith("REPLACE_WITH_")) {
    return undefined;
  }

  return trimmedValue;
};

export const buildInferenceConfigurationFromCliOverrides = (
  value: InferenceCliOverrides,
): InferenceConfiguration | undefined => {
  if (
    value.provider === undefined &&
    value.authMode === undefined &&
    value.apiKeyEnv === undefined &&
    value.model === undefined
  ) {
    return undefined;
  }

  const auth = buildInferenceAuthFromCliOverrides(value);
  const model = normalizeOptionalModelSelection(value.model);

  return {
    ...(auth ? { auth } : {}),
    ...(model ? { model } : {}),
    provider: value.provider as InferenceProviderId,
  };
};

const buildInferenceAuthFromCliOverrides = (
  value: InferenceCliOverrides,
): InferenceAuthConfiguration | undefined => {
  if (value.authMode === "oauth") {
    return { mode: "oauth" };
  }

  if (value.authMode === "env" || value.apiKeyEnv) {
    return {
      apiKeyEnvVar: value.apiKeyEnv,
      mode: "env",
    };
  }

  return undefined;
};
