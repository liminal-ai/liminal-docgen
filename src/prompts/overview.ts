import type { RepositoryAnalysis } from "../types/analysis.js";
import type { GeneratedModuleSet } from "../types/generation.js";
import type { ModulePlan } from "../types/planning.js";

export const buildOverviewPrompt = (
  modulePlan: ModulePlan,
  generatedModules: GeneratedModuleSet,
  analysis: RepositoryAnalysis,
): { systemPrompt: string; userMessage: string } => {
  const systemPrompt = `
You are generating the top-level repository overview for a documentation wiki.

Write markdown that:
- summarizes the repository structure at a high level
- names each planned module and its responsibility
- includes at least one Mermaid diagram that represents the module structure
- links readers to the module pages as the next step

Return structured output with:
- content: the full markdown document
- mermaidDiagram: the Mermaid diagram source only
  `.trim();

  const moduleSection = modulePlan.modules
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .map((module) => {
      const generatedPage = generatedModules.get(module.name);
      const summaryLine = generatedPage?.content
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .find((line) => line.length > 0 && !line.startsWith("#"));

      return [
        `- ${module.name}`,
        `  description: ${module.description}`,
        `  page: ${generatedPage?.fileName ?? "not-generated"}`,
        `  summary: ${summaryLine ?? "No module page summary available."}`,
      ].join("\n");
    })
    .join("\n");

  const relationshipSection =
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

  const userMessage = `
Repository path: ${analysis.repoPath}
Commit: ${analysis.commitHash}
Summary: ${analysis.summary.totalComponents} components, ${analysis.summary.totalRelationships} relationships, ${analysis.summary.totalFilesAnalyzed} files analyzed

Modules:
${moduleSection}

Relationships:
${relationshipSection}
  `.trim();

  return { systemPrompt, userMessage };
};
