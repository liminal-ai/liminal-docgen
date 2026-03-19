/**
 * Discriminated union for SDK operation results.
 *
 * ok: true -> operation completed, value contains the result
 * ok: false -> operation failed to execute, error describes why
 *
 * Domain-level findings appear inside the success value, not as EngineError.
 */
export type EngineResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: EngineError };

export type EngineErrorCode =
  | "ENVIRONMENT_ERROR"
  | "DEPENDENCY_MISSING"
  | "ANALYSIS_ERROR"
  | "METADATA_ERROR"
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "ORCHESTRATION_ERROR"
  | "PATH_ERROR"
  | "PUBLISH_ERROR"
  | "TOOL_USE_UNSUPPORTED"
  | "CLASSIFICATION_ERROR"
  | "STRATEGY_ERROR"
  | "AGENT_ERROR";

export interface EngineError {
  code: EngineErrorCode;
  message: string;
  details?: unknown;
}

export const ok = <T>(value: T): EngineResult<T> => ({ ok: true, value });

export const err = <T>(
  code: EngineErrorCode,
  message: string,
  details?: unknown,
): EngineResult<T> => ({ ok: false, error: { code, message, details } });
