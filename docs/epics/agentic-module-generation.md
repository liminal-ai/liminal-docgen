# Epic: Agentic Module Documentation Generation

This epic defines the requirements for replacing the current one-shot structured
JSON module generation with an agentic approach where the generation step uses
tools to read code, make decisions, and produce documentation iteratively.

---

## User Profile

**Primary User:** Developer running `liminal-docgen generate` against their codebase
**Context:** Generating or regenerating a documentation wiki for a repository, especially mid-to-large codebases (100+ components) with mixed architectural patterns
**Mental Model:** "I point the tool at my repo and it produces a useful wiki that reflects my actual code structure"
**Key Constraint:** Generation must complete reliably without manual intervention. Failures on individual modules should not abort the entire run.

---

## Feature Overview

Today, each module's documentation page is produced by a single inference call
that must return a complete structured JSON payload conforming to a strict Zod
schema. The model cannot read source code during generation, cannot iterate on
its output, and cannot decide to break a complex module into sub-sections. When
the model's one-shot response doesn't match the schema — empty sequence diagrams,
mismatched packet modes, malformed entity tables — the system either fails or
falls back to a degraded summary page.

After this epic ships, three things change. First, the analysis output gains
richer classification primitives — component architectural role, code zone, and
module archetype — so the system has a real vocabulary for what it found instead
of just file paths and export names. Second, module generation uses an agent that
can read source files, inspect relationships, decide what documentation sections
are appropriate, and produce the page iteratively through tool use. Third, the
system gains a repo-level strategy pass that examines the analyzed codebase and
selects a documentation approach before pages are generated, replacing the
hardcoded scoring heuristics.

The agent can also report observations when it encounters code that doesn't fit
the existing classification taxonomy, creating a feedback loop that identifies
where the abstractions need to expand for new repo shapes.

The result is more reliable generation on diverse codebases, higher-quality
documentation grounded in actual source code, significantly less
contract-violation repair machinery, and a system that improves its own
classification vocabulary over time.

---

## Scope

### In Scope

- Component classification enrichment: architectural role, code zone, and module archetype labels added to analysis output
- Agent-based module generation with tool use (read source files, write page sections, report observations)
- Agent observation feedback loop for identifying classification taxonomy gaps
- Repo-level documentation strategy pass between analysis and page generation
- Removal of the deterministic packet-selection scoring algorithm (`module-doc-packet.ts`)
- Provider interface extension to support multi-turn tool use alongside existing one-shot calls
- Preservation of all existing pipeline stages outside module generation (planning, overview, validation, publishing, update mode)

### Out of Scope

- Recursive sub-agent decomposition for complex modules (future enhancement — restore the original CodeWiki capability)
- Changes to the native analyzer's AST parsing or file discovery logic (classification is a post-analysis enrichment layer, not a parser change)
- Changes to the update mode affected-module mapper
- Python retirement / native Python analysis
- New provider implementations
- Changes to the publishing workflow

### Assumptions

| ID | Assumption | Status | Owner | Notes |
|----|------------|--------|-------|-------|
| A1 | Claude SDK supports multi-turn tool use natively | Unvalidated | Engineering | Verify Claude Agent SDK tool-use API |
| A2 | Claude CLI supports tool use through its JSON interface | Unvalidated | Engineering | Check `claude` CLI docs for tool-use flags |
| A3 | OpenRouter can remain on one-shot mode without breaking the provider interface | Unvalidated | Engineering | May need a compatibility path |
| A4 | The existing `RepositoryAnalysis` provides enough raw data for classification enrichment | Validated | — | File paths, export symbols, relationship edges, and language info are all available for heuristic classification |
| A5 | Module generation is the only pipeline stage that needs agentic behavior | Validated | — | Planning, overview, and validation work acceptably with one-shot |
| A6 | Classification enrichment can run deterministically without inference | Unvalidated | Engineering | Heuristic role/zone detection from paths, exports, and relationships; inference only refines during strategy pass |

---

## Flows & Requirements

### 1. Component Classification Enrichment

After structural analysis produces the raw `RepositoryAnalysis`, a classification
enrichment step labels each component with its architectural role and code zone.
This gives the strategy pass and the rest of the pipeline a typed vocabulary for
what it's working with, instead of raw file paths and export names that every
downstream consumer has to re-interpret.

Component-level classification (role, zone) is deterministic and runs immediately
after analysis, before the strategy pass. Module-level classification (archetype)
runs after module planning, since archetypes depend on knowing which components
landed in which module.

