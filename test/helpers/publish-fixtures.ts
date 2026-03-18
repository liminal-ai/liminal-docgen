import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MockGitForPublish {
  createWorktree: ReturnType<typeof vi.fn>;
  removeWorktree: ReturnType<typeof vi.fn>;
  createBranch: ReturnType<typeof vi.fn>;
  stageFiles: ReturnType<typeof vi.fn>;
  stageAllChanges: ReturnType<typeof vi.fn>;
  commit: ReturnType<typeof vi.fn>;
  pushBranch: ReturnType<typeof vi.fn>;
  getRemoteUrl: ReturnType<typeof vi.fn>;
  branchExists: ReturnType<typeof vi.fn>;
  getDefaultBranch: ReturnType<typeof vi.fn>;
}

export function createMockGitForPublish(
  overrides?: Partial<MockGitForPublish>,
): MockGitForPublish {
  return {
    createWorktree: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    removeWorktree: vi.fn().mockResolvedValue(undefined),
    createBranch: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    stageFiles: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    stageAllChanges: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    commit: vi.fn().mockResolvedValue({ ok: true, value: "abc123def456" }),
    pushBranch: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    getRemoteUrl: vi.fn().mockResolvedValue({
      ok: true,
      value: "https://github.com/org/repo.git",
    }),
    branchExists: vi.fn().mockResolvedValue(false),
    getDefaultBranch: vi.fn().mockResolvedValue({ ok: true, value: "main" }),
    ...overrides,
  };
}

export interface MockGhAdapter {
  isGhAvailable: ReturnType<typeof vi.fn>;
  createPullRequest: ReturnType<typeof vi.fn>;
}

export function createMockGh(
  overrides?: Partial<MockGhAdapter>,
): MockGhAdapter {
  return {
    isGhAvailable: vi.fn().mockResolvedValue(true),
    createPullRequest: vi.fn().mockResolvedValue({
      ok: true,
      value: { url: "https://github.com/org/repo/pull/42", number: 42 },
    }),
    ...overrides,
  };
}

const runGit = (args: string[]): void => {
  execFileSync("git", args, { stdio: "ignore" });
};

/**
 * Creates a temporary git repo with a bare remote for publish testing.
 * Returns paths to both the working repo and the bare remote.
 * All operations are local and require no network access.
 */
export function createPublishTestEnv(): {
  repoPath: string;
  remotePath: string;
  cleanup: () => void;
} {
  const tmpDir = mkdtempSync(
    path.join(os.tmpdir(), "liminal-docgen-publish-test-"),
  );
  const remotePath = path.join(tmpDir, "remote.git");
  const repoPath = path.join(tmpDir, "repo");

  runGit(["init", "--bare", remotePath]);
  runGit(["init", "--initial-branch=main", repoPath]);
  runGit(["-C", repoPath, "config", "user.name", "Doc Engine Test"]);
  runGit(["-C", repoPath, "config", "user.email", "doc-engine@example.com"]);
  runGit(["-C", repoPath, "remote", "add", "origin", remotePath]);
  runGit(["-C", repoPath, "commit", "--allow-empty", "-m", "initial"]);
  runGit(["-C", repoPath, "push", "-u", "origin", "main"]);

  cpSync(
    path.resolve(__dirname, "../fixtures/publish/valid-output-for-publish"),
    path.join(repoPath, "docs/wiki"),
    { recursive: true },
  );

  return {
    repoPath,
    remotePath,
    cleanup: () => {
      rmSync(tmpDir, { force: true, recursive: true });
    },
  };
}
