import type { RunStatus } from "../types/orchestration.js";

export const EXIT_SUCCESS = 0;
export const EXIT_OPERATIONAL_FAILURE = 1;
export const EXIT_USAGE_ERROR = 2;
export const EXIT_SIGINT = 130;

export function exitCodeForStatus(status: RunStatus): number {
  switch (status) {
    case "success":
      return EXIT_SUCCESS;
    case "partial-success":
      return EXIT_SUCCESS;
    case "failure":
      return EXIT_OPERATIONAL_FAILURE;
  }
}

export function mapToExitCode(
  result: { status: RunStatus },
  isUsageError: boolean,
): number {
  if (isUsageError) {
    return EXIT_USAGE_ERROR;
  }

  return exitCodeForStatus(result.status);
}
