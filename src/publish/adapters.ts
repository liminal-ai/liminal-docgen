import type { EngineResult } from "../types/index.js";

export interface GitAdapterForPublish {
  createWorktree: (
    repoPath: string,
    worktreePath: string,
  ) => Promise<EngineResult<void>>;
  removeWorktree: (repoPath: string, worktreePath: string) => Promise<void>;
  createBranch: (
    workDir: string,
    branchName: string,
    baseRef?: string,
  ) => Promise<EngineResult<void>>;
  stageFiles: (workDir: string, paths: string[]) => Promise<EngineResult<void>>;
  stageAllChanges: (
    workDir: string,
    directory: string,
  ) => Promise<EngineResult<void>>;
  commit: (workDir: string, message: string) => Promise<EngineResult<string>>;
  pushBranch: (
    workDir: string,
    branchName: string,
  ) => Promise<EngineResult<void>>;
  getRemoteUrl: (repoPath: string) => Promise<EngineResult<string>>;
  branchExists: (repoPath: string, branchRef: string) => Promise<boolean>;
  getDefaultBranch: (repoPath: string) => Promise<EngineResult<string>>;
}

export interface GhAdapterForPublish {
  isGhAvailable: () => Promise<boolean>;
  createPullRequest: (options: {
    repoPath: string;
    baseBranch: string;
    headBranch: string;
    title: string;
    body: string;
  }) => Promise<EngineResult<{ url: string; number: number }>>;
}
