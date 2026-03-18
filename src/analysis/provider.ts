import type { ResolvedConfiguration } from "../types/index.js";
import type { DiscoveredRepositoryFile } from "./file-discovery.js";

export type AnalysisProviderKind = "native-typescript" | "python";

export interface AnalysisProviderSelection {
  kind: AnalysisProviderKind;
  scopedFiles: DiscoveredRepositoryFile[];
}

export const selectAnalysisProvider = (
  scopedFiles: DiscoveredRepositoryFile[],
): AnalysisProviderSelection => ({
  kind: scopedFiles.some((file) => file.language === "python")
    ? "python"
    : "native-typescript",
  scopedFiles,
});

export const shouldRequirePythonForScope = (
  scopedFiles: DiscoveredRepositoryFile[],
): boolean => selectAnalysisProvider(scopedFiles).kind === "python";

export const getPythonScopedConfiguration = (
  config: ResolvedConfiguration,
): ResolvedConfiguration => ({
  ...config,
  includePatterns:
    config.focusDirs.length === 0
      ? [...config.includePatterns]
      : [
          ...config.includePatterns,
          ...config.focusDirs.map((focusDir) => `${focusDir}/**`),
        ],
});
