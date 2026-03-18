import { analyzeRepository } from "../../analysis/analyze.js";
import type {
  EngineResult,
  RepositoryAnalysis,
  ResolvedRunConfig,
} from "../../types/index.js";

export const runStructuralAnalysis = async (
  config: ResolvedRunConfig,
): Promise<EngineResult<RepositoryAnalysis>> =>
  analyzeRepository({
    excludePatterns: config.excludePatterns,
    focusDirs: config.focusDirs,
    includePatterns: config.includePatterns,
    repoPath: config.repoPath,
  });
