import { afterEach, describe, expect, it } from "vitest";

import type {
  DocumentationStatus,
  EnvironmentCheckResult,
  ValidationResult,
} from "../../src/types/index.js";
import { runCliJson } from "../helpers/cli-runner.js";
import { DOCS_OUTPUT, REPOS } from "../helpers/fixtures.js";
import {
  createGitFixtureRepo,
  type GitFixtureRepo,
} from "../helpers/story5-fixtures.js";

const fixtureRepos: GitFixtureRepo[] = [];

const trackRepo = (repo: GitFixtureRepo): GitFixtureRepo => {
  fixtureRepos.push(repo);
  return repo;
};

afterEach(() => {
  for (const repo of fixtureRepos.splice(0, fixtureRepos.length)) {
    repo.cleanup();
  }
});

describe("CLI smoke coverage", () => {
  it("TC-5.1a: status against fixture repo", async () => {
    const repo = trackRepo(createGitFixtureRepo(REPOS.validTs));
    const { envelope, exitCode } = await runCliJson<DocumentationStatus>([
      "status",
      "--json",
      "--repo-path",
      repo.repoPath,
    ]);

    expect(exitCode).toBe(0);
    expect(envelope).toMatchObject({
      command: "status",
      result: {
        currentHeadCommitHash: null,
        lastGeneratedAt: null,
        lastGeneratedCommitHash: null,
        outputPath: "docs/wiki",
        state: "not_generated",
      },
      success: true,
    });
  });

  it("TC-5.1b: check against fixture repo", async () => {
    const repo = trackRepo(createGitFixtureRepo(REPOS.validTs));
    const { envelope, exitCode } = await runCliJson<EnvironmentCheckResult>(
      ["check", "--json", "--repo-path", repo.repoPath],
      { timeoutMs: 60_000 },
    );

    expect(exitCode).toBe(0);
    expect(envelope).toMatchObject({
      command: "check",
      result: {
        detectedLanguages: ["typescript"],
        findings: expect.any(Array),
        passed: true,
      },
      success: true,
    });
  });

  it("TC-5.1c: validate against fixture output", async () => {
    const { envelope, exitCode } = await runCliJson<ValidationResult>([
      "validate",
      "--json",
      "--output-path",
      DOCS_OUTPUT.valid,
    ]);

    expect(exitCode).toBe(0);
    expect(envelope).toMatchObject({
      command: "validate",
      result: {
        errorCount: 0,
        findings: [],
        status: "pass",
        warningCount: 0,
      },
      success: true,
    });
  });

  it("non-TC: status against empty fixture repo remains not_generated", async () => {
    const repo = trackRepo(createGitFixtureRepo(REPOS.empty));
    const { envelope, exitCode } = await runCliJson<DocumentationStatus>([
      "status",
      "--json",
      "--repo-path",
      repo.repoPath,
    ]);

    expect(exitCode).toBe(0);
    expect(envelope).toMatchObject({
      command: "status",
      result: {
        currentHeadCommitHash: null,
        lastGeneratedAt: null,
        lastGeneratedCommitHash: null,
        outputPath: "docs/wiki",
        state: "not_generated",
      },
      success: true,
    });
  });
});
