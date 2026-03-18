import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Create a temp directory for write tests. Cleaned up in afterEach. */
export const createTempDir = (): string =>
  mkdtempSync(path.join(tmpdir(), "liminal-docgen-"));

export const cleanupTempDir = (dir: string): void => {
  rmSync(dir, { force: true, recursive: true });
};
