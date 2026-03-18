import { EXIT_SIGINT } from "./exit-codes.js";

let cancelled = false;
let cancellationNoticeEnabled = true;
let sigintHandlerInstalled = false;

export function installCancellationHandler(): void {
  if (sigintHandlerInstalled) {
    return;
  }

  process.on("SIGINT", () => {
    if (cancelled) {
      return;
    }

    cancelled = true;

    if (cancellationNoticeEnabled) {
      process.stderr.write(
        "\n→ Cancellation requested. Finishing current operation...\n",
      );
    }
  });

  sigintHandlerInstalled = true;
}

export function resetCancellationState(): void {
  cancelled = false;
  cancellationNoticeEnabled = true;
}

export function setCancellationNoticeEnabled(enabled: boolean): void {
  cancellationNoticeEnabled = enabled;
}

export function isCancelled(): boolean {
  return cancelled;
}

export function finalizeCancellation(jsonMode: boolean): boolean {
  if (!cancelled) {
    return false;
  }

  if (!jsonMode) {
    process.stderr.write("→ Cancelled.\n");
  }

  process.exitCode = EXIT_SIGINT;
  return true;
}
