import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { executeReadSource } from "../../src/agent/tools/read-source.js";
import type { AgentRuntimeConfig } from "../../src/agent/types.js";
import { DEFAULT_AGENT_CONFIG } from "../../src/agent/types.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await cleanupTempDir(dir);
  }
  tempDirs.length = 0;
});

const makeConfig = (repoRoot: string): AgentRuntimeConfig => ({
  ...DEFAULT_AGENT_CONFIG,
  repoRoot,
});

describe("executeReadSource", () => {
  it("reads component source file successfully", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    const srcDir = path.join(repoRoot, "src");
    await mkdir(srcDir, { recursive: true });
    const content = "export const foo = 42;\nexport function bar() {}\n";
    await writeFile(path.join(srcDir, "example.ts"), content, "utf8");

    const result = await executeReadSource(
      { filePath: "src/example.ts" },
      makeConfig(repoRoot),
    );

    expect("content" in result).toBe(true);
    if ("content" in result) {
      expect(result.content).toBe(content);
      expect(result.lineCount).toBe(3);
      expect(result.truncated).toBe(false);
    }
  });

  it("rejects path outside repository root", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    const result = await executeReadSource(
      { filePath: "../../etc/passwd" },
      makeConfig(repoRoot),
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("outside the repository root");
    }
  });

  it("reads multiple files independently", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    const srcDir = path.join(repoRoot, "src");
    await mkdir(srcDir, { recursive: true });

    for (const name of ["a.ts", "b.ts", "c.ts"]) {
      await writeFile(
        path.join(srcDir, name),
        `// content of ${name}\n`,
        "utf8",
      );
    }

    const config = makeConfig(repoRoot);
    const results = await Promise.all([
      executeReadSource({ filePath: "src/a.ts" }, config),
      executeReadSource({ filePath: "src/b.ts" }, config),
      executeReadSource({ filePath: "src/c.ts" }, config),
    ]);

    for (const [i, result] of results.entries()) {
      expect("content" in result).toBe(true);
      if ("content" in result) {
        expect(result.content).toContain(
          `content of ${["a.ts", "b.ts", "c.ts"][i]}`,
        );
      }
    }
  });

  it("truncates file over maxReadLines with notice", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i + 1}`);
    await writeFile(
      path.join(repoRoot, "big-file.ts"),
      lines.join("\n"),
      "utf8",
    );

    const config: AgentRuntimeConfig = {
      ...DEFAULT_AGENT_CONFIG,
      repoRoot,
      maxReadLines: 2000,
    };

    const result = await executeReadSource({ filePath: "big-file.ts" }, config);

    expect("content" in result).toBe(true);
    if ("content" in result) {
      expect(result.truncated).toBe(true);
      expect(result.lineCount).toBe(2000);
      expect(result.content).toContain("Truncated: 1000 lines omitted");
    }
  });

  it("returns error for nonexistent file", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    const result = await executeReadSource(
      { filePath: "does-not-exist.ts" },
      makeConfig(repoRoot),
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Failed to read");
    }
  });

  it("rejects path traversal via ../ in middle of path", async () => {
    const repoRoot = createTempDir();
    tempDirs.push(repoRoot);

    const result = await executeReadSource(
      { filePath: "src/../../outside.txt" },
      makeConfig(repoRoot),
    );

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("outside the repository root");
    }
  });
});