The canonical pipeline order is:
analysis → component classification → strategy → planning → module archetype assignment → generation

1. Structural analysis completes (existing behavior, unchanged)
2. System runs component-level classification:
   - Each component gets a `role` label based on its exports, file path, and relationship pattern
   - Each component gets a `zone` label based on directory conventions and file markers
3. Component classifications feed into the strategy pass (Flow 2) and module planning
4. After module planning completes, system runs module-level classification:
   - Each module gets an `archetype` label based on the roles and zones of its constituent components
5. All classifications flow through to agent context during generation

#### Acceptance Criteria

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

---

### 2. Repo Documentation Strategy Selection

After component-level classification (Flow 1, steps 1-3) and before module
planning, the system examines the classified repository and selects a
documentation strategy. This replaces the current approach where every repo gets
the same page template and the only variation is a scoring algorithm deciding
full-packet vs summary-only per module.

1. Component-level classification completes (Flow 1, steps 1-3)
2. System assembles a strategy input from the classified analysis: component count, language distribution, directory structure, relationship density, zone distribution, role distribution
3. System sends strategy input to inference provider (one-shot call, not agentic)
4. Provider returns a documentation strategy: repo classification, recommended documentation boundaries, zone treatments, page shape guidance
5. System persists strategy alongside module plan for use during generation and future updates
6. System proceeds to module planning (existing behavior, with strategy context available to the clustering prompt)

#### Acceptance Criteria

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

---

### 3. Agent Observation Feedback

During agentic module generation, the agent can report structured observations
when it encounters code that doesn't fit the existing classification taxonomy.
These observations are collected per-run into a companion artifact that surfaces
where the abstractions break down, so the classification system can be improved
over time without requiring the agent to solve every gap in real time.

1. Agent encounters a component whose role label is `unknown` or seems wrong based on the source code it read
2. Agent calls the `report_observation` tool with a structured description of the gap
3. System collects the observation into an in-memory list for the run
4. After all modules are generated, system writes observations to `.doc-observations.json` in the output directory
5. Observations are available for human review and for future classification improvements

#### Acceptance Criteria

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

---

### 4. Agent-Based Module Page Generation

Each module's documentation page is generated by an agent with access to tools
rather than by a single structured-output inference call. The agent can read
source files from the repository, decide what documentation sections are
appropriate, build the page incrementally, and report classification observations
when the taxonomy doesn't fit what it sees in the code.

1. System selects next module from plan
2. System assembles module context: component list with classifications, relationships, strategy guidance for this module's zone, module archetype
3. System initializes agent with tools and module context
4. Agent reads source files for the module's components as needed
5. Agent decides documentation approach: what sections to include, what diagrams make sense, based on the actual code and the classification context
6. Agent produces page sections through tool calls (write overview, write structure diagram, write entity table, etc.)
7. Agent optionally reports classification observations via report_observation tool
8. System collects all write_section outputs into a complete page
9. System validates the assembled page against output contracts
10. System writes the validated page to disk
11. System proceeds to next module

#### Acceptance Criteria

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

**AC-4.5:** Agent generation respects a per-module time budget

- **TC-4.5a: Agent terminates after time budget exceeded**
  - Given: A per-module timeout of N seconds (configurable)
  - When: Agent has not completed within N seconds
  - Then: Agent is terminated; module is marked as failed with timeout reason
- **TC-4.5b: Timeout does not leave orphan processes**
  - Given: Agent timeout occurs during an active inference call
  - When: Timeout fires
  - Then: All child processes and pending requests are cleaned up

---

### 5. Provider Interface Extension for Tool Use

The inference provider interface gains the ability to run multi-turn
conversations with tool use, alongside the existing one-shot `infer()` method.
Providers that don't support tool use continue to work for all non-agentic
pipeline stages.

1. Provider interface adds an `inferWithTools()` method
2. Each provider implementation either supports tool use or returns a clear "not supported" error
3. Module generation stage checks provider capability before attempting agentic generation
4. If provider does not support tool use, module generation falls back to the existing one-shot path
5. Cost and usage tracking accumulates across all turns of a tool-use conversation

#### Acceptance Criteria

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

---

### 6. Scoring and Repair Machinery Removal

The pre-generation scoring heuristics and post-generation repair/coercion
machinery are no longer in the module generation path. The agent decides what
sections to include based on examining actual code, and validation enforces
output correctness after the fact. The system no longer predicts what the model
should produce before generation or attempts to fix malformed structured output
inline.

