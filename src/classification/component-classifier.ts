import type { RepositoryAnalysis } from "../types/analysis.js";
import type {
  ClassificationConfidence,
  ClassifiedComponentData,
  CodeZone,
  ComponentRole,
} from "./types.js";

interface RoleMatch {
  role: ComponentRole;
  confidence: ClassificationConfidence;
}

interface MutableClassification {
  role: ComponentRole;
  roleConfidence: ClassificationConfidence;
  zone: CodeZone;
}

const CONFIDENCE_RANK: Record<ClassificationConfidence, number> = {
  unresolved: 0,
  likely: 1,
  confirmed: 2,
};

const DIR_ROLE_PATTERNS: ReadonlyArray<{
  dirs: string[];
  role: ComponentRole;
  confidence: ClassificationConfidence;
}> = [
  { dirs: ["services", "service"], role: "service", confidence: "confirmed" },
  { dirs: ["handlers", "handler"], role: "handler", confidence: "confirmed" },
  {
    dirs: ["controllers", "controller"],
    role: "controller",
    confidence: "confirmed",
  },
  {
    dirs: ["models", "model", "entities"],
    role: "model",
    confidence: "confirmed",
  },
  {
    dirs: ["repositories", "repository", "repos"],
    role: "repository",
    confidence: "confirmed",
  },
  { dirs: ["adapters", "adapter"], role: "adapter", confidence: "confirmed" },
  { dirs: ["factories", "factory"], role: "factory", confidence: "likely" },
  {
    dirs: ["utils", "util", "helpers", "lib"],
    role: "utility",
    confidence: "likely",
  },
  {
    dirs: ["config", "configuration"],
    role: "configuration",
    confidence: "likely",
  },
  {
    dirs: ["middleware", "middlewares"],
    role: "middleware",
    confidence: "confirmed",
  },
  {
    dirs: ["validators", "validation"],
    role: "validator",
    confidence: "likely",
  },
  { dirs: ["scripts"], role: "script", confidence: "confirmed" },
  {
    dirs: ["fixtures", "mocks", "__fixtures__"],
    role: "fixture",
    confidence: "confirmed",
  },
];

const SUFFIX_ROLE_PATTERNS: ReadonlyArray<{
  suffix: string;
  role: ComponentRole;
  confidence: ClassificationConfidence;
}> = [
  { suffix: ".service.ts", role: "service", confidence: "confirmed" },
  { suffix: ".controller.ts", role: "controller", confidence: "confirmed" },
  { suffix: ".handler.ts", role: "handler", confidence: "confirmed" },
  { suffix: ".model.ts", role: "model", confidence: "likely" },
  { suffix: ".adapter.ts", role: "adapter", confidence: "likely" },
  { suffix: ".factory.ts", role: "factory", confidence: "likely" },
  { suffix: ".middleware.ts", role: "middleware", confidence: "confirmed" },
  { suffix: ".validator.ts", role: "validator", confidence: "likely" },
  { suffix: ".schema.ts", role: "validator", confidence: "likely" },
  { suffix: ".config.ts", role: "configuration", confidence: "likely" },
];

const ENTRY_POINT_FILES = [
  "index.ts",
  "main.ts",
  "app.ts",
  "cli.ts",
  "server.ts",
];

/**
 * Classifies every component in the analysis output with a role and zone.
 * Deterministic: same input always produces same output.
 * Three-pass strategy: path conventions -> export patterns -> relationship shapes.
 *
 * Supports: AC-1.1, AC-1.2, AC-1.4
 *
 * @param analysis - The structural analysis output
 * @returns A map from file path to classification data, covering every component
 */
