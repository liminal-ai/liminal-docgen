import { err, ok } from "../types/common.js";
import type { EngineResult } from "../types/index.js";
import { runSubprocess } from "./subprocess.js";

export const isGhAvailable = async (): Promise<boolean> => {
  try {
    const result = await runSubprocess("gh", ["--version"], {
      timeoutMs: 10_000,
    });

    return result.exitCode === 0;
  } catch {
    return false;
  }
};

export const createPullRequest = async (options: {
  repoPath: string;
  baseBranch: string;
  headBranch: string;
  title: string;
  body: string;
}): Promise<EngineResult<{ url: string; number: number }>> => {
  const result = await runSubprocess(
    "gh",
    [
      "pr",
      "create",
      "--base",
      options.baseBranch,
      "--head",
      options.headBranch,
      "--title",
      options.title,
      "--body",
      options.body,
    ],
    {
      cwd: options.repoPath,
      timeoutMs: 30_000,
    },
  );

  if (result.exitCode !== 0) {
    return err("PUBLISH_ERROR", "Failed to create GitHub pull request", {
      ...options,
      stderr: result.stderr.trim() || undefined,
      stdout: result.stdout.trim() || undefined,
    });
  }

  const url = extractPullRequestUrl(result.stdout);
  const prNumber = extractPullRequestNumber(url);

  if (!url || prNumber === null) {
    return err(
      "PUBLISH_ERROR",
      "GitHub CLI did not return a pull request URL we could parse",
      {
        ...options,
        stdout: result.stdout.trim() || undefined,
      },
    );
  }

  return ok({ number: prNumber, url });
};

const extractPullRequestUrl = (stdout: string): string | null => {
  const match = stdout.match(/https?:\/\/\S+\/pull\/\d+\/?/u);
  return match?.[0] ?? null;
};

const extractPullRequestNumber = (url: string | null): number | null => {
  if (!url) {
    return null;
  }

  const match = url.match(/\/pull\/(\d+)\/?$/u);

  if (!match?.[1]) {
    return null;
  }

  const parsedNumber = Number.parseInt(match[1], 10);
  return Number.isNaN(parsedNumber) ? null : parsedNumber;
};
