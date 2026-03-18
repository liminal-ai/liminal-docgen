import path from "node:path";
import { LANGUAGE_BY_EXTENSION } from "../languages.js";
import type {
  AnalysisSummary,
  AnalyzedComponent,
  AnalyzedRelationship,
  ExportedSymbol,
  ResolvedConfiguration,
} from "../types/index.js";
import {
  createDiscoveryScope,
  normalizeRelativePath,
  shouldIncludeScopedFile,
} from "./file-discovery.js";
import type {
  RawAnalysisFile,
  RawAnalysisOutput,
  RawFileTreeNode,
} from "./raw-output.js";

export interface NormalizedAnalysis {
  summary: AnalysisSummary;
  components: Record<string, AnalyzedComponent>;
  relationships: AnalyzedRelationship[];
  focusDirs: string[];
}

export const normalize = (
  raw: RawAnalysisOutput,
  config: ResolvedConfiguration,
): NormalizedAnalysis => {
  const allFileMetadata = collectFileMetadata(raw);
  const filteredFileMetadata = new Map(
    [...allFileMetadata.entries()].filter(([filePath]) =>
      shouldIncludeFile(filePath, config),
    ),
  );
  const filteredNodes = raw.functions.filter((node) =>
    shouldIncludeFile(node.file_path, config),
  );

  for (const node of filteredNodes) {
    const filePath = normalizeFilePath(node.file_path);
    const metadata = filteredFileMetadata.get(filePath);
    const inferredLanguage = inferLanguage(filePath);

    filteredFileMetadata.set(filePath, {
      filePath,
      language: metadata?.language ?? inferredLanguage,
      linesOfCode: Math.max(metadata?.linesOfCode ?? 0, node.end_line),
      supported: metadata?.supported ?? inferredLanguage !== null,
    });
  }

  const languagesSkipped = getLanguagesSkipped(filteredFileMetadata);
  const skippedLanguageSet = new Set(languagesSkipped);
  const componentPaths = [...filteredFileMetadata.entries()]
    .filter(([, metadata]) => isAnalyzableFile(metadata, skippedLanguageSet))
    .map(([filePath]) => filePath)
    .sort();

  const componentPathSet = new Set(componentPaths);
  const nodesByFile = new Map<string, ExportedSymbol[]>();

  for (const node of filteredNodes) {
    const filePath = normalizeFilePath(node.file_path);

    if (!componentPathSet.has(filePath)) {
      continue;
    }

    const symbols = nodesByFile.get(filePath) ?? [];
    symbols.push({
      kind: mapExportKind(node.component_type, node.name),
      lineNumber: node.start_line,
      name: node.name,
    });
    nodesByFile.set(filePath, symbols);
  }

  const components = Object.fromEntries(
    componentPaths.map((filePath) => {
      const metadata = filteredFileMetadata.get(filePath);

      return [
        filePath,
        {
          exportedSymbols: deduplicateSymbols(nodesByFile.get(filePath) ?? []),
          filePath,
          language: metadata?.language ?? inferLanguage(filePath) ?? "other",
          linesOfCode: metadata?.linesOfCode ?? 0,
        } satisfies AnalyzedComponent,
      ];
    }),
  );

  const relationships = buildRelationships(
    filteredNodes,
    raw.relationships,
    componentPathSet,
  );
  const languagesFound = getLanguagesFound(components);

  return {
    components,
    focusDirs: [...config.focusDirs],
    relationships,
    summary: {
      languagesFound,
      languagesSkipped,
      totalComponents: componentPaths.length,
      totalFilesAnalyzed: componentPaths.length,
      totalRelationships: relationships.length,
    } satisfies AnalysisSummary,
  };
};

interface FileMetadata {
  filePath: string;
  language: string | null;
  linesOfCode: number;
  supported: boolean;
}