Page rendering (assembling markdown from structured sections) and deterministic
context assembly (entity candidates, relationship summaries) are retained — those
are input and output helpers, not prediction or repair logic.

1. Module generation no longer scores modules for packet eligibility before generation
2. Module generation no longer attempts repair prompts or coercion on invalid structured output
3. Page rendering continues to assemble valid markdown from whatever sections the agent produced
4. All validation checks (Mermaid, cross-links, metadata, file presence, module tree) continue to run after generation

#### Acceptance Criteria

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

---

### 7. Fallback and Error Handling

When module generation fails — whether on the agentic path or the one-shot
fallback — the system degrades gracefully rather than aborting the run. Graceful
degradation is a universal guarantee that applies regardless of provider
capability or generation path.

1. Module generation fails (timeout, agent error, provider error, or invalid output on either path)
2. System writes a placeholder page for that module
3. System logs the failure with module name, reason, and any partial output
4. System continues generating remaining modules
5. Run result includes per-module success/failure breakdown with generation path indicated (agentic or one-shot)
6. Validation reports placeholder pages as warnings, not errors

#### Acceptance Criteria

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

---

## Data Contracts

### Component Classification

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
  | "unknown";           // No pattern matched — expected for unfamiliar codebases

type CodeZone =
  | "production"         // Core application code
  | "test"               // Test suites
  | "generated"          // Auto-generated code (codegen, protobuf, etc.)
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

// Enrichments added to existing types (additive, not breaking)
interface ClassifiedComponent extends AnalyzedComponent {
  role: ComponentRole;
  zone: CodeZone;
}

interface ClassifiedModule extends PlannedModule {
  archetype: ModuleArchetype;
}
```

### Agent Observation

```typescript
interface AgentObservation {
  moduleName: string;
  category: ObservationCategory;
  subjectKind: "component" | "module" | "relationship";
  subject: string;                     // File path for components, module name for modules, "source -> target" for relationships
  observation: string;                 // What the agent found
  suggestedCategory?: string;          // What it thinks the right label would be
}

type ObservationCategory =
  | "classification-gap"               // Component role doesn't exist in taxonomy
  | "relationship-gap"                 // Relationship type not captured by analysis
  | "zone-ambiguity"                   // Zone label seems wrong for this code
  | "archetype-mismatch";             // Module archetype doesn't fit its contents

interface RunObservations {
  runId: string;
  timestamp: string;                   // ISO 8601
  observationCount: number;
  observations: AgentObservation[];
}
```

### Documentation Strategy

```typescript
type RepoClassification =
  | "service-app"        // Backend service or API application
  | "library"            // Reusable library or framework
  | "cli-tool"           // Command-line application
  | "monolith"           // Large application with multiple subsystems
  | "monorepo"           // Multiple packages/apps in one repository
  | "mixed";             // Doesn't fit a single classification

interface DocumentationStrategy {
  repoClassification: RepoClassification;
  boundaries: DocumentationBoundary[];
  zoneGuidance: ZoneGuidance[];
}

interface DocumentationBoundary {
  name: string;                        // e.g., "Convex Backend", "HTTP Server"
  componentPatterns: string[];         // glob patterns matching components in this boundary
  recommendedPageShape: PageShape;
}

type PageShape = "full-structured" | "summary-only" | "overview-only";

interface ZoneGuidance {
  zone: CodeZone;
  treatment: "document" | "summarize" | "exclude";
  reason: string;
}
```

### Agent Tool Definitions

```typescript
interface ReadSourceTool {
  name: "read_source";
  parameters: {
    filePath: string;                  // Relative to repo root
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
    content: string;                   // Markdown content or Mermaid code
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
    subject: string;                   // File path, component, or module this is about
    observation: string;               // What doesn't fit
    suggestedCategory?: string;        // What the agent thinks the right label would be
  };
  returns: {
    recorded: true;
  };
}
```

### Extended Provider Interface

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

// Result of a multi-turn tool-use conversation.
// finalText is the model's closing message after all tool use is complete,
// not the assembled page content (which is built from write_section tool calls).
interface ToolUseConversationResult {
  finalText: string;
  toolCallCount: number;
  turnCount: number;
  usage: InferenceUsage;
  costUsd: number | null;
}
```

### Per-Module Run Outcome

