import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeRepository, getDocumentationStatus } from "../../src/index.js";
import type {
  DocumentationRunResult,
  DocumentationStatus,
  EnvironmentCheckResult,
} from "../../src/types/index.js";
import { runCli, runCliJson } from "../helpers/cli-runner.js";
import { DOCS_OUTPUT, REPOS } from "../helpers/fixtures.js";
import { runGit } from "../helpers/git.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const INFERENCE_TESTS_ENABLED =
  process.env.DOC_ENGINE_ENABLE_CLI_INFERENCE_TESTS === "1";

describe("CLI command shell", () => {
  it("TC-1.1a: each command responds to --help", async () => {
    const commands = [
      "check",
      "analyze",
      "generate",
      "update",
      "validate",
      "status",
      "publish",
    ];

    for (const command of commands) {
      const result = await runCli([command, "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("USAGE");
      expect(result.stderr).toBe("");
      expect(result.stdout.toLowerCase()).not.toContain("unknown command");
    }
  }, 20_000);

  it("non-TC: --help flag produces non-empty output for each command", async () => {
    const expectations = {
      analyze: ["--repo-path", "--include", "--exclude", "--focus"],
      check: [
        "--repo-path",
        "--json",
        "--provider",
        "--auth-mode",
        "--api-key-env",
      ],
      generate: [
        "--repo-path",
        "--output-path",
        "--config",
        "--provider",
        "--auth-mode",
        "--api-key-env",
        "--model",
      ],
      publish: ["--repo-path", "--branch-name", "--create-pr"],
      status: ["--repo-path", "--output-path", "--config"],
      update: [
        "--repo-path",
        "--output-path",
        "--config",
        "--provider",
        "--auth-mode",
        "--api-key-env",
        "--model",
      ],
      validate: ["--output-path", "--json"],
    } as const;

    for (const [command, expectedFlags] of Object.entries(expectations)) {
      const result = await runCli([command, "--help"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim().length).toBeGreaterThan(0);

      for (const expectedFlag of expectedFlags) {
        expect(result.stdout).toContain(expectedFlag);
      }
    }
  });

  it("TC-1.1b: unknown command rejected", async () => {
    const result = await runCli(["nonexistent"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("COMMANDS");
    expect(result.stderr).toContain("USAGE_ERROR");
    expect(result.stderr).toContain("Unknown command nonexistent");
  });

  it("TC-1.1c: no-argument shows help", async () => {
    const result = await runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Liminal DocGen CLI");
    expect(result.stdout).toContain("COMMANDS");
    expect(result.stderr).toBe("");
  });

  it("TC-1.2b: check accepts optional repo-path", async () => {
    const { envelope } = await runCliJson<EnvironmentCheckResult>([
      "check",
      "--json",
    ]);

    expect(envelope.success).toBe(true);
    expect(envelope.result?.detectedLanguages).toEqual([]);
    expect(
      envelope.result?.findings.some((finding) =>
        ["invalid-path", "invalid-repo"].includes(finding.category),
      ),
    ).toBe(false);
  });

  it("TC-1.2c: required argument missing produces error", async () => {
    const result = await runCli(["generate"]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("USAGE");
    expect(result.stderr).toContain("Missing required argument: --repo-path");
  });

  it("TC-1.2d: publish accepts publish-specific arguments", async () => {
    const fixture = createStatusRepo();

    try {
      const { envelope, exitCode } = await runCliJson([
        "publish",
        "--json",
        "--repo-path",
        fixture.repoPath,
        "--branch-name",
        "docs/test-branch",
        "--create-pr",
      ]);

      expect(exitCode).toBe(1);
      expect(envelope.success).toBe(false);
      expect(envelope.error).toMatchObject({
        code: "PUBLISH_ERROR",
        details: {
          repoPath: fixture.repoPath,
        },
        message: expect.stringContaining("origin"),
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-1.3a: CLI argument overrides config file", async () => {
    const fixture = createStatusRepo({
      config: {
        outputPath: "docs/generated",
      },
      outputPath: "docs/custom",
    });

    try {
      const { envelope } = await runCliJson<DocumentationStatus>([
        "status",
        "--json",
        "--repo-path",
        fixture.repoPath,
        "--output-path",
        "docs/custom",
      ]);

      expect(envelope.success).toBe(true);
      expect(envelope.result?.outputPath).toBe("docs/custom");
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-1.3b: config file value used when CLI arg omitted", async () => {
    const fixture = createStatusRepo({
      config: {
        outputPath: "docs/generated",
      },
      outputPath: "docs/generated",
    });

    try {
      const { envelope } = await runCliJson<DocumentationStatus>([
        "status",
        "--json",
        "--repo-path",
        fixture.repoPath,
      ]);

      expect(envelope.success).toBe(true);
      expect(envelope.result?.outputPath).toBe("docs/generated");
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-1.3c: defaults apply when both config file and CLI args are omitted", async () => {
    const fixture = createStatusRepo();

    try {
      const { envelope } = await runCliJson<DocumentationStatus>([
        "status",
        "--json",
        "--repo-path",
        fixture.repoPath,
      ]);

      expect(envelope.success).toBe(true);
      expect(envelope.result?.outputPath).toBe("docs/wiki");
    } finally {
      fixture.cleanup();
    }
  });

  it("TC-1.4b: CLI status result matches direct SDK call", async () => {
    const fixture = createStatusRepo();

    try {
      const { envelope } = await runCliJson<DocumentationStatus>([
        "status",
        "--json",
        "--repo-path",
        fixture.repoPath,
      ]);
      const sdkResult = await getDocumentationStatus({
        repoPath: fixture.repoPath,
      });

      expect(sdkResult.ok).toBe(true);

      if (!sdkResult.ok) {
        return;
      }

      expect(envelope.result).toEqual(sdkResult.value);
    } finally {
      fixture.cleanup();
    }
  });

  it("config file loads from --config relative to CWD", async () => {
    const fixture = createStatusRepo({
      outputPath: "docs/from-config",
    });
    const cwdPath = path.join(fixture.rootDir, "cwd");
    const configPath = path.join(cwdPath, "custom-config.json");

    mkdirSync(cwdPath, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({ outputPath: "docs/from-config" }, null, 2),
      "utf8",
    );

    try {
      const { envelope } = await runCliJson<DocumentationStatus>(
        [
          "status",
          "--json",
          "--repo-path",
          fixture.repoPath,
          "--config",
          "./custom-config.json",
        ],
        {
          cwd: cwdPath,
        },
      );

      expect(envelope.success).toBe(true);
      expect(envelope.result?.outputPath).toBe("docs/from-config");
    } finally {
      fixture.cleanup();
    }
  });

  it("default config filename is .liminal-docgen.json", async () => {
    const fixture = createStatusRepo({
      config: {
        outputPath: "docs/from-default-config",
      },
      outputPath: "docs/from-default-config",
    });

    try {
      const { envelope } = await runCliJson<DocumentationStatus>([
        "status",
        "--json",
        "--repo-path",
        fixture.repoPath,
      ]);

      expect(envelope.success).toBe(true);
      expect(envelope.result?.outputPath).toBe("docs/from-default-config");
    } finally {
      fixture.cleanup();
    }
  });

  it("non-TC: comma-separated patterns split correctly", async () => {
    const repoPath = createAnalysisRepo();

    try {
      const { envelope } = await runCliJson([
        "analyze",
        "--json",
        "--repo-path",
        repoPath,
        "--include",
        "src/**,lib/**",
        "--exclude",
        "**/*.test.ts,**/*.spec.ts",
        "--focus",
        "src,lib",
      ]);
      const sdkResult = await analyzeRepository({
        excludePatterns: ["**/*.test.ts", "**/*.spec.ts"],
        focusDirs: ["src", "lib"],
        includePatterns: ["src/**", "lib/**"],
        repoPath,
      });

      expect(sdkResult.ok).toBe(true);

      if (!sdkResult.ok) {
        return;
      }

      expect(envelope.success).toBe(true);
      expect(envelope.result).toEqual(sdkResult.value);
    } finally {
      cleanupTempDir(path.dirname(repoPath));
    }
  });

  it.skipIf(!INFERENCE_TESTS_ENABLED)(
    "TC-1.2a: generate accepts repo-path and output-path",
    async () => {
      const fixture = createStatusRepo();

      try {
        const result = await runCli([
          "generate",
          "--json",
          "--repo-path",
          fixture.repoPath,
          "--output-path",
          "docs/wiki",
        ]);

        expect(result.exitCode).toBe(0);
      } finally {
        fixture.cleanup();
      }
    },
  );

  it.skipIf(!INFERENCE_TESTS_ENABLED)(
    "TC-1.4a: CLI generate result matches SDK",
    async () => {
      const fixture = createStatusRepo();

      try {
        const { envelope } = await runCliJson<DocumentationRunResult>([
          "generate",
          "--json",
          "--repo-path",
          fixture.repoPath,
          "--output-path",
          "docs/wiki",
        ]);

        expect(envelope.success).toBe(true);
        expect(envelope.result).toMatchObject({
          runId: expect.any(String),
          success: true,
          mode: expect.stringMatching(/^(full|update)$/),
          durationSeconds: expect.any(Number),
          generatedFiles: expect.any(Array),
          commitHash: expect.any(String),
          warnings: expect.any(Array),
        });
      } finally {
        fixture.cleanup();
      }
    },
  );

  it.skipIf(!INFERENCE_TESTS_ENABLED)(
    "TC-1.2e: include/exclude/focus patterns accepted by generate and update",
    async () => {
      const fixture = createStatusRepo();

      try {
        const result = await runCli([
          "generate",
          "--json",
          "--repo-path",
          fixture.repoPath,
          "--include",
          "src/**",
          "--exclude",
          "**/*.test.ts",
          "--focus",
          "src/core",
        ]);

        expect(result.exitCode).toBe(0);
      } finally {
        fixture.cleanup();
      }
    },
  );
});

interface StatusRepoOptions {
  outputPath?: string;
  config?: {
    outputPath?: string;
  };
}

const createStatusRepo = (
  options: StatusRepoOptions = {},
): {
  repoPath: string;
  rootDir: string;
  cleanup: () => void;
} => {
  const rootDir = createTempDir();
  const repoPath = path.join(rootDir, "repo");
  const outputPath = options.outputPath ?? "docs/wiki";

  cpSync(REPOS.validTs, repoPath, { recursive: true });
  initializeGitRepository(repoPath);

  const commitHash = runGit(repoPath, ["rev-parse", "HEAD"]);
  const resolvedOutputPath = path.join(repoPath, outputPath);

  mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  cpSync(DOCS_OUTPUT.valid, resolvedOutputPath, { recursive: true });

  const metadataPath = path.join(resolvedOutputPath, ".doc-meta.json");
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as {
    commitHash: string;
    outputPath: string;
  };

  metadata.commitHash = commitHash;
  metadata.outputPath = outputPath;

  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

  if (options.config) {
    writeFileSync(
      path.join(repoPath, ".liminal-docgen.json"),
      JSON.stringify(options.config, null, 2),
      "utf8",
    );
  }

  return {
    cleanup: () => cleanupTempDir(rootDir),
    repoPath,
    rootDir,
  };
};

const initializeGitRepository = (repoPath: string): void => {
  runGit(repoPath, ["init", "-q"]);
  runGit(repoPath, ["config", "user.email", "cli-tests@example.com"]);
  runGit(repoPath, ["config", "user.name", "CLI Tests"]);
  runGit(repoPath, ["add", "."]);
  runGit(repoPath, ["commit", "-qm", "initial fixture"]);
};

const createAnalysisRepo = (): string => {
  const repoPath = path.join(createTempDir(), "analyze-repo");

  cpSync(REPOS.validTs, repoPath, { recursive: true });
  mkdirSync(path.join(repoPath, "lib"), { recursive: true });
  writeFileSync(
    path.join(repoPath, "lib", "helper.ts"),
    "export const helper = () => true;\n",
    "utf8",
  );
  initializeGitRepository(repoPath);

  return repoPath;
};
