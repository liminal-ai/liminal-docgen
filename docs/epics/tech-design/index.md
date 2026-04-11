# Technical Design: Agentic Module Documentation Generation

## Purpose

This document is the index and decision log for the agentic module generation tech design. The design is split across companion documents by domain — each one covers a distinct architectural layer with its own interfaces, test mapping, and chunk breakdown.

| Audience | Value |
|----------|-------|
| Reviewers | Validate cross-cutting decisions and document map before diving into domains |
| BA/SM | Derive stories from the chunk breakdowns in each companion doc |
| Engineers | Navigate to the specific domain relevant to their current work |

**Epic:** `docs/epics/agentic-module-generation.md`

---

## Spec Validation

Before designing, the epic was validated for implementation readiness.

**Validation Checklist:**
- [x] Every AC maps to clear implementation work
- [x] Data contracts are complete and realistic
- [x] Edge cases have TCs, not just happy path
- [x] No technical constraints the BA missed
- [x] Flows make sense from implementation perspective

**Issues Found:**

| Issue | Spec Location | Recommendation | Status |
|-------|---------------|----------------|--------|
| `ClassifiedComponent extends AnalyzedComponent` forces all analysis consumers to handle classification fields | Data Contracts | Classification produces a wrapper map keyed by file path, not a type extension. Existing `AnalyzedComponent` remains unchanged. | Resolved in design |
| Claude Agent SDK `query()` already accepts a `tools` array and `maxTurns` | A1 assumption | Validated — SDK already supports tool use. The provider just passes `tools: []` today. | Resolved — A1 validated |
| Claude CLI tool-use support unknown | A2 assumption | Deferred — claude-cli provider stays on one-shot path for now. | Deferred to future work |

### Tech Design Questions — Answers

The epic raised 11 questions. Answers below, referenced from the relevant companion docs.

| # | Question | Answer | Where |
|---|----------|--------|-------|
| 1 | Claude Agent SDK tool-use API shape? | Custom tools are supported through `createSdkMcpServer()` — the SDK creates an in-process MCP server from `SdkMcpToolDefinition[]` with Zod schemas and handler functions. The SDK manages the conversation loop internally, invoking handlers when the model requests tool use. The caller receives the final `SDKResultSuccess` with aggregate usage and cost. | `td-provider-tool-use.md` |
| 2 | Claude CLI tool-use support? | Not validated. Claude CLI stays on one-shot path. | Out of scope |
| 3 | Read-source: full file or line ranges? | Full file with a line-count cap (2000 lines). Files over the cap return first 2000 lines with a truncation notice. Large file support is a future enhancement. | `td-agent-runtime.md` |
| 4 | Write-section: append or overwrite? | Last-write-wins per section kind. The section buffer is a `Map<PageSectionKind, string>`. Writing the same section twice replaces the previous content. | `td-agent-runtime.md` |
| 5 | Strategy artifact: separate file or embed? | Separate file: `.doc-strategy.json`. Keeps the module plan format unchanged and gives update mode a clean comparison surface. | `td-strategy-classification.md` |
| 6 | Max-turns default? | 15 turns, not varied by archetype. The timeout (120s default) is the effective budget constraint; max-turns is a safety cap, not a tuning parameter. | `td-agent-runtime.md` |
| 7 | One-shot fallback: keep repair machinery? | Yes, for now. The one-shot path retains existing repair/coercion logic until the agentic path is proven stable across repos. Removal is gated on Story 6. | `td-degradation-cleanup.md` |
| 8 | Classification heuristics? | Three-pass strategy: path conventions first (highest signal), then export pattern analysis, then relationship shape as tiebreaker. Details in companion doc. | `td-strategy-classification.md` |
| 9 | Classification: separate stage or normalizer? | Separate function called from the orchestrator between analysis and strategy. Not folded into the normalizer — classification is a consumer of normalized analysis, not part of normalization. | `td-strategy-classification.md` |
| 10 | Observation feedback: manual or auto-adjust? | Manual review only. Observations are a diagnostic artifact. Auto-adjustment risks compounding classification errors across runs. | `td-agent-runtime.md` |
| 11 | Page assembly from write_section calls? | `Map<PageSectionKind, string>` buffer. After agent finishes, `assembleAgentPage()` prepends the module title and concatenates sections with headings in canonical order. The agentic path does NOT call `renderModuleDocumentationPacket()` — that renderer expects structured data the agent doesn't produce. | `td-agent-runtime.md` |

---

## Context

This feature exists because the current module generation architecture has a structural mismatch between what it asks the LLM to do and what it gives the LLM to work with.

