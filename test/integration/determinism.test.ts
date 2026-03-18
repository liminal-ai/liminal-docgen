import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { generateDocumentation, type ModuleTree, ok } from "../../src/index.js";
import { TEST_INFERENCE_CONFIGURATION } from "../helpers/inference.js";
import {
  buildValidTsRawAnalysis,
  createGitFixtureRepo,
  createStory5MockSDK,
  type GitFixtureRepo,
  STORY5_EXPECTED_FILES,
} from "../helpers/story5-fixtures.js";

const mockCreateAgentSDKAdapter = vi.hoisted(() => vi.fn());
const mockCheckEnvironment = vi.hoisted(() => vi.fn());
const mockGetHeadCommitHash = vi.hoisted(() => vi.fn());
const mockGetPythonCommand = vi.hoisted(() => vi.fn());
const mockRunSubprocess = vi.hoisted(() => vi.fn());

vi.mock("../../src/inference/runtime.js", () => ({
  createInferenceRuntime: mockCreateAgentSDKAdapter,
}));

vi.mock("../../src/environment/check.js", () => ({
  checkEnvironment: mockCheckEnvironment,
}));

vi.mock("../../src/adapters/python.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/adapters/python.js")>();

  return {
    ...actual,
    getPythonCommand: mockGetPythonCommand,
  };
});

vi.mock("../../src/adapters/subprocess.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/adapters/subprocess.js")>();

  return {
    ...actual,
    runSubprocess: mockRunSubprocess,
  };
});

vi.mock("../../src/adapters/git.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/adapters/git.js")>();

  return {
    ...actual,
    getHeadCommitHash: mockGetHeadCommitHash,
  };
});

const FIXED_COMMIT_HASH = "0123456789abcdef0123456789abcdef01234567";
const fixtureRepos: GitFixtureRepo[] = [];

const trackRepo = (repo: GitFixtureRepo): GitFixtureRepo => {
  fixtureRepos.push(repo);
  return repo;
};

const setupMocks = (): void => {
  mockCreateAgentSDKAdapter.mockImplementation(() => createStory5MockSDK());
  mockCheckEnvironment.mockResolvedValue(
    ok({
      detectedLanguages: ["typescript"],
      findings: [],
      passed: true,
    }),
  );
  mockGetHeadCommitHash.mockResolvedValue(FIXED_COMMIT_HASH);
  mockGetPythonCommand.mockResolvedValue("python3");
  mockRunSubprocess.mockResolvedValue({
    exitCode: 0,
    stderr: "",
    stdout: JSON.stringify(buildValidTsRawAnalysis()),
  });
};

const runFixtureGeneration = async (repoPath: string): Promise<string> => {
  const result = await generateDocumentation({
    inference: TEST_INFERENCE_CONFIGURATION,
    mode: "full",
    repoPath,
  });

  expect(result.success).toBe(true);

  if (!result.success) {
    throw new Error(
      `Expected generation to succeed: ${result.error.code} ${result.error.message}`,
    );
  }

  return path.join(repoPath, "docs/wiki");
};

const flattenModuleTree = (
  entries: ModuleTree,
): Array<{ name: string; page: string }> =>
  entries.flatMap((entry) => [
    { name: entry.name, page: entry.page },
    ...flattenModuleTree(entry.children ?? []),
  ]);

afterEach(() => {
  vi.restoreAllMocks();
  mockCreateAgentSDKAdapter.mockReset();
  mockCheckEnvironment.mockReset();
  mockGetHeadCommitHash.mockReset();
  mockGetPythonCommand.mockReset();
  mockRunSubprocess.mockReset();

  for (const repo of fixtureRepos.splice(0, fixtureRepos.length)) {
    repo.cleanup();
  }
});

describe("integration determinism harness", () => {
  it("TC-5.4a: file list deterministic", async () => {
    const firstRepo = trackRepo(createGitFixtureRepo());
    const secondRepo = trackRepo(createGitFixtureRepo());
    setupMocks();

    const [firstOutputPath, secondOutputPath] = await Promise.all([
      runFixtureGeneration(firstRepo.repoPath),
      runFixtureGeneration(secondRepo.repoPath),
    ]);
    const firstFiles = (await readdir(firstOutputPath)).sort();
    const secondFiles = (await readdir(secondOutputPath)).sort();

    expect(firstFiles).toEqual(STORY5_EXPECTED_FILES);
    expect(secondFiles).toEqual(STORY5_EXPECTED_FILES);
    expect(secondFiles).toEqual(firstFiles);
  }, 60_000);

  it("TC-5.4b: module tree deterministic", async () => {
    const firstRepo = trackRepo(createGitFixtureRepo());
    const secondRepo = trackRepo(createGitFixtureRepo());
    setupMocks();

    const [firstOutputPath, secondOutputPath] = await Promise.all([
      runFixtureGeneration(firstRepo.repoPath),
      runFixtureGeneration(secondRepo.repoPath),
    ]);
    const firstTree = JSON.parse(
      await readFile(path.join(firstOutputPath, "module-tree.json"), "utf8"),
    ) as ModuleTree;
    const secondTree = JSON.parse(
      await readFile(path.join(secondOutputPath, "module-tree.json"), "utf8"),
    ) as ModuleTree;

    expect(flattenModuleTree(firstTree)).toEqual([
      { name: "repo", page: "repo.md" },
    ]);
    expect(flattenModuleTree(secondTree)).toEqual(flattenModuleTree(firstTree));
  });
});
