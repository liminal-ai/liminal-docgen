import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import { publishDocumentation } from "../../src/index.js";
import { runGit } from "../helpers/git.js";
import {
  gitShowFromRemote,
  removeDocsPage,
  seedCommittedDocsOutput,
} from "../helpers/live-fixtures.js";
import { createPublishTestEnv } from "../helpers/publish-fixtures.js";

const environments: Array<ReturnType<typeof createPublishTestEnv>> = [];

const trackEnvironment = (
  env: ReturnType<typeof createPublishTestEnv>,
): ReturnType<typeof createPublishTestEnv> => {
  environments.push(env);
  return env;
};

afterEach(() => {
  for (const env of environments.splice(0, environments.length)) {
    env.cleanup();
  }
});

describe("live publish flow", () => {
  it("Publish propagates deleted docs files and preserves caller branch", async () => {
    const env = trackEnvironment(createPublishTestEnv());
    const branchName = "docs/live-delete-sync";

    seedCommittedDocsOutput(env.repoPath);
    removeDocsPage(env.repoPath, "docs/wiki/auth.md");

    const startingBranch = runGit(env.repoPath, ["branch", "--show-current"]);
    expect(startingBranch).toBe("main");

    const result = await publishDocumentation({
      branchName,
      createPullRequest: false,
      repoPath: env.repoPath,
    });

    expect(result.ok).toBe(true);

    if (!result.ok) {
      throw new Error(
        `Expected publish to succeed: ${result.error.code} ${result.error.message}`,
      );
    }

    expect(result.value.branchName).toBe(branchName);
    expect(runGit(env.repoPath, ["branch", "--show-current"])).toBe("main");

    expect(() =>
      gitShowFromRemote(env.remotePath, `${branchName}:docs/wiki/auth.md`),
    ).toThrow();

    const overviewContents = gitShowFromRemote(
      env.remotePath,
      `${branchName}:docs/wiki/overview.md`,
    );

    expect(overviewContents.length).toBeGreaterThan(0);
    expect(
      execFileSync(
        "git",
        ["--git-dir", env.remotePath, "rev-parse", `refs/heads/${branchName}`],
        {
          encoding: "utf8",
        },
      ).trim(),
    ).toBe(result.value.commitHash);
  }, 120_000);
});
