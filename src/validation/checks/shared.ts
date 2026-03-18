import { access, readdir } from "node:fs/promises";
import path from "node:path";

export const pathExists = async (candidatePath: string): Promise<boolean> => {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
};

export const listMarkdownFiles = async (
  outputPath: string,
): Promise<string[]> => {
  const files = await walkFiles(outputPath);

  return files.filter((filePath) => filePath.endsWith(".md"));
};

export const normalizePath = (value: string): string =>
  value.split(path.sep).join("/");

const walkFiles = async (directoryPath: string): Promise<string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const sortedEntries = [...entries].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const files: string[] = [];

  for (const entry of sortedEntries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
};