const collectFileMetadata = (
  raw: RawAnalysisOutput,
): Map<string, FileMetadata> => {
  const metadataByFile = new Map<string, FileMetadata>();

  for (const file of raw.summary.files ?? []) {
    mergeFileMetadata(metadataByFile, toFileMetadata(file));
  }

  for (const file of raw.summary.unsupported_files ?? []) {
    const metadata = toFileMetadata(file, { supported: false });
    mergeFileMetadata(metadataByFile, metadata);
  }

  collectFileMetadataFromTree(raw.file_tree, metadataByFile);

  for (const node of raw.functions) {
    mergeFileMetadata(metadataByFile, {
      filePath: normalizeFilePath(node.file_path),
      language: inferLanguage(node.file_path),
      linesOfCode: node.end_line,
      supported: true,
    });
  }

  return metadataByFile;
};

const collectFileMetadataFromTree = (
  node: RawFileTreeNode | undefined,
  metadataByFile: Map<string, FileMetadata>,
): void => {
  if (!node) {
    return;
  }

  if (node.type === "file" && typeof node.path === "string") {
    mergeFileMetadata(metadataByFile, {
      filePath: normalizeFilePath(node.path),
      language:
        typeof node.language === "string"
          ? node.language
          : inferLanguage(node.path),
      linesOfCode:
        typeof node.lines_of_code === "number" ? node.lines_of_code : 0,
      supported: true,
    });
  }

  for (const child of node.children ?? []) {
    collectFileMetadataFromTree(child, metadataByFile);
  }
};

const mergeFileMetadata = (
  metadataByFile: Map<string, FileMetadata>,
  incoming: FileMetadata | null,
): void => {
  if (!incoming) {
    return;
  }

  const existing = metadataByFile.get(incoming.filePath);

  if (!existing) {
    metadataByFile.set(incoming.filePath, incoming);
    return;
  }

  metadataByFile.set(incoming.filePath, {
    filePath: incoming.filePath,
    language: existing.language ?? incoming.language,
    linesOfCode: Math.max(existing.linesOfCode, incoming.linesOfCode),
    supported: existing.supported && incoming.supported,
  });
};

const toFileMetadata = (
  value: string | RawAnalysisFile,
  overrides: Partial<FileMetadata> = {},
): FileMetadata | null => {
  if (typeof value === "string") {
    return {
      filePath: normalizeFilePath(value),
      language: inferLanguage(value),
      linesOfCode: 0,
      supported: overrides.supported ?? true,
      ...overrides,
    };
  }

  const normalizedPath = normalizeFilePath(value.path);

  return {
    filePath: normalizedPath,
    language: value.language ?? inferLanguage(normalizedPath),
    linesOfCode: value.lines_of_code ?? 0,
    supported: value.supported ?? overrides.supported ?? true,
    ...overrides,
  };
};

const buildRelationships = (
  nodes: RawAnalysisOutput["functions"],
  rawRelationships: RawAnalysisOutput["relationships"],
  componentPathSet: Set<string>,
): AnalyzedRelationship[] => {
  const nodeToFilePath = new Map(
    nodes.map((node) => [node.id, normalizeFilePath(node.file_path)]),
  );
  const relationships = new Map<string, AnalyzedRelationship>();

  for (const node of nodes) {
    const sourcePath = normalizeFilePath(node.file_path);

    if (!componentPathSet.has(sourcePath)) {
      continue;
    }

    for (const dependency of node.depends_on) {
      const targetPath = resolveRelationshipTarget(
        dependency,
        nodeToFilePath,
        componentPathSet,
      );

      if (!targetPath || targetPath === sourcePath) {
        continue;
      }

      relationships.set(getRelationshipKey(sourcePath, targetPath), {
        source: sourcePath,
        target: targetPath,
        type: "import",
      });
    }
  }

  for (const relationship of rawRelationships) {
    const sourcePath = resolveRelationshipTarget(
      relationship.caller,
      nodeToFilePath,
      componentPathSet,
    );
    const targetPath = resolveRelationshipTarget(
      relationship.callee,
      nodeToFilePath,
      componentPathSet,
    );

    if (!sourcePath || !targetPath || sourcePath === targetPath) {
      continue;
    }

    const key = getRelationshipKey(sourcePath, targetPath);

    if (!relationships.has(key)) {
      relationships.set(key, {
        source: sourcePath,
        target: targetPath,
        type: "usage",
      });
    }
  }

  return [...relationships.values()].sort(compareRelationships);
};

