/**
 * The architectural role of a component, determined by heuristic analysis
 * of its file path, export patterns, and relationship shape.
 *
 * Supports: AC-1.1
 */
export type ComponentRole =
  | "service"
  | "handler"
  | "controller"
  | "model"
  | "repository"
  | "adapter"
  | "factory"
  | "utility"
  | "configuration"
  | "entry-point"
  | "middleware"
  | "validator"
  | "type-definition"
  | "test"
  | "fixture"
  | "script"
  | "unknown";

/**
 * The code zone a component belongs to, determined by directory
 * conventions and file markers.
 *
 * Supports: AC-1.2
 */
export type CodeZone =
  | "production"
  | "test"
  | "generated"
  | "vendored"
  | "infrastructure"
  | "configuration"
  | "build-script"
  | "documentation";

/**
 * The documentation archetype of a planned module, determined by
 * the role and zone distribution of its constituent components.
 *
 * Supports: AC-1.3
 */
export type ModuleArchetype =
  | "orchestration"
  | "data-access"
  | "public-api"
  | "domain-model"
  | "integration"
  | "utility-collection"
  | "type-definitions"
  | "infrastructure"
  | "test-suite"
  | "mixed";

/**
 * Internal confidence level for classification decisions.
 * Used during multi-pass classification to determine when
 * later passes should override earlier ones.
 *
 * - confirmed: unambiguous match (e.g., file in services/ directory)
 * - likely: pattern matched but not definitively
 * - unresolved: no pattern matched; eligible for refinement by later passes
 */
export type ClassificationConfidence = "confirmed" | "likely" | "unresolved";

/**
 * Classification data for a single component.
 *
 * This is a standalone data structure, NOT an extension of AnalyzedComponent.
 * The classification map (Map<string, ClassifiedComponentData>) is keyed by
 * file path and consumed alongside the RepositoryAnalysis — it does not
 * mutate or replace the analysis types.
 *
 * Supports: AC-1.1, AC-1.2
 */
export interface ClassifiedComponentData {
  readonly role: ComponentRole;
  readonly roleConfidence: ClassificationConfidence;
  readonly zone: CodeZone;
}

/**
 * View type that merges AnalyzedComponent with its classification data.
 * Created on-demand by consumers that need the combined view (e.g.,
 * agent context assembly). Not stored — reconstructed from the analysis
 * component and the classification map entry.
 *
 * Supports: AC-1.4
 */
export interface ClassifiedComponentView {
  readonly filePath: string;
  readonly language: string;
  readonly exportedSymbols: ReadonlyArray<{
    readonly name: string;
    readonly kind: string;
    readonly lineNumber: number;
  }>;
  readonly linesOfCode: number;
  readonly role: ComponentRole;
  readonly roleConfidence: ClassificationConfidence;
  readonly zone: CodeZone;
}

/**
 * Creates a ClassifiedComponentView by merging an AnalyzedComponent
 * with its classification data. Returns null if no classification
 * exists for the component's file path.
 *
 * Supports: AC-1.4
 */
export function mergeComponentView(
  component: {
    filePath: string;
    language: string;
    exportedSymbols: ReadonlyArray<{
      name: string;
      kind: string;
      lineNumber: number;
    }>;
    linesOfCode: number;
  },
  classificationMap: Map<string, ClassifiedComponentData>,
): ClassifiedComponentView | null {
  const classification = classificationMap.get(component.filePath);
  if (!classification) return null;
  return {
    filePath: component.filePath,
    language: component.language,
    exportedSymbols: component.exportedSymbols,
    linesOfCode: component.linesOfCode,
    role: classification.role,
    roleConfidence: classification.roleConfidence,
    zone: classification.zone,
  };
}
