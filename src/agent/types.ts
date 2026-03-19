import type { InferenceUsage } from "../inference/types.js";

// -- Configuration --

/**
 * Configuration for a single module's agent run.
 * Passed from the generation stage to the runtime.
 */
export interface AgentRuntimeConfig {
  /** Absolute path to the repository root. Used for read_source sandboxing. */
  repoRoot: string;

  /** Per-module timeout in milliseconds. Default: 120_000. */
  timeoutMs: number;

  /** Maximum conversation turns. Default: 15. Safety cap, not a tuning parameter. */
  maxTurns: number;

  /** Maximum lines returned by read_source. Default: 2000. */
  maxReadLines: number;
}

/** Default configuration values. */
export const DEFAULT_AGENT_CONFIG: Readonly<AgentRuntimeConfig> = {
  repoRoot: "",
  timeoutMs: 120_000,
  maxTurns: 15,
  maxReadLines: 2000,
} as const;

// -- Module Context --

/**
 * Everything the agent needs to know about the module it's documenting.
 * Assembled by the generation stage from existing infrastructure
 * (buildModuleDocumentationFacts, classification map, strategy).
 *
 * References: AC-1.4 (classifications in agent context), AC-4.1 (module context)
 */
export interface AgentModuleContext {
  moduleName: string;
  moduleDescription: string;
  moduleArchetype: string;

  /** File paths of all components in this module. */
  componentPaths: string[];

  /** Per-component classification data. Keyed by file path. */
  componentClassifications: ReadonlyMap<string, ComponentClassificationView>;

  /** Entity candidates from buildModuleDocumentationFacts(). */
  entityCandidates: readonly AgentEntityCandidate[];

  /** Flow candidates from buildModuleDocumentationFacts(). */
  flowCandidates: readonly AgentFlowCandidate[];

  /** Relationship summaries. */
  internalRelationships: readonly string[];
  crossModuleRelationships: readonly string[];

  /** All file paths covered by this module. */
  sourceCoverage: readonly string[];

  /** Zone treatment guidance from the documentation strategy. */
  zoneGuidance: string | undefined;

  /** Names of all other modules in the plan, for cross-link context. */
  otherModuleNames: readonly string[];
}

export interface ComponentClassificationView {
  role: string;
  zone: string;
}

export interface AgentEntityCandidate {
  name: string;
  kind: string;
  filePath: string;
  publicEntrypoints: readonly string[];
  dependsOn: readonly string[];
  usedBy: readonly string[];
}

export interface AgentFlowCandidate {
  actor: string;
  action: string;
  output: string;
  target: string;
  weight: number;
}

// -- Result --

/**
 * The output of a single module's agent run.
 * Returned from runAgentForModule() to the generation stage.
 *
 * References: AC-4.2 (sections decided by agent), AC-4.3 (valid output)
 */
export interface AgentModuleResult {
  status: "success" | "failed";
  failureReason?: string;

  /**
   * Section content written by the agent. Keyed by PageSectionKind.
   * Only populated when status is "success".
   * Sections are pre-formatted markdown (agent controls formatting).
   */
  sections: Readonly<Record<string, string>>;

  /** Number of observations the agent reported for this module. */
  observationCount: number;

  /** Conversation metrics. */
  turnCount: number;
  toolCallCount: number;

  /** Inference usage accumulated across all turns. */
  usage: InferenceUsage;
  costUsd: number | null;
}

// -- Page Section Kinds --

/**
 * The canonical set of section kinds a module page can contain.
 * The agent writes sections by kind; the renderer assembles them in this order.
 *
 * This is the agent-side equivalent of the fields in ModuleGenerationResult.
 * The generation stage maps between the two representations.
 *
 * References: AC-4.2 (agent decides sections), AC-4.3e (flow-notes requires sequence-diagram)
 */
export const PAGE_SECTION_KINDS = [
  "overview",
  "responsibilities",
  "structure-diagram",
  "entity-table",
  "sequence-diagram",
  "flow-notes",
  "source-coverage",
  "cross-module-context",
] as const;

export type PageSectionKind = (typeof PAGE_SECTION_KINDS)[number];

/**
 * The minimum set of sections required for a successful page.
 * Epic AC-4.3c requires title, overview, and source coverage.
 * Title is NOT a section — it is derived from the module name and prepended
 * during page assembly. Overview and source-coverage are agent-written sections.
 */
export const REQUIRED_SECTIONS: readonly PageSectionKind[] = [
  "overview",
  "source-coverage",
] as const;

// -- Tool I/O Types --

/**
 * Input/output shapes for each agent tool.
 * These are the TypeScript representations; the JSON schemas for the provider
 * are derived from these via a build-time or runtime schema generator.
 */

/** read_source input. References: AC-4.1a, AC-4.1b */
export interface ReadSourceInput {
  filePath: string;
}

export interface ReadSourceSuccessOutput {
  content: string;
  lineCount: number;
  truncated: boolean;
}

export interface ReadSourceErrorOutput {
  error: string;
}

export type ReadSourceOutput = ReadSourceSuccessOutput | ReadSourceErrorOutput;

/** write_section input. References: AC-4.2, AC-4.3 */
export interface WriteSectionInput {
  section: PageSectionKind;
  content: string;
}

export interface WriteSectionOutput {
  written: true;
}

/** report_observation input. References: AC-3.1, AC-3.3 */
export interface ReportObservationInput {
  category: ObservationCategory;
  subject: string;
  observation: string;
  suggestedCategory?: string;
}

export interface ReportObservationOutput {
  recorded: true;
}

export type ObservationCategory =
  | "classification-gap"
  | "relationship-gap"
  | "zone-ambiguity"
  | "archetype-mismatch";

/** Discriminated union for tool call dispatch. */
export type AgentToolCall =
  | { name: "read_source"; input: ReadSourceInput }
  | { name: "write_section"; input: WriteSectionInput }
  | { name: "report_observation"; input: ReportObservationInput };

/** Discriminated union for tool call results. */
export type AgentToolResult =
  | { name: "read_source"; output: ReadSourceOutput }
  | { name: "write_section"; output: WriteSectionOutput }
  | { name: "report_observation"; output: ReportObservationOutput };
