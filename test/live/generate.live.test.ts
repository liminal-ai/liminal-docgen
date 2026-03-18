import { access } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  type DocumentationRunResult,
  type DocumentationStatus,
  generateDocumentation,
  readMetadata,
  type ValidationResult,
} from "../../src/index.js";
import { isClaudeOauthAvailable } from "../../src/inference/check.js";
import { runCli } from "../helpers/cli-runner.js";
import { buildTestInferenceConfiguration } from "../helpers/inference.js";
import {
  createLiveGenerationRepo,
  type LiveFixtureRepo,
  readJsonFile,
} from "../helpers/live-fixtures.js";

const repos: LiveFixtureRepo[] = [];

const sanitizeEnv = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.startsWith("REPLACE_WITH_") ? undefined : trimmedValue;
};

const CLAUDE_MODEL = sanitizeEnv(process.env.DOC_ENGINE_CLAUDE_MODEL);
const OPENROUTER_MODEL = sanitizeEnv(process.env.DOC_ENGINE_OPENROUTER_MODEL);
const ANTHROPIC_API_KEY_AVAILABLE = Boolean(
  sanitizeEnv(process.env.ANTHROPIC_API_KEY),
);
const OPENROUTER_API_KEY_AVAILABLE = Boolean(
  sanitizeEnv(process.env.OPENROUTER_API_KEY) && OPENROUTER_MODEL?.trim(),
);
const CLAUDE_OAUTH_AVAILABLE = await isClaudeOauthAvailable();

const trackRepo = (repo: LiveFixtureRepo): LiveFixtureRepo => {
  repos.push(repo);
  return repo;
};

const itIfClaudeOauth = CLAUDE_OAUTH_AVAILABLE ? it : it.skip;
const itIfAnthropicApiKey = ANTHROPIC_API_KEY_AVAILABLE ? it : it.skip;
const itIfOpenRouterApiKey = OPENROUTER_API_KEY_AVAILABLE ? it : it.skip;

afterEach(() => {
  for (const repo of repos.splice(0, repos.length)) {
    repo.cleanup();
  }
});

describe("live provider generation", () => {
  itIfClaudeOauth(
    "claude-sdk provider succeeds with OAuth-backed local auth",
    async () => {
      const repo = trackRepo(createLiveGenerationRepo());

      await expectSuccessfulGeneration(
        repo.repoPath,
        buildTestInferenceConfiguration(
          "claude-sdk",
          { mode: "oauth" },
          CLAUDE_MODEL,
        ),
      );
    },
    300_000,
  );

  itIfAnthropicApiKey(
    "claude-sdk provider succeeds with API-key-backed auth",
    async () => {
      const repo = trackRepo(createLiveGenerationRepo());

      await expectSuccessfulGeneration(
        repo.repoPath,
        buildTestInferenceConfiguration(
          "claude-sdk",
          { mode: "env" },
          CLAUDE_MODEL,
        ),
      );
    },
    300_000,
  );

  itIfClaudeOauth(
    "claude-cli provider succeeds with OAuth-backed local auth",
    async () => {
      const repo = trackRepo(createLiveGenerationRepo());

      await expectSuccessfulGeneration(
        repo.repoPath,
        buildTestInferenceConfiguration(
          "claude-cli",
          { mode: "oauth" },
          CLAUDE_MODEL,
        ),
      );
    },
    300_000,
  );

  itIfAnthropicApiKey(
    "claude-cli provider succeeds with API-key-backed auth",
    async () => {
      const repo = trackRepo(createLiveGenerationRepo());

      await expectSuccessfulGeneration(
        repo.repoPath,
        buildTestInferenceConfiguration(
          "claude-cli",
          { mode: "env" },
          CLAUDE_MODEL,
        ),
      );
    },
    300_000,
  );

  itIfOpenRouterApiKey(
    "openrouter-http provider succeeds with API-key-backed auth",
    async () => {
      const repo = trackRepo(createLiveGenerationRepo());

      await expectSuccessfulGeneration(
        repo.repoPath,
        buildTestInferenceConfiguration(
          "openrouter-http",
          { mode: "env" },
          OPENROUTER_MODEL,
        ),
      );
    },
    300_000,
  );

  itIfClaudeOauth(
    "CLI generate with explicit claude-cli provider leaves validate/status consistent",
    async () => {
      const repo = trackRepo(createLiveGenerationRepo());

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
      expect(generateEnvelope.result?.validationResult?.status).not.toBe(
        "fail",
      );

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
    },
    300_000,
  );
});

const expectSuccessfulGeneration = async (
  repoPath: string,
  inference: Parameters<typeof generateDocumentation>[0]["inference"],
): Promise<void> => {
  const result = await generateDocumentation({
    inference,
    mode: "full",
    qualityReview: {
      secondModelReview: false,
      selfReview: false,
    },
    repoPath,
  });

  expect(result.success).toBe(true);

  if (!result.success) {
    throw new Error(
      `Expected generation to succeed: ${result.error.code} ${result.error.message}`,
    );
  }

  expect(result.modulePlan.modules.length).toBeGreaterThan(0);
  expect(result.generatedFiles).toContain(".doc-meta.json");
  expect(result.generatedFiles).toContain(".module-plan.json");
  expect(result.generatedFiles).toContain("module-tree.json");
  expect(result.generatedFiles).toContain("overview.md");
  expect(result.validationResult.status).not.toBe("fail");

  const outputPath = path.join(repoPath, "docs", "wiki");
  await access(path.join(outputPath, "overview.md"));
  await access(path.join(outputPath, "module-tree.json"));

  const metadataResult = await readMetadata(outputPath);

  expect(metadataResult.ok).toBe(true);

  if (!metadataResult.ok) {
    throw new Error(metadataResult.error.message);
  }

  expect(metadataResult.value.commitHash).toBe(result.commitHash);
};
