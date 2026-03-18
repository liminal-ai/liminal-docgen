import { readFile } from "node:fs/promises";
import path from "node:path";

import { moduleTreeSchema } from "../../contracts/validation.js";
import type {
  ModuleTree,
  ModuleTreeEntry,
  ValidationFinding,
} from "../../types/index.js";
import { STRUCTURAL_FILES } from "../../types/validation.js";
import { listMarkdownFiles, normalizePath, pathExists } from "./shared.js";

const MODULE_TREE_FILE_NAME = "module-tree.json";

export const checkModuleTree = async (
  outputPath: string,
): Promise<ValidationFinding[]> => {
  const moduleTreePath = path.join(outputPath, MODULE_TREE_FILE_NAME);

  if (!(await pathExists(moduleTreePath))) {
    return [];
  }

  const rawModuleTree = await readFile(moduleTreePath, "utf8");
  let parsedModuleTree: unknown;

  try {
    parsedModuleTree = JSON.parse(rawModuleTree);
  } catch {
    return [
      {
        category: "module-tree",
        filePath: moduleTreePath,
        message: `Invalid JSON in module tree file at ${moduleTreePath}`,
        severity: "error",
      },
    ];
  }

  const moduleTreeResult = moduleTreeSchema.safeParse(parsedModuleTree);

  if (!moduleTreeResult.success) {
    const issue = moduleTreeResult.error.issues[0];
    const field = issue?.path.length ? issue.path.join(".") : "module-tree";

    return [
      {
        category: "module-tree",
        filePath: moduleTreePath,
        message: `Invalid module tree at ${moduleTreePath}: ${field}: ${issue?.message ?? "module tree does not match the expected shape"}`,
        severity: "error",
      },
    ];
  }

  const treePages = collectTreePages(moduleTreeResult.data);
  const markdownFiles = await listMarkdownFiles(outputPath);
  const actualPages = markdownFiles.map((filePath) =>
    normalizePath(path.relative(outputPath, filePath)),
  );
  const actualPageSet = new Set(actualPages);
  const findings: ValidationFinding[] = [];

  for (const page of [...treePages].sort()) {
    if (actualPageSet.has(page)) {
      continue;
    }

    findings.push({
      category: "module-tree",
      filePath: path.join(outputPath, page),
      message: `Module tree references a page that does not exist: ${page}`,
      severity: "error",
    });
  }

  for (const page of [...actualPages].sort()) {
    if (treePages.has(page) || STRUCTURAL_FILES.has(page)) {
      continue;
    }

    findings.push({
      category: "module-tree",
      filePath: path.join(outputPath, page),
      message: `Markdown page is not referenced by module-tree.json: ${page}`,
      severity: "warning",
    });
  }

  return findings;
};

const collectTreePages = (moduleTree: ModuleTree): Set<string> => {
  const pages = new Set<string>();

  for (const entry of moduleTree) {
    collectEntryPages(entry, pages);
  }

  return pages;
};

const collectEntryPages = (
  entry: ModuleTreeEntry,
  pages: Set<string>,
): void => {
  pages.add(normalizePath(entry.page));

  for (const child of entry.children ?? []) {
    collectEntryPages(child, pages);
  }
};