Today, `generateModulePage()` in `src/orchestration/stages/module-generation.ts` calls `provider.infer()` once per module with a structured output schema. The model must return a complete JSON payload — title, overview, responsibilities, Mermaid diagrams, entity tables, sequence diagrams, flow notes, cross-links — in a single response. The model cannot read source code during generation. It works from a summary of exports, relationships, and file paths assembled by `buildModuleDocumentationFacts()`. When the response doesn't match the Zod schema (which happens frequently on complex modules), the system enters a repair loop: `normalizeOptionalPacketFields()` → `isRecoverableModulePacketMismatch()` → `buildModuleRepairPrompt()` → retry → `coerceSummaryOnlyModuleGenerationResult()`. This repair chain is 200+ lines of code compensating for a single-shot generation approach that can't inspect the code it's documenting.

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) supports custom tools through its `createSdkMcpServer()` API, which creates an in-process MCP server from `SdkMcpToolDefinition[]` objects — each with a Zod schema and a handler function. The SDK invokes these handlers when the model requests tool use and manages the entire conversation loop internally. The current provider at `src/inference/providers/claude-sdk.ts` passes `tools: []` (disabling built-in tools) and no MCP servers — the infrastructure for tool use is available but not yet wired.

The design adds classification primitives so the agent has vocabulary for what it's looking at, extends the provider to pass real tools, builds a lightweight agent runtime that manages tool execution and section accumulation, and introduces a strategy pass so documentation structure adapts to the repo. The existing pipeline stages outside module generation (analysis, planning, overview, validation, publishing, update mode) are unchanged. The existing `EngineResult<T>` error handling pattern, the `RunContext` progress reporting, and the validation suite all remain in place.

---

## Canonical Pipeline Order

The epic establishes this stage sequence. All companion docs reference it.

```
┌──────────────────────┐
│  Structural Analysis │  ← existing, unchanged
└──────────┬───────────┘
           ▼
┌──────────────────────────────┐
│  Component Classification    │  ← NEW: deterministic, no inference
│  (role + zone per component) │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  Documentation Strategy      │  ← NEW: one-shot inference call
│  (repo classification,       │
│   boundaries, zone guidance) │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  Module Planning             │  ← existing, receives strategy context
│  (clustering)                │
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  Module Archetype Assignment │  ← NEW: deterministic, post-planning
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  Module Generation           │  ← CHANGED: agentic with tools
│  (per-module agent loop)     │     (or one-shot fallback)
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  Overview Generation         │  ← existing, unchanged
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  Validation + Quality Review │  ← existing, unchanged
└──────────┬───────────────────┘
           ▼
┌──────────────────────────────┐
│  Metadata Write              │  ← existing, gains per-module outcomes
└──────────────────────────────┘
```

---

## Companion Documents

| Document | Domain | ACs Covered | Chunk(s) |
|----------|--------|-------------|----------|
| [`td-strategy-classification.md`](td-strategy-classification.md) | Classification enrichment + documentation strategy | AC-1.1 through AC-1.4, AC-2.1 through AC-2.4 | 0 (types), 1, 3 |
| [`td-provider-tool-use.md`](td-provider-tool-use.md) | Provider interface extension for tool use | AC-5.1 through AC-5.4 | 0 (types), 2 |
| [`td-agent-runtime.md`](td-agent-runtime.md) | Agent tool execution, section buffer, observation collection | AC-3.1 through AC-3.3, AC-4.1 through AC-4.5 | 0 (types), 4 |
| [`td-degradation-cleanup.md`](td-degradation-cleanup.md) | Graceful degradation, run results, scoring removal | AC-6.1 through AC-6.3, AC-7.1 through AC-7.3 | 5, 6 |

Each companion doc follows the altitude model (system context → modules → interfaces) and includes its own TC → test mapping and chunk breakdown.

---

## Cross-Cutting Decisions

### Error Handling Pattern

All new code follows the existing `EngineResult<T>` pattern. New error codes:

| Code | When |
|------|------|
| `CLASSIFICATION_ERROR` | Component or module classification fails (should not happen — heuristics are defensive) |
| `STRATEGY_ERROR` | Strategy inference call fails or returns unparseable output |
| `AGENT_ERROR` | Agent tool-use conversation fails, times out, or exceeds max turns |
| `TOOL_USE_UNSUPPORTED` | Provider does not support tool use (informational, triggers fallback) |

These are added to the existing `EngineErrorCode` union. The `err()` and `ok()` helpers continue to be used everywhere.

### New Files Overview