export function classifyComponents(
  analysis: RepositoryAnalysis,
): Map<string, ClassifiedComponentData> {
  const sortedPaths = Object.keys(analysis.components).sort();
  const classifications = new Map<string, MutableClassification>();

  // Pass 1: Path Convention Scan + Zone Detection
  for (const filePath of sortedPaths) {
    const zone = detectZone(filePath);
    const roleMatch = detectRoleFromPath(filePath);
    classifications.set(filePath, {
      role: roleMatch.role,
      roleConfidence: roleMatch.confidence,
      zone,
    });
  }

  // Pass 2: Export Pattern Analysis
  for (const filePath of sortedPaths) {
    const cl = classifications.get(filePath);
    if (!cl || cl.roleConfidence === "confirmed") continue;

    const component = analysis.components[filePath];
    if (!component) continue;
    const exportMatch = detectRoleFromExports(component.exportedSymbols);
    if (exportMatch && canPromote(cl.roleConfidence, exportMatch.confidence)) {
      cl.role = exportMatch.role;
      cl.roleConfidence = exportMatch.confidence;
    }
  }

  // Build relationship maps for Pass 3
  const importOutbound = new Map<string, number>();
  const importInbound = new Map<string, number>();
  const allInbound = new Map<string, number>();
  const allOutboundTargets = new Map<string, string[]>();

  for (const rel of analysis.relationships) {
    if (rel.type === "import") {
      importOutbound.set(rel.source, (importOutbound.get(rel.source) ?? 0) + 1);
      importInbound.set(rel.target, (importInbound.get(rel.target) ?? 0) + 1);
    }
    allInbound.set(rel.target, (allInbound.get(rel.target) ?? 0) + 1);
    const targets = allOutboundTargets.get(rel.source) ?? [];
    targets.push(rel.target);
    allOutboundTargets.set(rel.source, targets);
  }

  // Pass 3: Relationship Shape Tiebreaker
  for (const filePath of sortedPaths) {
    const cl = classifications.get(filePath);
    if (!cl || cl.roleConfidence === "confirmed") continue;

    const component = analysis.components[filePath];
    if (!component) continue;
    const relMatch = detectRoleFromRelationships(
      importOutbound.get(filePath) ?? 0,
      importInbound.get(filePath) ?? 0,
      allInbound.get(filePath) ?? 0,
      allOutboundTargets.get(filePath) ?? [],
      component.exportedSymbols,
      classifications,
    );
    if (relMatch && canPromote(cl.roleConfidence, relMatch.confidence)) {
      cl.role = relMatch.role;
      cl.roleConfidence = relMatch.confidence;
    }
  }

  // Finalize: unresolved components get role "unknown"
  const result = new Map<string, ClassifiedComponentData>();
  for (const filePath of sortedPaths) {
    const cl = classifications.get(filePath);
    if (!cl) continue;
    result.set(filePath, {
      role: cl.roleConfidence === "unresolved" ? "unknown" : cl.role,
      roleConfidence: cl.roleConfidence,
      zone: cl.zone,
    });
  }

  return result;
}

function detectZone(filePath: string): CodeZone {
  const segments = filePath.split("/");
  const fileName = segments[segments.length - 1] ?? "";

  // Priority 1: Vendored (container directory takes precedence)
  const vendoredDirs = [
    "vendor",
    "vendored",
    "third-party",
    "third_party",
    "external",
  ];
  if (segments.some((s) => vendoredDirs.includes(s))) {
    return "vendored";
  }

  // Priority 2: Infrastructure (path starts with CI/deploy prefixes)
  const infraPrefixes = [
    ".github",
    ".circleci",
    "docker",
    ".docker",
    "deploy",
    "infra",
    "terraform",
    "k8s",
  ];
  if (infraPrefixes.includes(segments[0] ?? "")) {
    return "infrastructure";
  }

  // Priority 3: Build-script (path starts with script/tool/build dirs)
  const buildPrefixes = ["scripts", "tools", "build"];
  if (buildPrefixes.includes(segments[0] ?? "")) {
    return "build-script";
  }

  // Priority 4: Test (directory or file suffix)
  const testDirs = ["test", "tests", "__tests__", "spec"];
  if (
    segments.some((s) => testDirs.includes(s)) ||
    /\.test\./.test(fileName) ||
    /\.spec\./.test(fileName)
  ) {
    return "test";
  }

  // Priority 5: Generated (directory or file suffix)
  const generatedDirs = ["generated", "__generated__", "codegen"];
  if (
    segments.some((s) => generatedDirs.includes(s)) ||
    /\.generated\./.test(fileName)
  ) {
    return "generated";
  }

  // Priority 6: Configuration (directory or known config files)
  const configDirs = ["config", "configuration"];
  const configFileNames = ["tsconfig.json", "package.json"];
  const configFilePatterns = [/^\.eslintrc/, /^vitest\.config/];
  if (
    segments.some((s) => configDirs.includes(s)) ||
    configFileNames.includes(fileName) ||
    configFilePatterns.some((p) => p.test(fileName))
  ) {
    return "configuration";
  }

  // Priority 7: Documentation (path prefix or known doc files)
  const docPrefixes = ["docs", "documentation"];
  const docFilePatterns = [/^README\./i, /^CHANGELOG\./i, /^CONTRIBUTING\./i];
  if (
    docPrefixes.includes(segments[0] ?? "") ||
    docFilePatterns.some((p) => p.test(fileName))
  ) {
    return "documentation";
  }

  return "production";
}

