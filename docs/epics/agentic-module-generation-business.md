# Epic: Agentic Module Documentation Generation

<!-- Jira: Epic Name -->

---

## User Profile
<!-- Jira: Epic Description — User Profile section -->

**Primary User:** Developer running `liminal-docgen generate` against their codebase
**Context:** Generating or regenerating a documentation wiki for a repository, especially mid-to-large codebases (100+ components) with mixed architectural patterns
**Mental Model:** "I point the tool at my repo and it produces a useful wiki that reflects my actual code structure"
**Key Constraint:** Generation must complete reliably without manual intervention. Failures on individual modules should not abort the entire run.

---

## Feature Overview
<!-- Jira: Epic Description — Feature Overview section -->

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
<!-- Jira: Epic Description — Scope section -->

### In Scope

- Classification enrichment: each analyzed component gets an architectural role and code zone label; each planned module gets an archetype label
- Agent-based module generation with tool use (read source files, write page sections, report observations)
- Agent observation feedback loop for identifying classification taxonomy gaps
- Repo-level documentation strategy pass between analysis and page generation
- Removal of the deterministic pre-generation scoring and post-generation repair machinery
- Multi-turn tool-use support in the provider layer alongside existing one-shot calls
- Preservation of all existing pipeline stages outside module generation (planning, overview, validation, publishing, update mode)

### Out of Scope

- Recursive sub-agent decomposition for complex modules (future enhancement)
- Changes to the native analyzer's AST parsing or file discovery logic (classification is a post-analysis enrichment layer)
- Changes to the update mode affected-module mapper
- Python retirement / native Python analysis
- New provider implementations
- Changes to the publishing workflow

### Assumptions

| ID | Assumption | Status | Notes |
|----|------------|--------|-------|
| A1 | The primary inference provider supports multi-turn tool use natively | Unvalidated | Verify tool-use API |
| A2 | The CLI provider supports tool use through its interface | Unvalidated | Check CLI docs for tool-use flags |
| A3 | One-shot-only providers can remain on the existing path without breaking the provider interface | Unvalidated | May need a compatibility path |
| A4 | The existing `RepositoryAnalysis` provides enough raw data for classification enrichment | Validated | File paths, export symbols, relationship edges, and language info are all available |
| A5 | Module generation is the only pipeline stage that needs agentic behavior | Validated | Planning, overview, and validation work acceptably with one-shot |
| A6 | Classification enrichment can run deterministically without inference | Unvalidated | Heuristic role/zone detection from paths, exports, and relationships |

---

## Flows & Requirements
<!-- Jira: Epic Description — Requirements section -->

### 1. Component Classification Enrichment

AC-1.1 through AC-1.4. After structural analysis, every component receives an architectural role label (service, handler, utility, type-definition, etc.) and a code zone label (production, test, generated, vendored, etc.) through deterministic heuristics. After module planning, every module receives an archetype label (orchestration, domain-model, type-definitions, etc.) based on its constituent components. All classifications are available in the agent's context during generation. Classification is deterministic — same input always produces the same labels.

*(See Story 1 for detailed ACs and test conditions.)*

### 2. Repo Documentation Strategy Selection

AC-2.1 through AC-2.4. After component classification and before module planning, the system examines the classified repository and produces a documentation strategy through a single inference call. The strategy includes a repo classification (service-app, library, CLI tool, etc.), documentation boundary recommendations, and zone treatments (document, summarize, or exclude each zone). The strategy is persisted for use during generation and loaded in update mode. A fresh strategy replaces a stale one when repo structure changes significantly. The planning step receives strategy context so module clustering accounts for documentation boundaries.

*(See Story 3 for detailed ACs and test conditions.)*

### 3. Agent Observation Feedback

AC-3.1 through AC-3.3. During module generation, agents report structured observations when code doesn't fit the classification taxonomy — for example, a component labeled `unknown` that is clearly a repository pattern, or a component in zone `production` that is clearly generated code. Observations are collected per-run and written to a `.doc-observations.json` artifact after generation completes. Observations are informational only and do not affect run success or failure. If the observation tool encounters an internal error, generation continues unaffected.

