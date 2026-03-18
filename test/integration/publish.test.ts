import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";
import { detectBaseBranch } from "../../src/publish/base-branch-detector.js";
import type {
  GhAdapterForPublish,
  GitAdapterForPublish,
} from "../../src/publish/publish.js";
import { publishDocumentation } from "../../src/publish/publish.js";
import { err } from "../../src/types/common.js";
import { runGit } from "../helpers/git.js";
import {
  createMockGh,
  createMockGitForPublish,
  createPublishTestEnv,
} from "../helpers/publish-fixtures.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLISH_FIXTURE = path.resolve(
  __dirname,
  "../fixtures/publish/valid-output-for-publish",
);

const EXPECTED_DOC_FILES = [
  "docs/wiki/.doc-meta.json",
  "docs/wiki/.module-plan.json",
  "docs/wiki/auth.md",
  "docs/wiki/data-layer.md",
  "docs/wiki/module-tree.json",
  "docs/wiki/overview.md",
];

describe("publish flow", () => {
  it("TC-4.1a: publish without prior generation -> PUBLISH_ERROR, no generation triggered", async () => {
    const fixture = createPublishFixture({ copyOutput: false });
    const git = createMockGitForPublish();
    const gh = createMockGh();

    try {
      const result = await publishDocumentation(
        {
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, gh),
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "PUBLISH_ERROR",
          message: expect.stringContaining("No documentation to publish"),
        },
      });
      expect(git.getRemoteUrl).not.toHaveBeenCalled();
      expect(git.createWorktree).not.toHaveBeenCalled();
      expect(gh.createPullRequest).not.toHaveBeenCalled();
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.1b: publish after generation -> publish proceeds using mock adapters", async () => {
    const fixture = createPublishFixture();
    const git = createMockGitForPublish();
    const gh = createMockGh();

    try {
      const result = await publishDocumentation(
        {
          branchName: "docs/after-generation",
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, gh),
      );

      const value = expectPublishSuccess(result);
      expect(value.branchName).toBe("docs/after-generation");
      expect(value.commitHash).toBe("abc123def456");
      expect(value.pushedToRemote).toBe(true);
      expect(git.createWorktree).toHaveBeenCalledTimes(1);
      expect(git.pushBranch).toHaveBeenCalledWith(
        expect.any(String),
        "docs/after-generation",
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.2a: full publish with PR -> all fields populated, worktree lifecycle verified", async () => {
    const fixture = createPublishFixture();
    const git = createMockGitForPublish();
    const gh = createMockGh();

    try {
      const result = await publishDocumentation(
        {
          branchName: "docs/full-publish",
          createPullRequest: true,
          prBody: "Ready to merge",
          prTitle: "docs: full publish",
          repoPath: fixture.repoPath,
        },
        withAdapters(git, gh),
      );

      const value = expectPublishSuccess(result);
      const worktreePath = getWorktreePath(git);

      expect(value).toEqual({
        branchName: "docs/full-publish",
        commitHash: "abc123def456",
        filesCommitted: EXPECTED_DOC_FILES,
        pullRequestNumber: 42,
        pullRequestUrl: "https://github.com/org/repo/pull/42",
        pushedToRemote: true,
      });
      expect(git.createWorktree).toHaveBeenCalledWith(
        fixture.repoPath,
        expect.stringContaining("liminal-docgen-publish-"),
      );
      expect(git.createBranch).toHaveBeenCalledWith(
        worktreePath,
        "docs/full-publish",
        "main",
      );
      expect(git.stageAllChanges).toHaveBeenCalledWith(
        worktreePath,
        "docs/wiki",
      );
      expect(git.commit).toHaveBeenCalledWith(
        worktreePath,
        expect.stringContaining("docs/wiki"),
      );
      expect(git.pushBranch).toHaveBeenCalledWith(
        worktreePath,
        "docs/full-publish",
      );
      expect(git.removeWorktree).toHaveBeenCalledWith(
        fixture.repoPath,
        worktreePath,
      );
      expect(getCallOrder(git.createWorktree)).toBeLessThan(
        getCallOrder(git.createBranch),
      );
      expect(getCallOrder(git.createBranch)).toBeLessThan(
        getCallOrder(git.stageAllChanges),
      );
      expect(getCallOrder(git.stageAllChanges)).toBeLessThan(
        getCallOrder(git.commit),
      );
      expect(getCallOrder(git.commit)).toBeLessThan(
        getCallOrder(git.pushBranch),
      );
      expect(getCallOrder(git.pushBranch)).toBeLessThan(
        getCallOrder(git.removeWorktree),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.2b: publish without PR -> pullRequestUrl/Number null", async () => {
    const fixture = createPublishFixture();
    const git = createMockGitForPublish();
    const gh = createMockGh();

    try {
      const result = await publishDocumentation(
        {
          branchName: "docs/no-pr",
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, gh),
      );

      const value = expectPublishSuccess(result);
      expect(value.pullRequestUrl).toBeNull();
      expect(value.pullRequestNumber).toBeNull();
      expect(gh.isGhAvailable).not.toHaveBeenCalled();
      expect(gh.createPullRequest).not.toHaveBeenCalled();
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.2c: custom branch name used -> result.branchName matches", async () => {
    const fixture = createPublishFixture();
    const git = createMockGitForPublish();

    try {
      const result = await publishDocumentation(
        {
          branchName: "docs/custom-branch-name",
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, createMockGh()),
      );

      const value = expectPublishSuccess(result);
      expect(value.branchName).toBe("docs/custom-branch-name");
      expect(git.createBranch).toHaveBeenCalledWith(
        expect.any(String),
        "docs/custom-branch-name",
        "main",
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.2d: auto-generated branch name -> matches docs/update-<timestamp> pattern", async () => {
    const fixture = createPublishFixture();

    try {
      const result = await publishDocumentation(
        {
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(createMockGitForPublish(), createMockGh()),
      );

      const value = expectPublishSuccess(result);
      expect(value.branchName).toMatch(
        /^docs\/update-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/u,
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.2e: branch name collision -> PUBLISH_ERROR", async () => {
    const fixture = createPublishFixture();
    const git = createMockGitForPublish({
      branchExists: vi.fn().mockImplementation(async (_repoPath, branchRef) => {
        return branchRef === "docs/existing";
      }),
    });

    try {
      const result = await publishDocumentation(
        {
          branchName: "docs/existing",
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, createMockGh()),
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "PUBLISH_ERROR",
          message: expect.stringContaining("already exists"),
        },
      });
      expect(git.createWorktree).not.toHaveBeenCalled();
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.3a: no output directory -> PUBLISH_ERROR", async () => {
    const fixture = createPublishFixture({ copyOutput: false });
    const git = createMockGitForPublish();

    try {
      const result = await publishDocumentation(
        {
          createPullRequest: false,
          outputPath: fixture.outputPath,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, createMockGh()),
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "PUBLISH_ERROR",
          message: expect.stringContaining("does not exist"),
        },
      });
      expect(git.getRemoteUrl).not.toHaveBeenCalled();
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.3b: invalid metadata -> PUBLISH_ERROR", async () => {
    const fixture = createPublishFixture({ invalidMetadata: true });
    const git = createMockGitForPublish();

    try {
      const result = await publishDocumentation(
        {
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, createMockGh()),
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "PUBLISH_ERROR",
          message: "Documentation metadata is missing or invalid",
        },
      });
      expect(git.getRemoteUrl).not.toHaveBeenCalled();
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.3c: valid output proceeds -> no error", async () => {
    const fixture = createPublishFixture();

    try {
      const result = await publishDocumentation(
        {
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(createMockGitForPublish(), createMockGh()),
      );

      expect(result.ok).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.4a: all fields populated with PR -> verify every field", async () => {
    const fixture = createPublishFixture();
    const git = createMockGitForPublish({
      commit: vi.fn().mockResolvedValue({ ok: true, value: "feedface123456" }),
    });
    const gh = createMockGh({
      createPullRequest: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          number: 108,
          url: "https://github.com/org/repo/pull/108",
        },
      }),
    });

    try {
      const result = await publishDocumentation(
        {
          branchName: "docs/structured-result",
          createPullRequest: true,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, gh),
      );

      expectPublishSuccess(result);
      expect(result).toEqual({
        ok: true,
        value: {
          branchName: "docs/structured-result",
          commitHash: "feedface123456",
          filesCommitted: EXPECTED_DOC_FILES,
          pullRequestNumber: 108,
          pullRequestUrl: "https://github.com/org/repo/pull/108",
          pushedToRemote: true,
        },
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.4b: PR fields null without PR -> verify null fields", async () => {
    const fixture = createPublishFixture();

    try {
      const result = await publishDocumentation(
        {
          branchName: "docs/no-pr-structured",
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(createMockGitForPublish(), createMockGh()),
      );

      expect(result).toEqual({
        ok: true,
        value: {
          branchName: "docs/no-pr-structured",
          commitHash: "abc123def456",
          filesCommitted: EXPECTED_DOC_FILES,
          pullRequestNumber: null,
          pullRequestUrl: null,
          pushedToRemote: true,
        },
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.5a: caller's branch preserved -> worktree used, no checkout on main repo", async () => {
    const fixture = createPublishTestEnv();
    const dirtyFilePath = path.join(fixture.repoPath, "notes.txt");
    writeFileSync(dirtyFilePath, "keep me dirty\n", "utf8");

    try {
      const branchBefore = runGit(fixture.repoPath, [
        "branch",
        "--show-current",
      ]);
      const statusBefore = runGit(fixture.repoPath, ["status", "--porcelain"]);
      const result = await publishDocumentation({
        branchName: "docs/worktree-preserves-main",
        createPullRequest: false,
        repoPath: fixture.repoPath,
      });

      const value = expectPublishSuccess(result);
      expect(value.branchName).toBe("docs/worktree-preserves-main");
      expect(runGit(fixture.repoPath, ["branch", "--show-current"])).toBe(
        branchBefore,
      );
      expect(runGit(fixture.repoPath, ["status", "--porcelain"])).toBe(
        statusBefore,
      );
      expect(
        runGit(fixture.repoPath, [
          "branch",
          "--list",
          "docs/worktree-preserves-main",
        ]),
      ).toContain("docs/worktree-preserves-main");
      expect(runGit(fixture.repoPath, ["status", "--porcelain"])).toContain(
        "?? notes.txt",
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.5b: only doc files committed -> verify stageFiles called with doc files only", async () => {
    const fixture = createPublishTestEnv();
    writeFileSync(
      path.join(fixture.repoPath, "README.md"),
      "ignore me\n",
      "utf8",
    );

    try {
      const result = await publishDocumentation({
        branchName: "docs/real-doc-files-only",
        createPullRequest: false,
        repoPath: fixture.repoPath,
      });

      const value = expectPublishSuccess(result);
      expect(value.filesCommitted).toEqual(EXPECTED_DOC_FILES);
      const committedFiles = runGit(fixture.repoPath, [
        "show",
        "--name-only",
        "--pretty=format:",
        "docs/real-doc-files-only",
      ])
        .split("\n")
        .filter((entry: string) => entry.length > 0);

      expect(committedFiles).toEqual(EXPECTED_DOC_FILES);
      expect(runGit(fixture.repoPath, ["status", "--porcelain"])).toContain(
        "?? README.md",
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.6a: PR requested without gh CLI -> PUBLISH_ERROR", async () => {
    const fixture = createPublishFixture();
    const git = createMockGitForPublish();
    const gh = createMockGh({
      isGhAvailable: vi.fn().mockResolvedValue(false),
    });

    try {
      const result = await publishDocumentation(
        {
          branchName: "docs/no-gh-pr",
          createPullRequest: true,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, gh),
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "PUBLISH_ERROR",
          message: expect.stringContaining("GitHub CLI"),
        },
      });
      expect(git.pushBranch).toHaveBeenCalled();
      expect(gh.createPullRequest).not.toHaveBeenCalled();
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.6b: push-only without gh CLI -> publish completes", async () => {
    const fixture = createPublishFixture();
    const gh = createMockGh({
      isGhAvailable: vi.fn().mockResolvedValue(false),
    });

    try {
      const result = await publishDocumentation(
        {
          branchName: "docs/no-gh-needed",
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(createMockGitForPublish(), gh),
      );

      const value = expectPublishSuccess(result);
      expect(value.pullRequestUrl).toBeNull();
      expect(gh.isGhAvailable).not.toHaveBeenCalled();
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.7a: no remote configured -> PUBLISH_ERROR", async () => {
    const fixture = createPublishFixture();
    const git = createMockGitForPublish({
      getRemoteUrl: vi
        .fn()
        .mockResolvedValue(
          err("PUBLISH_ERROR", "Git remote 'origin' is not configured"),
        ),
    });

    try {
      const result = await publishDocumentation(
        {
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, createMockGh()),
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "PUBLISH_ERROR",
          message: "Git remote 'origin' is not configured",
        },
      });
      expect(git.createWorktree).not.toHaveBeenCalled();
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-4.7b: push rejected -> PUBLISH_ERROR with rejection reason", async () => {
    const fixture = createPublishFixture();
    const git = createMockGitForPublish({
      pushBranch: vi.fn().mockResolvedValue(
        err("PUBLISH_ERROR", "Push rejected by remote", {
          reason: "non-fast-forward",
        }),
      ),
    });

    try {
      const result = await publishDocumentation(
        {
          branchName: "docs/push-rejected",
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, createMockGh()),
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "PUBLISH_ERROR",
          details: {
            reason: "non-fast-forward",
          },
          message: "Push rejected by remote",
        },
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("non-TC: worktree cleanup on push failure", async () => {
    const fixture = createPublishFixture();
    const git = createMockGitForPublish({
      pushBranch: vi
        .fn()
        .mockResolvedValue(err("PUBLISH_ERROR", "Push rejected by remote")),
    });

    try {
      const result = await publishDocumentation(
        {
          branchName: "docs/cleanup-on-failure",
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, createMockGh()),
      );

      expect(result.ok).toBe(false);
      expect(git.removeWorktree).toHaveBeenCalledWith(
        fixture.repoPath,
        getWorktreePath(git),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("non-TC: auto-generated branch name includes timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-16T15:04:05.678Z"));

    const fixture = createPublishFixture();

    try {
      const result = await publishDocumentation(
        {
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(createMockGitForPublish(), createMockGh()),
      );

      const value = expectPublishSuccess(result);
      expect(value.branchName).toBe("docs/update-2026-03-16T15-04-05-678Z");
    } finally {
      vi.useRealTimers();
      fixture.cleanup();
    }
  });

  it("non-TC: auto-generated commit message includes output path", async () => {
    const fixture = createPublishFixture();
    const git = createMockGitForPublish();

    try {
      const result = await publishDocumentation(
        {
          branchName: "docs/default-commit-message",
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, createMockGh()),
      );

      expectPublishSuccess(result);
      expect(git.commit).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("docs/wiki"),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("non-TC: base branch fallback chain (symbolic-ref -> main -> master)", async () => {
    const defaultBranchGit = createMockGitForPublish({
      getDefaultBranch: vi.fn().mockResolvedValue({ ok: true, value: "trunk" }),
    });
    const mainFallbackGit = createMockGitForPublish({
      branchExists: vi.fn().mockImplementation(async (_repoPath, branchRef) => {
        return branchRef === "origin/main";
      }),
      getDefaultBranch: vi
        .fn()
        .mockResolvedValue(err("PUBLISH_ERROR", "origin/HEAD unavailable")),
    });
    const masterFallbackGit = createMockGitForPublish({
      branchExists: vi.fn().mockImplementation(async (_repoPath, branchRef) => {
        return branchRef === "origin/master";
      }),
      getDefaultBranch: vi
        .fn()
        .mockResolvedValue(err("PUBLISH_ERROR", "origin/HEAD unavailable")),
    });

    expect(
      await detectBaseBranch("/tmp/repo", toLookupAdapter(defaultBranchGit)),
    ).toEqual({
      ok: true,
      value: "trunk",
    });
    expect(
      await detectBaseBranch("/tmp/repo", toLookupAdapter(mainFallbackGit)),
    ).toEqual({
      ok: true,
      value: "main",
    });
    expect(
      await detectBaseBranch("/tmp/repo", toLookupAdapter(masterFallbackGit)),
    ).toEqual({ ok: true, value: "master" });
  });

  it("non-TC: PR body auto-generation includes commit hash and file count", async () => {
    const fixture = createPublishFixture();
    const git = createMockGitForPublish({
      commit: vi.fn().mockResolvedValue({ ok: true, value: "decafbadbeef" }),
    });
    const gh = createMockGh();

    try {
      const result = await publishDocumentation(
        {
          branchName: "docs/generated-pr-body",
          createPullRequest: true,
          repoPath: fixture.repoPath,
        },
        withAdapters(git, gh),
      );

      expectPublishSuccess(result);
      expect(gh.createPullRequest).toHaveBeenCalledWith({
        baseBranch: "main",
        body: expect.stringContaining("Commit: decafbadbeef"),
        headBranch: "docs/generated-pr-body",
        repoPath: fixture.repoPath,
        title: "docs: update documentation",
      });
      const pullRequestOptions = gh.createPullRequest.mock.calls[0]?.[0];

      if (!pullRequestOptions) {
        throw new Error("Expected createPullRequest to have been called");
      }

      expect(pullRequestOptions.body).toContain("Files changed: 6");
    } finally {
      fixture.cleanup();
    }
  });

  it("non-TC: missing module plan blocks publish", async () => {
    const fixture = createPublishFixture();
    rmSync(path.join(fixture.outputPath, ".module-plan.json"));

    try {
      const result = await publishDocumentation(
        {
          createPullRequest: false,
          repoPath: fixture.repoPath,
        },
        withAdapters(createMockGitForPublish(), createMockGh()),
      );

      expect(result).toMatchObject({
        ok: false,
        error: {
          code: "PUBLISH_ERROR",
          message: "Documentation module plan is missing",
        },
      });
    } finally {
      fixture.cleanup();
    }
  });
});

const withAdapters = (
  git: ReturnType<typeof createMockGitForPublish>,
  gh: ReturnType<typeof createMockGh>,
): {
  gh: GhAdapterForPublish;
  git: GitAdapterForPublish;
} => ({
  gh: gh as unknown as GhAdapterForPublish,
  git: git as unknown as GitAdapterForPublish,
});

const createPublishFixture = (options?: {
  copyOutput?: boolean;
  invalidMetadata?: boolean;
}): {
  repoPath: string;
  outputPath: string;
  cleanup: () => void;
} => {
  const rootDir = createTempDir();
  const repoPath = path.join(rootDir, "repo");
  const outputPath = path.join(repoPath, "docs/wiki");

  mkdirSync(repoPath, { recursive: true });

  if (options?.copyOutput !== false) {
    cpSync(PUBLISH_FIXTURE, outputPath, { recursive: true });
  }

  if (options?.invalidMetadata) {
    writeFileSync(path.join(outputPath, ".doc-meta.json"), "{invalid", "utf8");
  }

  return {
    cleanup: () => cleanupTempDir(rootDir),
    outputPath,
    repoPath,
  };
};

const expectPublishSuccess = (
  result: Awaited<ReturnType<typeof publishDocumentation>>,
) => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(
      `Expected publish to succeed: ${result.error.code} ${result.error.message}`,
    );
  }

  return result.value;
};

const getWorktreePath = (
  git: ReturnType<typeof createMockGitForPublish>,
): string => {
  const worktreePath = git.createWorktree.mock.calls[0]?.[1];

  if (!worktreePath) {
    throw new Error("Expected createWorktree to have been called");
  }

  return worktreePath;
};

const getCallOrder = (mockFn: {
  mock: { invocationCallOrder: number[] };
}): number => {
  const callOrder = mockFn.mock.invocationCallOrder[0];

  if (callOrder === undefined) {
    throw new Error("Expected mock to have been called");
  }

  return callOrder;
};

const toLookupAdapter = (
  git: ReturnType<typeof createMockGitForPublish>,
): Pick<GitAdapterForPublish, "branchExists" | "getDefaultBranch"> =>
  git as unknown as Pick<
    GitAdapterForPublish,
    "branchExists" | "getDefaultBranch"
  >;
