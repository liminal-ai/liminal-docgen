import { err } from "../types/common.js";
import type { EngineResult } from "../types/index.js";
import type { GhAdapterForPublish } from "./adapters.js";

export const createPR = async (
  options: {
    repoPath: string;
    branchName: string;
    baseBranch: string;
    title?: string;
    body?: string;
    commitHash: string;
    filesCount: number;
  },
  ghAdapter: GhAdapterForPublish,
): Promise<EngineResult<{ url: string; number: number }>> => {
  if (!(await ghAdapter.isGhAvailable())) {
    return err(
      "PUBLISH_ERROR",
      "GitHub CLI (`gh`) is required to create a pull request. Install GitHub CLI (gh) or set createPullRequest: false to push without a PR.",
      {
        repoPath: options.repoPath,
      },
    );
  }

  const title = options.title ?? "docs: update documentation";
  const body =
    options.body ??
    [
      "Automated documentation publish.",
      "",
      `Commit: ${options.commitHash}`,
      `Files changed: ${options.filesCount}`,
    ].join("\n");

  return ghAdapter.createPullRequest({
    baseBranch: options.baseBranch,
    body,
    headBranch: options.branchName,
    repoPath: options.repoPath,
    title,
  });
};
