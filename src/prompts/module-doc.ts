import type { RepositoryAnalysis } from "../types/analysis.js";
import type { ModulePlan, PlannedModule } from "../types/planning.js";

export const buildModuleDocPrompt = (
  module: PlannedModule,
  modulePlan: ModulePlan,
  analysis: RepositoryAnalysis,
): { systemPrompt: string; userMessage: string } => {
  const moduleComponentSet = new Set(module.components);
  const moduleLookup = new Map(
    modulePlan.modules.map((plannedModule) => [
      plannedModule.name,
      new Set(plannedModule.components),
    ]),
  );
  const dependsOn = new Set<string>();
  const dependedOnBy = new Set<string>();
  const relationshipDetails: string[] = [];

  for (const relationship of analysis.relationships) {
    const sourceInModule = moduleComponentSet.has(relationship.source);
    const targetInModule = moduleComponentSet.has(relationship.target);

    if (!sourceInModule && !targetInModule) {
      continue;
    }

    for (const plannedModule of modulePlan.modules) {
      if (plannedModule.name === module.name) {
        continue;
      }

      const plannedComponentSet = moduleLookup.get(plannedModule.name);

      if (!plannedComponentSet) {
        continue;
      }

      if (sourceInModule && plannedComponentSet.has(relationship.target)) {
        dependsOn.add(plannedModule.name);
        relationshipDetails.push(
          `${relationship.source} -> ${relationship.target} (${relationship.type})`,
        );
      }

      if (targetInModule && plannedComponentSet.has(relationship.source)) {
        dependedOnBy.add(plannedModule.name);
        relationshipDetails.push(
          `${relationship.source} -> ${relationship.target} (${relationship.type})`,
        );
      }
    }
  }

  const systemPrompt = `
You are generating a wiki page for one repository module.

Write a concise markdown document that:
- explains the module's purpose and responsibilities
- references the concrete component file paths that belong to the module
- mentions important dependencies on other modules where relevant
- uses stable headings and clean markdown suitable for repository documentation

Return structured output with:
- pageContent: the markdown page
- title: a short page title
- crossLinks: related module names worth linking to
  `.trim();

  const componentSection =
    module.components.length === 0
      ? "- none"
      : module.components
          .map((componentPath) => {
            const component = analysis.components[componentPath];
            const exportsList = component?.exportedSymbols.length
              ? component.exportedSymbols
                  .toSorted((left, right) => left.lineNumber - right.lineNumber)
                  .map((symbol) => `${symbol.name}:${symbol.kind}`)
                  .join(", ")
              : "none";

            return `- ${componentPath} | ${component?.linesOfCode ?? 0} LOC | exports: ${exportsList}`;
          })
          .join("\n");

  const userMessage = `
Repository path: ${analysis.repoPath}
Module name: ${module.name}
Module description: ${module.description}
Focus directories: ${analysis.focusDirs.length > 0 ? analysis.focusDirs.toSorted().join(", ") : "none"}
Repository summary: ${analysis.summary.totalComponents} components, ${analysis.summary.totalRelationships} relationships, languages ${analysis.summary.languagesFound.toSorted().join(", ")}

Components:
${componentSection}

Cross-module context:
- Depends on modules: ${dependsOn.size > 0 ? [...dependsOn].toSorted().join(", ") : "none"}
- Depended on by modules: ${dependedOnBy.size > 0 ? [...dependedOnBy].toSorted().join(", ") : "none"}
- Relationship details: ${relationshipDetails.length > 0 ? [...new Set(relationshipDetails)].sort().join("; ") : "none"}
- Unmapped components nearby: ${modulePlan.unmappedComponents.length > 0 ? modulePlan.unmappedComponents.toSorted().join(", ") : "none"}
  `.trim();

  return { systemPrompt, userMessage };
};
