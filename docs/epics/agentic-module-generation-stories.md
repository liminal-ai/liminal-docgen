# Agentic Module Documentation Generation — Stories

---

## User Profile

**Primary User:** Developer running `liminal-docgen generate` against their codebase
**Context:** Generating or regenerating a documentation wiki for a repository, especially mid-to-large codebases (100+ components) with mixed architectural patterns
**Mental Model:** "I point the tool at my repo and it produces a useful wiki that reflects my actual code structure"
**Key Constraint:** Generation must complete reliably without manual intervention. Failures on individual modules should not abort the entire run.

---

## Story 0: Foundation

### Summary
<!-- Jira: Summary field -->

Establish shared types, tool interfaces, provider capability detection, and test fixtures required by all subsequent stories.

### Description
<!-- Jira: Description field -->

**User Profile:** See epic-level User Profile above.

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

---

## Story 1: Component Classification Enrichment

### Summary
<!-- Jira: Summary field -->

Every component gets a role and zone label after analysis; every module gets an archetype after planning.

### Description
<!-- Jira: Description field -->

**User Profile:** See epic-level User Profile above.

**Objective:** After structural analysis produces the raw `RepositoryAnalysis`, run a deterministic classification enrichment step that labels each component with its architectural role and code zone. After module planning completes, assign each module an archetype based on its constituent component classifications. All classifications are available in agent context during generation.

The canonical pipeline order is:
analysis → component classification → strategy → planning → module archetype assignment → generation

**Scope:**

*In:*
- Component role classification from exports, file paths, and relationship patterns
- Component zone classification from directory conventions and file markers
- Module archetype classification from constituent component roles and zones
- Context assembly that includes classifications for agent consumption

*Out:*
- Inference-based classification (classification is deterministic heuristics only)
- Changes to the native analyzer's AST parsing or file discovery logic
- Strategy selection (Story 3)

**Dependencies:** Story 0 (type definitions)

### Acceptance Criteria
<!-- Jira: Acceptance Criteria field -->

**AC-1.1:** Every component in the analysis output receives a role classification

- **TC-1.1a: Service role detected from export pattern**
  - Given: A component that exports a class with methods matching service patterns (e.g., `UserService`, `createUserHandler`)
  - When: Classification enrichment runs
  - Then: Component receives role `service` or `handler`
- **TC-1.1b: Type-definition role detected from export composition**
  - Given: A component that exports only interfaces, types, and enums
  - When: Classification enrichment runs
  - Then: Component receives role `type-definition`
- **TC-1.1c: Unknown role assigned when no pattern matches**
  - Given: A component whose exports and path don't match any known role pattern
  - When: Classification enrichment runs
  - Then: Component receives role `unknown` (not an error — this is expected for unfamiliar codebases)
- **TC-1.1d: Role classification is deterministic**
  - Given: The same analysis output run through classification twice
  - When: Both enrichments complete
  - Then: All role labels are identical

**AC-1.2:** Every component receives a zone classification

- **TC-1.2a: Test zone detected from directory convention**
  - Given: A component at path `test/orchestration/generate.test.ts`
  - When: Classification enrichment runs
  - Then: Component receives zone `test`
- **TC-1.2b: Production zone is the default**
  - Given: A component at path `src/orchestration/generate.ts` with no test/generated/vendor indicators
  - When: Classification enrichment runs
  - Then: Component receives zone `production`
- **TC-1.2c: Generated zone detected from markers**
  - Given: A component in a directory named `generated/` or containing auto-generation markers
  - When: Classification enrichment runs
  - Then: Component receives zone `generated`
- **TC-1.2d: Vendored zone detected from directory convention**
  - Given: A component in a directory named `vendor/` or `vendored/` or `third-party/`
  - When: Classification enrichment runs
  - Then: Component receives zone `vendored`
- **TC-1.2e: Infrastructure zone detected from CI/deploy paths**
  - Given: A component at path `.github/workflows/ci.yml` or `docker/Dockerfile`
  - When: Classification enrichment runs
  - Then: Component receives zone `infrastructure`
- **TC-1.2f: Build-script zone detected from scripts directory**
  - Given: A component at path `scripts/build.ts` or `scripts/release.sh`
  - When: Classification enrichment runs
  - Then: Component receives zone `build-script`

**AC-1.3:** Every planned module receives an archetype classification

- **TC-1.3a: Orchestration archetype from constituent roles**
  - Given: A module whose components are predominantly `handler`, `service`, and `controller` roles with high cross-module relationship density
  - When: Module classification runs after planning
  - Then: Module receives archetype `orchestration`
- **TC-1.3b: Type-definition archetype from homogeneous roles**
  - Given: A module whose components are all `type-definition` role
  - When: Module classification runs after planning
  - Then: Module receives archetype `type-definitions`
- **TC-1.3c: Mixed archetype when no dominant pattern**
  - Given: A module with an even mix of roles
  - When: Module classification runs after planning
  - Then: Module receives archetype `mixed`
