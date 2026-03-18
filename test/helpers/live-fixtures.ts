import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REPOS } from "./fixtures.js";
import { runGit } from "./git.js";
import { cleanupTempDir, createTempDir } from "./temp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface LiveFixtureRepo {
  fixtureName: LiveSmokeFixtureName;
  rootDir: string;
  repoPath: string;
  cleanup: () => void;
}

export type LiveSmokeFixtureName = "smoke-counter-cli" | "smoke-notes-api";

const LIVE_SMOKE_FIXTURE_SOURCES: Record<LiveSmokeFixtureName, string> = {
  "smoke-counter-cli": REPOS.smokeCounterCli,
  "smoke-notes-api": REPOS.smokeNotesApi,
};

export const LIVE_SMOKE_FIXTURES = Object.keys(
  LIVE_SMOKE_FIXTURE_SOURCES,
) as LiveSmokeFixtureName[];

export const createLiveGenerationRepo = (
  fixtureName: LiveSmokeFixtureName = "smoke-counter-cli",
): LiveFixtureRepo => {
  const rootDir = createTempDir();
  const repoPath = path.join(rootDir, "repo");

  cpSync(LIVE_SMOKE_FIXTURE_SOURCES[fixtureName], repoPath, {
    recursive: true,
  });

  initializeGitRepo(repoPath, "live-tests@example.com", "Live Tests");

  return {
    cleanup: () => cleanupTempDir(rootDir),
    fixtureName,
    repoPath,
    rootDir,
  };
};

export const seedCommittedDocsOutput = (repoPath: string): void => {
  const docsOutputPath = path.join(repoPath, "docs", "wiki");

  rmSync(docsOutputPath, { force: true, recursive: true });
  cpSync(PUBLISH_FIXTURE_OUTPUT, docsOutputPath, { recursive: true });
  runGit(repoPath, ["add", "."]);
  runGit(repoPath, ["commit", "-qm", "seed generated docs"]);
  runGit(repoPath, ["push", "origin", "main"]);
};

export const removeDocsPage = (
  repoPath: string,
  relativePagePath: string,
): string => {
  const absolutePath = path.join(repoPath, relativePagePath);
  rmSync(absolutePath, { force: true });
  return absolutePath;
};

export const readJsonFile = <T>(filePath: string): T =>
  JSON.parse(readFileSync(filePath, "utf8")) as T;

export const gitShowFromRemote = (
  remotePath: string,
  revisionAndPath: string,
): string =>
  execFileSync("git", ["--git-dir", remotePath, "show", revisionAndPath], {
    encoding: "utf8",
  }).trim();

const initializeGitRepo = (
  repoPath: string,
  email: string,
  name: string,
): void => {
  runGit(repoPath, ["init", "-q"]);
  runGit(repoPath, ["config", "user.email", email]);
  runGit(repoPath, ["config", "user.name", name]);
  runGit(repoPath, ["add", "."]);
  runGit(repoPath, ["commit", "-qm", "initial fixture"]);
};

const PUBLISH_FIXTURE_OUTPUT = path.resolve(
  __dirname,
  "../fixtures/publish/valid-output-for-publish",
);