*(See Story 4 for detailed ACs and test conditions.)*

### 4. Agent-Based Module Page Generation

AC-4.1 through AC-4.5. Each module's documentation page is generated by an agent with access to tools rather than by a single structured-output call. The agent reads source files from the repository (sandboxed to the repo root), decides what documentation sections are appropriate based on actual code, and produces the page iteratively through tool calls. The assembled page passes existing validation checks (Mermaid syntax, cross-links, required sections, entity table validity, source coverage accuracy). Per-module time budgets are enforced — an agent that exceeds its budget is terminated and the module is marked failed.

*(See Story 4 and Story 5 for detailed ACs and test conditions.)*

### 5. Provider Interface Extension for Tool Use

AC-5.1 through AC-5.4. The provider layer gains multi-turn tool-use conversation support alongside existing one-shot calls. The SDK provider implements tool use. The CLI provider remains one-shot pending validation of its tool-use capability (assumption A2); if validated, CLI tool-use can be added as a follow-up. Providers that don't support tool use report this cleanly, and module generation falls back to the existing one-shot path. Usage and cost tracking accumulates across all turns of a tool-use conversation. Existing one-shot callers are unaffected.

*(See Story 2 for detailed ACs and test conditions.)*

### 6. Scoring and Repair Machinery Removal

AC-6.1 through AC-6.3. Pre-generation scoring (packet-mode prediction, conservative-mode thresholds) and post-generation repair (repair prompts, output coercion) are removed from the module generation path. The agent decides what sections to include; validation enforces correctness after assembly. Page rendering continues to produce valid markdown from structured sections, including handling partial section sets (no diagram, no sequence) without empty placeholders.

*(See Story 6 for detailed ACs and test conditions.)*

### 7. Fallback and Error Handling

AC-7.1 through AC-7.3. When module generation fails — timeout, agent error, provider error, or invalid output — the system writes a placeholder page, logs the failure, and continues generating remaining modules. This applies equally to the agentic path and the one-shot fallback. The run result includes a per-module success/failure breakdown indicating which path was used. Run status is `success` when all modules generate, `partial-success` when at least one fails but half or more succeed, and `failure` when more than half fail. An even split counts as `partial-success`.

*(See Story 5 for detailed ACs and test conditions.)*

---

## Data Contracts
<!-- Jira: Epic Description — Data Contracts section -->

### System Inputs

The developer provides a repository path and provider configuration. Optional inputs include per-module timeout (default 120 seconds) and maximum agent turns per module (default 15).

### System Outputs

**Documentation wiki.** One markdown page per module plus an overview page. Each module page contains a title, overview, and source coverage at minimum. Optional sections — structure diagrams, sequence diagrams, entity tables, flow notes, cross-module context — are included when the agent determines they are appropriate for the module's content.

**Run result.** Reports overall status (`success`, `partial-success`, or `failure`) with a per-module breakdown. Each module's outcome indicates whether it used the agentic or one-shot path, its duration, and any failure reason. Failed modules produce placeholder pages with the module name and component list preserved.

**Documentation strategy.** Persisted alongside run metadata. Contains the repo classification, documentation boundary recommendations, and zone treatments. Loaded in update mode for comparison; replaced when repo structure changes significantly.

**Observation report.** Written to `.doc-observations.json` when agents identify classification gaps during generation. Each observation names the component or module, the gap category (classification gap, zone ambiguity, relationship gap, or archetype mismatch), what the agent found, and what label it suggests. Not written when no observations are reported.

---

## Non-Functional Requirements
<!-- Jira: Epic Description — NFRs section -->