- **TC-1.3d: Domain-model archetype from model-heavy module**
  - Given: A module whose components are predominantly `model` role with few cross-module dependencies
  - When: Module classification runs after planning
  - Then: Module receives archetype `domain-model`
- **TC-1.3e: Test-suite archetype from test-zone module**
  - Given: A module whose components are all in zone `test`
  - When: Module classification runs after planning
  - Then: Module receives archetype `test-suite`

**AC-1.4:** Classifications are available in agent context during module generation

- **TC-1.4a: Agent receives component roles for its module**
  - Given: A module being generated by an agent
  - When: Agent context is assembled
  - Then: Each component's role and zone labels are included in the context
- **TC-1.4b: Agent receives module archetype**
  - Given: A module being generated by an agent
  - When: Agent context is assembled
  - Then: Module archetype label is included in the context

### Technical Design
<!-- Jira: Technical Notes or sub-section of Description -->

```typescript
type ComponentRole =
  | "service" | "handler" | "controller" | "model" | "repository"
  | "adapter" | "factory" | "utility" | "configuration" | "entry-point"
  | "middleware" | "validator" | "type-definition" | "test" | "fixture"
  | "script" | "unknown";

type CodeZone =
  | "production" | "test" | "generated" | "vendored"
  | "infrastructure" | "configuration" | "build-script" | "documentation";

type ModuleArchetype =
  | "orchestration" | "data-access" | "public-api" | "domain-model"
  | "integration" | "utility-collection" | "type-definitions"
  | "infrastructure" | "test-suite" | "mixed";

interface ClassifiedComponent extends AnalyzedComponent {
  role: ComponentRole;
  zone: CodeZone;
}

interface ClassifiedModule extends PlannedModule {
  archetype: ModuleArchetype;
}
```

*See the tech design document for full architecture, implementation targets, and test mapping.*

### Definition of Done
<!-- Jira: Definition of Done or Acceptance Criteria footer -->

- [ ] Every component receives a role label after analysis
- [ ] Every component receives a zone label after analysis
- [ ] Every module receives an archetype label after planning
- [ ] Classification is deterministic (same input produces identical output)
- [ ] Classifications are included in agent context assembly
- [ ] Enrichment completes in <1s for repos under 500 components
- [ ] All tests pass

---

## Story 2: Provider Tool-Use Support

### Summary
<!-- Jira: Summary field -->

At least one provider (claude-sdk) can run multi-turn tool-use conversations; unsupported providers report this cleanly.

### Description
<!-- Jira: Description field -->

**User Profile:** See epic-level User Profile above.

**Objective:** Implement `inferWithTools()` on the claude-sdk provider so it can run multi-turn conversations with tool use. Providers that don't support tool use return a clear "not supported" error. Usage and cost tracking accumulates across all turns.

**Scope:**

*In:*
- `inferWithTools()` implementation for claude-sdk provider
- Tool call loop: model requests tool use → caller executes → result passed back
- Usage/cost accumulation across all turns
- `supportsToolUse()` returns `true` for claude-sdk, `false` for others
- Clear error from unsupported providers
- Fallback detection: module generation checks provider capability before attempting agentic generation

