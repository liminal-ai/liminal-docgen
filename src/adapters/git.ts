import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import { err, ok } from "../types/common.js";
import { runSubprocess } from "./subprocess.js";

export type GitRepositoryStatus = "valid" | "invalid-path" | "invalid-repo";

export const getHeadCommitHash = async (repoPath: string): Promise<string> => {
  const result = await runSubprocess("git", ["rev-parse", "HEAD"], {
    cwd: repoPath,
    timeoutMs: 10_000,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || "Failed to resolve git commit hash");
  }

  return result.stdout.trim();
};

export const getChangedFilesBetweenCommits = async (
  repoPath: string,
  fromCommit: string,
  toCommit: string,
): Promise<import("../types/update.js").ChangedFile[]> => {
  const result = await runSubprocess(
    "git",
    ["diff", "--name-status", "--find-renames", fromCommit, toCommit],
    {
      cwd: repoPath,
      timeoutMs: 10_000,
    },
  );

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || "Failed to compute changed files");
  }

  return result.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parseChangedFileLine);
};

export const isGitRepository = async (repoPath: string): Promise<boolean> => {
  const repositoryStatus = await getGitRepositoryStatus(repoPath);
  return repositoryStatus === "valid";
};

export const getGitRepositoryStatus = async (
  repoPath: string,
): Promise<GitRepositoryStatus> => {
  try {
    const repoStats = await stat(repoPath);

    if (!repoStats.isDirectory()) {
      return "invalid-path";
    }

    const result = await runSubprocess(
      "git",
      ["rev-parse", "--show-toplevel"],
      {
        cwd: repoPath,
        timeoutMs: 10_000,
      },
    );

    if (result.exitCode !== 0) {
      return "invalid-repo";
    }

    const [gitRootPath, requestedRepoPath] = await Promise.all([
      realpath(path.resolve(result.stdout.trim())),
      realpath(path.resolve(repoPath)),
    ]);

    return gitRootPath === requestedRepoPath ? "valid" : "invalid-repo";
  } catch {
    return "invalid-path";
  }
};

export const isGitAvailable = async (): Promise<boolean> => {
  try {
    const result = await runSubprocess("git", ["--version"], {
      timeoutMs: 10_000,
    });

    return result.exitCode === 0;
  } catch {
    return false;
  }
};

export const createWorktree = async (
  repoPath: string,
  worktreePath: string,
): Promise<import("../types/index.js").EngineResult<void>> => {
  return runGitResult(
    ["-C", repoPath, "worktree", "add", worktreePath, "--detach"],
    "Failed to create temporary git worktree",
    {
      repoPath,
      worktreePath,
    },
  );
};

export const removeWorktree = async (
  repoPath: string,
  worktreePath: string,
): Promise<void> => {
  try {
    await runSubprocess(
      "git",
      ["-C", repoPath, "worktree", "remove", worktreePath, "--force"],
      {
        timeoutMs: 30_000,
      },
    );
  } catch {
    // Best-effort cleanup only.
  }
};

export const createBranch = async (
  workDir: string,
  branchName: string,
  baseRef?: string,
): Promise<import("../types/index.js").EngineResult<void>> => {
  const args = ["-C", workDir, "checkout", "-b", branchName];

  if (baseRef) {
    args.push(normalizeRemoteBranchRef(baseRef));
  }

  return runGitResult(args, "Failed to create publish branch", {
    baseRef,
    branchName,
    workDir,
  });
};

export const stageFiles = async (
  workDir: string,
  paths: string[],
): Promise<import("../types/index.js").EngineResult<void>> => {
  return runGitResult(
    ["-C", workDir, "add", ...paths],
    "Failed to stage documentation files",
    {
      paths,
      workDir,
    },
  );
};

export const stageAllChanges = async (
  workDir: string,
  directory: string,
): Promise<import("../types/index.js").EngineResult<void>> => {
  return runGitResult(
    ["-C", workDir, "add", "-A", "--", directory],
    "Failed to stage documentation changes",
    {
      directory,
      workDir,
    },
  );
};

export const commit = async (
  workDir: string,
  message: string,
): Promise<import("../types/index.js").EngineResult<string>> => {
  const commitResult = await runSubprocess(
    "git",
    ["-C", workDir, "commit", "-m", message],
    {
      timeoutMs: 30_000,
    },
  );

  if (commitResult.exitCode !== 0) {
    return err("PUBLISH_ERROR", "Failed to commit documentation changes", {
      message,
      stderr: commitResult.stderr.trim() || undefined,
      stdout: commitResult.stdout.trim() || undefined,
      workDir,
    });
  }

  const hashResult = await runSubprocess(
    "git",
    ["-C", workDir, "rev-parse", "HEAD"],
    {
      timeoutMs: 10_000,
    },
  );

  if (hashResult.exitCode !== 0) {
    return err("PUBLISH_ERROR", "Failed to resolve publish commit hash", {
      stderr: hashResult.stderr.trim() || undefined,
      stdout: hashResult.stdout.trim() || undefined,
      workDir,
    });
  }

  return ok(hashResult.stdout.trim());
};

