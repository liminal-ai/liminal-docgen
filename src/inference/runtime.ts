import type { EngineError } from "../types/common.js";
import { createInferenceProvider } from "./factory.js";
import type {
  InferenceProvider,
  ResolvedInferenceConfiguration,
} from "./types.js";

export interface InferenceRuntime extends InferenceProvider {}

export class InferenceRuntimeInitializationError extends Error {
  readonly engineError: EngineError;

  constructor(engineError: EngineError) {
    super(engineError.message);
    this.engineError = engineError;
    this.name = "InferenceRuntimeInitializationError";
  }
}

export const createInferenceRuntime = (
  config: ResolvedInferenceConfiguration,
  options: { workingDirectory: string },
): InferenceRuntime => {
  const result = createInferenceProvider(config, options);

  if (!result.ok) {
    throw new InferenceRuntimeInitializationError(result.error);
  }

  return result.value;
};
