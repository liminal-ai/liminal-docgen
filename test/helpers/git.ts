import { execFileSync } from "node:child_process";

export const runGit = (repoPath: string, args: string[]): string =>
  execFileSync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
  }).trim();

export const getFixtureCommitHash = (repoPath: string): string =>
  runGit(repoPath, ["rev-parse", "HEAD"]);

export const getFixtureShortCommitHash = (repoPath: string): string =>
  runGit(repoPath, ["rev-parse", "--short", "HEAD"]);
