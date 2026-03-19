import { access } from "node:fs/promises";
import path from "node:path";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import {
  type DocumentationRunResult,
  type DocumentationStatus,
  generateDocumentation,
  normalizeOptionalModelSelection,
  readMetadata,
  type ValidationResult,
} from "../../src/index.js";
import { runCli } from "../helpers/cli-runner.js";
import { buildTestInferenceConfiguration } from "../helpers/inference.js";
import {
  createLiveGenerationRepo,
  LIVE_SMOKE_FIXTURES,
  type LiveFixtureRepo,
  readJsonFile,
} from "../helpers/live-fixtures.js";

const repos: LiveFixtureRepo[] = [];
const timingRecords: LiveTimingRecord[] = [];

const CLAUDE_MODEL = normalizeOptionalModelSelection(
  process.env.DOC_ENGINE_CLAUDE_MODEL,
);
const OPENROUTER_MODEL = normalizeOptionalModelSelection(
  process.env.DOC_ENGINE_OPENROUTER_MODEL,
);

const trackRepo = (repo: LiveFixtureRepo): LiveFixtureRepo => {
  repos.push(repo);
  return repo;
};

afterEach(() => {
  for (const repo of repos.splice(0, repos.length)) {
    repo.cleanup();
  }
});

afterAll(() => {
  if (timingRecords.length === 0) {
    return;
  }

  const summary = timingRecords
    .map(
      (record) =>
        `${record.surface} provider=${record.provider} auth=${record.authMode} fixture=${record.fixtureName} duration=${record.durationSeconds.toFixed(3)}s cost=${formatCost(record.costUsd)}`,
    )
    .join("\n");

  console.info(`Live generation timing summary\n${summary}`);
});

describe("live provider generation", () => {
  it("claude-sdk provider succeeds with OAuth-backed local auth", async () => {
    await expectSuccessfulProviderSmokeMatrix(
      "claude-sdk",
      { mode: "oauth" },
      CLAUDE_MODEL,
    );
  }, 300_000);

  it("claude-sdk provider succeeds with API-key-backed auth", async () => {
    await expectSuccessfulProviderSmokeMatrix(
      "claude-sdk",
      { mode: "env" },
      CLAUDE_MODEL,
    );
  }, 300_000);

  it("claude-cli provider succeeds with OAuth-backed local auth", async () => {
    await expectSuccessfulProviderSmokeMatrix(
      "claude-cli",
      { mode: "oauth" },
      CLAUDE_MODEL,
    );
  }, 300_000);

  it("claude-cli provider succeeds with API-key-backed auth", async () => {
    await expectSuccessfulProviderSmokeMatrix(
      "claude-cli",
      { mode: "env" },
      CLAUDE_MODEL,
    );
  }, 300_000);

  it.skip("openrouter-http provider succeeds with API-key-backed auth", async () => {
    await expectSuccessfulProviderSmokeMatrix(
      "openrouter-http",
      { mode: "env" },
      OPENROUTER_MODEL,
    );
  }, 300_000);

  it("CLI generate with explicit claude-cli provider leaves validate/status consistent for smoke notes api", async () => {
    const repo = trackRepo(createLiveGenerationRepo("smoke-notes-api"));

    const generateRun = await runCli(
      [
        "generate",
        "--json",
        "--repo-path",
        repo.repoPath,
        "--provider",
        "claude-cli",
        "--auth-mode",
        "oauth",
        ...(CLAUDE_MODEL ? ["--model", CLAUDE_MODEL] : []),
      ],
      {
        timeoutMs: 300_000,
      },
    );

    expect(generateRun.exitCode).toBe(0);
    expect(generateRun.stderr).toBe("");

    const generateEnvelope = JSON.parse(generateRun.stdout) as {
      success: boolean;
      result?: DocumentationRunResult;
    };

    expect(generateEnvelope.success).toBe(true);
    expect(generateEnvelope.result?.generatedFiles).toContain("overview.md");
    expect(generateEnvelope.result?.validationResult?.status).not.toBe("fail");
    expect(generateEnvelope.result?.totalDurationMs).toBeGreaterThan(0);

    const validateRun = await runCli(
      [
        "validate",
        "--json",
        "--output-path",
        path.join(repo.repoPath, "docs/wiki"),
      ],
      {
        timeoutMs: 120_000,
      },
    );
    const statusRun = await runCli(
      ["status", "--json", "--repo-path", repo.repoPath],
      {
        timeoutMs: 120_000,
      },
    );

    expect(validateRun.exitCode).toBe(0);
    expect(statusRun.exitCode).toBe(0);
    expect(validateRun.stderr).toBe("");
    expect(statusRun.stderr).toBe("");

    const validateEnvelope = JSON.parse(validateRun.stdout) as {
      success: boolean;
      result?: ValidationResult;
    };
    const statusEnvelope = JSON.parse(statusRun.stdout) as {
      success: boolean;
      result?: DocumentationStatus;
    };

    expect(validateEnvelope.success).toBe(true);
    expect(validateEnvelope.result?.status).not.toBe("fail");
    expect(statusEnvelope.success).toBe(true);
    expect(statusEnvelope.result?.state).toBe("current");
    expect(statusEnvelope.result?.currentHeadCommitHash).toBe(
      statusEnvelope.result?.lastGeneratedCommitHash,
    );

    const metadata = readJsonFile<{ commitHash: string }>(
      path.join(repo.repoPath, "docs/wiki/.doc-meta.json"),
    );
    expect(metadata.commitHash).toBe(
      statusEnvelope.result?.lastGeneratedCommitHash,
    );

    recordTiming({
      authMode: "oauth",
      costUsd: generateEnvelope.result?.costUsd ?? null,
      durationSeconds: (generateEnvelope.result?.totalDurationMs ?? 0) / 1000,
      fixtureName: repo.fixtureName,
      provider: "claude-cli",
      surface: "cli",
    });
  }, 300_000);
});

