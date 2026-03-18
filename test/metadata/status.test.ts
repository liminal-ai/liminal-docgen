import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import * as gitAdapter from "../../src/adapters/git.js";
import {
  getDocumentationStatus,
  readMetadata,
  writeMetadata,
} from "../../src/index.js";
import type {
  DocumentationStatus,
  GeneratedDocumentationMetadata,
} from "../../src/types/index.js";
import { DOCS_OUTPUT, REPOS } from "../helpers/fixtures.js";
import { cleanupTempDir, createTempDir } from "../helpers/temp.js";

const METADATA_FILE_NAME = ".doc-meta.json";
const VALID_FIXTURE_COMMIT_HASH = "1111111111111111111111111111111111111111";
const STALE_FIXTURE_COMMIT_HASH = "def456def456def456def456def456def456def4";

const buildMetadata = (
  overrides: Partial<GeneratedDocumentationMetadata> = {},
): GeneratedDocumentationMetadata => ({
  commitHash: "0123456789abcdef0123456789abcdef01234567",
  componentCount: 3,
  filesGenerated: ["overview.md", "auth.md", "session.md", "storage.md"],
  generatedAt: "2026-03-15T12:00:00.000Z",
  mode: "full",
  outputPath: "docs/wiki",
  ...overrides,
});

const expectStatus = (
  result: Awaited<ReturnType<typeof getDocumentationStatus>>,
): DocumentationStatus => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(
      `Expected status query to succeed: ${result.error.message}`,
    );
  }

  return result.value;
};

const expectMetadata = (
  result: Awaited<ReturnType<typeof readMetadata>>,
): GeneratedDocumentationMetadata => {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error(
      `Expected metadata read to succeed: ${result.error.message}`,
    );
  }

  return result.value;
};

