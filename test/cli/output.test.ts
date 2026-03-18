import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  DocumentationStatus,
  ValidationResult,
} from "../../src/types/index.js";
import { runCli, runCliJson } from "../helpers/cli-runner.js";
import { DOCS_OUTPUT, REPOS } from "../helpers/fixtures.js";
import { runGit } from "../helpers/git.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

describe("CLI output and exit codes", () => {
  it("CLI binary starts without error", async () => {
    const result = await runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  it("TC-2.1a: successful JSON result", async () => {
    const fixture = createStatusRepo();

    try {
      const { envelope, exitCode } = await runCliJson<DocumentationStatus>([
        "status",
        "--json",
        "--repo-path",
        fixture.repoPath,
      ]);

      expect(exitCode).toBe(0);
      expect(envelope.success).toBe(true);
      expect(envelope.result).toMatchObject({
        currentHeadCommitHash: fixture.commitHash,
        lastGeneratedCommitHash: fixture.commitHash,
        state: "current",
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-2.1b: error JSON result", async () => {
    const result = await runCliJson([
      "generate",
      "--json",
      "--repo-path",
      "/nonexistent",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.envelope.success).toBe(false);
    expect(result.envelope.error).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
    });
  });

  it("TC-2.1c: JSON output is a single parseable object", async () => {
    const fixture = createStatusRepo();

    try {
      const result = await runCli([
        "status",
        "--json",
        "--repo-path",
        fixture.repoPath,
      ]);

      expect(() => JSON.parse(result.stdout)).not.toThrow();
      expect(result.stdout.trim().startsWith("{")).toBe(true);
      expect(result.stdout.trim().endsWith("}")).toBe(true);
      expect(result.stderr).toBe("");
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-2.2a: status displayed readably", async () => {
    const fixture = createStatusRepo();

    try {
      const result = await runCli(["status", "--repo-path", fixture.repoPath]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Status: current");
      expect(result.stdout).toContain(fixture.commitHash);
      expect(result.stdout.trim().startsWith("{")).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-2.2b: validation findings listed readably", async () => {
    const result = await runCli([
      "validate",
      "--output-path",
      DOCS_OUTPUT.brokenLinks,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("[ERROR] broken-link:");
  });

  it("TC-2.4a: exit code 0 on success", async () => {
    const fixture = createStatusRepo();

    try {
      const result = await runCli(["status", "--repo-path", fixture.repoPath]);

      expect(result.exitCode).toBe(0);
    } finally {
      fixture.cleanup();
    }
  }, 60_000);

  it("TC-2.4b: exit code 1 on operational failure", async () => {
    const result = await runCli(["generate", "--repo-path", "/nonexistent"]);

    expect(result.exitCode).toBe(1);
  });

  it("TC-2.4c: exit code 2 on usage error", async () => {
    const result = await runCli(["generate"]);

    expect(result.exitCode).toBe(2);
  });

  it("TC-2.4d: exit code 1 when validation finds errors", async () => {
    const result = await runCli([
      "validate",
      "--output-path",
      DOCS_OUTPUT.brokenLinks,
    ]);

    expect(result.exitCode).toBe(1);
  });

  it("non-TC: publish error rendered in human mode", async () => {
    const fixture = createStatusRepo();

    try {
      const result = await runCli([
        "publish",
        "--repo-path",
        fixture.repoPath,
        "--branch-name",
        "docs/test",
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("PUBLISH_ERROR");
      expect(result.stderr).toContain("origin");
    } finally {
      fixture.cleanup();
    }
  });

  it("non-TC: publish error in JSON mode", async () => {
    const fixture = createStatusRepo();

    try {
      const { envelope, exitCode } = await runCliJson([
        "publish",
        "--json",
        "--repo-path",
        fixture.repoPath,
        "--branch-name",
        "docs/test",
      ]);

      expect(exitCode).toBe(1);
      expect(envelope.success).toBe(false);
      expect(envelope.error).toMatchObject({
        code: "PUBLISH_ERROR",
        details: {
          repoPath: fixture.repoPath,
        },
        message: expect.stringContaining("origin"),
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("validation JSON preserves failure result shape", async () => {
    const { envelope, exitCode } = await runCliJson<ValidationResult>([
      "validate",
      "--json",
      "--output-path",
      DOCS_OUTPUT.brokenLinks,
    ]);

    expect(exitCode).toBe(1);
    expect(envelope.success).toBe(true);
    expect(envelope.result?.status).toBe("fail");
  });
});

const createStatusRepo = (): {
  repoPath: string;
  commitHash: string;
  cleanup: () => void;
} => {
  const rootDir = createTempDir();
  const repoPath = path.join(rootDir, "repo");

  cpSync(REPOS.validTs, repoPath, { recursive: true });
  runGit(repoPath, ["init", "-q"]);
  runGit(repoPath, ["config", "user.email", "cli-tests@example.com"]);
  runGit(repoPath, ["config", "user.name", "CLI Tests"]);
  runGit(repoPath, ["add", "."]);
  runGit(repoPath, ["commit", "-qm", "initial fixture"]);

  const commitHash = runGit(repoPath, ["rev-parse", "HEAD"]);
  const outputPath = path.join(repoPath, "docs/wiki");

  mkdirSync(path.dirname(outputPath), { recursive: true });
  cpSync(DOCS_OUTPUT.valid, outputPath, { recursive: true });

  const metadataPath = path.join(outputPath, ".doc-meta.json");
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
    commitHash: string;
    outputPath: string;
  };

  metadata.commitHash = commitHash;
  metadata.outputPath = "docs/wiki";

  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

  return {
    cleanup: () => cleanupTempDir(rootDir),
    commitHash,
    repoPath,
  };
};
