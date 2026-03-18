import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runCli, runCliJson } from "../helpers/cli-runner.js";
import { DOCS_OUTPUT, REPOS } from "../helpers/fixtures.js";
import { runGit } from "../helpers/git.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

describe("CLI failure handling", () => {
  it("TC-6.1a: CLI error matches SDK error for nonexistent path", async () => {
    const repoPath = "/nonexistent-story-6-cli";
    const { envelope, exitCode } = await runCliJson([
      "generate",
      "--json",
      "--repo-path",
      repoPath,
      "--provider",
      "openrouter-http",
      "--auth-mode",
      "env",
      "--api-key-env",
      "OPENROUTER_API_KEY",
    ]);

    expect(exitCode).toBe(1);
    expect(envelope.success).toBe(false);
    expect(envelope.error).toMatchObject({
      code: "PATH_ERROR",
      details: {
        failedStage: "checking-environment",
      },
      message: `Path does not exist or is not a directory: ${repoPath}`,
    });
  });

  it("TC-6.1b: CLI exit code reflects SDK error", async () => {
    const result = await runCli([
      "check",
      "--repo-path",
      "./nonexistent-story-6-check",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("ENVIRONMENT_ERROR");
    expect(result.stderr).toContain("./nonexistent-story-6-check");
  });

  it("TC-6.2b: missing dependency error includes guidance (CLI)", async () => {
    const gitOnlyPathDir = createGitOnlyPathDir();

    try {
      const { envelope, exitCode } = await runCliJson(["check", "--json"], {
        env: {
          PATH: gitOnlyPathDir,
        },
      });

      expect(exitCode).toBe(1);
      expect(envelope.success).toBe(false);
      expect(envelope.error).toMatchObject({
        code: "DEPENDENCY_MISSING",
        message: expect.stringContaining("Install Python 3.11+"),
      });
    } finally {
      cleanupTempDir(path.dirname(gitOnlyPathDir));
    }
  });

  it("publish failure leaves output directory unchanged (CLI)", async () => {
    const fixture = createRepoWithDocs(DOCS_OUTPUT.valid);
    const outputPath = path.join(fixture.repoPath, "docs/wiki");
    const before = snapshotDirectory(outputPath);

    try {
      const { envelope, exitCode } = await runCliJson([
        "publish",
        "--json",
        "--repo-path",
        fixture.repoPath,
      ]);
      const after = snapshotDirectory(outputPath);

      expect(exitCode).toBe(1);
      expect(envelope.success).toBe(false);
      expect(envelope.error?.code).toBe("PUBLISH_ERROR");
      expect(before).toEqual(after);
    } finally {
      fixture.cleanup();
    }
  });

  it("multiple sequential CLI failures don't corrupt state", async () => {
    const missingPlanFixture = createRepoWithDocs(
      DOCS_OUTPUT.missingModulePlan,
    );

    try {
      const first = await runCliJson([
        "generate",
        "--json",
        "--repo-path",
        "/nonexistent-story-6-sequential",
        "--provider",
        "openrouter-http",
        "--auth-mode",
        "env",
        "--api-key-env",
        "OPENROUTER_API_KEY",
      ]);
      const second = await runCliJson(
        [
          "update",
          "--json",
          "--repo-path",
          missingPlanFixture.repoPath,
          "--provider",
          "openrouter-http",
          "--auth-mode",
          "env",
          "--api-key-env",
          "OPENROUTER_API_KEY",
        ],
        {
          env: {
            OPENROUTER_API_KEY: "test-openrouter-key",
          },
        },
      );

      expect(first.exitCode).toBe(1);
      expect(first.envelope.error).toMatchObject({
        code: "PATH_ERROR",
        details: {
          failedStage: "checking-environment",
        },
      });
      expect(second.exitCode).toBe(1);
      expect(second.envelope.error).toMatchObject({
        code: "METADATA_ERROR",
        details: {
          failedStage: "computing-changes",
        },
        message: expect.stringContaining("Run full generation"),
      });
    } finally {
      missingPlanFixture.cleanup();
    }
  });
});

const createRepoWithDocs = (docsSourcePath: string) => {
  const rootDir = createTempDir();
  const repoPath = path.join(rootDir, "repo");

  cpSync(REPOS.validTs, repoPath, { recursive: true });
  runGit(repoPath, ["init", "-q"]);
  runGit(repoPath, ["config", "user.email", "story6-cli@example.com"]);
  runGit(repoPath, ["config", "user.name", "Story 6 CLI"]);
  runGit(repoPath, ["add", "."]);
  runGit(repoPath, ["commit", "-qm", "initial fixture"]);

  const outputPath = path.join(repoPath, "docs/wiki");
  cpSync(docsSourcePath, outputPath, { recursive: true });

  const metadataPath = path.join(outputPath, ".doc-meta.json");

  if (statSync(metadataPath).isFile()) {
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
      commitHash: string;
      outputPath: string;
    };

    metadata.commitHash = runGit(repoPath, ["rev-parse", "HEAD"]);
    metadata.outputPath = "docs/wiki";
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
  }

  return {
    cleanup: () => cleanupTempDir(rootDir),
    repoPath,
  };
};

const snapshotDirectory = (directoryPath: string): Record<string, string> => {
  const snapshot: Record<string, string> = {};

  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const absolutePath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      const nestedSnapshot = snapshotDirectory(absolutePath);

      for (const [nestedPath, content] of Object.entries(nestedSnapshot)) {
        snapshot[path.join(entry.name, nestedPath)] = content;
      }

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    snapshot[entry.name] = readFileSync(absolutePath, "utf8");
  }

  return snapshot;
};

const createGitOnlyPathDir = (): string => {
  const rootDir = createTempDir();
  const binDir = path.join(rootDir, "bin");
  const gitPath = execFileSync("which", ["git"], {
    encoding: "utf8",
  }).trim();

  mkdirSync(binDir, { recursive: true });
  symlinkSync(gitPath, path.join(binDir, "git"));
  symlinkSync(process.execPath, path.join(binDir, "node"));

  return binDir;
};
