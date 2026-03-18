import {
  createDiscoveryScope,
  detectLanguagesInScope,
  discoverRepositoryFiles,
} from "../analysis/file-discovery.js";
import type { EnvironmentCheckRequest } from "../types/index.js";

export const detectLanguages = async (
  repoPath: string,
  request: Pick<
    EnvironmentCheckRequest,
    "excludePatterns" | "focusDirs" | "includePatterns"
  > = {},
): Promise<string[]> => {
  const files = await discoverRepositoryFiles(
    repoPath,
    createDiscoveryScope(request),
  );

  return detectLanguagesInScope(files);
};
