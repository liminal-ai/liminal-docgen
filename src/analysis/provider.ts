import type { DiscoveredRepositoryFile } from "./file-discovery.js";

export interface AnalysisExecutionPlan {
  nativeFiles: DiscoveredRepositoryFile[];
  pythonFallbackFiles: DiscoveredRepositoryFile[];
  requiresPython: boolean;
  scopedFiles: DiscoveredRepositoryFile[];
}

export const buildAnalysisExecutionPlan = (
  scopedFiles: DiscoveredRepositoryFile[],
): AnalysisExecutionPlan => {
  const nativeFiles = scopedFiles.filter((file) => file.supportedByNative);
  const pythonFallbackFiles = scopedFiles.filter(
    (file) => file.language === "python",
  );

  return {
    nativeFiles,
    pythonFallbackFiles,
    requiresPython: pythonFallbackFiles.length > 0,
    scopedFiles,
  };
};

export const shouldRequirePythonForScope = (
  scopedFiles: DiscoveredRepositoryFile[],
): boolean => buildAnalysisExecutionPlan(scopedFiles).requiresPython;

export const getPythonParserLanguagesForScope = (
  scopedFiles: DiscoveredRepositoryFile[],
): string[] =>
  buildAnalysisExecutionPlan(scopedFiles).requiresPython ? ["python"] : [];

export const getPythonFallbackRelativePaths = (
  plan: AnalysisExecutionPlan,
): string[] => plan.pythonFallbackFiles.map((file) => file.path).sort();
