import { isTreeSitterLanguageAvailable } from "../adapters/python.js";
import type { EnvironmentCheckFinding } from "../types/index.js";

export const checkParsers = async (
  languages: string[],
): Promise<EnvironmentCheckFinding[]> => {
  const findings: EnvironmentCheckFinding[] = [];

  for (const language of [...new Set(languages)].sort()) {
    const requirement = PARSER_REQUIREMENTS[language];

    if (!requirement) {
      continue;
    }

    if (await isTreeSitterLanguageAvailable(language)) {
      continue;
    }

    findings.push({
      category: "missing-dependency",
      dependencyName: requirement.dependencyName,
      message: `${language} parser is not available: ${requirement.dependencyName}`,
      severity: "warning",
    });
  }

  return findings;
};

const PARSER_REQUIREMENTS: Record<
  string,
  {
    dependencyName: string;
  }
> = {
  javascript: {
    dependencyName: "tree-sitter-javascript",
  },
  python: {
    dependencyName: "tree-sitter-python",
  },
  typescript: {
    dependencyName: "tree-sitter-typescript",
  },
};
