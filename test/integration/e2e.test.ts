import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeRepository,
  generateDocumentation,
  type ModulePlan,
  type ModuleTree,
  ok,
  type RepositoryAnalysis,
} from "../../src/index.js";
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

vi.mock("../../src/adapters/agent-sdk.js", () => ({
  createAgentSDKAdapter: mockCreateAgentSDKAdapter,
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

const fixtureRepos: GitFixtureRepo[] = [];

const trackRepo = (repo: GitFixtureRepo): GitFixtureRepo => {
  fixtureRepos.push(repo);
  return repo;
};

const expectAnalysis = (
  result: Awaited<ReturnType<typeof analyzeRepository>>,
): RepositoryAnalysis => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(`Expected analysis to succeed: ${result.error.message}`);
  }

  return result.value;
};

const expectSuccess = (
  result: Awaited<ReturnType<typeof generateDocumentation>>,
) => {
  expect(result.success).toBe(true);

  if (!result.success) {
    throw new Error(
      `Expected generation to succeed: ${result.error.code} ${result.error.message}`,
    );
  }

  return result;
};

const setupMocks = (commitHash: string): void => {
  mockCreateAgentSDKAdapter.mockImplementation(() => createStory5MockSDK());
  mockCheckEnvironment.mockResolvedValue(
    ok({
      detectedLanguages: ["typescript"],
      findings: [],
      passed: true,
    }),
  );
  mockGetHeadCommitHash.mockResolvedValue(commitHash);
  mockGetPythonCommand.mockResolvedValue("python3");
  mockRunSubprocess.mockResolvedValue({
    exitCode: 0,
    stderr: "",
    stdout: JSON.stringify(buildValidTsRawAnalysis()),
  });
};

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

describe("integration E2E harness", () => {
  it("TC-5.3a: fixture repo has known structure", async () => {
    const repo = trackRepo(createGitFixtureRepo());
    setupMocks(repo.commitHash);

    const analysis = expectAnalysis(
      await analyzeRepository({ repoPath: repo.repoPath }),
    );

    expect(Object.keys(analysis.components)).toEqual([
      "src/auth.ts",
      "src/index.ts",
      "src/session.ts",
    ]);
    expect(analysis.summary).toEqual({
      languagesFound: ["typescript"],
      languagesSkipped: [],
      totalComponents: 3,
      totalFilesAnalyzed: 3,
      totalRelationships: 3,
    });
    expect(analysis.relationships).toEqual([
      {
        source: "src/auth.ts",
        target: "src/session.ts",
        type: "import",
      },
      {
        source: "src/index.ts",
        target: "src/auth.ts",
        type: "import",
      },
      {
        source: "src/index.ts",
        target: "src/session.ts",
        type: "usage",
      },
    ]);
  });

  it("TC-5.3b: end-to-end generation produces expected output", async () => {
    const repo = trackRepo(createGitFixtureRepo());
    setupMocks(repo.commitHash);

    const result = expectSuccess(
      await generateDocumentation({
        inference: TEST_INFERENCE_CONFIGURATION,
        mode: "full",
        repoPath: repo.repoPath,
      }),
    );
    const outputPath = path.join(repo.repoPath, "docs/wiki");
    const modulePlan = JSON.parse(
      await readFile(path.join(outputPath, ".module-plan.json"), "utf8"),
    ) as ModulePlan;
    const moduleTree = JSON.parse(
      await readFile(path.join(outputPath, "module-tree.json"), "utf8"),
    ) as ModuleTree;

    expect(result.outputPath).toBe(outputPath);
    expect(result.generatedFiles).toEqual(STORY5_EXPECTED_FILES);
    expect(result.validationResult.status).toBe("pass");
    expect((await readdir(outputPath)).sort()).toEqual(STORY5_EXPECTED_FILES);
    expect(modulePlan).toEqual({
      modules: [
        {
          components: ["src/auth.ts", "src/index.ts", "src/session.ts"],
          description:
            "Single-module plan for a compact repository without distinct source directories",
          name: "repo",
        },
      ],
      unmappedComponents: [],
    });
    expect(moduleTree).toEqual([{ name: "repo", page: "repo.md" }]);
  });
});
