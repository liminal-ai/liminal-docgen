import type { RepositoryAnalysis } from "../types/analysis.js";
import type {
  ModuleDocumentationPacketMode,
  ModuleEntitySummary,
  ModuleFlowNote,
  ModuleGenerationResult,
  ModuleStructureDiagramKind,
} from "../types/generation.js";
import type { ModulePlan, PlannedModule } from "../types/planning.js";

const HIGH_VALUE_MODULE_NAME_PATTERNS = [
  /\banalysis\b/u,
  /\borchestration\b/u,
  /\bupdate\b/u,
  /\bpublish\b/u,
  /\binference\b/u,
  /\bvalidation\b/u,
  /\breview\b/u,
];

export interface ModuleDocumentationSelection {
  packetMode: ModuleDocumentationPacketMode;
  preferredStructureDiagramKind: ModuleStructureDiagramKind;
  recommendSequenceDiagram: boolean;
  selectionReason: string;
}

export interface ModuleDocumentationFacts {
  module: PlannedModule;
  internalRelationships: string[];
  crossModuleRelationships: string[];
  entityCandidates: ModuleEntityCandidate[];
  flowCandidates: ModuleFlowCandidate[];
  sourceCoverage: string[];
}

export interface ModuleEntityCandidate {
  name: string;
  kind: string;
  filePath: string;
  publicEntrypoints: string[];
  dependsOn: string[];
  usedBy: string[];
}

export interface ModuleFlowCandidate {
  actor: string;
  action: string;
  output: string;
  target: string;
}

export const selectModuleDocumentationPacket = (
  module: PlannedModule,
  _modulePlan: ModulePlan,
  analysis: RepositoryAnalysis,
): ModuleDocumentationSelection => {
  const moduleRelationshipCount = analysis.relationships.filter(
    (relationship) =>
      module.components.includes(relationship.source) ||
      module.components.includes(relationship.target),
  ).length;
  const exportedEntityCount = module.components.reduce(
    (total, componentPath) =>
      total + (analysis.components[componentPath]?.exportedSymbols.length ?? 0),
    0,
  );
  const isHighValueModule = HIGH_VALUE_MODULE_NAME_PATTERNS.some((pattern) =>
    pattern.test(module.name),
  );
  const packetMode: ModuleDocumentationPacketMode =
    isHighValueModule ||
    module.components.length >= 3 ||
    exportedEntityCount >= 3 ||
    moduleRelationshipCount >= 2
      ? "full-packet"
      : "summary-only";
  const classLikeEntityCount = module.components.reduce(
    (total, componentPath) =>
      total +
      (analysis.components[componentPath]?.exportedSymbols.filter((symbol) =>
        ["class", "interface", "type", "enum"].includes(symbol.kind),
      ).length ?? 0),
    0,
  );

  return {
    packetMode,
    preferredStructureDiagramKind:
      classLikeEntityCount >= 2 ? "classDiagram" : "flowchart",
    recommendSequenceDiagram:
      packetMode === "full-packet" && moduleRelationshipCount >= 2,
    selectionReason: isHighValueModule
      ? "Module matches a high-value subsystem pattern."
      : packetMode === "full-packet"
        ? "Module has enough entities and relationships to benefit from structure and flow documentation."
        : "Module is better served by a concise summary-only page.",
  };
};

export const buildModuleDocumentationFacts = (
  module: PlannedModule,
  modulePlan: ModulePlan,
  analysis: RepositoryAnalysis,
): ModuleDocumentationFacts => {
  const moduleComponentSet = new Set(module.components);
  const moduleLookup = new Map(
    modulePlan.modules.map((plannedModule) => [
      plannedModule.name,
      new Set(plannedModule.components),
    ]),
  );
  const internalRelationships: string[] = [];
  const crossModuleRelationships: string[] = [];

  for (const relationship of analysis.relationships) {
    const sourceInModule = moduleComponentSet.has(relationship.source);
    const targetInModule = moduleComponentSet.has(relationship.target);

    if (!sourceInModule && !targetInModule) {
      continue;
    }

    if (sourceInModule && targetInModule) {
      internalRelationships.push(
        `${relationship.source} -> ${relationship.target} (${relationship.type})`,
      );
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

      if (
        (sourceInModule && plannedComponentSet.has(relationship.target)) ||
        (targetInModule && plannedComponentSet.has(relationship.source))
      ) {
        crossModuleRelationships.push(
          `${relationship.source} -> ${relationship.target} (${relationship.type})`,
        );
      }
    }
  }

  const entityCandidates = module.components.flatMap((componentPath) => {
    const component = analysis.components[componentPath];
    const dependencies = [
      ...new Set(
        analysis.relationships
          .filter((relationship) => relationship.source === componentPath)
          .map((relationship) => relationship.target),
      ),
    ].sort();
    const usedBy = [
      ...new Set(
        analysis.relationships
          .filter((relationship) => relationship.target === componentPath)
          .map((relationship) => relationship.source),
      ),
    ].sort();

    if (!component || component.exportedSymbols.length === 0) {
      return [
        {
          dependsOn: dependencies,
          filePath: componentPath,
          kind: "file",
          name: componentPath,
          publicEntrypoints: [componentPath],
          usedBy,
        },
      ];
    }

    return component.exportedSymbols.map((symbol) => ({
      dependsOn: dependencies,
      filePath: componentPath,
      kind: symbol.kind,
      name: symbol.name,
      publicEntrypoints: [`${componentPath}:${symbol.name}`],
      usedBy,
    }));
  });

  const flowCandidates = analysis.relationships
    .filter(
      (relationship) =>
        moduleComponentSet.has(relationship.source) ||
        moduleComponentSet.has(relationship.target),
    )
    .map((relationship) => ({
      action: `${relationship.type} interaction`,
      actor: relationship.source,
      output:
        relationship.type === "import"
          ? "Imports collaborator"
          : "Uses collaborator during runtime",
      target: relationship.target,
    }));

  return {
    crossModuleRelationships: [...new Set(crossModuleRelationships)].sort(),
    entityCandidates: entityCandidates.sort((left, right) =>
      `${left.filePath}:${left.name}`.localeCompare(
        `${right.filePath}:${right.name}`,
      ),
    ),
    flowCandidates,
    internalRelationships: [...new Set(internalRelationships)].sort(),
    module,
    sourceCoverage: [...module.components].sort(),
  };
};

