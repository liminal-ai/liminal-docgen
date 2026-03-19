import type {
  InferenceProviderCapabilities,
  InferenceProviderId,
} from "./types.js";

export interface InferenceProviderDefinition {
  id: InferenceProviderId;
  capabilities: InferenceProviderCapabilities;
  defaultAuthMode: "env" | "oauth";
  defaultApiKeyEnvVar?: string;
  defaultModel?: string;
}

export const INFERENCE_PROVIDER_REGISTRY: Record<
  InferenceProviderId,
  InferenceProviderDefinition
> = {
  "claude-cli": {
    capabilities: {
      authModes: ["env", "api-key", "oauth"],
      reportsCost: true,
      reportsUsage: true,
      supportsModelSelection: true,
      supportsStructuredOutput: true,
      supportsToolUse: false,
    },
    defaultApiKeyEnvVar: "ANTHROPIC_API_KEY",
    defaultAuthMode: "oauth",
    defaultModel: "sonnet[1m]",
    id: "claude-cli",
  },
  "claude-sdk": {
    capabilities: {
      authModes: ["env", "api-key", "oauth"],
      reportsCost: true,
      reportsUsage: true,
      supportsModelSelection: true,
      supportsStructuredOutput: true,
      supportsToolUse: true,
    },
    defaultApiKeyEnvVar: "ANTHROPIC_API_KEY",
    defaultAuthMode: "oauth",
    defaultModel: "sonnet[1m]",
    id: "claude-sdk",
  },
  "openrouter-http": {
    capabilities: {
      authModes: ["env", "api-key"],
      reportsCost: false,
      reportsUsage: true,
      supportsModelSelection: true,
      supportsStructuredOutput: true,
      supportsToolUse: false,
    },
    defaultApiKeyEnvVar: "OPENROUTER_API_KEY",
    defaultAuthMode: "env",
    id: "openrouter-http",
  },
};

export const getProviderDefinition = (
  providerId: InferenceProviderId,
): InferenceProviderDefinition => INFERENCE_PROVIDER_REGISTRY[providerId];
