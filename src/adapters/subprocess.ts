import { spawn } from "node:child_process";

export class SubprocessTimeoutError extends Error {
  constructor(command: string, args: string[], timeoutMs: number) {
    super(
      `Subprocess timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`,
    );
    this.name = "SubprocessTimeoutError";
  }
}

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const runSubprocess = async (
  command: string,
  args: string[],
  options?: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<SubprocessResult> => {
  const timeoutMs = options?.timeoutMs ?? 30_000;

  return await new Promise<SubprocessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) {
        return;
      }

      finished = true;
      child.kill("SIGTERM");
      reject(new SubprocessTimeoutError(command, args, timeoutMs));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.once("error", (error) => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.once("close", (exitCode) => {
      if (finished) {
        return;
      }

      finished = true;
      clearTimeout(timeout);
      resolve({
        exitCode: exitCode ?? 1,
        stderr,
        stdout,
      });
    });
  });
};
