/**
 * Wraps any SDK result for CLI JSON output.
 * Used by all commands in --json mode.
 */
export interface CliResultEnvelope<T> {
  success: boolean;
  command: string;
  result?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Exit code constants.
 */
export type CliExitCode = 0 | 1 | 2 | 130;