```
src/
├── classification/
│   ├── component-classifier.ts    # role + zone assignment
│   ├── module-classifier.ts       # archetype assignment
│   └── types.ts                   # ComponentRole, CodeZone, ModuleArchetype, etc.
├── strategy/
│   ├── strategy-input.ts          # deterministic assembly from classified analysis
│   ├── strategy-stage.ts          # inference call + persistence
│   └── types.ts                   # DocumentationStrategy, RepoClassification, etc.
├── agent/
│   ├── runtime.ts                 # agent loop: init → tool dispatch → section collect
│   ├── tools/
│   │   ├── read-source.ts         # sandboxed file reader
│   │   ├── write-section.ts       # section buffer accumulator
│   │   └── report-observation.ts  # observation collector
│   ├── section-buffer.ts          # Map<PageSectionKind, string> + assembly
│   ├── observation-collector.ts   # in-memory list + persistence
│   └── types.ts                   # ToolUseRequest, ToolUseConversationResult, etc.
├── inference/
│   └── types.ts                   # extended with supportsToolUse(), inferWithTools(), ToolUseHandle
└── types/
    └── orchestration.ts           # extended with ModuleGenerationOutcome, DocumentationRunResult
```

### Classification Does Not Mutate Analysis Types

The epic's data contracts define `ClassifiedComponent extends AnalyzedComponent`. In the implementation, classification produces a separate `Map<string, ClassifiedComponentData>` keyed by file path, where `ClassifiedComponentData` contains only the new fields (`role`, `zone`). This avoids changing `AnalyzedComponent` which would break every consumer. The orchestrator passes both the analysis and the classification map to downstream stages. The `ClassifiedComponent` type from the epic is realized as a view function that merges them when needed.

### Verification Scripts

The project already has the full Liminal Spec verification suite:

| Script | Command | Status |
|--------|---------|--------|
| `red-verify` | `biome check . && tsc --noEmit` | Exists |
| `verify` | `biome check . && tsc --noEmit && vitest run` | Exists |
| `green-verify` | `biome check . && tsc --noEmit && vitest run && tsx scripts/guard-no-test-changes.ts` | Exists |
| `verify-all` | `biome check . && tsc --noEmit && vitest run && npm run test:integration` | Exists |

No changes needed to the verification infrastructure.

### Test Organization

New test files follow the existing directory structure:

```
test/
├── classification/
│   ├── component-classifier.test.ts
│   └── module-classifier.test.ts
├── strategy/
│   └── strategy-stage.test.ts
├── agent/
│   ├── runtime.test.ts
│   ├── read-source.test.ts
│   ├── write-section.test.ts
│   ├── report-observation.test.ts
│   └── section-buffer.test.ts
├── inference/
│   └── providers.test.ts              # existing, extended with tool-use tests
└── orchestration/
    ├── generate.test.ts               # existing, extended with per-module outcomes
    └── module-generation.test.ts      # new, tests agentic vs one-shot routing
```

---

## Dependencies

| Dependency | Version | Purpose | Status |
|------------|---------|---------|--------|
| `@anthropic-ai/claude-agent-sdk` | existing (peer dep) | Tool-use support via `query()` | Available |
| `zod` | 4.3.6 (existing) | Schema validation for strategy output | Available |
| `vitest` | existing (dev dep) | Test runner | Available |

No new dependencies. The Claude Agent SDK is already a peer dependency used by the claude-sdk provider.

---

## Chunk Overview (Cross-Document)

Chunks are defined in detail within each companion doc. This is the top-level sequencing view.

```
Chunk 0: Foundation (types, fixtures, error codes)
    ↓
Chunk 1: Classification        Chunk 2: Provider Tool-Use
    ↓                               ↓
Chunk 3: Strategy              ← depends on Chunk 1
    ↓                               ↓
Chunk 4: Agent Runtime         ← depends on Chunk 1, 2, 3
    ↓
Chunk 5: Graceful Degradation  ← depends on Chunk 4
    ↓
Chunk 6: Scoring Removal       ← depends on Chunk 4, 5
```

Chunks 1 and 2 can run in parallel — they have no dependency on each other. Both feed into Chunk 4.

---

## Self-Review Checklist

- [x] Epic validated — every AC maps to implementation
- [x] Tech Design Questions all answered with rationale
- [x] Canonical pipeline order documented and referenced by all companions
- [x] Cross-cutting decisions (error handling, types, test org) centralized here
- [x] No circular dependencies in chunk graph
- [x] Classification design avoids mutating existing types
- [x] Verification scripts already exist — no setup needed
- [x] Companion docs cover all 7 flows and all ACs

---

## Related Documentation

- Epic: `docs/epics/agentic-module-generation.md`
- Companion: `docs/epics/tech-design/td-strategy-classification.md`
- Companion: `docs/epics/tech-design/td-provider-tool-use.md`
- Companion: `docs/epics/tech-design/td-agent-runtime.md`
- Companion: `docs/epics/tech-design/td-degradation-cleanup.md`
