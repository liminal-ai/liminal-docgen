import { err } from "../types/common.js";
import type { EngineResult } from "../types/index.js";
import type { GitAdapterForPublish } from "./adapters.js";

export const detectBaseBranch = async (
  repoPath: string,
  gitAdapter: Pick<GitAdapterForPublish, "branchExists" | "getDefaultBranch">,
): Promise<EngineResult<string>> => {
  const defaultBranchResult = await gitAdapter.getDefaultBranch(repoPath);

  if (defaultBranchResult.ok) {
    return defaultBranchResult;
  }

  if (await gitAdapter.branchExists(repoPath, "origin/main")) {
    return { ok: true, value: "main" };
  }

  if (await gitAdapter.branchExists(repoPath, "origin/master")) {
    return { ok: true, value: "master" };
  }

  return err(
    "PUBLISH_ERROR",
    "Cannot detect base branch for publish; tried origin/HEAD, main, and master. Provide --base-branch explicitly.",
    {
      repoPath,
    },
  );
};