```typescript
// A module either succeeds or fails. Failed modules always get a placeholder page.
// There is no separate "placeholder" status — a placeholder is the output artifact
// of a failed module, not a distinct outcome.
interface ModuleGenerationOutcome {
  moduleName: string;
  status: "success" | "failed";
  generationPath: "agentic" | "one-shot";
  fileName: string;
  durationMs: number;
  turnCount?: number;              // For agentic generation
  toolCallCount?: number;          // For agentic generation
  failureReason?: string;          // Present when status is "failed"
  hasPlaceholderPage?: boolean;    // True when status is "failed" and placeholder was written
  observationCount?: number;       // Observations reported during this module
}
```

### Run-Level Result

```typescript
type RunStatus = "success" | "partial-success" | "failure";

interface DocumentationRunResult {
  status: RunStatus;
  moduleOutcomes: ModuleGenerationOutcome[];
  successCount: number;
  failureCount: number;            // Failed modules (each has a placeholder page)
  totalDurationMs: number;
  warnings: string[];              // Includes failed module names
  observationCount: number;        // Total across all modules
  costUsd: number | null;
}
```

Run status rules (evaluated in order, first match wins):
1. `failure`: more than half of modules failed (failureCount > totalModules / 2), or a critical pipeline-level error occurred
2. `partial-success`: at least one module failed but half or more succeeded
3. `success`: all modules generated successfully

The ">half failed" threshold means an even split (e.g., 5 of 10 failed) is `partial-success`, not `failure`. The system errs toward reporting a usable result rather than discarding a run where half the docs are good.

CLI exit codes: `success` → 0, `partial-success` → 0 (warnings printed to stderr), `failure` → 1.
JSON output mode includes the full `DocumentationRunResult` regardless of status.

---

## Dependencies

Technical dependencies:
- Claude Agent SDK tool-use API (A1 — must be validated before Story 2)
- Claude CLI tool-use capability (A2 — determines whether claude-cli gets agentic support or stays one-shot)

Process dependencies:
- Classification taxonomy review after first real-repo run with observation feedback

---

## Non-Functional Requirements

### Performance
- Per-module agent timeout: configurable, default 120 seconds
- Total run time should not exceed 2x the current one-shot approach for the same repo (agent overhead is acceptable; order-of-magnitude slowdown is not)
- Classification enrichment should complete in <1 second for repos under 500 components (no inference, pure heuristics)
- Strategy selection should complete within one inference call (not agentic)

### Cost
- Per-module cost increase from multi-turn should be bounded; agent should not make unbounded tool calls
- Default max turns per module agent: 15
- Usage and cost tracking must remain accurate across all turns

### Reliability
- On repositories where the current one-shot approach has >30% module failure rate, the agentic approach should achieve <10% module failure rate
- On repositories where the current one-shot approach succeeds, the agentic approach should also succeed with comparable or better output quality

### Compatibility
- All existing CLI commands, flags, and output formats remain unchanged
- Existing `.doc-meta.json` and `.module-plan.json` formats remain backward compatible
- Providers that don't support tool use fall back to the current one-shot path transparently

---

## Tech Design Questions

Questions for the Tech Lead to address during design:

1. What is the Claude Agent SDK's tool-use API shape? Does it handle the tool execution loop internally, or does the caller manage the turn-by-turn conversation?
2. Does the Claude CLI (`claude -p`) support tool use through flags or configuration, or would agentic generation be SDK-only?
3. Should the agent's read-source tool return full file contents or support line-range reads for large files?
4. How should the agent's write-section tool accumulate output — append to a buffer, or overwrite per section? What happens if the agent writes the same section twice?
5. Should the strategy pass produce a separate artifact file (`.doc-strategy.json`) or embed in the module plan?
6. What is the right max-turns default for the module agent? Should it vary by module size or archetype?
7. Should the one-shot fallback path retain the current repair/coercion machinery, or should it also be simplified?
8. What heuristics should drive component role detection? File path conventions (e.g., `services/`, `models/`), export patterns (e.g., all-types file), or relationship shapes (e.g., high fan-out = orchestrator)?
9. Should the classification enrichment step be a separate pipeline stage, or fold into the existing normalizer?
10. How should the observation feedback loop influence future runs? Manual review only, or should persisted observations auto-adjust classification on the next run?
11. How does the system assemble the final page from write_section tool calls? Buffer per section kind, with the renderer assembling them in standard order after the agent finishes?

---

## Recommended Story Breakdown

### Story 0: Foundation (Infrastructure)

