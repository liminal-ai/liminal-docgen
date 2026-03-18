export const EXIT_SUCCESS = 0;
export const EXIT_OPERATIONAL_FAILURE = 1;
export const EXIT_USAGE_ERROR = 2;
export const EXIT_SIGINT = 130;

export function mapToExitCode(
  result: { success: boolean },
  isUsageError: boolean,
): number {
  if (isUsageError) {
    return EXIT_USAGE_ERROR;
  }

  return result.success ? EXIT_SUCCESS : EXIT_OPERATIONAL_FAILURE;
}
