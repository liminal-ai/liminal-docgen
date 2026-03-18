import { err, ok } from "../types/common.js";
import type { EngineResult } from "../types/index.js";
import { createClaudeCliProvider } from "./providers/claude-cli.js";
import {
  createClaudeSdkProvider,
  isClaudeAgentSdkAvailable,
} from "./providers/claude-sdk.js";
import { createOpenRouterHttpProvider } from "./providers/openrouter-http.js";
import { getProviderDefinition } from "./registry.js";
import type {
  InferenceProvider,
  ResolvedInferenceConfiguration,
} from "./types.js";

export const createInferenceProvider = (
  config: ResolvedInferenceConfiguration,
  options: { workingDirectory: string },
): EngineResult<InferenceProvider> => {
  switch (config.provider) {
    case "claude-cli":
      return ok(createClaudeCliProvider(config, options));
    case "claude-sdk": {
      if (!isClaudeAgentSdkAvailable()) {
        return err(
          "DEPENDENCY_MISSING",
          "Claude Agent SDK package is not available. Install @anthropic-ai/claude-agent-sdk to use the claude-sdk provider.",
          {
            dependency: "@anthropic-ai/claude-agent-sdk",
            provider: config.provider,
          },
        );
      }

      return ok(createClaudeSdkProvider(config, options));
    }
    case "openrouter-http":
      return ok(createOpenRouterHttpProvider(config));
  }
};

export const validateInferenceCompatibility = (
  config: ResolvedInferenceConfiguration,
): EngineResult<void> => {
  const definition = getProviderDefinition(config.provider);

  if (!definition.capabilities.authModes.includes(config.auth.mode)) {
    return err(
      "CONFIGURATION_ERROR",
      `Auth mode "${config.auth.mode}" is not supported by provider "${config.provider}"`,
      {
        authMode: config.auth.mode,
        provider: config.provider,
        supportedAuthModes: definition.capabilities.authModes,
      },
    );
  }

  if (config.auth.mode === "api-key" && !config.auth.apiKey) {
    return err(
      "CONFIGURATION_ERROR",
      `Auth mode "api-key" for provider "${config.provider}" requires an API key at runtime`,
      {
        provider: config.provider,
      },
    );
  }

  return ok(undefined);
};
