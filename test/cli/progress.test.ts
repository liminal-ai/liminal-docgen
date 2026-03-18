import { spawn } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { EXIT_SIGINT } from "../../src/cli/exit-codes.js";
import { createProgressRenderer } from "../../src/cli/progress.js";
import type {
  CliResultEnvelope,
  DocumentationProgressEvent,
  DocumentationRunResult,
} from "../../src/types/index.js";
import { runCli } from "../helpers/cli-runner.js";
import { REPOS } from "../helpers/fixtures.js";
import { runGit } from "../helpers/git.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_CANCELLATION_PATH = path.resolve(
  __dirname,
  "../../dist/cli/cancellation.js",
);

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();

  for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
    cleanupTempDir(tempDir);
  }
});

function hasClaudeAuth(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function createGenerationRepo(): string {
  const rootDir = createTempDir();
  const repoPath = path.join(rootDir, "repo");
  tempDirs.push(rootDir);

  cpSync(REPOS.validTs, repoPath, { recursive: true });
  mkdirSync(path.join(repoPath, "src"), { recursive: true });
  writeFileSync(
    path.join(repoPath, "src", "billing.ts"),
    "export const createInvoice = () => 'invoice';\n",
    "utf8",
  );
  writeFileSync(
    path.join(repoPath, "src", "storage.ts"),
    "export const storeSession = () => 'stored';\n",
    "utf8",
  );
  writeFileSync(
    path.join(repoPath, "src", "notifications.ts"),
    "export const notifyUser = () => 'sent';\n",
    "utf8",
  );

  runGit(repoPath, ["init", "-q"]);
  runGit(repoPath, ["config", "user.email", "progress-tests@example.com"]);
  runGit(repoPath, ["config", "user.name", "Progress Tests"]);
  runGit(repoPath, ["add", "."]);
  runGit(repoPath, ["commit", "-qm", "initial fixture"]);

  return repoPath;
}

function captureStderr(run: () => void): string {
  const chunks: string[] = [];
  const writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(((
    chunk: string | Uint8Array,
  ) => {
    chunks.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
    );
    return true;
  }) as typeof process.stderr.write);

  try {
    run();
  } finally {
    writeSpy.mockRestore();
  }

  return chunks.join("");
}

describe.skipIf(!hasClaudeAuth())("CLI progress rendering (live)", () => {
  it("TC-2.3a: stage transitions visible during generation", async () => {
    const repoPath = createGenerationRepo();
    const result = await runCli(["generate", "--repo-path", repoPath], {
      timeoutMs: 180_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("→ Analyzing structure...");
    expect(result.stderr).toContain("→ Planning modules...");
    expect(result.stderr).toContain("→ Generating module:");
  }, 180_000);

  it("TC-2.3b: module-level progress visible", async () => {
    const repoPath = createGenerationRepo();
    const result = await runCli(["generate", "--repo-path", repoPath], {
      timeoutMs: 180_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toMatch(/→ Generating module: .+ \(\d+\/\d+\)\n/);
  }, 180_000);

  it("TC-2.3c: JSON mode suppresses progress", async () => {
    const repoPath = createGenerationRepo();
    const result = await runCli(
      ["generate", "--json", "--repo-path", repoPath],
      {
        timeoutMs: 180_000,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(
      JSON.parse(result.stdout) as CliResultEnvelope<DocumentationRunResult>,
    ).toMatchObject({
      command: "generate",
      success: true,
    });
  }, 180_000);
});

describe("CLI progress renderer", () => {
  it("non-TC: renderer handles unknown stage without crashing", () => {
    const output = captureStderr(() => {
      expect(() =>
        createProgressRenderer(false)({
          runId: "run-123",
          stage: "mystery-stage" as DocumentationProgressEvent["stage"],
          timestamp: "2026-03-16T00:00:00.000Z",
        }),
      ).not.toThrow();
    });

    expect(output).toContain("mystery-stage");
  });

  it("non-TC: empty moduleName in generating-module handled gracefully", () => {
    const output = captureStderr(() => {
      createProgressRenderer(false)({
        completed: 1,
        moduleName: "",
        runId: "run-456",
        stage: "generating-module",
        timestamp: "2026-03-16T00:00:00.000Z",
        total: 3,
      });
    });

    expect(output).toContain("→ Generating module: (unknown) (1/3)");
  });

  it("non-TC: SIGINT during progress exits with code 130", async () => {
    const script = `
      import {
        finalizeCancellation,
        installCancellationHandler,
        resetCancellationState
      } from ${JSON.stringify(pathToFileURL(DIST_CANCELLATION_PATH).href)};

      resetCancellationState();
      installCancellationHandler();
      process.stdout.write("ready\\n");

      const interval = setInterval(() => {
        if (!finalizeCancellation(false)) {
          return;
        }

        clearInterval(interval);
      }, 10);
    `;

    const result = await new Promise<{
      code: number | null;
      stderr: string;
      signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--input-type=module", "-e", script],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let stderr = "";
      let sigintSent = false;

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        if (sigintSent || !chunk.includes("ready")) {
          return;
        }

        sigintSent = true;
        child.kill("SIGINT");
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("exit", (code, signal) => {
        resolve({ code, signal, stderr });
      });
    });

    expect(result.code).toBe(EXIT_SIGINT);
    expect(result.signal).toBeNull();
    expect(result.stderr).toContain(
      "→ Cancellation requested. Finishing current operation...",
    );
    expect(result.stderr).toContain("→ Cancelled.");
  });
});
