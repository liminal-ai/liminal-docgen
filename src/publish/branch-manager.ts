import { randomUUID } from "node:crypto";
import { copyFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { err, ok } from "../types/common.js";
import type { EngineResult } from "../types/index.js";
import type { GitAdapterForPublish } from "./adapters.js";

export interface BranchResult {
  commitHash: string;
  filesCommitted: string[];
}

export const createDocsBranch = async (
  options: {
    repoPath: string;
    outputPath: string;
    branchName: string;
    baseBranch: string;
    commitMessage: string;
    filesForCommit: string[];
  },
  gitAdapter: Pick<
    GitAdapterForPublish,
    | "commit"
    | "createBranch"
    | "createWorktree"
    | "pushBranch"
    | "removeWorktree"
    | "stageAllChanges"
  >,
): Promise<EngineResult<BranchResult>> => {
  const worktreePath = path.join(
    os.tmpdir(),
    `liminal-docgen-publish-${randomUUID()}`,
  );

  try {
    const worktreeResult = await gitAdapter.createWorktree(
      options.repoPath,
      worktreePath,
    );

    if (!worktreeResult.ok) {
      return worktreeResult;
    }

    const branchResult = await gitAdapter.createBranch(
      worktreePath,
      options.branchName,
      options.baseBranch,
    );

    if (!branchResult.ok) {
      return branchResult;
    }

    const relativeOutputPath = path.relative(
      options.repoPath,
      options.outputPath,
    );

    if (
      relativeOutputPath.startsWith("..") ||
      path.isAbsolute(relativeOutputPath)
    ) {
      return err(
        "PUBLISH_ERROR",
        "Documentation output path must live inside the repository to publish it.",
        {
          outputPath: options.outputPath,
          repoPath: options.repoPath,
        },
      );
    }

    try {
      await syncDocumentationDirectory(
        options.repoPath,
        worktreePath,
        relativeOutputPath,
        options.filesForCommit,
      );
    } catch (error) {
      return err(
        "PUBLISH_ERROR",
        "Failed to copy documentation into worktree",
        {
          filesForCommit: options.filesForCommit,
          outputPath: options.outputPath,
          reason: error instanceof Error ? error.message : String(error),
          worktreePath,
        },
      );
    }

    const stageResult = await gitAdapter.stageAllChanges(
      worktreePath,
      relativeOutputPath,
    );

    if (!stageResult.ok) {
      return stageResult;
    }

    const commitResult = await gitAdapter.commit(
      worktreePath,
      options.commitMessage,
    );

    if (!commitResult.ok) {
      return commitResult;
    }

    const pushResult = await gitAdapter.pushBranch(
      worktreePath,
      options.branchName,
    );

    if (!pushResult.ok) {
      return pushResult;
    }

    return ok({
      commitHash: commitResult.value,
      filesCommitted: options.filesForCommit,
    });
  } finally {
    await gitAdapter.removeWorktree(options.repoPath, worktreePath);
  }
};

const syncDocumentationDirectory = async (
  repoPath: string,
  worktreePath: string,
  relativeOutputPath: string,
  filesForCommit: string[],
): Promise<void> => {
  const worktreeOutputPath = path.join(worktreePath, relativeOutputPath);

  await rm(worktreeOutputPath, { force: true, recursive: true });
  await mkdir(worktreeOutputPath, { recursive: true });

  for (const relativeFile of filesForCommit) {
    const sourcePath = path.join(repoPath, relativeFile);
    const targetPath = path.join(worktreePath, relativeFile);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await copyFile(sourcePath, targetPath);
  }
};