export const renderModuleDocumentationPacket = (
  result: ModuleGenerationResult,
  selection: ModuleDocumentationSelection,
  facts: ModuleDocumentationFacts,
): string => {
  if (
    result.pageContent &&
    !result.overview &&
    !result.responsibilities &&
    !result.structureDiagram &&
    !result.entityTable &&
    !result.sequenceDiagram &&
    !result.flowNotes
  ) {
    return result.pageContent.trim();
  }

  const packetMode = result.packetMode ?? selection.packetMode;
  const lines = [`# ${result.title}`];

  if (result.overview) {
    lines.push("", "## Overview", "", result.overview.trim());
  }

  if ((result.responsibilities?.length ?? 0) > 0) {
    lines.push("", "## Responsibilities", "");
    for (const responsibility of result.responsibilities ?? []) {
      lines.push(`- ${responsibility}`);
    }
  }

  if (
    packetMode === "full-packet" &&
    result.structureDiagram &&
    (result.entityTable?.length ?? 0) > 0
  ) {
    lines.push(
      "",
      "## Structure Diagram",
      "",
      "```mermaid",
      result.structureDiagram.trim(),
      "```",
      "",
      "## Entity Table",
      "",
      "| Name | Kind | Role | Public Entrypoints | Depends On | Used By |",
      "| --- | --- | --- | --- | --- | --- |",
      ...renderEntityTable(result.entityTable ?? []),
    );
  }

  if (
    packetMode === "full-packet" &&
    result.sequenceDiagram &&
    (result.flowNotes?.length ?? 0) > 0
  ) {
    lines.push(
      "",
      "## Key Flow",
      "",
      "```mermaid",
      result.sequenceDiagram.trim(),
      "```",
      "",
      "## Flow Notes",
      "",
      "| Step | Actor/Component | Action | Output / Side Effect |",
      "| --- | --- | --- | --- |",
      ...renderFlowNotes(result.flowNotes ?? []),
    );
  }

  lines.push("", "## Source Coverage", "");
  for (const sourcePath of facts.sourceCoverage) {
    lines.push(`- ${sourcePath}`);
  }

  if (facts.crossModuleRelationships.length > 0) {
    lines.push("", "## Cross-Module Context", "");
    for (const relationship of facts.crossModuleRelationships) {
      lines.push(`- ${relationship}`);
    }
  }

  return lines.join("\n").trim();
};

export const summarizeEntityCandidatesForPrompt = (
  entityCandidates: ModuleEntityCandidate[],
): string =>
  entityCandidates.length === 0
    ? "- none"
    : entityCandidates
        .map(
          (entity) =>
            `- ${entity.name} | kind: ${entity.kind} | file: ${entity.filePath} | public: ${entity.publicEntrypoints.join(", ") || "none"} | depends on: ${entity.dependsOn.join(", ") || "none"} | used by: ${entity.usedBy.join(", ") || "none"}`,
        )
        .join("\n");

export const defaultEntityTable = (
  entityCandidates: ModuleEntityCandidate[],
): ModuleEntitySummary[] =>
  entityCandidates.map((entity) => ({
    dependsOn: entity.dependsOn,
    kind: entity.kind,
    name: entity.name,
    publicEntrypoints: entity.publicEntrypoints,
    role: `Represents ${entity.name} in the ${entity.filePath} source boundary.`,
    usedBy: entity.usedBy,
  }));

export const defaultFlowNotes = (
  flowCandidates: ModuleFlowCandidate[],
): ModuleFlowNote[] =>
  flowCandidates.slice(0, 6).map((candidate, index) => ({
    action: candidate.action,
    actor: candidate.actor,
    output: candidate.output,
    step: index + 1,
  }));

const renderEntityTable = (rows: ModuleEntitySummary[]): string[] =>
  rows.map(
    (row) =>
      `| ${escapeMarkdownCell(row.name)} | ${escapeMarkdownCell(row.kind)} | ${escapeMarkdownCell(row.role)} | ${escapeMarkdownCell(row.publicEntrypoints.join(", ") || "none")} | ${escapeMarkdownCell(row.dependsOn.join(", ") || "none")} | ${escapeMarkdownCell(row.usedBy.join(", ") || "none")} |`,
  );

const renderFlowNotes = (rows: ModuleFlowNote[]): string[] =>
  rows.map(
    (row) =>
      `| ${row.step} | ${escapeMarkdownCell(row.actor)} | ${escapeMarkdownCell(row.action)} | ${escapeMarkdownCell(row.output)} |`,
  );

const escapeMarkdownCell = (value: string): string =>
  value.replaceAll("|", "\\|").replaceAll("\n", " ");
