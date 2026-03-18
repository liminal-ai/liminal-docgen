import { chmodSync, cpSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as gitAdapter from "../../src/adapters/git.js";
import * as pythonAdapter from "../../src/adapters/python.js";
import { checkEnvironment } from "../../src/environment/check.js";
import { BUNDLED_ANALYSIS_SCRIPT_PATHS } from "../../src/environment/runtime-checker.js";
import { REPOS } from "../helpers/fixtures.js";
import { runGit } from "../helpers/git.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const expectEnvironmentCheck = (
  result: Awaited<ReturnType<typeof checkEnvironment>>,
) => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(
      `Expected environment check to succeed: ${result.error.message}`,
    );
  }

  return result.value;
};

const createGitFixture = (sourcePath: string): string => {
  const repoPath = path.join(createTempDir(), path.basename(sourcePath));
  cpSync(sourcePath, repoPath, { recursive: true });
  runGit(repoPath, ["init", "-q"]);
  return repoPath;
};

const getBundledScriptPath = (): string => {
  const scriptPath = BUNDLED_ANALYSIS_SCRIPT_PATHS[0];

  if (!scriptPath) {
    throw new Error("Expected at least one bundled analysis script path.");
  }

  return scriptPath;
};

describe("checkEnvironment", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("TC-1.1a: all deps present returns passed true", async () => {
    const repoPath = createGitFixture(REPOS.validTs);

    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(true);
    vi.spyOn(pythonAdapter, "isTreeSitterLanguageAvailable").mockResolvedValue(
      true,
    );
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    try {
      const value = expectEnvironmentCheck(
        await checkEnvironment({ repoPath }),
      );

      expect(value).toEqual({
        detectedLanguages: ["typescript"],
        findings: [],
        passed: true,
      });
    } finally {
      cleanupTempDir(path.dirname(repoPath));
    }
  });

  it("TC-1.1b: no repo path checks only runtime deps", async () => {
    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(true);
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    const value = expectEnvironmentCheck(await checkEnvironment());

    expect(value.passed).toBe(true);
    expect(value.detectedLanguages).toEqual([]);
    expect(value.findings).toEqual([]);
  });

  it("TC-1.2a: missing Python identified by name", async () => {
    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(false);
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    const value = expectEnvironmentCheck(await checkEnvironment());

    expect(value.findings).toContainEqual(
      expect.objectContaining({
        category: "missing-dependency",
        dependencyName: "python",
        severity: "error",
      }),
    );
  });

  it("TC-1.2b: missing TS parser identified by name", async () => {
    const repoPath = createGitFixture(REPOS.multiLang);

    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(true);
    vi.spyOn(pythonAdapter, "isTreeSitterLanguageAvailable").mockImplementation(
      async (language) => language !== "typescript",
    );
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    try {
      const value = expectEnvironmentCheck(
        await checkEnvironment({ repoPath }),
      );

      expect(value.findings).toContainEqual(
        expect.objectContaining({
          category: "missing-dependency",
          dependencyName: expect.stringContaining("typescript"),
          severity: "warning",
        }),
      );
    } finally {
      cleanupTempDir(path.dirname(repoPath));
    }
  });

  it("TC-1.2c: multiple missing deps listed individually", async () => {
    const repoPath = createGitFixture(REPOS.validTs);

    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(false);
    vi.spyOn(pythonAdapter, "isTreeSitterLanguageAvailable").mockResolvedValue(
      false,
    );
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    try {
      const value = expectEnvironmentCheck(
        await checkEnvironment({ repoPath }),
      );
      expect(value.findings).toEqual([]);
      expect(value.passed).toBe(true);
    } finally {
      cleanupTempDir(path.dirname(repoPath));
    }
  });

  it("TC-1.2d: missing Git identified by name", async () => {
    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(true);
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(false);

    const value = expectEnvironmentCheck(await checkEnvironment());

    expect(value.findings).toContainEqual(
      expect.objectContaining({
        category: "missing-dependency",
        dependencyName: "git",
        severity: "error",
      }),
    );
  });

  it("TC-1.3a: TypeScript repo detected", async () => {
    const repoPath = createGitFixture(REPOS.validTs);

    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(true);
    vi.spyOn(pythonAdapter, "isTreeSitterLanguageAvailable").mockResolvedValue(
      true,
    );
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    try {
      const value = expectEnvironmentCheck(
        await checkEnvironment({ repoPath }),
      );

      expect(value.detectedLanguages).toContain("typescript");
    } finally {
      cleanupTempDir(path.dirname(repoPath));
    }
  });

  it("TC-1.3b: multi-language repo detected", async () => {
    const repoPath = createGitFixture(REPOS.multiLang);

    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(true);
    vi.spyOn(pythonAdapter, "isTreeSitterLanguageAvailable").mockResolvedValue(
      true,
    );
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    try {
      const value = expectEnvironmentCheck(
        await checkEnvironment({ repoPath }),
      );

      expect(value.detectedLanguages).toEqual(["python", "typescript"]);
    } finally {
      cleanupTempDir(path.dirname(repoPath));
    }
  });

  it("TC-1.4a: valid git repo produces no git errors", async () => {
    const repoPath = createGitFixture(REPOS.validTs);

    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(true);
    vi.spyOn(pythonAdapter, "isTreeSitterLanguageAvailable").mockResolvedValue(
      true,
    );
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    try {
      const value = expectEnvironmentCheck(
        await checkEnvironment({ repoPath }),
      );

      expect(value.findings).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: "invalid-repo",
            severity: "error",
          }),
        ]),
      );
    } finally {
      cleanupTempDir(path.dirname(repoPath));
    }
  });

  it("TC-1.4b: directory without git produces error finding", async () => {
    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(true);
    vi.spyOn(pythonAdapter, "isTreeSitterLanguageAvailable").mockResolvedValue(
      true,
    );
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    const value = expectEnvironmentCheck(
      await checkEnvironment({ repoPath: REPOS.noGit }),
    );

    expect(value.findings).toContainEqual(
      expect.objectContaining({
        category: "invalid-repo",
        path: REPOS.noGit,
        severity: "error",
      }),
    );
  });

  it("TC-1.4c: nonexistent path produces error finding", async () => {
    const repoPath = path.join(REPOS.noGit, "missing");

    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(true);
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    const value = expectEnvironmentCheck(await checkEnvironment({ repoPath }));

    expect(value.findings).toContainEqual(
      expect.objectContaining({
        category: "invalid-path",
        path: repoPath,
        severity: "error",
      }),
    );
  });

  it("TC-1.5a: missing optional parser is warning", async () => {
    const repoPath = createGitFixture(REPOS.multiLang);

    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(true);
    vi.spyOn(pythonAdapter, "isTreeSitterLanguageAvailable").mockImplementation(
      async (language) => language !== "python",
    );
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    try {
      const value = expectEnvironmentCheck(
        await checkEnvironment({ repoPath }),
      );

      expect(value.findings).toContainEqual(
        expect.objectContaining({
          category: "missing-dependency",
          dependencyName: "tree-sitter-python",
          severity: "warning",
        }),
      );
      expect(value.passed).toBe(true);
    } finally {
      cleanupTempDir(path.dirname(repoPath));
    }
  });

  it("TC-1.5b: missing Python runtime is error", async () => {
    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(false);
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    const value = expectEnvironmentCheck(await checkEnvironment());

    expect(value.findings).toContainEqual(
      expect.objectContaining({
        category: "missing-dependency",
        dependencyName: "python",
        severity: "error",
      }),
    );
    expect(value.passed).toBe(false);
  });

  it("analysis scripts not executable returns error finding", async () => {
    const scriptPath = getBundledScriptPath();

    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(true);
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    chmodSync(scriptPath, 0o644);

    try {
      const value = expectEnvironmentCheck(await checkEnvironment());

      expect(value.findings).toContainEqual(
        expect.objectContaining({
          category: "environment",
          message: expect.stringContaining(path.basename(scriptPath)),
          severity: "error",
        }),
      );
      expect(value.passed).toBe(false);
    } finally {
      chmodSync(scriptPath, 0o755);
    }
  });

  it("mixed parser availability across multiple languages", async () => {
    const repoPath = createGitFixture(REPOS.multiLang);

    vi.spyOn(pythonAdapter, "isPythonAvailable").mockResolvedValue(true);
    vi.spyOn(pythonAdapter, "isTreeSitterLanguageAvailable").mockImplementation(
      async (language) =>
        language === "typescript" || language === "javascript",
    );
    vi.spyOn(gitAdapter, "isGitAvailable").mockResolvedValue(true);

    try {
      const value = expectEnvironmentCheck(
        await checkEnvironment({ repoPath }),
      );

      expect(value.findings).toEqual([
        expect.objectContaining({
          category: "missing-dependency",
          dependencyName: "tree-sitter-python",
          severity: "warning",
        }),
      ]);
      expect(value.passed).toBe(true);
    } finally {
      cleanupTempDir(path.dirname(repoPath));
    }
  });
});
