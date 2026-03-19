import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { RawAnalysisOutput } from "../../src/analysis/raw-output.js";
import {
  generateDocumentation,
  type ModulePlan,
  type OverviewGenerationResult,
  ok,
} from "../../src/index.js";
import {
  createMockSDK,
  type MockSDKConfig,
} from "../helpers/agent-sdk-mock.js";
import { REPOS } from "../helpers/fixtures.js";
import { TEST_INFERENCE_CONFIGURATION } from "../helpers/inference.js";
import {
  createGitFixtureRepo,
  type GitFixtureRepo,
} from "../helpers/story5-fixtures.js";

const mockCreateInferenceRuntime = vi.hoisted(() => vi.fn());
const mockCheckEnvironment = vi.hoisted(() => vi.fn());
const mockGetHeadCommitHash = vi.hoisted(() => vi.fn());
const mockGetChangedFilesBetweenCommits = vi.hoisted(() => vi.fn());
const mockGetPythonCommand = vi.hoisted(() => vi.fn());
const mockRunSubprocess = vi.hoisted(() => vi.fn());

vi.mock("../../src/inference/runtime.js", () => ({
  createInferenceRuntime: mockCreateInferenceRuntime,
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
    getChangedFilesBetweenCommits: mockGetChangedFilesBetweenCommits,
    getHeadCommitHash: mockGetHeadCommitHash,
  };
});

const fixtureRepos: GitFixtureRepo[] = [];
const PRIOR_COMMIT = "1111111111111111111111111111111111111111";
const CURRENT_COMMIT = "2222222222222222222222222222222222222222";

const trackRepo = (repo: GitFixtureRepo): GitFixtureRepo => {
  fixtureRepos.push(repo);
  return repo;
};

const buildMixedPythonRawAnalysis = (): RawAnalysisOutput => ({
  file_tree: {
    children: [],
    name: "repo",
    path: ".",
    type: "directory",
  },
  functions: [
    {
      component_type: "function",
      depends_on: [],
      end_line: 2,
      file_path: "analyzer.py",
      id: "analyzer.py:summarize",
      name: "summarize",
      relative_path: "analyzer.py",
      start_line: 1,
    },
  ],
  relationships: [],
  summary: {
    files: [
      {
        language: "python",
        lines_of_code: 2,
        path: "analyzer.py",
        supported: true,
      },
    ],
    files_analyzed: 1,
    languages_found: ["python"],
    total_files: 1,
    unsupported_files: [],
  },
});

const buildOverview = (): OverviewGenerationResult => ({
  content: ["# Repository Overview", "", "- [repo](./repo.md)"].join("\n"),
  mermaidDiagram: "graph TD\n  repo",
});

const setupMixedRepoMocks = (
  commitHash: string,
  sdkConfig: MockSDKConfig = {},
): void => {
  mockCreateInferenceRuntime.mockReturnValue(
    createMockSDK({
      moduleGeneration: [
        {
          output: {
            crossLinks: [],
            pageContent: [
              "# repo",
              "",
              "## Components",
              "",
              "- analyzer.py",
              "- src/index.ts",
            ].join("\n"),
            title: "repo",
          },
          usage: { inputTokens: 500, outputTokens: 250 },
        },
      ],
      overview: {
        output: buildOverview(),
        usage: { inputTokens: 300, outputTokens: 120 },
      },
      qualityReview: {
        output: [],
        usage: { inputTokens: 120, outputTokens: 40 },
      },
      ...sdkConfig,
    }),
  );
  mockCheckEnvironment.mockResolvedValue(
    ok({
      detectedLanguages: ["python", "typescript"],
      findings: [],
      passed: true,
    }),
  );
  mockGetHeadCommitHash.mockResolvedValue(commitHash);
  mockGetPythonCommand.mockResolvedValue("python3");
  mockRunSubprocess.mockImplementation(async (_command, args) => {
    expect(args).toContain("--file");
    expect(args).toContain("analyzer.py");

    return {
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify(buildMixedPythonRawAnalysis()),
    };
  });
};

afterEach(() => {
  vi.restoreAllMocks();
  mockCreateInferenceRuntime.mockReset();
  mockCheckEnvironment.mockReset();
  mockGetHeadCommitHash.mockReset();
  mockGetChangedFilesBetweenCommits.mockReset();
  mockGetPythonCommand.mockReset();
  mockRunSubprocess.mockReset();

  for (const repo of fixtureRepos.splice(0, fixtureRepos.length)) {
    repo.cleanup();
  }
});

describe("integration mixed analysis harness", () => {
  it("full generation succeeds for a mixed TypeScript and Python repo", async () => {
    const repo = trackRepo(createGitFixtureRepo(REPOS.multiLang));
    setupMixedRepoMocks(PRIOR_COMMIT);

    const result = await generateDocumentation({
      inference: TEST_INFERENCE_CONFIGURATION,
      mode: "full",
      repoPath: repo.repoPath,
    });

    expect(result.status).not.toBe("failure");

    if (result.status === "failure") {
      return;
    }

    expect(result.modulePlan).toEqual({
      modules: [
        {
          components: ["analyzer.py", "src/index.ts"],
          description:
            "Single-module plan for a compact repository without distinct source directories",
          name: "repo",
        },
      ],
      unmappedComponents: [],
    } satisfies ModulePlan);
    expect(result.generatedFiles).toEqual([
      ".doc-meta.json",
      ".module-plan.json",
      "module-tree.json",
      "overview.md",
      "repo.md",
    ]);
  });

  it("update succeeds for a mixed repo after a Python file change", async () => {
    const repo = trackRepo(createGitFixtureRepo(REPOS.multiLang));
    setupMixedRepoMocks(PRIOR_COMMIT);

    const firstResult = await generateDocumentation({
      inference: TEST_INFERENCE_CONFIGURATION,
      mode: "full",
      repoPath: repo.repoPath,
    });

    expect(firstResult.status).not.toBe("failure");

    await writeFile(
      path.join(repo.repoPath, "analyzer.py"),
      [
        "def summarize(items: list[str]) -> str:",
        "    return ' | '.join(items)",
      ].join("\n"),
      "utf8",
    );

    setupMixedRepoMocks(CURRENT_COMMIT);
    mockGetChangedFilesBetweenCommits.mockResolvedValue([
      { changeType: "modified", path: "analyzer.py" },
    ]);

    const result = await generateDocumentation({
      inference: TEST_INFERENCE_CONFIGURATION,
      mode: "update",
      repoPath: repo.repoPath,
    });

    expect(result.status).not.toBe("failure");

    if (result.status === "failure") {
      return;
    }

    expect(result.updatedModules).toEqual(["repo"]);
    expect(result.overviewRegenerated).toBe(false);

    const modulePlan = JSON.parse(
      await readFile(
        path.join(repo.repoPath, "docs/wiki/.module-plan.json"),
        "utf8",
      ),
    ) as ModulePlan;

    expect(modulePlan).toEqual({
      modules: [
        {
          components: ["analyzer.py", "src/index.ts"],
          description:
            "Single-module plan for a compact repository without distinct source directories",
          name: "repo",
        },
      ],
      unmappedComponents: [],
    });
  });
});
