import type { RepositoryAnalysis } from "../types/analysis.js";

export const buildClusteringPrompt = (
  analysis: RepositoryAnalysis,
): { systemPrompt: string; userMessage: string } => {
  const systemPrompt = `
You are planning documentation modules for a source repository.

Cluster repository components into logical modules using:
- file path and directory structure
- exported symbols and their likely responsibility
- relationships between components such as imports, usage, inheritance, and composition

Return a ModulePlan JSON object with:
- modules: array of modules with name, description, and components
- unmappedComponents: array of component file paths that do not clearly belong in a module

Rules:
- Every component must appear exactly once, either in one module's components array or in unmappedComponents
- Do not place the same component in multiple modules
- Do not emit empty modules
- Module names must be concise, descriptive, and unique
- Prefer stable, human-readable groupings that would make sense as wiki sections
  `.trim();

  const componentsSection = Object.entries(analysis.components)
    .sort()
    .map(([componentPath, component]) => {
      const exportedSymbols =
        component.exportedSymbols.length === 0
          ? "none"
          : component.exportedSymbols
              .toSorted((left, right) => left.lineNumber - right.lineNumber)
              .map(
                (symbol) =>
                  `${symbol.name}:${symbol.kind}@${symbol.lineNumber}`,
              )
              .join(", ");

      return `- ${componentPath} | ${component.linesOfCode} LOC | exports: ${exportedSymbols}`;
    })
    .join("\n");

  const relationshipsSection =
    analysis.relationships.length === 0
      ? "- none"
      : analysis.relationships
          .toSorted((left, right) =>
            `${left.source}:${left.type}:${left.target}`.localeCompare(
              `${right.source}:${right.type}:${right.target}`,
            ),
          )
          .map(
            (relationship) =>
              `- ${relationship.source} -> ${relationship.target} (${relationship.type})`,
          )
          .join("\n");

  const focusDirsSection =
    analysis.focusDirs.length === 0
      ? "Focus directories: none"
      : `Focus directories: ${analysis.focusDirs.toSorted().join(", ")}`;

  const userMessage = `
Repository path: ${analysis.repoPath}
Commit: ${analysis.commitHash}
${focusDirsSection}

Components:
${componentsSection}

Relationship graph:
${relationshipsSection}
  `.trim();

  return { systemPrompt, userMessage };
};
