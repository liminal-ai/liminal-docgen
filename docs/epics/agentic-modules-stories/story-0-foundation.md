<!-- Source: docs/epics/agentic-module-generation-stories.md -->

## Story 0: Foundation

### Summary
<!-- Jira: Summary field -->

Establish shared types, tool interfaces, provider capability detection, and test fixtures required by all subsequent stories.

### Description
<!-- Jira: Description field -->

**User Profile:**
- **Primary User:** Developer running `liminal-docgen generate` against their codebase
- **Context:** Generating or regenerating a documentation wiki for a repository, especially mid-to-large codebases (100+ components) with mixed architectural patterns
- **Mental Model:** "I point the tool at my repo and it produces a useful wiki that reflects my actual code structure"
- **Key Constraint:** Generation must complete reliably without manual intervention. Failures on individual modules should not abort the entire run.

**Objective:** Define all new type primitives — classification labels, agent observation shapes, documentation strategy contracts, tool definitions, provider interface extensions, and run outcome types — so that subsequent stories implement against stable contracts. Add `supportsToolUse()` to the provider interface (returning `false` for all providers initially). Create test fixtures for classified analysis data, mock agentic providers, and mock tool executors.

**Scope:**

*In:*
- `ComponentRole`, `CodeZone`, `ModuleArchetype` type definitions
- `ClassifiedComponent`, `ClassifiedModule` extended types
- `AgentObservation`, `RunObservations`, `ObservationCategory` types
- `DocumentationStrategy`, `DocumentationBoundary`, `ZoneGuidance`, `RepoClassification`, `PageShape` types
- `ToolDefinition`, `ToolUseRequest`, `ToolUseConversationResult` types
- `ReadSourceTool`, `WritePageSectionTool`, `ReportObservationTool`, `PageSectionKind` interface definitions
- `ModuleGenerationOutcome`, `RunStatus`, `DocumentationRunResult` types
- `supportsToolUse()` method on `InferenceProvider` (returns `false` for all existing providers)
- `inferWithTools()` method signature on `InferenceProvider` interface
- Test fixtures: mock agentic provider, mock tool executor, classified analysis fixtures

*Out:*
- Implementation of classification logic (Story 1)
- Implementation of tool-use conversations (Story 2)
- Any runtime behavior changes

**Dependencies:** None — this is the foundation story.

### Acceptance Criteria
<!-- Jira: Acceptance Criteria field -->

**AC-0.1:** All type definitions compile and are importable

- **TC-0.1a:** All new types and interfaces compile without errors when imported by downstream modules
- **TC-0.1b:** `ClassifiedComponent` extends `AnalyzedComponent` additively — existing fields unchanged
- **TC-0.1c:** `ClassifiedModule` extends `PlannedModule` additively — existing fields unchanged

**AC-0.2:** Provider interface extension is non-breaking

- **TC-0.2a:** All existing `infer()` callers compile without modification
- **TC-0.2b:** `supportsToolUse()` returns `false` for all existing provider implementations
- **TC-0.2c:** `inferWithTools()` is defined on the interface with correct signature

**AC-0.3:** Test fixtures exist for downstream stories

- **TC-0.3a:** A mock agentic provider fixture exists that implements `inferWithTools()` with controllable responses
- **TC-0.3b:** Classified analysis fixtures exist with pre-labeled components (various roles and zones)
- **TC-0.3c:** A mock tool executor fixture exists that can simulate read_source, write_section, and report_observation

### Technical Design
<!-- Jira: Technical Notes or sub-section of Description -->

#### Component Classification

```typescript
type ComponentRole =
  | "service"            // Business logic, stateful operations
  | "handler"            // Request/event handling, routing
  | "controller"         // Coordination between services
  | "model"              // Data structures, domain entities
  | "repository"         // Data access, persistence
  | "adapter"            // External system integration
  | "factory"            // Object creation, initialization
  | "utility"            // Stateless helpers, pure functions
  | "configuration"      // Config loading, defaults, env resolution
  | "entry-point"        // CLI entry, main, app bootstrap
  | "middleware"         // Request/response pipeline intercept
  | "validator"          // Input validation, schema enforcement
  | "type-definition"    // Interfaces, types, enums only
  | "test"               // Test files
  | "fixture"            // Test fixtures, mock data
  | "script"             // Build scripts, tooling
  | "unknown";           // No pattern matched

type CodeZone =
  | "production"         // Core application code
  | "test"               // Test suites
  | "generated"          // Auto-generated code
  | "vendored"           // Third-party code copied into repo
  | "infrastructure"     // CI/CD, Docker, deploy config
  | "configuration"      // App/project config files
  | "build-script"       // Build tooling, scripts
  | "documentation";     // Docs, README, etc.

type ModuleArchetype =
  | "orchestration"      // Coordinates multiple services/subsystems
  | "data-access"        // Database, storage, persistence layer
  | "public-api"         // External-facing API surface
  | "domain-model"       // Core business entities and rules
  | "integration"        // External service adapters
  | "utility-collection" // Shared helpers, no dominant pattern
  | "type-definitions"   // Primarily types/interfaces
  | "infrastructure"     // Build, deploy, CI/CD support
  | "test-suite"         // Test organization
  | "mixed";             // No dominant archetype

interface ClassifiedComponent extends AnalyzedComponent {
  role: ComponentRole;
  zone: CodeZone;
}

interface ClassifiedModule extends PlannedModule {
  archetype: ModuleArchetype;
}
```

