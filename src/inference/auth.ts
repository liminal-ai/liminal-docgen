import { getProviderDefinition } from "./registry.js";
import type {
  InferenceAuthConfiguration,
  InferenceConfiguration,
  ResolvedInferenceAuth,
  ResolvedInferenceConfiguration,
} from "./types.js";

export const resolveInferenceConfiguration = (
  value: InferenceConfiguration,
): ResolvedInferenceConfiguration => {
  const definition = getProviderDefinition(value.provider);
  const auth =
    value.auth ??
    (definition.defaultAuthMode === "oauth"
      ? { mode: "oauth" as const }
      : {
          apiKeyEnvVar: definition.defaultApiKeyEnvVar,
          mode: "env" as const,
        });

  return {
    auth: normalizeAuthConfiguration(auth, definition.defaultApiKeyEnvVar),
    model: value.model,
    provider: value.provider,
  };
};

export const resolveInferenceAuth = (
  auth: InferenceAuthConfiguration,
  defaultApiKeyEnvVar?: string,
): ResolvedInferenceAuth => {
  switch (auth.mode) {
    case "oauth":
      return { mode: "oauth" };
    case "env":
      return {
        apiKey: readApiKeyFromEnv(auth.apiKeyEnvVar ?? defaultApiKeyEnvVar),
        apiKeyEnvVar: auth.apiKeyEnvVar ?? defaultApiKeyEnvVar,
        mode: "env",
      };
    case "api-key":
      return {
        apiKey:
          auth.apiKey ??
          readApiKeyFromEnv(auth.apiKeyEnvVar ?? defaultApiKeyEnvVar),
        apiKeyEnvVar: auth.apiKeyEnvVar ?? defaultApiKeyEnvVar,
        mode: "api-key",
      };
  }
};

const normalizeAuthConfiguration = (
  auth: InferenceAuthConfiguration,
  defaultApiKeyEnvVar?: string,
): InferenceAuthConfiguration => {
  switch (auth.mode) {
    case "oauth":
      return auth;
    case "env":
      return {
        apiKeyEnvVar: auth.apiKeyEnvVar ?? defaultApiKeyEnvVar,
        mode: "env",
      };
    case "api-key":
      return {
        apiKey: auth.apiKey,
        apiKeyEnvVar: auth.apiKeyEnvVar ?? defaultApiKeyEnvVar,
        mode: "api-key",
      };
  }
};

const readApiKeyFromEnv = (envVar: string | undefined): string | undefined => {
  if (!envVar) {
    return undefined;
  }

  const value = process.env[envVar];
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
};