function detectRoleFromPath(filePath: string): RoleMatch {
  const segments = filePath.split("/");
  const fileName = segments[segments.length - 1] ?? "";
  const dirSegments = segments.slice(0, -1);

  // Test suffixes are highest priority — a .test.ts file is always a test
  const testSuffixes = [".test.ts", ".spec.ts", ".test.js", ".spec.js"];
  if (testSuffixes.some((s) => fileName.endsWith(s))) {
    return { role: "test", confidence: "confirmed" };
  }

  // Check directory patterns
  let dirMatch: RoleMatch | null = null;
  for (const pattern of DIR_ROLE_PATTERNS) {
    if (dirSegments.some((s) => pattern.dirs.includes(s))) {
      dirMatch = { role: pattern.role, confidence: pattern.confidence };
      break;
    }
  }

  // Check non-test suffix patterns
  let suffixMatch: RoleMatch | null = null;
  for (const pattern of SUFFIX_ROLE_PATTERNS) {
    if (fileName.endsWith(pattern.suffix)) {
      suffixMatch = { role: pattern.role, confidence: pattern.confidence };
      break;
    }
  }

  // If both matched, take the higher confidence; directory wins on tie
  if (dirMatch && suffixMatch) {
    if (
      CONFIDENCE_RANK[suffixMatch.confidence] >
      CONFIDENCE_RANK[dirMatch.confidence]
    ) {
      return suffixMatch;
    }
    return dirMatch;
  }
  if (dirMatch) return dirMatch;
  if (suffixMatch) return suffixMatch;

  // Entry-point: specific filenames at root or first-level src dir
  if (ENTRY_POINT_FILES.includes(fileName)) {
    const isRoot = segments.length === 1;
    const isFirstLevelSrc = segments.length === 2 && segments[0] === "src";
    if (isRoot || isFirstLevelSrc) {
      return { role: "entry-point", confidence: "likely" };
    }
  }

  return { role: "unknown", confidence: "unresolved" };
}

function detectRoleFromExports(
  exports: ReadonlyArray<{ name: string; kind: string; lineNumber: number }>,
): RoleMatch | null {
  if (exports.length === 0) return null;

  const typeKinds = new Set(["interface", "type", "enum"]);

  // All exports are types/interfaces/enums → type-definition
  if (exports.every((e) => typeKinds.has(e.kind))) {
    return { role: "type-definition", confidence: "confirmed" };
  }

  const classExports = exports.filter((e) => e.kind === "class");
  const functionExports = exports.filter((e) => e.kind === "function");

  // Exactly one class with naming pattern
  if (classExports.length === 1) {
    const name = classExports[0]?.name ?? "";
    if (name.endsWith("Service"))
      return { role: "service", confidence: "confirmed" };
    if (name.endsWith("Controller"))
      return { role: "controller", confidence: "confirmed" };
    if (name.endsWith("Handler"))
      return { role: "handler", confidence: "confirmed" };
    if (name.endsWith("Repository") || name.endsWith("Repo"))
      return { role: "repository", confidence: "likely" };
    if (name.endsWith("Adapter") || name.endsWith("Client"))
      return { role: "adapter", confidence: "likely" };
    if (name.endsWith("Factory"))
      return { role: "factory", confidence: "likely" };
  }

  // Multiple functions, zero classes → utility
  if (functionExports.length > 1 && classExports.length === 0) {
    return { role: "utility", confidence: "likely" };
  }

  // Exactly one function, zero classes → handler
  if (functionExports.length === 1 && classExports.length === 0) {
    return { role: "handler", confidence: "likely" };
  }

  return null;
}

function detectRoleFromRelationships(
  importFanOut: number,
  importFanIn: number,
  totalInbound: number,
  outboundTargets: string[],
  exports: ReadonlyArray<{ name: string; kind: string; lineNumber: number }>,
  classifications: Map<string, MutableClassification>,
): RoleMatch | null {
  // Rule 1: High fan-out, low fan-in → controller
  if (importFanOut >= 5 && importFanIn <= 2) {
    return { role: "controller", confidence: "likely" };
  }

  // Rule 2: High fan-in, low fan-out → utility or type-definition
  if (importFanIn >= 5 && importFanOut <= 1) {
    const typeKinds = new Set(["interface", "type", "enum"]);
    if (exports.length > 0 && exports.every((e) => typeKinds.has(e.kind))) {
      return { role: "type-definition", confidence: "likely" };
    }
    return { role: "utility", confidence: "likely" };
  }

  // Rule 3: No inbound edges, outbound to services/handlers → entry-point
  if (totalInbound === 0 && outboundTargets.length > 0) {
    const hasServiceOrHandlerTarget = outboundTargets.some((t) => {
      const cl = classifications.get(t);
      return cl && (cl.role === "service" || cl.role === "handler");
    });
    if (hasServiceOrHandlerTarget) {
      return { role: "entry-point", confidence: "likely" };
    }
  }

  return null;
}

function canPromote(
  current: ClassificationConfidence,
  proposed: ClassificationConfidence,
): boolean {
  return CONFIDENCE_RANK[proposed] > CONFIDENCE_RANK[current];
}
