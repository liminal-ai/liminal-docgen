import type { DiscoveredRepositoryFile } from "./file-discovery.js";
import { buildScopedFileTree } from "./file-discovery.js";
import type { AnalysisExecutionPlan } from "./provider.js";
import type {
  RawAnalysisFile,
  RawAnalysisOutput,
  RawCallRelationship,
  RawNode,
} from "./raw-output.js";

export const mergeRawAnalysisOutputs = (
  repoPath: string,
  scopedFiles: DiscoveredRepositoryFile[],
  executionPlan: AnalysisExecutionPlan,
  outputs: RawAnalysisOutput[],
): RawAnalysisOutput => {
  return {
    file_tree: buildScopedFileTree(repoPath, scopedFiles),
    functions: deduplicateNodes(outputs.flatMap((output) => output.functions)),
    relationships: deduplicateRelationships(
      outputs.flatMap((output) => output.relationships),
    ),
    summary: {
      files: buildSummaryFiles(scopedFiles, executionPlan),
      files_analyzed:
        executionPlan.nativeFiles.length +
        executionPlan.pythonFallbackFiles.length,
      languages_found: [
        ...new Set(
          [
            ...executionPlan.nativeFiles,
            ...executionPlan.pythonFallbackFiles,
          ].flatMap((file) => (file.language ? [file.language] : [])),
        ),
      ].sort(),
      total_files: scopedFiles.length,
      unsupported_files: buildUnsupportedFiles(scopedFiles, executionPlan),
    },
  };
};

const deduplicateNodes = (nodes: RawNode[]): RawNode[] => {
  const byId = new Map(nodes.map((node) => [node.id, node] as const));

  return [...byId.values()].sort(compareRawNodes);
};

const deduplicateRelationships = (
  relationships: RawCallRelationship[],
): RawCallRelationship[] => {
  const byKey = new Map(
    relationships.map((relationship) => [
      getRelationshipKey(relationship),
      relationship,
    ]),
  );

  return [...byKey.values()].sort(compareRelationships);
};

const buildSummaryFiles = (
  scopedFiles: DiscoveredRepositoryFile[],
  executionPlan: AnalysisExecutionPlan,
): RawAnalysisFile[] => {
  const executableFiles = new Set(
    [...executionPlan.nativeFiles, ...executionPlan.pythonFallbackFiles].map(
      (file) => file.path,
    ),
  );

  return scopedFiles
    .filter((file) => file.language !== null)
    .map((file) => ({
      language: file.language,
      lines_of_code: file.linesOfCode,
      path: file.path,
      supported: executableFiles.has(file.path),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
};

const buildUnsupportedFiles = (
  scopedFiles: DiscoveredRepositoryFile[],
  executionPlan: AnalysisExecutionPlan,
): RawAnalysisFile[] => {
  const executableFiles = new Set(
    [...executionPlan.nativeFiles, ...executionPlan.pythonFallbackFiles].map(
      (file) => file.path,
    ),
  );

  return scopedFiles
    .filter((file) => file.language !== null && !executableFiles.has(file.path))
    .map((file) => ({
      language: file.language,
      lines_of_code: file.linesOfCode,
      path: file.path,
      supported: false,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
};

const getRelationshipKey = (relationship: RawCallRelationship): string =>
  `${relationship.caller}:${relationship.callee}:${relationship.is_resolved}:${relationship.call_line ?? ""}`;

const compareRawNodes = (left: RawNode, right: RawNode): number =>
  left.file_path.localeCompare(right.file_path) ||
  left.start_line - right.start_line ||
  left.name.localeCompare(right.name);

const compareRelationships = (
  left: RawCallRelationship,
  right: RawCallRelationship,
): number =>
  left.caller.localeCompare(right.caller) ||
  left.callee.localeCompare(right.callee) ||
  (left.call_line ?? 0) - (right.call_line ?? 0);