const getLanguagesFound = (
  components: Record<string, AnalyzedComponent>,
): string[] =>
  uniqueSorted(
    Object.values(components).map((component) => component.language),
  );

const getLanguagesSkipped = (
  metadataByFile: Map<string, FileMetadata>,
): string[] => {
  const unsupportedLanguages = new Set<string>();

  for (const metadata of metadataByFile.values()) {
    if (!metadata.supported && metadata.language) {
      unsupportedLanguages.add(metadata.language);
    }
  }

  return [...unsupportedLanguages].sort();
};

const isAnalyzableFile = (
  metadata: FileMetadata,
  skippedLanguageSet: Set<string>,
): boolean =>
  metadata.supported &&
  metadata.language !== null &&
  !skippedLanguageSet.has(metadata.language);

// Authoritative include/exclude filtering layer. The Python script also receives
// these patterns for early pruning, but the normalizer re-filters because it is
// deterministic, testable in TypeScript, and guarantees correctness regardless
// of upstream behavior.
const shouldIncludeFile = (
  filePath: string,
  config: ResolvedConfiguration,
): boolean => {
  return shouldIncludeScopedFile(
    normalizeFilePath(filePath),
    createDiscoveryScope(config),
  );
};

const resolveRelationshipTarget = (
  candidate: string,
  nodeToFilePath: Map<string, string>,
  componentPathSet: Set<string>,
): string | null => {
  const nodeMatch = nodeToFilePath.get(candidate);

  if (nodeMatch && componentPathSet.has(nodeMatch)) {
    return nodeMatch;
  }

  const normalizedPath = normalizeFilePath(candidate);
  return componentPathSet.has(normalizedPath) ? normalizedPath : null;
};

const mapExportKind = (
  componentType: string,
  _symbolName: string,
): ExportedSymbol["kind"] => {
  switch (componentType) {
    case "function":
    case "method":
      return "function";
    case "class":
      return "class";
    case "interface":
      return "interface";
    case "type_alias":
      return "type";
    case "enum":
      return "enum";
    case "variable":
      return "variable";
    case "constant":
      return "constant";
    default:
      return "other";
  }
};

const deduplicateSymbols = (symbols: ExportedSymbol[]): ExportedSymbol[] => {
  const deduplicated = new Map<string, ExportedSymbol>();

  for (const symbol of symbols) {
    const key = `${symbol.name}:${symbol.kind}:${symbol.lineNumber}`;

    if (!deduplicated.has(key)) {
      deduplicated.set(key, symbol);
    }
  }

  return [...deduplicated.values()].sort(compareSymbols);
};

const compareSymbols = (left: ExportedSymbol, right: ExportedSymbol): number =>
  left.lineNumber - right.lineNumber || left.name.localeCompare(right.name);

const compareRelationships = (
  left: AnalyzedRelationship,
  right: AnalyzedRelationship,
): number =>
  left.source.localeCompare(right.source) ||
  left.target.localeCompare(right.target) ||
  left.type.localeCompare(right.type);

const getRelationshipKey = (source: string, target: string): string =>
  `${source}->${target}`;

const uniqueSorted = (values: string[]): string[] =>
  [...new Set(values)].sort();

const normalizeFilePath = (filePath: string): string =>
  normalizeRelativePath(filePath);

const inferLanguage = (filePath: string): string | null => {
  const extension = path.extname(filePath).toLowerCase();
  return LANGUAGE_BY_EXTENSION[extension] ?? null;
};
