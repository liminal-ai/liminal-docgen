import { createInferenceProvider } from "../inference/factory.js";
import type {
  InferenceProvider,
  InferenceRequest,
  InferenceResponse,
  InferenceUsage,
  ResolvedInferenceConfiguration,
} from "../inference/types.js";
import type { EngineError, EngineResult } from "../types/common.js";

// Compatibility types for legacy internal tests during the provider-system
// migration. The runtime now uses the provider-neutral inference interface.
export interface AgentSDKAdapter extends InferenceProvider {
  query<T>(
    options: AgentQueryOptions,
  ): Promise<EngineResult<AgentQueryResult<T>>>;
}

export type AgentQueryOptions = InferenceRequest;
export type AgentQueryResult<T> = InferenceResponse<T>;
export type TokenUsage = InferenceUsage;

export class InferenceProviderInitializationError extends Error {
  readonly engineError: EngineError;

  constructor(engineError: EngineError) {
    super(engineError.message);
    this.engineError = engineError;
    this.name = "InferenceProviderInitializationError";
  }
}

export const createAgentSDKAdapter = (
  config: ResolvedInferenceConfiguration,
  options: { workingDirectory: string },
): AgentSDKAdapter => {
  const result = createInferenceProvider(config, options);

  if (!result.ok) {
    throw new InferenceProviderInitializationError(result.error);
  }

  return result.value as AgentSDKAdapter;
};
