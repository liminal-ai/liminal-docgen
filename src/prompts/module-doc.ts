import {
  type ModuleDocumentationFacts,
  type ModuleDocumentationSelection,
  summarizeEntityCandidatesForPrompt,
} from "../orchestration/module-doc-packet.js";
import type { RepositoryAnalysis } from "../types/analysis.js";
import type { ModulePlan, PlannedModule } from "../types/planning.js";

export const buildModuleDocPrompt = (
  module: PlannedModule,
  modulePlan: ModulePlan,
  analysis: RepositoryAnalysis,
  selection: ModuleDocumentationSelection,
  facts: ModuleDocumentationFacts,
): { systemPrompt: string; userMessage: string } => {
  const systemPrompt = `
You are generating a wiki page for one repository module.

Return grounded structured output for the module.

You may improve clarity and wording, but you must stay within the analyzer-backed entities, relationships, and flow candidates provided.
Do not invent classes, functions, interfaces, collaborators, or runtime flows that are not supported by the supplied context.

For packetMode:
- use "full-packet" only when the supplied context supports both a meaningful structural view and a meaningful representative flow
- otherwise use "summary-only"
- if you choose "full-packet", you must provide a non-empty structureDiagram, entityTable, sequenceDiagram, and flowNotes
- if a meaningful sequence diagram is not possible, you must return "summary-only"

For structureDiagram:
- use Mermaid classDiagram when the class/interface/type shape is the clearest view
- otherwise use a Mermaid flowchart-style structural dependency view
- keep the diagram readable and scoped to the module

For sequenceDiagram:
- only include it when packetMode is "full-packet" and there is a meaningful runtime/control flow
- keep it at the same abstraction level as the structure diagram

Return structured output with:
- title
- crossLinks
- packetMode
- overview
- responsibilities
- structureDiagramKind
- structureDiagram
- entityTable
- sequenceDiagram
- flowNotes
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
Packet recommendation:
- recommended packet mode: ${selection.packetMode}
- recommended structure diagram kind: ${selection.preferredStructureDiagramKind}
- recommend sequence diagram: ${selection.recommendSequenceDiagram ? "yes" : "no"}
- reason: ${selection.selectionReason}
- structure score: ${selection.structureScore}
- flow score: ${selection.flowScore}
- conservative mode: ${selection.conservativeMode ? "yes" : "no"}
${selection.downgradeReason ? `- downgrade reason: ${selection.downgradeReason}` : ""}

Components:
${componentSection}

Cross-module context:
- Internal relationships: ${facts.internalRelationships.length > 0 ? facts.internalRelationships.join("; ") : "none"}
- Cross-module relationships: ${facts.crossModuleRelationships.length > 0 ? facts.crossModuleRelationships.join("; ") : "none"}
- Unmapped components nearby: ${modulePlan.unmappedComponents.length > 0 ? modulePlan.unmappedComponents.toSorted().join(", ") : "none"}

Entity candidates:
${summarizeEntityCandidatesForPrompt(facts.entityCandidates)}

Flow candidates:
${facts.flowCandidates.length > 0 ? facts.flowCandidates.map((candidate) => `- ${candidate.actor} -> ${candidate.target} | ${candidate.action} | ${candidate.output}`).join("\n") : "- none"}
  `.trim();

  return { systemPrompt, userMessage };
};
