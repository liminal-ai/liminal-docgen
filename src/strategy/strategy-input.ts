import type { ClassifiedComponentData } from "../classification/types.js";
import type { RepositoryAnalysis } from "../types/analysis.js";
import type { StrategyInput } from "./types.js";

/**
 * Assembles a deterministic strategy input from classified analysis output.
 * Same inputs always produce the same output — no randomness, no timestamps.
 *
 * Supports: AC-2.3
 *
 * @param analysis - The structural analysis output
 * @param classificationMap - Component classifications from classifyComponents()
 * @returns A StrategyInput suitable for the strategy inference call
 */
export function assembleStrategyInput(
  analysis: RepositoryAnalysis,
  classificationMap: Map<string, ClassifiedComponentData>,
): StrategyInput {
  const sortedPaths = Object.keys(analysis.components).sort();
  const componentCount = sortedPaths.length;

  const languageDistribution: Record<string, number> = {};
  const directoryCountMap: Record<string, number> = {};
  const zoneDistribution: Record<string, number> = {};
  const roleDistribution: Record<string, number> = {};

  for (const filePath of sortedPaths) {
    const component = analysis.components[filePath];
    if (!component) continue;

    // Language distribution
    const lang = component.language;
    languageDistribution[lang] = (languageDistribution[lang] ?? 0) + 1;

    // Directory tree: top-level directory (first segment of file path)
    const topDir = filePath.split("/")[0];
    if (topDir) {
      directoryCountMap[topDir] = (directoryCountMap[topDir] ?? 0) + 1;
    }

    // Zone and role from classification map
    const classification = classificationMap.get(filePath);
    if (classification) {
      const { zone, role } = classification;
      zoneDistribution[zone] = (zoneDistribution[zone] ?? 0) + 1;
      roleDistribution[role] = (roleDistribution[role] ?? 0) + 1;
    }
  }

  // Sort all record keys alphabetically
  const sortedLanguageDistribution = sortRecord(languageDistribution);
  const sortedZoneDistribution = sortRecord(zoneDistribution);
  const sortedRoleDistribution = sortRecord(roleDistribution);

  // Directory tree summary: sorted alphabetically, format "dir/ (N components)"
  const directoryTreeSummary = Object.keys(directoryCountMap)
    .sort()
    .map((dir) => `${dir}/ (${directoryCountMap[dir]} components)`);

  // Relationship density: edges / components (handle zero division)
  const relationshipDensity =
    componentCount === 0 ? 0 : analysis.relationships.length / componentCount;

  return {
    componentCount,
    languageDistribution: sortedLanguageDistribution,
    directoryTreeSummary,
    relationshipDensity,
    zoneDistribution: sortedZoneDistribution,
    roleDistribution: sortedRoleDistribution,
  };
}

function sortRecord(record: Record<string, number>): Record<string, number> {
  const sorted: Record<string, number> = {};
  for (const key of Object.keys(record).sort()) {
    const val = record[key];
    if (val !== undefined) {
      sorted[key] = val;
    }
  }
  return sorted;
}