#### Agent Observation

```typescript
interface AgentObservation {
  moduleName: string;
  category: ObservationCategory;
  subjectKind: "component" | "module" | "relationship";
  subject: string;
  observation: string;
  suggestedCategory?: string;
}

type ObservationCategory =
  | "classification-gap"
  | "relationship-gap"
  | "zone-ambiguity"
  | "archetype-mismatch";

interface RunObservations {
  runId: string;
  timestamp: string;  // ISO 8601
  observationCount: number;
  observations: AgentObservation[];
}
```

#### Documentation Strategy

```typescript
type RepoClassification =
  | "service-app"
  | "library"
  | "cli-tool"
  | "monolith"
  | "monorepo"
  | "mixed";

interface DocumentationStrategy {
  repoClassification: RepoClassification;
  boundaries: DocumentationBoundary[];
  zoneGuidance: ZoneGuidance[];
}

interface DocumentationBoundary {
  name: string;
  componentPatterns: string[];
  recommendedPageShape: PageShape;
}

type PageShape = "full-structured" | "summary-only" | "overview-only";

interface ZoneGuidance {
  zone: CodeZone;
  treatment: "document" | "summarize" | "exclude";
  reason: string;
}
```

#### Agent Tool Definitions

```typescript
interface ReadSourceTool {
  name: "read_source";
  parameters: {
    filePath: string;  // Relative to repo root
  };
  returns: {
    content: string;
    lineCount: number;
  } | {
    error: string;
  };
}

interface WritePageSectionTool {
  name: "write_section";
  parameters: {
    section: PageSectionKind;
    content: string;
  };
  returns: {
    written: true;
  };
}

type PageSectionKind =
  | "overview"
  | "responsibilities"
  | "structure-diagram"
  | "entity-table"
  | "sequence-diagram"
  | "flow-notes"
  | "source-coverage"
  | "cross-module-context";

interface ReportObservationTool {
  name: "report_observation";
  parameters: {
    category: ObservationCategory;
    subject: string;
    observation: string;
    suggestedCategory?: string;
  };
  returns: {
    recorded: true;
  };
}
```

#### Extended Provider Interface

```typescript
interface InferenceProvider {
  // Existing — unchanged
  infer<T>(request: InferenceRequest): Promise<EngineResult<InferenceResponse<T>>>;
  getAccumulatedUsage(): InferenceUsage;
  computeCost(): number | null;

  // New
  supportsToolUse(): boolean;
  inferWithTools(request: ToolUseRequest): Promise<EngineResult<ToolUseConversationResult>>;
}

interface ToolUseRequest {
  systemPrompt: string;
  userMessage: string;
  tools: ToolDefinition[];
  maxTurns?: number;
  model?: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolUseConversationResult {
  finalText: string;
  toolCallCount: number;
  turnCount: number;
  usage: InferenceUsage;
  costUsd: number | null;
}
```

#### Per-Module Run Outcome

```typescript
interface ModuleGenerationOutcome {
  moduleName: string;
  status: "success" | "failed";
  generationPath: "agentic" | "one-shot";
  fileName: string;
  durationMs: number;
  turnCount?: number;
  toolCallCount?: number;
  failureReason?: string;
  hasPlaceholderPage?: boolean;
  observationCount?: number;
}
```

#### Run-Level Result

```typescript
type RunStatus = "success" | "partial-success" | "failure";

interface DocumentationRunResult {
  status: RunStatus;
  moduleOutcomes: ModuleGenerationOutcome[];
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  warnings: string[];
  observationCount: number;
  costUsd: number | null;
}
```

Run status rules (evaluated in order, first match wins):
1. `failure`: more than half of modules failed, or a critical pipeline-level error occurred
2. `partial-success`: at least one module failed but half or more succeeded
3. `success`: all modules generated successfully

*See the tech design document for full architecture, implementation targets, and test mapping.*

### Definition of Done
<!-- Jira: Definition of Done or Acceptance Criteria footer -->

- [ ] All new type definitions compile without errors
- [ ] `ClassifiedComponent` and `ClassifiedModule` extend existing types additively
- [ ] `supportsToolUse()` returns `false` for all existing providers
- [ ] `inferWithTools()` signature defined on provider interface
- [ ] Test fixtures created: mock agentic provider, mock tool executor, classified analysis data
- [ ] No existing tests broken
- [ ] No changes to runtime behavior
