import type { EngineResult } from "../types/common.js";

export type InferenceProviderId =
  | "claude-sdk"
  | "claude-cli"
  | "openrouter-http";

export type InferenceAuthMode = "env" | "api-key" | "oauth";

export interface InferenceUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface InferenceRequest {
  systemPrompt: string;
  userMessage: string;
  outputSchema?: Record<string, unknown>;
  model?: string;
}

export interface InferenceResponse<T> {
  output: T;
  usage: InferenceUsage | null;
  costUsd: number | null;
}

export interface InferenceProvider {
  infer<T>(
    request: InferenceRequest,
  ): Promise<EngineResult<InferenceResponse<T>>>;
  getAccumulatedUsage(): InferenceUsage;
  computeCost(): number | null;
}

export interface InferenceProviderCapabilities {
  authModes: readonly InferenceAuthMode[];
  supportsModelSelection: boolean;
  supportsStructuredOutput: boolean;
  reportsUsage: boolean;
  reportsCost: boolean;
}

export type InferenceAuthConfiguration =
  | {
      mode: "oauth";
    }
  | {
      mode: "env";
      apiKeyEnvVar?: string;
    }
  | {
      mode: "api-key";
      apiKey?: string;
      apiKeyEnvVar?: string;
    };

export interface InferenceConfiguration {
  provider: InferenceProviderId;
  auth?: InferenceAuthConfiguration;
  model?: string;
}

export interface ResolvedInferenceConfiguration {
  provider: InferenceProviderId;
  auth: InferenceAuthConfiguration;
  model?: string;
}

export interface ResolvedInferenceAuth {
  mode: InferenceAuthMode;
  apiKey?: string;
  apiKeyEnvVar?: string;
}