export const pushBranch = async (
  workDir: string,
  branchName: string,
): Promise<import("../types/index.js").EngineResult<void>> => {
  const result = await runSubprocess(
    "git",
    ["-C", workDir, "push", "-u", "origin", branchName],
    {
      timeoutMs: 30_000,
    },
  );

  if (result.exitCode !== 0) {
    const rejectionReason =
      result.stderr.trim() || result.stdout.trim() || "unknown push failure";

    return err(
      "PUBLISH_ERROR",
      `Failed to push publish branch: ${rejectionReason}`,
      {
        branchName,
        stderr: result.stderr.trim() || undefined,
        stdout: result.stdout.trim() || undefined,
        workDir,
      },
    );
  }

  return ok(undefined);
};

export const getRemoteUrl = async (
  repoPath: string,
): Promise<import("../types/index.js").EngineResult<string>> => {
  const result = await runSubprocess(
    "git",
    ["-C", repoPath, "remote", "get-url", "origin"],
    {
      timeoutMs: 10_000,
    },
  );

  if (result.exitCode !== 0) {
    return err(
      "PUBLISH_ERROR",
      "Git remote 'origin' is not configured. Configure a git remote: git remote add origin <url>",
      {
        repoPath,
        stderr: result.stderr.trim() || undefined,
        stdout: result.stdout.trim() || undefined,
      },
    );
  }

  return ok(result.stdout.trim());
};

export const branchExists = async (
  repoPath: string,
  branchRef: string,
): Promise<boolean> => {
  for (const candidateRef of buildBranchCandidates(branchRef)) {
    const result = await runSubprocess(
      "git",
      ["-C", repoPath, "rev-parse", "--verify", candidateRef],
      {
        timeoutMs: 10_000,
      },
    );

    if (result.exitCode === 0) {
      return true;
    }
  }

  return false;
};

export const getDefaultBranch = async (
  repoPath: string,
): Promise<import("../types/index.js").EngineResult<string>> => {
  const result = await runSubprocess(
    "git",
    ["-C", repoPath, "symbolic-ref", "refs/remotes/origin/HEAD"],
    {
      timeoutMs: 10_000,
    },
  );

  if (result.exitCode !== 0) {
    return err("PUBLISH_ERROR", "Failed to detect the default remote branch", {
      repoPath,
      stderr: result.stderr.trim() || undefined,
      stdout: result.stdout.trim() || undefined,
    });
  }

  const ref = result.stdout.trim();
  const branchName = ref.replace(/^refs\/remotes\/origin\//u, "");

  if (!branchName || branchName === ref) {
    return err("PUBLISH_ERROR", "Failed to parse the default remote branch", {
      ref,
      repoPath,
    });
  }

  return ok(branchName);
};

const parseChangedFileLine = (
  line: string,
): import("../types/update.js").ChangedFile => {
  const parts = line.split("\t");
  const status = parts[0] ?? "";

  if (status.startsWith("R")) {
    const oldPath = parts[1];
    const newPath = parts[2];

    if (!oldPath || !newPath) {
      throw new Error(`Unable to parse renamed file entry: ${line}`);
    }

    return {
      changeType: "renamed",
      oldPath,
      path: newPath,
    };
  }

  const changedPath = parts[1];

  if (!changedPath) {
    throw new Error(`Unable to parse changed file entry: ${line}`);
  }

  switch (status) {
    case "A":
      return { changeType: "added", path: changedPath };
    case "D":
      return { changeType: "deleted", path: changedPath };
    case "M":
      return { changeType: "modified", path: changedPath };
    default:
      return { changeType: "modified", path: changedPath };
  }
};

const runGitResult = async (
  args: string[],
  message: string,
  details?: Record<string, unknown>,
): Promise<import("../types/index.js").EngineResult<void>> => {
  const result = await runSubprocess("git", args, {
    timeoutMs: 30_000,
  });

  if (result.exitCode !== 0) {
    return err("PUBLISH_ERROR", message, {
      ...details,
      stderr: result.stderr.trim() || undefined,
      stdout: result.stdout.trim() || undefined,
    });
  }

  return ok(undefined);
};

const normalizeRemoteBranchRef = (branchRef: string): string =>
  branchRef.startsWith("origin/") ? branchRef : `origin/${branchRef}`;

const buildBranchCandidates = (branchRef: string): string[] => {
  const candidates = new Set<string>([branchRef]);

  if (branchRef.startsWith("origin/")) {
    candidates.add(branchRef.slice("origin/".length));
  } else {
    candidates.add(`origin/${branchRef}`);
  }

  return [...candidates];
};
