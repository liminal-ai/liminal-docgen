import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { getDefaults } from "../config/defaults.js";
import { LANGUAGE_BY_EXTENSION } from "../languages.js";
import type { RawFileTreeNode } from "./raw-output.js";

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const NATIVE_ANALYZABLE_LANGUAGES = new Set(["javascript", "typescript"]);

export interface AnalysisScope {
  excludePatterns: string[];
  focusDirs: string[];
  includePatterns: string[];
}

export interface DiscoveredRepositoryFile {
  absolutePath: string;
  extension: string;
  language: string | null;
  linesOfCode: number;
  path: string;
  supportedByNative: boolean;
}

export const createDiscoveryScope = (
  overrides: Partial<AnalysisScope> = {},
): AnalysisScope => {
  const defaults = getDefaults();

  return {
    excludePatterns: overrides.excludePatterns ?? defaults.excludePatterns,
    focusDirs: overrides.focusDirs ?? defaults.focusDirs,
    includePatterns: overrides.includePatterns ?? defaults.includePatterns,
  };
};

export const discoverRepositoryFiles = async (
  repoPath: string,
  scope: AnalysisScope,
): Promise<DiscoveredRepositoryFile[]> => {
  return walkDirectory(repoPath, repoPath, scope);
};

export const buildScopedFileTree = (
  repoPath: string,
  files: DiscoveredRepositoryFile[],
): RawFileTreeNode => {
  const root: RawFileTreeNode = {
    children: [],
    name: path.basename(repoPath),
    path: ".",
    type: "directory",
  };
  const directories = new Map<string, RawFileTreeNode>([[".", root]]);

  for (const file of [...files].sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    const parts = file.path.split("/");
    let parentPath = ".";

    for (const part of parts.slice(0, -1)) {
      const currentPath = parentPath === "." ? part : `${parentPath}/${part}`;

      if (!directories.has(currentPath)) {
        const directoryNode: RawFileTreeNode = {
          children: [],
          name: part,
          path: currentPath,
          type: "directory",
        };
        directories.get(parentPath)?.children?.push(directoryNode);
        directories.set(currentPath, directoryNode);
      }

      parentPath = currentPath;
    }

    directories.get(parentPath)?.children?.push({
      extension: file.extension,
      language: file.language,
      lines_of_code: file.linesOfCode,
      name: parts.at(-1),
      path: file.path,
      type: "file",
    });
  }

  sortTree(root);
  return root;
};

export const detectLanguagesInScope = (
  files: DiscoveredRepositoryFile[],
): string[] =>
  [
    ...new Set(files.flatMap((file) => (file.language ? [file.language] : []))),
  ].sort();

export const shouldIncludeScopedFile = (
  filePath: string,
  scope: AnalysisScope,
): boolean => {
  const normalizedFilePath = normalizeRelativePath(filePath);
  const included =
    scope.includePatterns.length === 0 ||
    scope.includePatterns.some((pattern) =>
      path.matchesGlob(normalizedFilePath, pattern),
    );

  if (!included) {
    return false;
  }

  if (
    scope.excludePatterns.some((pattern) =>
      path.matchesGlob(normalizedFilePath, pattern),
    )
  ) {
    return false;
  }

  if (scope.focusDirs.length === 0) {
    return true;
  }

  return scope.focusDirs.some((focusDir) =>
    isWithinFocusDir(normalizedFilePath, focusDir),
  );
};

export const normalizeRelativePath = (value: string): string =>
  value.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");

export const inferLanguageFromPath = (filePath: string): string | null =>
  LANGUAGE_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? null;

const walkDirectory = async (
  repoPath: string,
  directoryPath: string,
  scope: AnalysisScope,
): Promise<DiscoveredRepositoryFile[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files: DiscoveredRepositoryFile[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    const relativePath = normalizeRelativePath(
      path.relative(repoPath, absolutePath),
    );

    if (entry.isDirectory()) {
      if (DEFAULT_IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(...(await walkDirectory(repoPath, absolutePath, scope)));
      continue;
    }

    if (!entry.isFile() || !shouldIncludeScopedFile(relativePath, scope)) {
      continue;
    }

    const language = inferLanguageFromPath(relativePath);
    files.push({
      absolutePath,
      extension: path.extname(entry.name).toLowerCase(),
      language,
      linesOfCode: await countLines(absolutePath),
      path: relativePath,
      supportedByNative:
        language !== null && NATIVE_ANALYZABLE_LANGUAGES.has(language),
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
};

const countLines = async (filePath: string): Promise<number> => {
  try {
    const contents = await readFile(filePath, "utf8");
    if (contents.length === 0) {
      return 0;
    }

    const lines = contents.split(/\r?\n/u);
    return lines.at(-1) === "" ? lines.length - 1 : lines.length;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ERR_INVALID_CHAR"
    ) {
      return 0;
    }

    if (
      error instanceof Error &&
      "name" in error &&
      error.name === "AbortError"
    ) {
      return 0;
    }

    try {
      await readFile(filePath);
      return 0;
    } catch {
      return 0;
    }
  }
};

const isWithinFocusDir = (filePath: string, focusDir: string): boolean => {
  const normalizedFocusDir = normalizeRelativePath(focusDir);

  if (normalizedFocusDir.length === 0) {
    return true;
  }

  return (
    filePath === normalizedFocusDir ||
    filePath.startsWith(`${normalizedFocusDir}/`)
  );
};

const sortTree = (node: RawFileTreeNode): void => {
  if (!node.children) {
    return;
  }

  node.children.sort((left, right) => {
    const leftIsDirectory = left.type === "directory";
    const rightIsDirectory = right.type === "directory";

    if (leftIsDirectory !== rightIsDirectory) {
      return leftIsDirectory ? -1 : 1;
    }

    return (left.name ?? "").localeCompare(right.name ?? "");
  });

  for (const child of node.children) {
    sortTree(child);
  }
};
