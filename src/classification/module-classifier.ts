import type { AnalyzedRelationship } from "../types/analysis.js";
import type { PlannedModule } from "../types/planning.js";
import type {
  ClassifiedComponentData,
  CodeZone,
  ComponentRole,
  ModuleArchetype,
} from "./types.js";

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
  modules: PlannedModule[],
  classificationMap: Map<string, ClassifiedComponentData>,
  relationships: AnalyzedRelationship[],
): Map<string, ModuleArchetype> {
  const result = new Map<string, ModuleArchetype>();

  // Build component-to-module lookup for cross-module edge detection
  const componentToModule = new Map<string, string>();
  for (const mod of modules) {
    for (const comp of mod.components) {
      componentToModule.set(comp, mod.name);
    }
  }

  // Sort modules by name for determinism
  const sortedModules = [...modules].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  for (const mod of sortedModules) {
    const archetype = assignArchetype(
      mod,
      classificationMap,
      relationships,
      componentToModule,
    );
    result.set(mod.name, archetype);
  }

  return result;
}

function assignArchetype(
  mod: PlannedModule,
  classificationMap: Map<string, ClassifiedComponentData>,
  relationships: AnalyzedRelationship[],
  componentToModule: Map<string, string>,
): ModuleArchetype {
  const componentCount = mod.components.length;
  if (componentCount === 0) return "mixed";

  // Count roles and zones
  const roleCounts = new Map<ComponentRole, number>();
  const zoneCounts = new Map<CodeZone, number>();

  for (const comp of mod.components) {
    const cl = classificationMap.get(comp);
    if (cl) {
      roleCounts.set(cl.role, (roleCounts.get(cl.role) ?? 0) + 1);
      zoneCounts.set(cl.zone, (zoneCounts.get(cl.zone) ?? 0) + 1);
    }
  }

  // Count cross-module edges
  const moduleComponents = new Set(mod.components);
  let crossModuleEdges = 0;
  let hasInboundCrossModule = false;
  let hasOutboundCrossModule = false;

  for (const rel of relationships) {
    const sourceInModule = moduleComponents.has(rel.source);
    const targetInModule = moduleComponents.has(rel.target);

    // Only count edges where exactly one end is in this module
    // AND the other end is in a different module (not orphaned)
    if (sourceInModule && !targetInModule) {
      const targetModule = componentToModule.get(rel.target);
      if (targetModule !== undefined && targetModule !== mod.name) {
        crossModuleEdges++;
        hasOutboundCrossModule = true;
      }
    } else if (!sourceInModule && targetInModule) {
      const sourceModule = componentToModule.get(rel.source);
      if (sourceModule !== undefined && sourceModule !== mod.name) {
        crossModuleEdges++;
        hasInboundCrossModule = true;
      }
    }
  }

  const pct = (count: number) => count / componentCount;

  // Rule 1: 100% test zone → test-suite
  if ((zoneCounts.get("test") ?? 0) === componentCount) {
    return "test-suite";
  }

  // Rule 2: 100% type-definition role → type-definitions
  if ((roleCounts.get("type-definition") ?? 0) === componentCount) {
    return "type-definitions";
  }

  // Rule 3: ≥60% infrastructure/build-script zone → infrastructure
  const infraZoneCount =
    (zoneCounts.get("infrastructure") ?? 0) +
    (zoneCounts.get("build-script") ?? 0);
  if (pct(infraZoneCount) >= 0.6) {
    return "infrastructure";
  }

  // Rule 4: ≥60% model role AND cross-module deps ≤2 → domain-model
  if (pct(roleCounts.get("model") ?? 0) >= 0.6 && crossModuleEdges <= 2) {
    return "domain-model";
  }

  // Rule 5: ≥60% adapter role → integration
  if (pct(roleCounts.get("adapter") ?? 0) >= 0.6) {
    return "integration";
  }

  // Rule 6: ≥50% handler/controller role AND cross-module edges ≥3 → orchestration
  const handlerControllerCount =
    (roleCounts.get("handler") ?? 0) + (roleCounts.get("controller") ?? 0);
  if (pct(handlerControllerCount) >= 0.5 && crossModuleEdges >= 3) {
    return "orchestration";
  }

  // Rule 7: ≥60% repository role → data-access
  if (pct(roleCounts.get("repository") ?? 0) >= 0.6) {
    return "data-access";
  }

  // Rule 8: ≥50% handler/entry-point role AND only outbound cross-module edges → public-api
  const handlerEntryCount =
    (roleCounts.get("handler") ?? 0) + (roleCounts.get("entry-point") ?? 0);
  if (
    pct(handlerEntryCount) >= 0.5 &&
    hasOutboundCrossModule &&
    !hasInboundCrossModule
  ) {
    return "public-api";
  }

  // Rule 9: ≥60% utility role → utility-collection
  if (pct(roleCounts.get("utility") ?? 0) >= 0.6) {
    return "utility-collection";
  }

  // Rule 10: None of above → mixed
  return "mixed";
}
