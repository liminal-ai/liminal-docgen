import type { AnalyzedRelationship } from "../types/analysis.js";
import type { PlannedModule } from "../types/planning.js";
import type { ClassifiedComponentData, ModuleArchetype } from "./types.js";

/**
 * Assigns an archetype to every planned module based on the roles and zones
 * of its constituent components and its cross-module relationship density.
 * Deterministic: same input always produces same output.
 *
 * Supports: AC-1.3, AC-1.4
 *
 * @param modules - The planned modules from clustering
 * @param classificationMap - Component classifications from classifyComponents()
 * @param relationships - Relationship edges from analysis
 * @returns A map from module name to archetype
 */
export function classifyModules(
  _modules: PlannedModule[],
  _classificationMap: Map<string, ClassifiedComponentData>,
  _relationships: AnalyzedRelationship[],
): Map<string, ModuleArchetype> {
  throw new Error("Not implemented: classifyModules");
}