### Performance
- Per-module agent timeout: configurable, default 120 seconds
- Total run time should not exceed 2x the current one-shot approach for the same repo
- Classification enrichment completes in <1 second for repos under 500 components (no inference, pure heuristics)
- Strategy selection completes within one inference call

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
<!-- Jira: Epic Description — Tech Design Questions section -->

1. What is the primary provider's tool-use API shape? Does it handle the tool execution loop internally, or does the caller manage the turn-by-turn conversation?
2. Does the CLI provider support tool use through flags or configuration, or would agentic generation be SDK-only?
3. Should the agent's read-source tool return full file contents or support line-range reads for large files?
4. How should the agent's write-section tool accumulate output — append to a buffer, or overwrite per section? What happens if the agent writes the same section twice?
5. Should the strategy pass produce a separate artifact file or embed in the module plan?
6. What is the right max-turns default for the module agent? Should it vary by module size or archetype?
7. Should the one-shot fallback path retain the current repair/coercion machinery, or should it also be simplified?
8. What heuristics should drive component role detection? File path conventions, export patterns, or relationship shapes?
9. Should the classification enrichment step be a separate pipeline stage, or fold into the existing normalizer?
10. How should the observation feedback loop influence future runs? Manual review only, or should persisted observations auto-adjust classification on the next run?
11. How does the system assemble the final page from write_section tool calls? Buffer per section kind, with the renderer assembling them in standard order after the agent finishes?

---

## Story Breakdown
<!-- Jira: Epic Description — Stories section -->

### Story 0: Foundation
Shared types, tool interfaces, provider capability detection, and test fixtures required by all subsequent stories. No runtime behavior changes.
*(See story file Story 0 for full details.)*

### Story 1: Component Classification Enrichment
Every component gets a role and zone label after analysis; every module gets an archetype after planning. Covers AC-1.1 through AC-1.4.
*(See story file Story 1 for full details and test conditions.)*

### Story 2: Provider Tool-Use Support
At least one provider can run multi-turn tool-use conversations; unsupported providers report this cleanly. Covers AC-5.1 through AC-5.4.
*(See story file Story 2 for full details and test conditions.)*

### Story 3: Repo Documentation Strategy
System examines classified repo and produces a documentation strategy before planning. Covers AC-2.1 through AC-2.4.
*(See story file Story 3 for full details and test conditions.)*

### Story 4: Agentic Module Generation with Observation Feedback
Modules generated by an agent with read-source, write-section, and report-observation tools. Classifications and strategy flow through to agent context. Covers AC-4.1 through AC-4.3, AC-4.5, and AC-3.1 through AC-3.3.
*(See story file Story 4 for full details and test conditions.)*

### Story 5: Graceful Degradation and Per-Module Outcomes
Failed modules get placeholder pages on both paths; run completes with partial results and per-module outcome reporting. Covers AC-4.4, AC-7.1 through AC-7.3.
*(See story file Story 5 for full details and test conditions.)*

### Story 6: Scoring and Repair Machinery Removal
Pre-generation scoring and post-generation repair removed from module generation path. Covers AC-6.1 through AC-6.3.
*(See story file Story 6 for full details and test conditions.)*

---

## Dependencies
<!-- Jira: Epic Description — Dependencies section -->

Technical dependencies:
- Primary inference provider tool-use API (A1 — must be validated before Story 2)
- CLI provider tool-use capability (A2 — determines whether CLI gets agentic support or stays one-shot)

Process dependencies:
- Classification taxonomy review after first real-repo run with observation feedback

---

## Validation Checklist
<!-- Jira: Epic Description — footer -->

- [x] User Profile present with all fields
- [x] Feature Overview describes before/after
- [x] Scope boundaries explicit (in/out/assumptions)
- [x] All flows covered with grouped AC references
- [x] Data contracts describe system boundary inputs/outputs (no TypeScript)
- [x] Non-functional requirements present
- [x] Tech design questions present
- [x] Story breakdown covers all ACs with ranges and story file references
- [x] Dependencies identified
- [x] No code blocks in this document
- [x] Scope cleaned of internal tech references
