import { cpSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RawAnalysisOutput } from "../../src/analysis/raw-output.js";
import type {
  ModuleGenerationResult,
  OverviewGenerationResult,
} from "../../src/types/index.js";
import { createMockSDK } from "./agent-sdk-mock.js";
import { REPOS } from "./fixtures.js";
import { runGit } from "./git.js";
import { cleanupTempDir, createTempDir } from "./temp.js";

const FIXTURE_BASE_URL = new URL("../fixtures/agent-sdk/", import.meta.url);

const loadJsonFixture = <T>(fileName: string): T =>
  JSON.parse(readFileSync(new URL(fileName, FIXTURE_BASE_URL), "utf8")) as T;

const CORE_PAGE = loadJsonFixture<ModuleGenerationResult>(
  "module-gen-core.json",
);
const API_PAGE = loadJsonFixture<ModuleGenerationResult>("module-gen-api.json");
const OVERVIEW_PAGE = loadJsonFixture<OverviewGenerationResult>(
  "overview-success.json",
);

export const STORY5_EXPECTED_FILES = [
  ".doc-meta.json",
  ".module-plan.json",
  "module-tree.json",
  "overview.md",
  "repo.md",
];

export interface GitFixtureRepo {
  rootDir: string;
  repoPath: string;
  commitHash: string;
  cleanup: () => void;
}

export const createGitFixtureRepo = (
  sourcePath: string = REPOS.validTs,
): GitFixtureRepo => {
  const rootDir = createTempDir();
  const repoPath = path.join(rootDir, "repo");

  cpSync(sourcePath, repoPath, { recursive: true });
  runGit(repoPath, ["init", "-q"]);
  runGit(repoPath, ["config", "user.email", "story5-tests@example.com"]);
  runGit(repoPath, ["config", "user.name", "Story 5 Tests"]);
  runGit(repoPath, ["add", "."]);
  runGit(repoPath, ["commit", "--allow-empty", "-qm", "initial fixture"]);

  return {
    cleanup: () => cleanupTempDir(rootDir),
    commitHash: runGit(repoPath, ["rev-parse", "HEAD"]),
    repoPath,
    rootDir,
  };
};

export const buildValidTsRawAnalysis = (): RawAnalysisOutput => ({
  file_tree: {
    children: [
      {
        children: [
          {
            language: "typescript",
            lines_of_code: 8,
            name: "auth.ts",
            path: "src/auth.ts",
            type: "file",
          },
          {
            language: "typescript",
            lines_of_code: 5,
            name: "index.ts",
            path: "src/index.ts",
            type: "file",
          },
          {
            language: "typescript",
            lines_of_code: 5,
            name: "session.ts",
            path: "src/session.ts",
            type: "file",
          },
        ],
        name: "src",
        path: "src",
        type: "directory",
      },
    ],
    name: "repo",
    path: ".",
    type: "directory",
  },
  functions: [
    {
      component_type: "class",
      depends_on: ["src/session.ts"],
      end_line: 8,
      file_path: "src/auth.ts",
      id: "src/auth.ts:AuthService",
      name: "AuthService",
      relative_path: "src/auth.ts",
      start_line: 3,
    },
    {
      component_type: "function",
      depends_on: ["src/auth.ts"],
      end_line: 5,
      file_path: "src/index.ts",
      id: "src/index.ts:bootstrapAuth",
      name: "bootstrapAuth",
      relative_path: "src/index.ts",
      start_line: 3,
    },
    {
      component_type: "constant",
      depends_on: [],
      end_line: 1,
      file_path: "src/session.ts",
      id: "src/session.ts:SESSION_TTL_MS",
      name: "SESSION_TTL_MS",
      relative_path: "src/session.ts",
      start_line: 1,
    },
    {
      component_type: "function",
      depends_on: [],
      end_line: 5,
      file_path: "src/session.ts",
      id: "src/session.ts:createSession",
      name: "createSession",
      relative_path: "src/session.ts",
      start_line: 3,
    },
  ],
  relationships: [
    {
      callee: "src/session.ts:createSession",
      caller: "src/index.ts:bootstrapAuth",
      is_resolved: true,
    },
  ],
  summary: {
    files: [
      {
        language: "typescript",
        lines_of_code: 8,
        path: "src/auth.ts",
        supported: true,
      },
      {
        language: "typescript",
        lines_of_code: 5,
        path: "src/index.ts",
        supported: true,
      },
      {
        language: "typescript",
        lines_of_code: 5,
        path: "src/session.ts",
        supported: true,
      },
    ],
    files_analyzed: 3,
    languages_found: ["typescript"],
    total_files: 3,
    unsupported_files: [],
  },
});

export const createStory5MockSDK = () =>
  createMockSDK({
    moduleGeneration: [
      { output: CORE_PAGE, usage: { inputTokens: 950, outputTokens: 420 } },
      { output: API_PAGE, usage: { inputTokens: 900, outputTokens: 380 } },
    ],
    overview: {
      output: OVERVIEW_PAGE,
      usage: { inputTokens: 650, outputTokens: 260 },
    },
    qualityReview: {
      output: [],
      usage: { inputTokens: 140, outputTokens: 60 },
    },
  });
