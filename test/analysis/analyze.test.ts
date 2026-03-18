import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as gitAdapter from "../../src/adapters/git.js";
import * as pythonAdapter from "../../src/adapters/python.js";
import * as subprocessAdapter from "../../src/adapters/subprocess.js";
import { analyzeRepository } from "../../src/analysis/analyze.js";
import type { RepositoryAnalysis } from "../../src/types/index.js";
import { REPOS } from "../helpers/fixtures.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const MOCK_COMMIT_HASH = "0123456789abcdef0123456789abcdef01234567";
const tempDirs: string[] = [];

const expectAnalysis = (
  result: Awaited<ReturnType<typeof analyzeRepository>>,
): RepositoryAnalysis => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(`Expected analysis to succeed: ${result.error.message}`);
  }

  return result.value;
};

const createFixtureRepo = (sourcePath: string): string => {
  const repoPath = createTempDir();
  tempDirs.push(repoPath);
  cpSync(sourcePath, repoPath, { recursive: true });
  return repoPath;
};

const createRepo = (files: Record<string, string>): string => {
  const repoPath = createTempDir();
  tempDirs.push(repoPath);

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(repoPath, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents, "utf8");
  }

  return repoPath;
};

describe("analyzeRepository", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(gitAdapter, "getHeadCommitHash").mockResolvedValue(
      MOCK_COMMIT_HASH,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();

    for (const tempDir of tempDirs.splice(0, tempDirs.length)) {
      cleanupTempDir(tempDir);
    }
  });

  it("TC-2.1a: successful TypeScript repo analysis uses the native provider", async () => {
    const repoPath = createFixtureRepo(REPOS.validTs);

    const value = expectAnalysis(await analyzeRepository({ repoPath }));

    expect(Object.keys(value.components)).toEqual([
      "src/auth.ts",
      "src/index.ts",
      "src/session.ts",
    ]);
    expect(value.components["src/auth.ts"]).toEqual({
      exportedSymbols: [{ kind: "class", lineNumber: 3, name: "AuthService" }],
      filePath: "src/auth.ts",
      language: "typescript",
      linesOfCode: 10,
    });
    expect(value.relationships).toEqual([
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
    expect(value.summary).toEqual({
      languagesFound: ["typescript"],
      languagesSkipped: [],
      totalComponents: 3,
      totalFilesAnalyzed: 3,
      totalRelationships: 3,
    });
    expect(value.commitHash).toBe(MOCK_COMMIT_HASH);
  });

  it("TC-2.2a: include and exclude patterns constrain native analysis scope", async () => {
    const repoPath = createRepo({
      "src/auth.ts": "export const AUTH = true;\n",
      "src/generated/client.ts": "export const GENERATED = true;\n",
      "test/auth.test.ts": "export const TEST = true;\n",
    });

    const value = expectAnalysis(
      await analyzeRepository({
        excludePatterns: ["**/generated/**", "**/*.test.ts"],
        includePatterns: ["src/**", "test/**"],
        repoPath,
      }),
    );

    expect(Object.keys(value.components)).toEqual(["src/auth.ts"]);
  });

  it("TC-2.4a: focusDirs now materially constrains analysis scope", async () => {
    const repoPath = createRepo({
      "src/core/index.ts": "export const core = true;\n",
      "src/api/index.ts": "export const api = true;\n",
    });

    const value = expectAnalysis(
      await analyzeRepository({
        focusDirs: ["src/core"],
        repoPath,
      }),
    );

    expect(value.focusDirs).toEqual(["src/core"]);
    expect(Object.keys(value.components)).toEqual(["src/core/index.ts"]);
  });

  it("TC-2.5a: files with no exports are still analyzed as components", async () => {
    const repoPath = createRepo({
      "src/bootstrap.ts": "console.log('boot');\n",
    });

    const value = expectAnalysis(await analyzeRepository({ repoPath }));

    expect(value.components["src/bootstrap.ts"]).toEqual({
      exportedSymbols: [],
      filePath: "src/bootstrap.ts",
      language: "typescript",
      linesOfCode: 1,
    });
  });

  it("TC-2.6a: import-only relationships are deduplicated over usage", async () => {
    const repoPath = createRepo({
      "src/a.ts": [
        "import { beta } from './b.js';",
        "",
        "export function alpha(): string {",
        "  return beta();",
        "}",
        "",
      ].join("\n"),
      "src/b.ts": [
        "export function beta(): string {",
        "  return 'ok';",
        "}",
        "",
      ].join("\n"),
    });

    const value = expectAnalysis(await analyzeRepository({ repoPath }));

    expect(value.relationships).toEqual([
      {
        source: "src/a.ts",
        target: "src/b.ts",
        type: "import",
      },
    ]);
  });

  it("TC-2.8a: Python unavailable does not block JS/TS repositories", async () => {
    const repoPath = createFixtureRepo(REPOS.validTs);

    vi.spyOn(pythonAdapter, "getPythonCommand").mockResolvedValue(null);

    const result = await analyzeRepository({ repoPath });

    expect(result.ok).toBe(true);
  });

  it("TC-2.8b: nonexistent repo path returns PATH_ERROR", async () => {
    const result = await analyzeRepository({
      repoPath: `${REPOS.validTs}/missing`,
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("PATH_ERROR");
  });

  it("TC-2.8c: unsupported languages are reported in languagesSkipped", async () => {
    const repoPath = createRepo({
      "src/index.ts": "export const value = 1;\n",
      "src/lib.rs": "pub fn greet() {}\n",
    });

    const value = expectAnalysis(await analyzeRepository({ repoPath }));

    expect(value.summary.languagesFound).toEqual(["typescript"]);
    expect(value.summary.languagesSkipped).toEqual(["rust"]);
    expect(value.summary.totalComponents).toBe(1);
  });

  it("TC-2.8d: mixed-language repos fall back to Python and preserve dependency errors", async () => {
    const repoPath = createFixtureRepo(REPOS.multiLang);

    vi.spyOn(pythonAdapter, "getPythonCommand").mockResolvedValue(null);

    const result = await analyzeRepository({ repoPath });

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("DEPENDENCY_MISSING");
  });

  it("mixed-language repos merge native TypeScript and Python fallback results", async () => {
    const repoPath = createFixtureRepo(REPOS.multiLang);

    vi.spyOn(pythonAdapter, "getPythonCommand").mockResolvedValue("python3");
    vi.spyOn(subprocessAdapter, "runSubprocess").mockResolvedValue({
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({
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
      }),
    });

    const value = expectAnalysis(await analyzeRepository({ repoPath }));

    expect(Object.keys(value.components)).toEqual([
      "analyzer.py",
      "src/index.ts",
    ]);
    expect(value.summary).toEqual({
      languagesFound: ["python", "typescript"],
      languagesSkipped: [],
      totalComponents: 2,
      totalFilesAnalyzed: 2,
      totalRelationships: 0,
    });
  });

  it("mixed-language repos scoped to TypeScript do not require Python", async () => {
    const repoPath = createFixtureRepo(REPOS.multiLang);

    vi.spyOn(pythonAdapter, "getPythonCommand").mockResolvedValue(null);

    const value = expectAnalysis(
      await analyzeRepository({
        focusDirs: ["src"],
        repoPath,
      }),
    );

    expect(Object.keys(value.components)).toEqual(["src/index.ts"]);
    expect(value.summary.languagesFound).toEqual(["typescript"]);
  });

  it("adapter invalid payload shape returns ANALYSIS_ERROR for Python fallback", async () => {
    const repoPath = createFixtureRepo(REPOS.multiLang);

    vi.spyOn(pythonAdapter, "getPythonCommand").mockResolvedValue("python3");
    vi.spyOn(subprocessAdapter, "runSubprocess").mockResolvedValue({
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({
        file_tree: { children: [], name: "repo", path: ".", type: "directory" },
        functions: [{}],
        relationships: [],
        summary: {},
      }),
    });

    const result = await analyzeRepository({ repoPath });

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("ANALYSIS_ERROR");
  });

  it("adapter invalid JSON returns ANALYSIS_ERROR for Python fallback", async () => {
    const repoPath = createFixtureRepo(REPOS.multiLang);

    vi.spyOn(pythonAdapter, "getPythonCommand").mockResolvedValue("python3");
    vi.spyOn(subprocessAdapter, "runSubprocess").mockResolvedValue({
      exitCode: 0,
      stderr: "",
      stdout: "{not-json",
    });

    const result = await analyzeRepository({ repoPath });

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("ANALYSIS_ERROR");
  }, 60_000);

  it("re-export relationships are preserved for files without direct exports", async () => {
    const repoPath = createRepo({
      "src/barrel.ts": "export { greet } from './lib.js';\n",
      "src/lib.ts": "export function greet(): string {\n  return 'hi';\n}\n",
    });

    const value = expectAnalysis(await analyzeRepository({ repoPath }));

    expect(value.relationships).toContainEqual({
      source: "src/barrel.ts",
      target: "src/lib.ts",
      type: "usage",
    });
  });
});