*Out:*
- OpenRouter tool-use support (stays one-shot)
- Claude CLI tool-use support (stays one-shot pending A2 validation — epic tech design question #2)
- New provider implementations
- Agent logic or tool implementations (Story 4)

**Claude CLI decision:** The epic identifies claude-cli tool-use capability as assumption A2 (unvalidated) and tech design question #2. Until A2 is validated, claude-cli remains one-shot. `supportsToolUse()` returns `false` for claude-cli. If A2 is validated during this story, claude-cli tool-use can be added as a follow-up; if not, claude-cli uses the one-shot fallback path established by AC-5.3b.

**Dependencies:** Story 0 (type definitions and provider interface)

### Acceptance Criteria
<!-- Jira: Acceptance Criteria field -->

**AC-5.1:** Provider interface supports tool-use conversations without breaking existing one-shot callers

- **TC-5.1a: Existing `infer()` calls unchanged**
  - Given: Any code that calls `provider.infer()`
  - When: Provider interface is extended
  - Then: All existing `infer()` callers compile and behave identically
- **TC-5.1b: `inferWithTools()` available on interface**
  - Given: An `InferenceProvider` instance
  - When: Caller invokes `inferWithTools()`
  - Then: Method exists and accepts tool definitions, system prompt, and initial message

**AC-5.2:** Providers that support tool use implement it correctly

- **TC-5.2a: Claude SDK provider supports tool use**
  - Given: A claude-sdk provider instance
  - When: `inferWithTools()` is called with tool definitions and a prompt
  - Then: Provider handles multi-turn conversation, executes tool calls, and returns final output
- **TC-5.2b: Tool call results are passed back to the model**
  - Given: Model returns a tool-use request during conversation
  - When: Tool is executed and result is available
  - Then: Result is sent back to the model and conversation continues

**AC-5.3:** Providers that don't support tool use report this cleanly

- **TC-5.3a: OpenRouter returns unsupported capability error**
  - Given: An openrouter-http provider instance
  - When: `inferWithTools()` is called
  - Then: Returns an error with code indicating tool use is not supported
- **TC-5.3b: Module generation falls back to one-shot for unsupported providers**
  - Given: A provider that does not support tool use
  - When: Module generation detects this
  - Then: Falls back to the existing one-shot structured-output path

**AC-5.4:** Usage and cost tracking works across multi-turn conversations

- **TC-5.4a: Token usage accumulated across all turns**
  - Given: A tool-use conversation with 5 turns
  - When: Conversation completes
  - Then: `getAccumulatedUsage()` reflects total input and output tokens from all turns
- **TC-5.4b: Cost accumulated across all turns**
  - Given: A tool-use conversation with cost reporting
  - When: Conversation completes
  - Then: `computeCost()` reflects total cost from all turns

### Technical Design
<!-- Jira: Technical Notes or sub-section of Description -->

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

*See the tech design document for full architecture, implementation targets, and test mapping.*

### Definition of Done
<!-- Jira: Definition of Done or Acceptance Criteria footer -->

- [ ] `inferWithTools()` implemented for claude-sdk provider
- [ ] Multi-turn tool call loop handles tool requests and passes results back
- [ ] `supportsToolUse()` returns `true` for claude-sdk, `false` for others
- [ ] Unsupported providers return clear error from `inferWithTools()`
- [ ] Usage and cost tracking accumulates across all conversation turns
- [ ] Existing `infer()` callers compile and behave identically
- [ ] All tests pass

---

## Story 3: Repo Documentation Strategy

### Summary
<!-- Jira: Summary field -->

System examines the classified repository and produces a documentation strategy before module planning.

### Description
<!-- Jira: Description field -->

**User Profile:** See epic-level User Profile above.

**Objective:** After component-level classification and before module planning, the system assembles a strategy input from the classified analysis and sends it to the inference provider (one-shot, not agentic). The provider returns a documentation strategy: repo classification, boundary recommendations, zone treatments. The strategy is persisted for use during generation and future update runs. The clustering prompt receives strategy context.

**Scope:**

*In:*
- Strategy input assembly from classified analysis (deterministic)
- One-shot inference call for strategy selection
- Strategy persistence alongside run metadata
- Strategy loading in update mode
- Strategy context injected into the clustering/planning prompt

*Out:*
- Agentic strategy selection (this is one-shot)
- Module archetype assignment (runs after planning, covered in Story 1's classification logic)
- Changes to module planning algorithm itself

**Dependencies:** Story 1 (component-level classification must exist to feed strategy input)

### Acceptance Criteria
<!-- Jira: Acceptance Criteria field -->

**AC-2.1:** System produces a documentation strategy before module planning begins

- **TC-2.1a: Strategy produced for standard TS repo**
  - Given: A TypeScript repository with 20+ components
  - When: Generation pipeline reaches the strategy stage
  - Then: A `DocumentationStrategy` is produced containing repo classification, boundary recommendations, and zone treatments
- **TC-2.1b: Strategy produced for mixed-language repo**
  - Given: A repository with TypeScript and Python files
  - When: Generation pipeline reaches the strategy stage
  - Then: Strategy reflects both language zones and their recommended treatment
- **TC-2.1c: Strategy produced for small repo**
  - Given: A repository with fewer than 8 components
  - When: Generation pipeline reaches the strategy stage
  - Then: Strategy still produced (may recommend summary-only for all modules)

**AC-2.2:** Documentation strategy is persisted alongside run metadata

- **TC-2.2a: Strategy file written to output directory**
  - Given: Strategy selection completes successfully
  - When: Generation proceeds to planning
  - Then: Strategy is available in output metadata and accessible to downstream stages
- **TC-2.2b: Strategy available during update mode**
  - Given: A prior generation run produced a persisted strategy
  - When: An update run reads prior state
  - Then: Prior strategy is loaded and available for comparison
- **TC-2.2c: Fresh strategy replaces stale strategy in update mode**
  - Given: A prior strategy exists but the repo structure has changed significantly (new zones, different role distribution)
  - When: Update run produces a fresh strategy
  - Then: Fresh strategy is used for this run and persisted, replacing the prior strategy

**AC-2.3:** Strategy input is assembled deterministically from classified analysis output

- **TC-2.3a: Same classified analysis produces same strategy input**
  - Given: Two identical classified analysis outputs
  - When: Strategy input is assembled from each
  - Then: Both strategy inputs are byte-identical
- **TC-2.3b: Strategy input includes classification dimensions**
  - Given: Any valid classified `RepositoryAnalysis`
  - When: Strategy input is assembled
  - Then: Input contains component count, language distribution, directory tree summary, relationship density, zone distribution, and role distribution

**AC-2.4:** Module planning receives strategy context

- **TC-2.4a: Clustering prompt includes strategy guidance**
  - Given: A documentation strategy has been produced
  - When: The clustering prompt is built
  - Then: Prompt includes the strategy's boundary recommendations and zone treatments

### Technical Design
<!-- Jira: Technical Notes or sub-section of Description -->

```typescript
type RepoClassification =
  | "service-app" | "library" | "cli-tool"
  | "monolith" | "monorepo" | "mixed";

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

*See the tech design document for full architecture, implementation targets, and test mapping.*

### Definition of Done
<!-- Jira: Definition of Done or Acceptance Criteria footer -->

- [ ] Strategy produced for all repo shapes (standard, mixed-language, small)
- [ ] Strategy input assembly is deterministic
- [ ] Strategy persisted in output metadata
- [ ] Prior strategy loaded in update mode; fresh strategy replaces stale
- [ ] Clustering prompt includes strategy boundary and zone guidance
- [ ] `.module-plan.json` format backward compatible with prior runs
- [ ] Strategy selection completes within one inference call
- [ ] All tests pass

---

## Story 4: Agentic Module Generation with Observation Feedback

### Summary
<!-- Jira: Summary field -->

Modules are generated by an agent with read-source, write-section, and report-observation tools; classifications and strategy flow through to agent context.

### Description
<!-- Jira: Description field -->

**User Profile:** See epic-level User Profile above.

**Objective:** Replace the single structured-output inference call for module generation with an agent that has access to tools. The agent can read source files from the repository, decide what documentation sections are appropriate based on actual code, produce the page iteratively through `write_section` tool calls, and report classification observations via `report_observation`. The assembled page passes existing validation. Per-module time budgets are enforced.

The generation flow:
1. System assembles module context (classifications, strategy, component list)
2. Agent reads source files as needed
3. Agent decides documentation approach and produces sections via tool calls
4. Agent optionally reports classification observations
5. System assembles sections into a page, validates, and writes to disk

**Scope:**

*In:*
- Agent initialization with tools and classified module context
- `read_source` tool: reads files sandboxed to repository root
- `write_section` tool: produces page sections (overview, diagrams, entity table, etc.)
- `report_observation` tool: reports classification taxonomy gaps
- Page assembly from write_section outputs
- Page validation against existing checks (Mermaid, cross-links, metadata)
- Per-module timeout enforcement
- Observation collection and persistence to `.doc-observations.json`
- Observation failures do not affect generation success

*Out:*
- Placeholder page generation and per-module outcome reporting (Story 5)
- Scoring/repair removal (Story 6)
- Provider implementation (Story 2 — consumed here)

**Story 4/5 boundary on timeouts:** Story 4 owns the timeout mechanism — detecting the budget is exceeded, terminating the agent, and cleaning up child processes (AC-4.5). Story 5 owns what happens to the module afterward — writing the placeholder page, recording the `ModuleGenerationOutcome` with `status: "failed"` and `failureReason`, and contributing to run-level status (AC-4.4, AC-7.1). In Story 4's tests, "module is marked as failed" means the timeout handler raises a failure signal that Story 5's machinery consumes. Story 4 can stub the outcome recording; Story 5 tests the full path from failure signal to placeholder and outcome.

**Dependencies:** Story 1 (classifications in context), Story 2 (provider tool-use support), Story 3 (strategy in context)

### Acceptance Criteria
<!-- Jira: Acceptance Criteria field -->

**AC-4.1:** Agent can read source files from the repository during generation

- **TC-4.1a: Agent reads a component's source file**
  - Given: A module contains component `src/analysis/native.ts`
  - When: Agent invokes the read-source tool with that file path
  - Then: Agent receives the file contents, scoped to the repository root
- **TC-4.1b: Agent read is sandboxed to repository**
  - Given: Agent attempts to read a file outside the repository root
  - When: Read-source tool is invoked with an out-of-bounds path
  - Then: Tool returns an error; no file content is returned
- **TC-4.1c: Agent can read multiple files**
  - Given: A module contains 5 components across 3 files
  - When: Agent reads each file
  - Then: Each read succeeds independently and agent has access to all source content

**AC-4.2:** Agent decides documentation sections based on module content

- **TC-4.2a: Agent produces structure diagram for module with clear class/interface structure**
  - Given: A module whose source files contain exported classes with inheritance relationships
  - When: Agent generates the module page
  - Then: Output includes a Mermaid structure diagram reflecting the actual class relationships
- **TC-4.2b: Agent omits sequence diagram when no meaningful flow exists**
  - Given: A module containing only type definitions and utility functions
  - When: Agent generates the module page
  - Then: Output does not include a sequence diagram; no contract violation occurs
- **TC-4.2c: Agent includes sequence diagram when flow is evident from source**
  - Given: A module with orchestration logic (function calls through multiple collaborators)
  - When: Agent generates the module page
  - Then: Output includes a sequence diagram that reflects the actual call flow visible in source

**AC-4.3:** Agent produces a valid module page that passes existing validation

- **TC-4.3a: Generated page passes cross-link validation**
  - Given: Agent produces a module page with cross-references to other modules
  - When: Validation suite runs
  - Then: All cross-links resolve to existing module pages
- **TC-4.3b: Generated page passes Mermaid validation**
  - Given: Agent produces a module page with Mermaid diagrams
  - When: Validation suite runs
  - Then: All Mermaid blocks are syntactically valid
- **TC-4.3c: Generated page contains required sections**
  - Given: Any module
  - When: Agent produces its page
  - Then: Page contains at minimum: title, overview, and source coverage
- **TC-4.3d: Entity table, when present, contains valid entries**
  - Given: Agent produces an entity table section
  - When: Page is assembled
  - Then: Each entity row has non-empty name, kind, and role fields
- **TC-4.3e: Flow notes, when present, accompany a sequence diagram**
  - Given: Agent produces flow notes
  - When: Page is assembled
  - Then: A sequence diagram section is also present; flow notes without a sequence diagram are stripped during assembly
- **TC-4.3f: Source coverage lists actual component paths**
  - Given: Agent produces a source coverage section
  - When: Page is assembled and validated
  - Then: Every listed path exists in the module's component list

**AC-4.5:** Agent generation respects a per-module time budget

- **TC-4.5a: Agent terminates after time budget exceeded**
  - Given: A per-module timeout of N seconds (configurable)
  - When: Agent has not completed within N seconds
  - Then: Agent is terminated and a timeout failure signal is raised (Story 5 consumes this signal to record the outcome and write the placeholder)
- **TC-4.5b: Timeout does not leave orphan processes**
  - Given: Agent timeout occurs during an active inference call
  - When: Timeout fires
  - Then: All child processes and pending requests are cleaned up

**AC-3.1:** Agent can report observations during generation

- **TC-3.1a: Observation reported for unclassified component**
  - Given: Agent is generating a module page and reads a component labeled role `unknown`
  - When: Agent determines the component is clearly a data repository pattern
  - Then: Agent calls `report_observation` with category `classification-gap`, the component path, and a suggested `repository` role
- **TC-3.1b: Observation reported for misclassified zone**
  - Given: Agent reads a component in zone `production` that is clearly generated code
  - When: Agent identifies the mismatch
  - Then: Agent calls `report_observation` with category `zone-ambiguity` and the relevant details

**AC-3.2:** Observations are persisted as a run artifact

- **TC-3.2a: Observations file written after generation completes**
  - Given: Agents reported 5 observations during the run
  - When: Run completes (success or partial success)
  - Then: `.doc-observations.json` exists in the output directory containing all 5 observations
- **TC-3.2b: No observations file when no observations reported**
  - Given: No agent reported any observations during the run
  - When: Run completes
  - Then: No `.doc-observations.json` is written (not an empty file)
- **TC-3.2c: Observations include run metadata**
  - Given: Observations file is written
  - When: File is read
  - Then: Each observation includes the module name, the component or entity it applies to, the category, the observation text, and any suggested classification

**AC-3.3:** Observations do not affect generation success or failure

- **TC-3.3a: Run succeeds regardless of observation count**
  - Given: Agents report 20 observations during a run
  - When: All modules generate successfully
  - Then: Run result is success; observations are informational only
- **TC-3.3b: Observation tool failure does not fail the module**
  - Given: The report_observation tool encounters an internal error
  - When: Agent continues generating
  - Then: Module generation proceeds; observation is lost but generation is unaffected

### Technical Design
<!-- Jira: Technical Notes or sub-section of Description -->

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
  | "overview" | "responsibilities" | "structure-diagram"
  | "entity-table" | "sequence-diagram" | "flow-notes"
  | "source-coverage" | "cross-module-context";

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
  | "classification-gap" | "relationship-gap"
  | "zone-ambiguity" | "archetype-mismatch";

interface RunObservations {
  runId: string;
  timestamp: string;  // ISO 8601
  observationCount: number;
  observations: AgentObservation[];
}
```

*See the tech design document for full architecture, implementation targets, and test mapping.*

### Definition of Done
<!-- Jira: Definition of Done or Acceptance Criteria footer -->

- [ ] Agent reads source files sandboxed to repository root
- [ ] Agent decides documentation sections based on module content and classification context
- [ ] Assembled pages pass existing validation suite (Mermaid, cross-links, required sections)
- [ ] Entity tables contain valid entries; flow notes accompany sequence diagrams
- [ ] Source coverage lists actual component paths
- [ ] Per-module timeout enforced; cleanup on timeout
- [ ] Observations reported via tool, persisted to `.doc-observations.json`
- [ ] No observations file written when no observations reported
- [ ] Observation tool failures do not affect module generation
- [ ] Default max turns per module agent: 15
- [ ] Default per-module timeout: 120 seconds (configurable)
- [ ] On repos where one-shot has >30% module failure rate, agentic achieves <10%
- [ ] All tests pass

---

## Story 5: Graceful Degradation and Per-Module Outcomes

### Summary
<!-- Jira: Summary field -->

Failed modules get placeholder pages on both agentic and one-shot paths; run completes with partial results and reports per-module outcomes.

### Description
<!-- Jira: Description field -->

**User Profile:** See epic-level User Profile above.

**Objective:** When module generation fails — whether on the agentic path or the one-shot fallback — the system writes a placeholder page, logs the failure, and continues generating remaining modules. The run result includes a per-module success/failure breakdown with generation path indicated. Run status follows defined rules: `failure` when more than half of modules fail, `partial-success` when at least one fails but half or more succeed, `success` when all succeed.

**Scope:**

*In:*
- Placeholder page generation for failed modules (both paths)
- Per-module outcome reporting (`ModuleGenerationOutcome` shape)
- Run-level result with status rules (`DocumentationRunResult`)
- Failure logging with module name, reason, and partial output
- Validation reports placeholder pages as warnings, not errors
- One-shot fallback path uses same degradation guarantees

*Out:*
- Agent implementation (Story 4 — consumed here)
- Provider implementation (Story 2 — consumed here)
- Changes to validation logic itself

**Dependencies:** Story 4 (agentic generation must exist to test degradation on both paths)

### Acceptance Criteria
<!-- Jira: Acceptance Criteria field -->

**AC-4.4:** Module generation failures do not abort the entire run

- **TC-4.4a: Single module agent failure allows remaining modules to proceed**
  - Given: A run with 10 modules where module 3's agent fails
  - When: Agent for module 3 returns an error or times out
  - Then: Modules 4-10 still generate; run result reports module 3 as failed
- **TC-4.4b: Failed module produces a placeholder page**
  - Given: A module's agent fails after partial output
  - When: The system handles the failure
  - Then: A placeholder page is written indicating generation failed, with the module name and component list preserved
- **TC-4.4c: Run result reports per-module outcomes**
  - Given: A run where some modules succeed and some fail
  - When: Run completes
  - Then: Result includes a per-module success/failure breakdown

**AC-7.1:** Failed modules get placeholder pages regardless of generation path

- **TC-7.1a: Placeholder written on agent timeout**
  - Given: Module agent exceeds time budget
  - When: System handles the timeout
  - Then: A placeholder `.md` file exists for that module with the module name and a "generation failed" notice
- **TC-7.1b: Placeholder written on agent error**
  - Given: Module agent encounters a provider error
  - When: System handles the error
  - Then: Placeholder page written; error reason included in run result
- **TC-7.1c: Placeholder written on one-shot fallback failure**
  - Given: Provider does not support tool use and one-shot generation fails for a module
  - When: System handles the one-shot failure
  - Then: Placeholder page written; system continues to next module (does not abort the run)

**AC-7.2:** Run completes with partial results when some modules fail

- **TC-7.2a: Run succeeds with warnings when 1 of 10 modules fails**
  - Given: 10 modules planned, module 4 fails (on either path)
  - When: Run completes
  - Then: Run result status is `partial-success`; 9 module pages + 1 placeholder + overview are written
- **TC-7.2b: Run fails when more than half of modules fail**
  - Given: 10 modules planned, 6 or more fail (on either path)
  - When: Run completes
  - Then: Run result status is `failure` with reason indicating too many module failures
- **TC-7.2c: All modules succeed**
  - Given: 10 modules planned, all generate successfully
  - When: Run completes
  - Then: Run result status is `success`

**AC-7.3:** One-shot fallback for providers without tool-use support

- **TC-7.3a: One-shot path used when provider lacks tool-use capability**
  - Given: Provider is openrouter-http (no tool-use support)
  - When: Module generation begins
  - Then: Existing one-shot structured-output path is used
- **TC-7.3b: Per-module outcomes reported the same way on both paths**
  - Given: A run using one-shot fallback
  - When: Run completes
  - Then: Per-module outcomes use the same `ModuleGenerationOutcome` shape as the agentic path

### Technical Design
<!-- Jira: Technical Notes or sub-section of Description -->

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
1. `failure`: more than half of modules failed (`failureCount > totalModules / 2`), or a critical pipeline-level error occurred
2. `partial-success`: at least one module failed but half or more succeeded
3. `success`: all modules generated successfully

The ">half failed" threshold means an even split (e.g., 5 of 10 failed) is `partial-success`, not `failure`.

CLI exit codes: `success` → 0, `partial-success` → 0 (warnings printed to stderr), `failure` → 1.

*See the tech design document for full architecture, implementation targets, and test mapping.*

### Definition of Done
<!-- Jira: Definition of Done or Acceptance Criteria footer -->

- [ ] Failed modules produce placeholder pages on both agentic and one-shot paths
- [ ] Remaining modules continue after a failure
- [ ] Run result includes per-module success/failure breakdown
- [ ] Run status follows defined rules (success / partial-success / failure)
- [ ] One-shot fallback path has identical degradation behavior
- [ ] Per-module outcomes use same `ModuleGenerationOutcome` shape on both paths
- [ ] Validation reports placeholder pages as warnings
- [ ] Total run time ≤2x the current one-shot approach for the same repo
- [ ] `.doc-meta.json` format backward compatible with prior runs
- [ ] All existing CLI commands, flags, and output formats unchanged
- [ ] All tests pass

---

## Story 6: Scoring and Repair Machinery Removal

### Summary
<!-- Jira: Summary field -->

Pre-generation scoring and post-generation repair/coercion removed from the module generation path.

### Description
<!-- Jira: Description field -->

**User Profile:** See epic-level User Profile above.

**Objective:** Remove the deterministic packet-selection scoring algorithm and the post-generation repair/coercion machinery from the module generation path. The agent decides what sections to include based on examining actual code. Validation enforces output correctness after the fact. Page rendering (assembling markdown from structured sections) and deterministic context assembly are retained.

**Scope:**

*In:*
- Remove pre-generation scoring (packet-mode prediction, conservative-mode thresholds)
- Remove post-generation repair prompts and output coercion
- Verify page rendering still produces valid markdown from agent-produced sections
- Verify validation still catches errors regardless of how output was produced

*Out:*
- Changes to validation checks themselves
- Changes to page rendering logic (rendering is retained)
- Changes to context assembly (context assembly is retained)

**Dependencies:** Story 4 (agentic generation replaces scoring), Story 5 (degradation handles failures that repair previously caught)

### Acceptance Criteria
<!-- Jira: Acceptance Criteria field -->

**AC-6.1:** Module generation path does not contain pre-generation scoring or post-generation repair

- **TC-6.1a: No pre-generation section prediction**
  - Given: A module is about to be generated
  - When: The generation stage begins for that module
  - Then: No scoring, packet-mode prediction, or conservative-mode threshold evaluation occurs before the agent starts
- **TC-6.1b: No inline repair on agent output**
  - Given: An agent produces output that doesn't match a specific section template
  - When: The output is collected
  - Then: No repair prompt or coercion is attempted; validation catches errors after assembly

**AC-6.2:** Module page rendering still produces valid markdown from structured sections

- **TC-6.2a: Rendering from agent-produced sections matches expected format**
  - Given: An agent produces structured sections (overview, structure diagram, entity table)
  - When: Sections are passed to the renderer
  - Then: Output markdown has correct section order, Mermaid fencing, and table formatting
- **TC-6.2b: Rendering handles partial sections (no diagram, no sequence)**
  - Given: An agent produces only overview and responsibilities
  - When: Sections are passed to the renderer
  - Then: Output markdown contains those sections without empty diagram placeholders

**AC-6.3:** Validation catches bad output regardless of how it was produced

- **TC-6.3a: Invalid Mermaid still caught by validation**
  - Given: Agent produces a page with malformed Mermaid
  - When: Validation runs
  - Then: Mermaid check reports the error
- **TC-6.3b: Missing overview still caught by validation**
  - Given: Agent produces a page without an overview section
  - When: Page is assembled and validated
  - Then: Validation reports missing required content

### Technical Design
<!-- Jira: Technical Notes or sub-section of Description -->

No new data contracts. This story removes code rather than adding it. The relevant contracts are:

- Page sections produced by the agent (`PageSectionKind` — defined in Story 0)
- Page validation checks (existing, unchanged)
- Page rendering logic (existing, unchanged)

*See the tech design document for full architecture, implementation targets, and test mapping.*

### Definition of Done
<!-- Jira: Definition of Done or Acceptance Criteria footer -->

- [ ] No pre-generation scoring, packet-mode prediction, or conservative-mode thresholds in module generation path
- [ ] No post-generation repair prompts or output coercion in module generation path
- [ ] Page rendering produces valid markdown from agent-produced sections
- [ ] Rendering handles partial sections without empty placeholders
- [ ] Validation catches malformed Mermaid, missing overview, and other errors
- [ ] All tests pass
- [ ] Removed code identified and confirmed unused before deletion

---

## Integration Path Trace

### Path 1: Full Agentic Generation

| Path Segment | Description | Owning Story | Relevant TC |
|---|---|---|---|
| Structural analysis | Existing analysis runs, produces RepositoryAnalysis | Pre-existing | N/A (unchanged) |
| Component classification | Each component gets role and zone labels | Story 1 | TC-1.1a, TC-1.2b |
| Strategy selection | System produces DocumentationStrategy from classified analysis | Story 3 | TC-2.1a |
| Strategy persistence | Strategy written for downstream use | Story 3 | TC-2.2a |
| Module planning with strategy | Clustering prompt receives strategy context | Story 3 | TC-2.4a |
| Module archetype assignment | Each module gets archetype from constituent roles | Story 1 | TC-1.3a |
| Agent context assembly | Classifications and strategy flow to agent | Story 1 | TC-1.4a, TC-1.4b |
| Agent reads source | Agent uses read_source tool on component files | Story 4 | TC-4.1a |
| Agent decides sections | Agent chooses documentation approach from actual code | Story 4 | TC-4.2a |
| Agent writes sections | Agent produces page via write_section calls | Story 4 | TC-4.3c |
| Agent reports observations | Agent uses report_observation for taxonomy gaps | Story 4 | TC-3.1a |
| Page validation | Assembled page passes validation suite | Story 4 | TC-4.3a, TC-4.3b |
| Observations persisted | .doc-observations.json written after run | Story 4 | TC-3.2a |
| Run result reported | Per-module outcomes with run status | Story 5 | TC-7.2c |

### Path 2: Partial Failure with Degradation

| Path Segment | Description | Owning Story | Relevant TC |
|---|---|---|---|
| Module agent fails | Agent returns error or times out | Story 5 | TC-4.4a |
| Placeholder written | System writes placeholder .md for failed module | Story 5 | TC-7.1b |
| Remaining modules continue | Other modules still generate after failure | Story 5 | TC-4.4a |
| Run reports partial-success | Run completes with partial-success status | Story 5 | TC-7.2a |

### Path 3: One-Shot Fallback (Provider Without Tool Use)

| Path Segment | Description | Owning Story | Relevant TC |
|---|---|---|---|
| Provider capability check | Provider reports no tool-use support | Story 2 | TC-5.3a |
| One-shot fallback | Generation uses existing structured-output path | Story 2 | TC-5.3b |
| One-shot failure handling | Failed one-shot gets placeholder page | Story 5 | TC-7.1c |
| Same outcome shape | Per-module outcomes identical on both paths | Story 5 | TC-7.3b |

---

## Coverage Gate

| AC | TC | Story |
|----|-----|-------|
| AC-1.1 | TC-1.1a, TC-1.1b, TC-1.1c, TC-1.1d | Story 1 |
| AC-1.2 | TC-1.2a, TC-1.2b, TC-1.2c, TC-1.2d, TC-1.2e, TC-1.2f | Story 1 |
| AC-1.3 | TC-1.3a, TC-1.3b, TC-1.3c, TC-1.3d, TC-1.3e | Story 1 |
| AC-1.4 | TC-1.4a, TC-1.4b | Story 1 |
| AC-2.1 | TC-2.1a, TC-2.1b, TC-2.1c | Story 3 |
| AC-2.2 | TC-2.2a, TC-2.2b, TC-2.2c | Story 3 |
| AC-2.3 | TC-2.3a, TC-2.3b | Story 3 |
| AC-2.4 | TC-2.4a | Story 3 |
| AC-3.1 | TC-3.1a, TC-3.1b | Story 4 |
| AC-3.2 | TC-3.2a, TC-3.2b, TC-3.2c | Story 4 |
| AC-3.3 | TC-3.3a, TC-3.3b | Story 4 |
| AC-4.1 | TC-4.1a, TC-4.1b, TC-4.1c | Story 4 |
| AC-4.2 | TC-4.2a, TC-4.2b, TC-4.2c | Story 4 |
| AC-4.3 | TC-4.3a, TC-4.3b, TC-4.3c, TC-4.3d, TC-4.3e, TC-4.3f | Story 4 |
| AC-4.4 | TC-4.4a, TC-4.4b, TC-4.4c | Story 5 |
| AC-4.5 | TC-4.5a, TC-4.5b | Story 4 |
| AC-5.1 | TC-5.1a, TC-5.1b | Story 2 |
| AC-5.2 | TC-5.2a, TC-5.2b | Story 2 |
| AC-5.3 | TC-5.3a, TC-5.3b | Story 2 |
| AC-5.4 | TC-5.4a, TC-5.4b | Story 2 |
| AC-6.1 | TC-6.1a, TC-6.1b | Story 6 |
| AC-6.2 | TC-6.2a, TC-6.2b | Story 6 |
| AC-6.3 | TC-6.3a, TC-6.3b | Story 6 |
| AC-7.1 | TC-7.1a, TC-7.1b, TC-7.1c | Story 5 |
| AC-7.2 | TC-7.2a, TC-7.2b, TC-7.2c | Story 5 |
| AC-7.3 | TC-7.3a, TC-7.3b | Story 5 |

**AC/TC result:** 26 ACs mapped. All TCs assigned to exactly one story. No orphans.

### Constraints Not Covered by AC/TC Mapping

The coverage gate above tracks acceptance criteria and test conditions. The following epic constraints are not expressed as ACs but still bind implementation. Each is assigned to its owning story's Definition of Done.

| Constraint | Source | Owning Story |
|---|---|---|
| Classification enrichment <1s for repos under 500 components | NFR: Performance | Story 1 |
| Strategy selection completes within one inference call | NFR: Performance | Story 3 |
| Total run time ≤2x current one-shot approach | NFR: Performance | Story 5 |
| Default max turns per module agent: 15 | NFR: Cost | Story 4 |
| Per-module agent timeout configurable, default 120s | NFR: Performance | Story 4 |
| Usage/cost tracking accurate across all turns | NFR: Cost | Story 2 |
| `.doc-meta.json` format backward compatible | NFR: Compatibility | Story 5 |
| `.module-plan.json` format backward compatible | NFR: Compatibility | Story 3 |
| All existing CLI commands, flags, output formats unchanged | NFR: Compatibility | Story 5 |
| Agentic approach <10% failure rate where one-shot >30% | NFR: Reliability | Story 4 |
| A1: Primary provider supports multi-turn tool use | Assumption (unvalidated) | Story 2 |
| A2: Claude CLI tool-use capability | Assumption (unvalidated) | Story 2 (decision: stays one-shot pending validation) |
| A3: One-shot-only providers work without breaking interface | Assumption (unvalidated) | Story 2 |
| A6: Classification runs deterministically without inference | Assumption (unvalidated) | Story 1 |
