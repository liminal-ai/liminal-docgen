import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REPOS } from "./fixtures.js";
import { runGit } from "./git.js";
import { cleanupTempDir, createTempDir } from "./temp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface LiveFixtureRepo {
  rootDir: string;
  repoPath: string;
  cleanup: () => void;
}

export const createLiveGenerationRepo = (): LiveFixtureRepo => {
  const rootDir = createTempDir();
  const repoPath = path.join(rootDir, "repo");

  cpSync(REPOS.validTs, repoPath, { recursive: true });

  for (const [relativePath, content] of Object.entries(
    EXTRA_TYPESCRIPT_FILES,
  )) {
    const absolutePath = path.join(repoPath, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, "utf8");
  }

  initializeGitRepo(repoPath, "live-tests@example.com", "Live Tests");

  return {
    cleanup: () => cleanupTempDir(rootDir),
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

const EXTRA_TYPESCRIPT_FILES: Record<string, string> = {
  "src/api/client.ts": [
    'import { handleRequest } from "./http.js";',
    "",
    "export function callApi(userId: string): string {",
    "  return handleRequest(userId);",
    "}",
    "",
  ].join("\n"),
  "src/api/http.ts": [
    'import { runEngine } from "../core/engine.js";',
    'import { formatResult } from "../utils/format.js";',
    "",
    "export function handleRequest(userId: string): string {",
    "  return formatResult(runEngine(userId));",
    "}",
    "",
  ].join("\n"),
  "src/core/config.ts": [
    'export const ENGINE_PREFIX = "engine";',
    "",
    "export function buildPrefix(userId: string): string {",
    `  return \`\${ENGINE_PREFIX}:\${userId}\`;`,
    "}",
    "",
  ].join("\n"),
  "src/core/engine.ts": [
    'import { buildPrefix } from "./config.js";',
    'import { logResult } from "../utils/logger.js";',
    "",
    "export function runEngine(userId: string): string {",
    "  const value = buildPrefix(userId);",
    "  logResult(value);",
    "  return value;",
    "}",
    "",
  ].join("\n"),
  "src/core/index.ts": [
    'export { buildPrefix, ENGINE_PREFIX } from "./config.js";',
    'export { runEngine } from "./engine.js";',
    "",
  ].join("\n"),
  "src/features/auth/login.ts": [
    'import { runEngine } from "../../core/engine.js";',
    "",
    "export function login(userId: string): string {",
    "  return runEngine(userId);",
    "}",
    "",
  ].join("\n"),
  "src/features/auth/logout.ts": [
    'import { buildPrefix } from "../../core/config.js";',
    "",
    "export function logout(userId: string): string {",
    "  return buildPrefix(userId);",
    "}",
    "",
  ].join("\n"),
  "src/utils/format.ts": [
    "export function formatResult(value: string): string {",
    "  return '[' + value + ']';",
    "}",
    "",
  ].join("\n"),
  "src/utils/logger.ts": [
    "export function logResult(_value: string): void {",
    "  // no-op logger for fixture generation",
    "}",
    "",
  ].join("\n"),
};