describe("metadata and status", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("TC-3.1a: nonexistent output dir returns not_generated", async () => {
    const outputPath = path.join(createTempDir(), "missing-output");

    try {
      const value = expectStatus(
        await getDocumentationStatus({
          outputPath,
          repoPath: REPOS.validTs,
        }),
      );

      expect(value).toEqual({
        currentHeadCommitHash: null,
        lastGeneratedAt: null,
        lastGeneratedCommitHash: null,
        outputPath,
        state: "not_generated",
      });
    } finally {
      cleanupTempDir(path.dirname(outputPath));
    }
  });

  it("TC-3.1b: output dir without metadata returns not_generated", async () => {
    const value = expectStatus(
      await getDocumentationStatus({
        outputPath: DOCS_OUTPUT.missingMeta,
        repoPath: REPOS.validTs,
      }),
    );

    expect(value.state).toBe("not_generated");
    expect(value.lastGeneratedAt).toBeNull();
    expect(value.lastGeneratedCommitHash).toBeNull();
  });

  it("TC-3.2a: matching commit hash returns current", async () => {
    vi.spyOn(gitAdapter, "getHeadCommitHash").mockResolvedValue(
      VALID_FIXTURE_COMMIT_HASH,
    );

    const value = expectStatus(
      await getDocumentationStatus({
        outputPath: DOCS_OUTPUT.valid,
        repoPath: REPOS.validTs,
      }),
    );

    expect(value.state).toBe("current");
    expect(value.lastGeneratedCommitHash).toBe(VALID_FIXTURE_COMMIT_HASH);
    expect(value.currentHeadCommitHash).toBe(VALID_FIXTURE_COMMIT_HASH);
  });

  it("TC-3.3a: differing commit hash returns stale", async () => {
    vi.spyOn(gitAdapter, "getHeadCommitHash").mockResolvedValue(
      STALE_FIXTURE_COMMIT_HASH,
    );

    const value = expectStatus(
      await getDocumentationStatus({
        outputPath: DOCS_OUTPUT.valid,
        repoPath: REPOS.validTs,
      }),
    );

    expect(value.state).toBe("stale");
    expect(value.lastGeneratedCommitHash).toBe(VALID_FIXTURE_COMMIT_HASH);
    expect(value.currentHeadCommitHash).toBe(STALE_FIXTURE_COMMIT_HASH);
  });

  it("TC-3.4a: invalid JSON metadata returns invalid", async () => {
    const value = expectStatus(
      await getDocumentationStatus({
        outputPath: DOCS_OUTPUT.corruptMetadata,
        repoPath: REPOS.validTs,
      }),
    );

    expect(value.state).toBe("invalid");
    expect(value.lastGeneratedAt).toBeNull();
    expect(value.lastGeneratedCommitHash).toBeNull();
    expect(value.currentHeadCommitHash).toBeNull();
  });

  it("TC-3.4b: metadata missing commitHash returns invalid", async () => {
    const value = expectStatus(
      await getDocumentationStatus({
        outputPath: DOCS_OUTPUT.missingMetadataFields,
        repoPath: REPOS.validTs,
      }),
    );

    expect(value.state).toBe("invalid");
    expect(value.lastGeneratedAt).toBeNull();
    expect(value.lastGeneratedCommitHash).toBeNull();
    expect(value.currentHeadCommitHash).toBeNull();
  });

  it("TC-3.5a: write full generation metadata", async () => {
    const rootDir = createTempDir();
    const outputPath = path.join(rootDir, "docs", "wiki");
    const metadata = buildMetadata();

    try {
      const result = await writeMetadata({ metadata, outputPath });

      expect(result).toEqual({ ok: true, value: undefined });

      const fileContents = await readFile(
        path.join(outputPath, METADATA_FILE_NAME),
        "utf8",
      );

      expect(JSON.parse(fileContents)).toEqual(metadata);
      expect(expectMetadata(await readMetadata(outputPath))).toEqual(metadata);
      expect(metadata.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    } finally {
      cleanupTempDir(rootDir);
    }
  });

  it("TC-3.5b: write update metadata replaces previous", async () => {
    const rootDir = createTempDir();
    const outputPath = path.join(rootDir, "docs", "wiki");
    const initialMetadata = buildMetadata();
    const updatedMetadata = buildMetadata({
      commitHash: "fedcba9876543210fedcba9876543210fedcba98",
      componentCount: 5,
      filesGenerated: ["overview.md", "auth.md"],
      generatedAt: "2026-03-16T08:30:00.000Z",
      mode: "update",
    });

    try {
      await writeMetadata({ metadata: initialMetadata, outputPath });
      await writeMetadata({ metadata: updatedMetadata, outputPath });

      expect(expectMetadata(await readMetadata(outputPath))).toEqual(
        updatedMetadata,
      );
    } finally {
      cleanupTempDir(rootDir);
    }
  });

  it("TC-3.6a: successful metadata read", async () => {
    const value = expectMetadata(await readMetadata(DOCS_OUTPUT.valid));

    expect(value).toEqual({
      commitHash: VALID_FIXTURE_COMMIT_HASH,
      componentCount: 3,
      filesGenerated: ["overview.md", "auth.md", "session.md", "storage.md"],
      generatedAt: "2026-03-15T12:00:00.000Z",
      mode: "full",
      outputPath: "docs/wiki",
    });
  });

  it("TC-3.6b: corrupted metadata returns structured error", async () => {
    const result = await readMetadata(DOCS_OUTPUT.corruptMetadata);

    expect(result.ok).toBe(false);

    if (result.ok) {
      return;
    }

    expect(result.error.code).toBe("METADATA_ERROR");
  });

  it("write to nonexistent output directory creates it", async () => {
    const rootDir = createTempDir();
    const outputPath = path.join(rootDir, "nested", "docs-output");

    try {
      await writeMetadata({
        metadata: buildMetadata({ outputPath: "nested/docs-output" }),
        outputPath,
      });

      const roundtrip = expectMetadata(await readMetadata(outputPath));
      expect(roundtrip.outputPath).toBe("nested/docs-output");
    } finally {
      cleanupTempDir(rootDir);
    }
  });

  it("read metadata with extra unknown fields succeeds", async () => {
    const rootDir = createTempDir();
    const outputPath = path.join(rootDir, "docs-output");
    const metadata = {
      ...buildMetadata(),
      extraField: "future-compatible",
    };

    try {
      await mkdir(outputPath, { recursive: true });
      await writeFile(
        path.join(outputPath, METADATA_FILE_NAME),
        JSON.stringify(metadata, null, 2),
        "utf8",
      );

      expect(expectMetadata(await readMetadata(outputPath))).toEqual(
        buildMetadata(),
      );
    } finally {
      cleanupTempDir(rootDir);
    }
  });

  it("write then read roundtrip preserves all fields", async () => {
    const rootDir = createTempDir();
    const outputPath = path.join(rootDir, "docs-output");
    const metadata = buildMetadata({
      commitHash: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      componentCount: 8,
      filesGenerated: ["overview.md", "api.md", "workers.md"],
      generatedAt: "2026-03-17T10:45:30.000Z",
      mode: "update",
      outputPath: "docs/custom",
    });

    try {
      await writeMetadata({ metadata, outputPath });

      expect(expectMetadata(await readMetadata(outputPath))).toEqual(metadata);
    } finally {
      cleanupTempDir(rootDir);
    }
  });
});