const expectSuccessfulGeneration = async (
  repo: LiveFixtureRepo,
  inference: NonNullable<
    Parameters<typeof generateDocumentation>[0]["inference"]
  >,
  authMode: string,
): Promise<void> => {
  const result = await generateDocumentation({
    inference,
    mode: "full",
    qualityReview: {
      secondModelReview: false,
      selfReview: false,
    },
    repoPath: repo.repoPath,
  });

  expect(result.status).not.toBe("failure");

  if (result.status === "failure") {
    throw new Error(
      `Expected generation to succeed: ${result.error?.code} ${result.error?.message}`,
    );
  }

  expect(result.modulePlan!.modules.length).toBeGreaterThan(0);
  expect(result.generatedFiles).toContain(".doc-meta.json");
  expect(result.generatedFiles).toContain(".module-plan.json");
  expect(result.generatedFiles).toContain("module-tree.json");
  expect(result.generatedFiles).toContain("overview.md");
  expect(result.validationResult!.status).not.toBe("fail");

  const outputPath = path.join(repo.repoPath, "docs", "wiki");
  await access(path.join(outputPath, "overview.md"));
  await access(path.join(outputPath, "module-tree.json"));

  const metadataResult = await readMetadata(outputPath);

  expect(metadataResult.ok).toBe(true);

  if (!metadataResult.ok) {
    throw new Error(metadataResult.error.message);
  }

  expect(metadataResult.value.commitHash).toBe(result.commitHash);
  expect(result.totalDurationMs).toBeGreaterThan(0);

  const moduleTree = readJsonFile<Array<{ name?: string }>>(
    path.join(outputPath, "module-tree.json"),
  );
  expect(Array.isArray(moduleTree)).toBe(true);
  expect(moduleTree.length).toBeGreaterThan(0);

  recordTiming({
    authMode,
    costUsd: result.costUsd,
    durationSeconds: result.totalDurationMs / 1000,
    fixtureName: repo.fixtureName,
    provider: inference.provider,
    surface: "sdk",
  });
};

const expectSuccessfulProviderSmokeMatrix = async (
  provider: Parameters<typeof buildTestInferenceConfiguration>[0],
  auth: NonNullable<Parameters<typeof buildTestInferenceConfiguration>[1]>,
  model?: string,
): Promise<void> => {
  for (const fixtureName of LIVE_SMOKE_FIXTURES) {
    const repo = trackRepo(createLiveGenerationRepo(fixtureName));

    await expectSuccessfulGeneration(
      repo,
      buildTestInferenceConfiguration(provider, auth, model),
      auth.mode,
    );
  }
};

interface LiveTimingRecord {
  authMode: string;
  costUsd: number | null;
  durationSeconds: number;
  fixtureName: string;
  provider: string;
  surface: "cli" | "sdk";
}

const recordTiming = (record: LiveTimingRecord): void => {
  timingRecords.push(record);
  console.info(
    `Live generation timing surface=${record.surface} provider=${record.provider} auth=${record.authMode} fixture=${record.fixtureName} duration=${record.durationSeconds.toFixed(3)}s cost=${formatCost(record.costUsd)}`,
  );
};

const formatCost = (costUsd: number | null): string =>
  costUsd === null ? "n/a" : `$${costUsd.toFixed(6)}`;
