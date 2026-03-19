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
  conservativeMode: boolean;
  downgradeReason?: string;
  flowScore: number;
  packetMode: ModuleDocumentationPacketMode;
  preferredStructureDiagramKind: ModuleStructureDiagramKind;
  recommendSequenceDiagram: boolean;
  selectionReason: string;
  structureScore: number;
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
  weight: number;
}

export const selectModuleDocumentationPacket = (
  module: PlannedModule,
  modulePlan: ModulePlan,
  analysis: RepositoryAnalysis,
): ModuleDocumentationSelection => {
  const facts = buildModuleDocumentationFacts(module, modulePlan, analysis);
  const isHighValueModule = HIGH_VALUE_MODULE_NAME_PATTERNS.some((pattern) =>
    pattern.test(module.name),
  );
  const conservativeMode =
    analysis.summary.totalComponents >= 150 || modulePlan.modules.length >= 20;
  const metrics = buildSelectionMetrics(
    module,
    analysis,
    facts,
    isHighValueModule,
  );
  const structureThreshold = conservativeMode ? 4 : 3;
  const flowThreshold = conservativeMode ? 3 : 2;
  const qualifiesForFullPacket =
    metrics.structureScore >= structureThreshold &&
    metrics.flowScore >= flowThreshold &&
    !metrics.forceSummaryOnly;
  const packetMode: ModuleDocumentationPacketMode = qualifiesForFullPacket
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
    conservativeMode,
    downgradeReason: !qualifiesForFullPacket
      ? buildDowngradeReason(metrics, conservativeMode)
      : undefined,
    flowScore: metrics.flowScore,
    packetMode,
    preferredStructureDiagramKind:
      classLikeEntityCount >= 2 ? "classDiagram" : "flowchart",
    recommendSequenceDiagram: packetMode === "full-packet",
    selectionReason: isHighValueModule
      ? "Module matches a high-value subsystem pattern."
      : packetMode === "full-packet"
        ? "Module has strong structural and flow signals for a paired structure-and-sequence packet."
        : buildSummaryOnlyReason(metrics, conservativeMode),
    structureScore: metrics.structureScore,
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
    .filter((relationship) => {
      const sourceInModule = moduleComponentSet.has(relationship.source);
      const targetInModule = moduleComponentSet.has(relationship.target);

      if (!sourceInModule && !targetInModule) {
        return false;
      }

      if (relationship.type !== "import") {
        return true;
      }

      return (
        isFlowWorthyPath(relationship.source) ||
        isFlowWorthyPath(relationship.target)
      );
    })
    .map((relationship) => ({
      action: `${relationship.type} interaction`,
      actor: relationship.source,
      output:
        relationship.type === "import"
          ? "Imports collaborator"
          : "Uses collaborator during runtime",
      target: relationship.target,
      weight: getRelationshipWeight(relationship.type),
    }))
    .sort(
      (left, right) =>
        right.weight - left.weight ||
        `${left.actor}:${left.target}`.localeCompare(
          `${right.actor}:${right.target}`,
        ),
    );

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

interface ModuleSelectionMetrics {
  structureScore: number;
  flowScore: number;
  forceSummaryOnly: boolean;
  reasons: string[];
}

const buildSelectionMetrics = (
  module: PlannedModule,
  _analysis: RepositoryAnalysis,
  facts: ModuleDocumentationFacts,
  isHighValueModule: boolean,
): ModuleSelectionMetrics => {
  const exportedEntityCount = facts.entityCandidates.filter(
    (entity) => entity.kind !== "file",
  ).length;
  const classLikeEntityCount = facts.entityCandidates.filter((entity) =>
    ["class", "interface", "type", "enum"].includes(entity.kind),
  ).length;
  const moduleRelationshipCount =
    facts.internalRelationships.length + facts.crossModuleRelationships.length;
  const strongFlowCandidates = facts.flowCandidates.filter(
    (candidate) => candidate.weight >= 2,
  );
  const distinctFlowNodes = new Set(
    strongFlowCandidates.flatMap((candidate) => [
      candidate.actor,
      candidate.target,
    ]),
  ).size;
  const flowWorthyEntityCount = facts.entityCandidates.filter(
    (entity) =>
      isFlowWorthyName(entity.name) || isFlowWorthyPath(entity.filePath),
  ).length;
  const analyzerFamilyCount = facts.entityCandidates.filter((entity) =>
    /analyzer$/iu.test(entity.name),
  ).length;
  const vendoredModule = module.components.some((componentPath) =>
    componentPath.startsWith("vendor/"),
  );
  const testHeavyModule = module.components.every((componentPath) =>
    /(\/|^)(test|tests|__tests__)\b/iu.test(componentPath),
  );
  const generatedHeavyModule = module.components.every((componentPath) =>
    /_generated|generated/iu.test(componentPath),
  );

  let structureScore = 0;
  let flowScore = 0;
  const reasons: string[] = [];

  if (isHighValueModule) {
    structureScore += 2;
  }

  if (module.components.length >= 3) {
    structureScore += 1;
  }

  if (module.components.length >= 6) {
    structureScore += 1;
  }

  if (exportedEntityCount >= 4) {
    structureScore += 1;
  }

  if (exportedEntityCount >= 10) {
    structureScore += 1;
  }

  if (moduleRelationshipCount >= 3) {
    structureScore += 1;
  }

  if (moduleRelationshipCount >= 8) {
    structureScore += 1;
  }

  if (classLikeEntityCount >= 2) {
    structureScore += 1;
  }

  if (flowWorthyEntityCount >= 2) {
    flowScore += 1;
  }

  if (strongFlowCandidates.length >= 2) {
    flowScore += 1;
  }

  if (strongFlowCandidates.length >= 4) {
    flowScore += 1;
  }

  if (distinctFlowNodes >= 3) {
    flowScore += 1;
  }

  if (strongFlowCandidates.some((candidate) => candidate.weight >= 3)) {
    flowScore += 1;
  }

  if (vendoredModule) {
    flowScore -= 2;
    reasons.push("module is vendored");
  }

  if (analyzerFamilyCount >= 3) {
    flowScore -= 3;
    reasons.push("module is an analyzer family without a clear dominant flow");
  }

  if (testHeavyModule) {
    flowScore -= 2;
    reasons.push("module is test-heavy");
  }

  if (generatedHeavyModule) {
    flowScore -= 2;
    reasons.push("module is generated-code-heavy");
  }

  return {
    flowScore,
    forceSummaryOnly:
      analyzerFamilyCount >= 3 || testHeavyModule || generatedHeavyModule,
    reasons,
    structureScore,
  };
};

const buildSummaryOnlyReason = (
  metrics: ModuleSelectionMetrics,
  conservativeMode: boolean,
): string => {
  const parts = [
    "Module is better served by a concise summary-only page.",
    `structure score=${metrics.structureScore}`,
    `flow score=${metrics.flowScore}`,
  ];

  if (conservativeMode) {
    parts.push("large-repo conservative mode is active");
  }

  if (metrics.reasons.length > 0) {
    parts.push(`reasons: ${metrics.reasons.join(", ")}`);
  }

  return parts.join(" ");
};

const buildDowngradeReason = (
  metrics: ModuleSelectionMetrics,
  conservativeMode: boolean,
): string => buildSummaryOnlyReason(metrics, conservativeMode);

const FLOW_WORTHY_NAME_PATTERN =
  /(handler|orchestrator|service|controller|route|router|middleware|publisher|generator|updater|validator|review|entry|server|api|manager)\b/iu;

const FLOW_WORTHY_PATH_PATTERN =
  /(handler|orchestrator|service|controller|route|router|middleware|publish|update|validate|review|server|api)/iu;

const isFlowWorthyName = (value: string): boolean =>
  FLOW_WORTHY_NAME_PATTERN.test(value);

const isFlowWorthyPath = (value: string): boolean =>
  FLOW_WORTHY_PATH_PATTERN.test(value);

const getRelationshipWeight = (
  relationshipType: RepositoryAnalysis["relationships"][number]["type"],
): number => {
  switch (relationshipType) {
    case "usage":
      return 3;
    case "composition":
    case "implementation":
    case "inheritance":
      return 2;
    case "import":
      return 1;
  }
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