Types, classification primitives, tool interfaces, provider capability detection,
and test fixtures needed by all subsequent stories.

- `ComponentRole`, `CodeZone`, `ModuleArchetype` type definitions
- `ClassifiedComponent`, `ClassifiedModule` extended types
- `AgentObservation`, `RunObservations` types
- `DocumentationStrategy`, `DocumentationBoundary`, `ZoneGuidance`, `RepoClassification` types
- `ToolDefinition`, `ToolUseRequest`, `ToolUseConversationResult` types
- `ModuleGenerationOutcome` type
- `supportsToolUse()` method on provider interface (returns false for all providers initially)
- `ReadSourceTool`, `WritePageSectionTool`, `ReportObservationTool` interface definitions
- Test fixtures: mock agentic provider, mock tool executor, classified analysis fixtures

### Story 1: Component Classification Enrichment
**Delivers:** Every component gets a role and zone label after analysis; every module gets an archetype after planning
**Prerequisite:** Story 0
**ACs covered:**
- AC-1.1 (component role classification)
- AC-1.2 (component zone classification)
- AC-1.3 (module archetype classification — runs after planning in the pipeline, but tested here as classification logic)
- AC-1.4 (classifications available in agent context)

### Story 2: Provider Tool-Use Support
**Delivers:** At least one provider (claude-sdk) can run multi-turn tool-use conversations
**Prerequisite:** Story 0
**ACs covered:**
- AC-5.1 (interface extension without breaking existing callers)
- AC-5.2 (claude-sdk tool-use implementation)
- AC-5.3 (unsupported providers report cleanly)
- AC-5.4 (usage/cost tracking across turns)

### Story 3: Repo Documentation Strategy
**Delivers:** System examines classified repo and produces a documentation strategy before planning, using component-level classifications
**Prerequisite:** Story 1
**ACs covered:**
- AC-2.1 (strategy produced before planning)
- AC-2.2 (strategy persisted, including update-mode behavior)
- AC-2.3 (deterministic strategy input from classified analysis)
- AC-2.4 (planning receives strategy context)

### Story 4: Agentic Module Generation with Observation Feedback
**Delivers:** Modules are generated by an agent with read-source, write-section, and report-observation tools; classifications and strategy flow through to agent context
**Prerequisite:** Story 1, Story 2, Story 3
**ACs covered:**
- AC-4.1 (agent reads source files)
- AC-4.2 (agent decides documentation sections)
- AC-4.3 (output passes validation, including entity table, flow notes, source coverage checks)
- AC-4.5 (time budget)
- AC-3.1 (agent reports observations)
- AC-3.2 (observations persisted as run artifact)
- AC-3.3 (observations don't affect success/failure)

### Story 5: Graceful Degradation and Per-Module Outcomes
**Delivers:** Failed modules get placeholders on both agentic and one-shot paths; run completes with partial results; run-level result contract
**Prerequisite:** Story 4
**ACs covered:**
- AC-4.4 (failures don't abort run)
- AC-7.1 (placeholder pages on both paths)
- AC-7.2 (partial result completion with run-level status)
- AC-7.3 (one-shot fallback with same degradation guarantees)

### Story 6: Scoring and Repair Machinery Removal
**Delivers:** Pre-generation scoring and post-generation repair/coercion no longer in the module generation path
**Prerequisite:** Story 4, Story 5
**ACs covered:**
- AC-6.1 (scoring and repair removed)
- AC-6.2 (rendering still works)
- AC-6.3 (validation still catches errors)

---

## Validation Checklist

- [x] User Profile has all four fields + Feature Overview
- [x] Flows cover all paths (happy, alternate, cancel/error)
- [x] Every AC is testable (no vague terms)
- [x] Every AC has at least one TC
- [x] TCs cover happy path, edge cases, and errors
- [x] Data contracts are fully typed (including run-level result)
- [x] Scope boundaries are explicit (in/out/assumptions)
- [x] Story breakdown covers all ACs
- [x] Stories sequence logically (foundation → classification → provider → strategy → generation+observations → degradation → cleanup)
- [x] Dependencies section present
- [x] Canonical pipeline order explicit (analysis → component classification → strategy → planning → archetype assignment → generation)
- [x] Graceful degradation applies universally (both agentic and one-shot paths)
- [x] Self-review complete
- [x] First external review round addressed (Codex review — 2 critical, 3 major, 3 minor)
- [ ] Second validation round (if needed)
