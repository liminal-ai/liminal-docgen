type SdkMcpToolDef =
  // biome-ignore lint/suspicious/noExplicitAny: SDK type requires `any` for generic tool schemas
  import("@anthropic-ai/claude-agent-sdk").SdkMcpToolDefinition<any>;

import type { EngineResult } from "../types/common.js";

export const INFERENCE_PROVIDER_IDS = [
  "claude-sdk",
  "claude-cli",
  "openrouter-http",
] as const;

export type InferenceProviderId = (typeof INFERENCE_PROVIDER_IDS)[number];

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

  supportsToolUse(): boolean;
  inferWithTools(request: ToolUseRequest): ToolUseHandle;
}

export interface ToolUseRequest {
  systemPrompt: string;
  userMessage: string;
  tools: SdkMcpToolDef[];
  maxTurns?: number;
  model?: string;
}

export interface ToolUseHandle {
  /** Promise that resolves when the conversation completes or is cancelled. */
  result: Promise<EngineResult<ToolUseConversationResult>>;
  /** Cancel the running conversation. Calls query.close() on the SDK. */
  cancel: () => void;
}

export interface ToolUseConversationResult {
  /** The model's final text after all tool use is complete. */
  finalText: string;
  /** Number of conversation turns (from SDK's num_turns). */
  turnCount: number;
  /** Total duration of the conversation in milliseconds. */
  durationMs: number;
  /** Aggregate usage across all turns. */
  usage: InferenceUsage | null;
  /** Aggregate cost across all turns. */
  costUsd: number | null;
}

export interface InferenceProviderCapabilities {
  authModes: readonly InferenceAuthMode[];
  supportsModelSelection: boolean;
  supportsStructuredOutput: boolean;
  reportsUsage: boolean;
  reportsCost: boolean;
  supportsToolUse: boolean;
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
