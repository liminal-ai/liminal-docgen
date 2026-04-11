# Technical Design: Classification & Strategy Domain

## Context

This companion document covers the first two stages the pipeline gains in the agentic module generation epic: component classification enrichment and repo documentation strategy selection. These stages sit between existing structural analysis and existing module planning in the canonical pipeline order, and they provide the semantic vocabulary that every downstream stage — planning, archetype assignment, agent generation — depends on.

Without these stages, the pipeline treats every component as a bag of exports and file paths. Downstream consumers (the clustering prompt, the module generation prompt, the scoring heuristics) each re-derive structural intent from raw signals, inconsistently and without a shared vocabulary. Classification and strategy replace that ad hoc re-derivation with a single enrichment pass that gives every component a role and zone label, and a single strategy pass that examines the classified repo shape and decides how documentation should be structured.

The two stages are architecturally distinct. Classification is deterministic — pure heuristics over analysis output, no inference calls, sub-second on repos under 500 components. Strategy is inference-backed — a one-shot call that takes the classified analysis summary and returns a `DocumentationStrategy` with repo classification, boundary recommendations, and zone treatments. They share a companion document because they share a boundary: classification's output is strategy's input, and together they form the "understanding the repo" layer that precedes all generation work.

**Epic:** `docs/epics/agentic-module-generation.md`
**Index:** `docs/epics/tech-design/index.md`

### ACs Covered

| AC | Summary | Flow |
|----|---------|------|
| AC-1.1 | Every component receives a role classification | Component Classification |
| AC-1.2 | Every component receives a zone classification | Component Classification |
| AC-1.3 | Every planned module receives an archetype classification | Module Archetype Assignment |
| AC-1.4 | Classifications are available in agent context during generation | Context Assembly |
| AC-2.1 | System produces a documentation strategy before module planning | Strategy Selection |
| AC-2.2 | Strategy is persisted alongside run metadata | Strategy Persistence |
| AC-2.3 | Strategy input assembled deterministically from classified analysis | Strategy Input |
| AC-2.4 | Module planning receives strategy context | Planning Integration |

---

## High Altitude: System View

### Where Classification and Strategy Sit

The canonical pipeline, excerpted from the index with the two new stages highlighted:

```
  Structural Analysis        (existing, unchanged)
         │
         ▼
  Component Classification   ← THIS DOC: deterministic, no inference
  (role + zone per component)
         │
         ▼
  Documentation Strategy     ← THIS DOC: one-shot inference call
  (repo classification,
   boundaries, zone guidance)
         │
         ▼
  Module Planning            (existing, receives strategy context)
         │
         ▼
  Module Archetype Assignment  ← THIS DOC: deterministic, post-planning
         │
         ▼
  Module Generation          (changed — covered in td-agent-runtime.md)
         │
         ▼
  [remainder of pipeline unchanged]
```

Classification runs twice at different pipeline points — once for components (before strategy) and once for modules (after planning). This is because module archetypes depend on knowing which components landed in which module, and that grouping is the output of planning. The component-level classification and the module-level classification share the `src/classification/` directory and the same heuristic philosophy (deterministic, no inference, defensive defaults), but they operate on different input shapes and produce different output shapes.

Strategy runs exactly once, between component classification and planning. It is the only inference call in this domain. Its output is persisted to `.doc-strategy.json` and read by three consumers: the planning stage (for clustering guidance), the archetype assignment stage (for zone-aware archetype rules), and the agent runtime (for per-module page shape guidance).

### Data Flow

The data flow through these two stages connects the existing analysis output to the existing planning input, adding semantic enrichment along the way:

```
RepositoryAnalysis ─────────────────────────────────────────────┐
  │                                                             │
  ▼                                                             │
classifyComponents(analysis)                                    │
  │                                                             │
  ▼                                                             │
Map<string, ClassifiedComponentData>                            │
  │                                                             │
  ├──▶ assembleStrategyInput(analysis, classificationMap)       │
  │         │                                                   │
  │         ▼                                                   │
  │    StrategyInput                                            │
  │         │                                                   │
  │         ▼                                                   │
  │    selectStrategy(provider, strategyInput)                  │
  │         │                                                   │
  │         ▼                                                   │
  │    DocumentationStrategy ──▶ .doc-strategy.json             │
  │         │                                                   │
  │         ▼                                                   │
  ├──▶ Module Planning (existing, now with strategy context) ◀──┘
  │         │
  │         ▼
  │    PlannedModule[]
  │         │
  │         ▼
  └──▶ classifyModules(modules, classificationMap, relationships)
            │
            ▼
       Map<string, ModuleArchetype>
```

Two things to notice. First, the `RepositoryAnalysis` flows through to planning unchanged — strategy is additive context, not a replacement for the raw analysis. Second, the classification map is consumed twice: once by the strategy input assembler and once by the module archetype classifier. This is why classification produces a standalone data structure rather than mutating the analysis — multiple consumers need it at different pipeline points.

---

## Medium Altitude: Module Architecture

### File Responsibilities

The classification and strategy domain spans two source directories. Each file has a single responsibility that maps to one or more acceptance criteria.

#### `src/classification/`

| File | Responsibility | ACs |
|------|---------------|-----|
| `types.ts` | `ComponentRole`, `CodeZone`, `ModuleArchetype`, `ClassifiedComponentData` type definitions | AC-1.1, AC-1.2, AC-1.3 |
| `component-classifier.ts` | `classifyComponents()` — assigns role and zone to every component | AC-1.1, AC-1.2, AC-1.4 |
| `module-classifier.ts` | `classifyModules()` — assigns archetype to every planned module | AC-1.3, AC-1.4 |

The types file is a Chunk 0 deliverable — it ships in the foundation pass before any implementation. The two classifier files are Chunk 1 deliverables.

#### `src/strategy/`

| File | Responsibility | ACs |
|------|---------------|-----|
| `types.ts` | `DocumentationStrategy`, `StrategyInput`, `RepoClassification`, `DocumentationBoundary`, `ZoneGuidance`, `PageShape` type definitions | AC-2.1, AC-2.2 |
| `strategy-input.ts` | `assembleStrategyInput()` — deterministic assembly from classified analysis | AC-2.3 |
| `strategy-stage.ts` | `selectStrategy()` — one-shot inference call, persistence, update-mode loading | AC-2.1, AC-2.2, AC-2.4 |

The types file is a Chunk 0 deliverable. The input assembler and strategy stage are Chunk 3 deliverables (Chunk 3 depends on Chunk 1 because classification must exist before strategy can consume it).

### Relationship to Existing Modules

Classification and strategy are called from the orchestrator at `src/orchestration/generate.ts`. The orchestrator already manages the stage sequence: analyze → plan → generate → overview → validate → write metadata. The new stages insert between analyze and plan, plus one insert between plan and generate (archetype assignment). No existing stage's code changes — the orchestrator gains new calls, and the planning stage receives additional context through its existing parameter surface.

The component classifier reads from `RepositoryAnalysis` (defined in `src/types/analysis.ts`). The module classifier reads from `PlannedModule[]` (defined in `src/types/planning.ts`). Neither classification module imports from or depends on the strategy module. Strategy depends on classification output but not on classification internals — it receives the classification map as a parameter, not by importing the classifier.

---

## Medium Altitude: Flow-by-Flow Design

### Flow 1: Component Classification Enrichment

This flow covers AC-1.1 through AC-1.4. It is entirely deterministic — no inference calls, no network, no I/O beyond reading the analysis that was already loaded into memory.

#### Sequence

```
Orchestrator                  ComponentClassifier
    │                              │
    │  classifyComponents(analysis)│
    │─────────────────────────────▶│
    │                              │
    │                              │──── Pass 1: Path Convention Scan
    │                              │     For each component:
    │                              │       - Extract directory segments
    │                              │       - Match against zone patterns
    │                              │       - Match against role path patterns
    │                              │       - Record matches with confidence
    │                              │
    │                              │──── Pass 2: Export Pattern Analysis
    │                              │     For each component:
    │                              │       - Count exports by kind
    │                              │       - Detect dominant export pattern
    │                              │       - Assign or refine role from exports
    │                              │
    │                              │──── Pass 3: Relationship Shape Tiebreaker
    │                              │     For components still ambiguous:
    │                              │       - Count inbound vs outbound edges
    │                              │       - Detect fan-out (orchestrator signal)
    │                              │       - Detect fan-in (utility signal)
    │                              │       - Break ties
    │                              │
    │     Map<string,              │
    │      ClassifiedComponentData>│
    │◀─────────────────────────────│
    │                              │
    │  [store classification map   │
    │   for downstream stages]     │
```

The three-pass strategy is ordered by signal reliability. Path conventions (Pass 1) are the highest-signal heuristic — a file at `src/services/user-service.ts` is almost certainly a service, a file at `test/services/user-service.test.ts` is almost certainly a test. Export patterns (Pass 2) catch what paths miss — a file that exports only interfaces, types, and enums is a type-definition regardless of where it lives. Relationship shape (Pass 3) is the tiebreaker for ambiguous cases — a component with high fan-out and low fan-in that imports many other components is likely an orchestrator or controller, even if its path and exports are generic.

Each pass can confirm, refine, or leave unchanged the classification from the previous pass. No pass can override a high-confidence classification from an earlier pass. The confidence model is simple: `confirmed` (path match was unambiguous), `likely` (pattern matched but not definitively), and `unresolved` (no pattern matched). Pass 2 can promote `unresolved` to `likely` or `confirmed`. Pass 3 can promote `unresolved` or `likely` to `confirmed`. A component that remains `unresolved` after all three passes gets role `unknown` — this is the expected outcome for unfamiliar codebases and is explicitly not an error (TC-1.1c).

#### AC-1.1: Role Classification

**What the classifier must do:** Assign exactly one `ComponentRole` to every component in the analysis output.

**Path convention rules (Pass 1):**

| Path Pattern | Role | Confidence |
|-------------|------|------------|
| `*/services/*`, `*/service/*` | `service` | confirmed |
| `*/handlers/*`, `*/handler/*` | `handler` | confirmed |
| `*/controllers/*`, `*/controller/*` | `controller` | confirmed |
| `*/models/*`, `*/model/*`, `*/entities/*` | `model` | confirmed |
| `*/repositories/*`, `*/repository/*`, `*/repos/*` | `repository` | confirmed |
| `*/adapters/*`, `*/adapter/*` | `adapter` | confirmed |
| `*/factories/*`, `*/factory/*` | `factory` | likely |
| `*/utils/*`, `*/util/*`, `*/helpers/*`, `*/lib/*` | `utility` | likely |
| `*/config/*`, `*/configuration/*` | `configuration` | likely |
| `*/middleware/*`, `*/middlewares/*` | `middleware` | confirmed |
| `*/validators/*`, `*/validation/*` | `validator` | likely |
| `*/scripts/*` | `script` | confirmed |
| `*/fixtures/*`, `*/mocks/*`, `*/__fixtures__/*` | `fixture` | confirmed |
| File name `index.ts`, `main.ts`, `app.ts`, `cli.ts`, `server.ts` at root or first-level src dir | `entry-point` | likely |

**File name suffix rules (also Pass 1):**

| Suffix | Role | Confidence |
|--------|------|------------|
| `.test.ts`, `.spec.ts`, `.test.js`, `.spec.js` | `test` | confirmed |
| `.service.ts` | `service` | confirmed |
| `.controller.ts` | `controller` | confirmed |
| `.handler.ts` | `handler` | confirmed |
| `.model.ts` | `model` | likely |
| `.adapter.ts` | `adapter` | likely |
| `.factory.ts` | `factory` | likely |
| `.middleware.ts` | `middleware` | confirmed |
| `.validator.ts`, `.schema.ts` | `validator` | likely |
| `.config.ts` | `configuration` | likely |

**Export pattern rules (Pass 2):**

These rules use only the fields available on `ExportedSymbol`: `name` (string), `kind` (union of `function | class | interface | type | variable | enum | constant | other`), and `lineNumber`. There is no `isDefault` flag, no method name list, and no generated-file markers on `AnalyzedComponent`. Rules that would depend on unavailable data have been removed.

| Export Pattern | Role | Confidence |
|---------------|------|------------|
| All exports have `kind` in (`interface`, `type`, `enum`) | `type-definition` | confirmed |
| Exactly one `class` export with `name` matching `*Service` | `service` | confirmed |
| Exactly one `class` export with `name` matching `*Controller` | `controller` | confirmed |
| Exactly one `class` export with `name` matching `*Handler` | `handler` | confirmed |
| Exactly one `class` export with `name` matching `*Repository` or `*Repo` | `repository` | likely |
| Exactly one `class` export with `name` matching `*Adapter` or `*Client` | `adapter` | likely |
| Exactly one `class` export with `name` matching `*Factory` | `factory` | likely |
| Multiple `function` exports, zero `class` exports | `utility` | likely |
| Exactly one `function` export, zero `class` exports | `handler` | likely |

**Relationship shape rules (Pass 3):**

| Relationship Pattern | Role | Confidence |
|---------------------|------|------------|
| Fan-out >= 5 outbound import edges, fan-in <= 2 | `controller` or `service` (prefer `controller` if path is ambiguous) | likely |
| Fan-in >= 5 inbound import edges, fan-out <= 1 | `utility` or `type-definition` (prefer `type-definition` if all exports are types) | likely |
| No inbound edges, outbound edges to services/handlers | `entry-point` | likely |

When no rule matches across all three passes, the component gets role `unknown` with confidence `unresolved`. This satisfies TC-1.1c — the classifier is defensive by design.

**Determinism guarantee (TC-1.1d):** The classifier uses no randomness, no timestamps, no ordering-dependent state. Given the same `RepositoryAnalysis`, it produces the same `Map<string, ClassifiedComponentData>` every time. The three-pass strategy processes components in alphabetical order by file path to ensure deterministic iteration order. Relationship shape lookups use the same sorted order.

#### AC-1.2: Zone Classification

**What the classifier must do:** Assign exactly one `CodeZone` to every component. Zone classification runs as part of Pass 1 (path conventions) because zone is almost entirely determined by directory location.

**Zone detection rules:**

| Pattern | Zone |
|---------|------|
| Path contains `test/`, `tests/`, `__tests__/`, `spec/`, or file has `.test.`, `.spec.` suffix | `test` |
| Path contains `generated/`, `__generated__/`, `codegen/`, or file has `.generated.` suffix | `generated` |
| Path contains `vendor/`, `vendored/`, `third-party/`, `third_party/`, `external/` | `vendored` |
| Path starts with `.github/`, `.circleci/`, `docker/`, `.docker/`, `deploy/`, `infra/`, `terraform/`, `k8s/` | `infrastructure` |
| Path starts with `scripts/`, `tools/`, `build/` | `build-script` |
| Path contains `config/`, `configuration/`, or file is a known config file (`tsconfig.json`, `.eslintrc.*`, `package.json`, `vitest.config.*`) | `configuration` |
| Path starts with `docs/`, `documentation/`, or file is `README.*`, `CHANGELOG.*`, `CONTRIBUTING.*` | `documentation` |
| None of the above | `production` |

Zone rules are evaluated in priority order (top to bottom). A test file inside a `vendor/` directory is classified as `vendored`, not `test` — the container directory takes precedence. A generated file inside `test/` is classified as `test` — test zone outranks generated zone. This priority ordering handles the ambiguous cases consistently.

The zone rules match TC-1.2a through TC-1.2f: test detection from directory convention, production as default, generated from markers, vendored from directory, infrastructure from CI/deploy paths, and build-script from scripts directory.

#### AC-1.3: Module Archetype Assignment

Module archetype classification runs at a different pipeline point than component classification — it happens after planning, because archetypes depend on which components are grouped into which module. But the logic lives in the same `src/classification/` directory because it follows the same design philosophy: deterministic, heuristic, no inference.

**Archetype assignment rules:**

The module archetype classifier receives a `PlannedModule`, the classification map, and the relationship edges. It examines the role distribution and zone distribution of the module's constituent components, plus the cross-module relationship density, to assign an archetype.

| Condition | Archetype |
|-----------|-----------|
| 100% of components are zone `test` | `test-suite` |
| 100% of components are role `type-definition` | `type-definitions` |
| >= 60% of components are zone `infrastructure` or `build-script` | `infrastructure` |
| >= 60% of components are role `model` and cross-module dependency count <= 2 | `domain-model` |
| >= 60% of components are role `adapter` | `integration` |
| >= 50% of components are role `handler` or `controller` with cross-module edges >= 3 | `orchestration` |
| >= 60% of components are role `repository` | `data-access` |
| >= 50% of components are role `handler` or `entry-point` with only outbound cross-module edges | `public-api` |
| >= 60% of components are role `utility` | `utility-collection` |
| None of the above | `mixed` |

Rules are evaluated in priority order. The first matching rule wins. The thresholds are intentionally generous — a module where 60% of its components are models is a "domain-model" module even if the remaining 40% are utility helpers. The `mixed` archetype is the default, analogous to `unknown` for component roles. It is not an error — it is the expected result for modules that don't have a dominant pattern.

The archetype classifier checks conditions in the order listed because some conditions are more specific than others. A module where all components are test files should be `test-suite` regardless of the roles those test files have. Zone-based archetypes (test-suite, infrastructure) take priority over role-based archetypes (orchestration, domain-model) because zone is a stronger structural signal.

This satisfies TC-1.3a (orchestration from constituent roles), TC-1.3b (type-definitions from homogeneous roles), TC-1.3c (mixed when no dominant pattern), TC-1.3d (domain-model from model-heavy module), and TC-1.3e (test-suite from test-zone module).

#### AC-1.4: Classifications Available in Agent Context

AC-1.4 specifies that classification data must be available to the agent during module generation. This AC is the bridge between this document and `td-agent-runtime.md`. The implementation responsibility lives in the orchestrator and the agent context assembly function, not in the classification module itself.

The classification module's responsibility is to produce the data. The `classifyComponents()` return value (`Map<string, ClassifiedComponentData>`) and the `classifyModules()` return value (`Map<string, ModuleArchetype>`) are passed through the orchestrator to the agent context builder, which assembles them into the agent's system prompt. The classification module does not need to know about agent context — it produces data, and the orchestrator routes it.

From this document's perspective, AC-1.4 is satisfied when:
1. `classifyComponents()` returns a map that covers every component in the analysis (TC-1.4a)
2. `classifyModules()` returns a map that covers every planned module (TC-1.4b)
3. The orchestrator passes both maps to the agent context assembly function (tested in orchestration integration tests, covered in `td-agent-runtime.md`)

#### Skeleton Requirements

Before implementation, the following skeleton must compile cleanly:

```typescript
// src/classification/types.ts

export type ComponentRole =
  | "service"
  | "handler"
  | "controller"
  | "model"
  | "repository"
  | "adapter"
  | "factory"
  | "utility"
  | "configuration"
  | "entry-point"
  | "middleware"
  | "validator"
  | "type-definition"
  | "test"
  | "fixture"
  | "script"
  | "unknown";

export type CodeZone =
  | "production"
  | "test"
  | "generated"
  | "vendored"
  | "infrastructure"
  | "configuration"
  | "build-script"
  | "documentation";

export type ModuleArchetype =
  | "orchestration"
  | "data-access"
  | "public-api"
  | "domain-model"
  | "integration"
  | "utility-collection"
  | "type-definitions"
  | "infrastructure"
  | "test-suite"
  | "mixed";

export type ClassificationConfidence = "confirmed" | "likely" | "unresolved";

/**
 * Classification data for a single component. Keyed by file path
 * in the classification map. Does NOT extend AnalyzedComponent —
 * the analysis types remain unchanged.
 *
 * Supports: AC-1.1, AC-1.2
 */
export interface ClassifiedComponentData {
  readonly role: ComponentRole;
  readonly roleConfidence: ClassificationConfidence;
  readonly zone: CodeZone;
}
```

```typescript
// src/classification/component-classifier.ts

import type { RepositoryAnalysis } from "../types/analysis.js";
import type { ClassifiedComponentData } from "./types.js";

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
  throw new Error("Not implemented: classifyComponents");
}
```

```typescript
// src/classification/module-classifier.ts

import type { PlannedModule } from "../types/planning.js";
import type { AnalyzedRelationship } from "../types/analysis.js";
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
  modules: PlannedModule[],
  classificationMap: Map<string, ClassifiedComponentData>,
  relationships: AnalyzedRelationship[],
): Map<string, ModuleArchetype> {
  throw new Error("Not implemented: classifyModules");
}
```

### Flow 2: Repo Documentation Strategy Selection

This flow covers AC-2.1 through AC-2.4. It is the only inference call in this domain — a single one-shot provider call that takes a deterministic strategy input and returns a structured `DocumentationStrategy`.

#### Sequence

```
Orchestrator           StrategyInputAssembler       StrategyStage         Provider
    │                         │                         │                    │
    │  assembleStrategyInput  │                         │                    │
    │  (analysis, classMap)   │                         │                    │
    │────────────────────────▶│                         │                    │
    │                         │                         │                    │
    │                         │── Compute counts:       │                    │
    │                         │   - componentCount      │                    │
    │                         │   - languageDistribution│                    │
    │                         │   - directoryTree       │                    │
    │                         │   - relationshipDensity │                    │
    │                         │   - zoneDistribution    │                    │
    │                         │   - roleDistribution    │                    │
    │                         │                         │                    │
    │    StrategyInput        │                         │                    │
    │◀────────────────────────│                         │                    │
    │                         │                         │                    │
    │  selectStrategy(provider, strategyInput, opts)    │                    │
    │──────────────────────────────────────────────────▶│                    │
    │                         │                         │                    │
    │                         │                         │  provider.infer()  │
    │                         │                         │───────────────────▶│
    │                         │                         │                    │
    │                         │                         │  EngineResult<     │
    │                         │                         │   DocStrategy>     │
    │                         │                         │◀───────────────────│
    │                         │                         │                    │
    │                         │                         │── Validate against │
    │                         │                         │   Zod schema       │
    │                         │                         │                    │
    │                         │                         │── Persist to       │
    │                         │                         │   .doc-strategy.json
    │                         │                         │                    │
    │    DocumentationStrategy│                         │                    │
    │◀─────────────────────────────────────────────────│                    │
    │                         │                         │                    │
    │  [pass strategy to      │                         │                    │
    │   planning stage]       │                         │                    │
```

The strategy stage uses the existing `provider.infer()` one-shot method — it does not need tool use. The provider returns a structured JSON response that the strategy stage validates against a Zod schema. If validation fails, the strategy stage returns an `EngineResult` error with code `STRATEGY_ERROR`. The orchestrator decides how to handle that error — the recommended behavior is to proceed with planning using default strategy values (document everything, no boundary recommendations), logging a warning.

#### AC-2.1: Strategy Produced Before Planning

The orchestrator calls `selectStrategy()` after `classifyComponents()` and before the planning stage. The strategy stage makes a single inference call with the assembled `StrategyInput` and returns a `DocumentationStrategy`.

The strategy prompt asks the model to examine the repository shape — how many components, what languages, what role distribution, what zone distribution, what the directory tree looks like — and produce three outputs:

1. **Repo classification** — what kind of repository is this? A service app, a library, a CLI tool, a monolith, a monorepo, or a mix? This tells the agent what documentation conventions apply.
2. **Documentation boundaries** — what are the natural subsystems? Each boundary has a name, component patterns (globs), and a recommended page shape (full-structured, summary-only, or overview-only).
3. **Zone guidance** — for each zone present in the repo, should it be documented, summarized, or excluded? Infrastructure code might be excluded. Test code might be summarized. Generated code is almost always excluded.

The prompt includes the full `StrategyInput` as structured data (JSON), not as prose. The model returns a JSON response conforming to the `DocumentationStrategy` schema. This is a standard one-shot structured-output call using the same `provider.infer()` path that planning and overview generation use today.

TC-2.1a (standard TS repo), TC-2.1b (mixed-language repo), and TC-2.1c (small repo) are all satisfied by the same code path — the strategy stage produces a `DocumentationStrategy` regardless of repo size or language composition. The model may recommend different strategies for different repo shapes (a small repo might get summary-only for all modules), but the pipeline always produces a strategy.

#### AC-2.2: Strategy Persistence

The strategy stage writes the `DocumentationStrategy` to `.doc-strategy.json` in the output directory after validation succeeds. This is a standalone artifact, separate from `.module-plan.json` and `.doc-meta.json`. Keeping it separate serves two purposes: it gives update mode a clean comparison surface (has the strategy changed?), and it keeps the module plan format unchanged (no migration needed).

**File format:** The `.doc-strategy.json` file contains the `DocumentationStrategy` object serialized as JSON with 2-space indentation. No wrapper — the file is the strategy object directly.

**Update mode behavior (TC-2.2b, TC-2.2c):** When running in update mode, the strategy stage:
1. Checks whether `.doc-strategy.json` exists from a prior run
2. If it exists, loads and parses the prior strategy
3. Runs a fresh strategy inference call regardless (the repo may have changed)
4. Compares the fresh strategy to the prior strategy
5. If they differ, uses the fresh strategy and persists it (TC-2.2c)
6. If they match, uses the existing strategy (no re-write needed, but functionally identical)

The comparison is structural, not byte-level — the strategies are compared by their JSON-serialized canonical form after key-sorting. This handles cases where the model produces the same strategy with different key ordering.

#### AC-2.3: Deterministic Strategy Input

The strategy input is assembled deterministically from the classified analysis output. Given the same `RepositoryAnalysis` and the same `Map<string, ClassifiedComponentData>`, the `assembleStrategyInput()` function always produces the same `StrategyInput`. This is important for reproducibility and for update-mode comparison — if the analysis hasn't changed, the strategy input shouldn't change.

The `StrategyInput` is an intermediate data structure, not persisted. It exists only as the argument to the strategy inference call.

TC-2.3a (byte-identical inputs from identical analyses) and TC-2.3b (input includes all classification dimensions) are both satisfied by the assembly function's design: it iterates components in sorted order, counts by category, and produces a fixed-shape output.

#### AC-2.4: Planning Receives Strategy Context

After strategy selection, the orchestrator passes the `DocumentationStrategy` to the planning stage. The planning stage incorporates strategy guidance into the clustering prompt — specifically the boundary recommendations and zone treatments.

The clustering prompt already receives the analysis output. With strategy context, it additionally receives:
- The repo classification (so the model knows what kind of repo it's clustering)
- The boundary recommendations (so the model can use the suggested subsystem divisions as clustering hints)
- The zone treatments (so the model knows which zones should be excluded from documentation — excluded zones' components shouldn't form their own modules)

The planning stage's function signature gains an optional `strategy?: DocumentationStrategy` parameter. When present, the clustering prompt includes the strategy guidance. When absent (strategy selection failed, or running in a legacy mode), planning proceeds without strategy context — the same behavior as today.

This satisfies TC-2.4a: the clustering prompt includes strategy guidance when a strategy has been produced.

#### Skeleton Requirements

```typescript
// src/strategy/types.ts

import type { CodeZone } from "../classification/types.js";

export type RepoClassification =
  | "service-app"
  | "library"
  | "cli-tool"
  | "monolith"
  | "monorepo"
  | "mixed";

export type PageShape = "full-structured" | "summary-only" | "overview-only";

/**
 * A boundary represents a natural subsystem in the repository that
 * should be documented as a cohesive unit. Boundaries guide module
 * clustering — they are suggestions, not hard constraints.
 *
 * Supports: AC-2.1
 */
export interface DocumentationBoundary {
  readonly name: string;
  readonly componentPatterns: string[];
  readonly recommendedPageShape: PageShape;
}

/**
 * Guidance for how a particular code zone should be treated in documentation.
 * Zones that are "excluded" should not generate their own module pages.
 * Zones that are "summarized" get summary-only treatment.
 *
 * Supports: AC-2.1
 */
export interface ZoneGuidance {
  readonly zone: CodeZone;
  readonly treatment: "document" | "summarize" | "exclude";
  readonly reason: string;
}

/**
 * The complete documentation strategy for a repository. Produced by a
 * one-shot inference call and persisted to .doc-strategy.json.
 *
 * Supports: AC-2.1, AC-2.2
 */
export interface DocumentationStrategy {
  readonly repoClassification: RepoClassification;
  readonly boundaries: DocumentationBoundary[];
  readonly zoneGuidance: ZoneGuidance[];
}

/**
 * The deterministic input assembled from classified analysis output.
 * Passed to the inference provider as the structured data for strategy selection.
 * Not persisted — exists only as a function argument.
 *
 * Supports: AC-2.3
 */
export interface StrategyInput {
  readonly componentCount: number;
  readonly languageDistribution: Record<string, number>;
  readonly directoryTreeSummary: string[];
  readonly relationshipDensity: number;
  readonly zoneDistribution: Record<string, number>;
  readonly roleDistribution: Record<string, number>;
}
```

```typescript
// src/strategy/strategy-input.ts

import type { RepositoryAnalysis } from "../types/analysis.js";
import type { ClassifiedComponentData } from "../classification/types.js";
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
  throw new Error("Not implemented: assembleStrategyInput");
}
```

```typescript
// src/strategy/strategy-stage.ts

import type { InferenceProvider } from "../inference/types.js";
import type { EngineResult } from "../types/common.js";
import type { DocumentationStrategy, StrategyInput } from "./types.js";

export interface StrategySelectionOptions {
  /** Directory where .doc-strategy.json is read from / written to */
  readonly outputDir: string;
  /** When true, load prior strategy for comparison (update mode) */
  readonly loadPrior: boolean;
}

/**
 * Runs the documentation strategy selection stage. Makes a one-shot
 * inference call with the assembled strategy input and returns a
 * validated DocumentationStrategy.
 *
 * On success, persists the strategy to .doc-strategy.json in the output directory.
 * On failure, returns an EngineResult error with code STRATEGY_ERROR.
 *
 * Supports: AC-2.1, AC-2.2, AC-2.4
 *
 * @param provider - The inference provider for the one-shot call
 * @param strategyInput - The deterministic input from assembleStrategyInput()
 * @param options - Output directory and update-mode flag
 * @returns The documentation strategy or an error
 */
export function selectStrategy(
  provider: InferenceProvider,
  strategyInput: StrategyInput,
  options: StrategySelectionOptions,
): Promise<EngineResult<DocumentationStrategy>> {
  throw new Error("Not implemented: selectStrategy");
}

/**
 * Loads a previously persisted strategy from .doc-strategy.json.
 * Returns null if the file doesn't exist or can't be parsed.
 *
 * Supports: AC-2.2 (update mode)
 *
 * @param outputDir - Directory containing the prior .doc-strategy.json
 * @returns The prior strategy or null
 */
export function loadPriorStrategy(
  outputDir: string,
): Promise<DocumentationStrategy | null> {
  throw new Error("Not implemented: loadPriorStrategy");
}
```

---

## Low Altitude: Interface Definitions

This section provides the complete, copy-paste-ready type definitions for the classification and strategy domain. Every type is annotated with the ACs it supports.

### Classification Types

```typescript
// src/classification/types.ts — complete file

/**
 * The architectural role of a component, determined by heuristic analysis
 * of its file path, export patterns, and relationship shape.
 *
 * Supports: AC-1.1
 */
export type ComponentRole =
  | "service"
  | "handler"
  | "controller"
  | "model"
  | "repository"
  | "adapter"
  | "factory"
  | "utility"
  | "configuration"
  | "entry-point"
  | "middleware"
  | "validator"
  | "type-definition"
  | "test"
  | "fixture"
  | "script"
  | "unknown";

/**
 * The code zone a component belongs to, determined by directory
 * conventions and file markers.
 *
 * Supports: AC-1.2
 */
export type CodeZone =
  | "production"
  | "test"
  | "generated"
  | "vendored"
  | "infrastructure"
  | "configuration"
  | "build-script"
  | "documentation";

/**
 * The documentation archetype of a planned module, determined by
 * the role and zone distribution of its constituent components.
 *
 * Supports: AC-1.3
 */
export type ModuleArchetype =
  | "orchestration"
  | "data-access"
  | "public-api"
  | "domain-model"
  | "integration"
  | "utility-collection"
  | "type-definitions"
  | "infrastructure"
  | "test-suite"
  | "mixed";

/**
 * Internal confidence level for classification decisions.
 * Used during multi-pass classification to determine when
 * later passes should override earlier ones.
 *
 * - confirmed: unambiguous match (e.g., file in services/ directory)
 * - likely: pattern matched but not definitively
 * - unresolved: no pattern matched; eligible for refinement by later passes
 */
export type ClassificationConfidence = "confirmed" | "likely" | "unresolved";

/**
 * Classification data for a single component.
 *
 * This is a standalone data structure, NOT an extension of AnalyzedComponent.
 * The classification map (Map<string, ClassifiedComponentData>) is keyed by
 * file path and consumed alongside the RepositoryAnalysis — it does not
 * mutate or replace the analysis types.
 *
 * Supports: AC-1.1, AC-1.2
 */
export interface ClassifiedComponentData {
  readonly role: ComponentRole;
  readonly roleConfidence: ClassificationConfidence;
  readonly zone: CodeZone;
}

/**
 * View type that merges AnalyzedComponent with its classification data.
 * Created on-demand by consumers that need the combined view (e.g.,
 * agent context assembly). Not stored — reconstructed from the analysis
 * component and the classification map entry.
 *
 * Supports: AC-1.4
 */
export interface ClassifiedComponentView {
  readonly filePath: string;
  readonly language: string;
  readonly exportedSymbols: ReadonlyArray<{
    readonly name: string;
    readonly kind: string;
    readonly lineNumber: number;
  }>;
  readonly linesOfCode: number;
  readonly role: ComponentRole;
  readonly roleConfidence: ClassificationConfidence;
  readonly zone: CodeZone;
}

/**
 * Creates a ClassifiedComponentView by merging an AnalyzedComponent
 * with its classification data. Returns null if no classification
 * exists for the component's file path.
 *
 * Supports: AC-1.4
 */
export function mergeComponentView(
  component: { filePath: string; language: string; exportedSymbols: ReadonlyArray<{ name: string; kind: string; lineNumber: number }>; linesOfCode: number },
  classificationMap: Map<string, ClassifiedComponentData>,
): ClassifiedComponentView | null {
  const classification = classificationMap.get(component.filePath);
  if (!classification) return null;
  return {
    filePath: component.filePath,
    language: component.language,
    exportedSymbols: component.exportedSymbols,
    linesOfCode: component.linesOfCode,
    role: classification.role,
    roleConfidence: classification.roleConfidence,
    zone: classification.zone,
  };
}
```

### Classifier Function Signatures

```typescript
// src/classification/component-classifier.ts — public API

import type { RepositoryAnalysis } from "../types/analysis.js";
import type { ClassifiedComponentData } from "./types.js";

/**
 * Classifies every component in the analysis output with a role and zone.
 *
 * Three-pass strategy:
 * 1. Path conventions — highest signal, catches services/, test/, etc.
 * 2. Export patterns — catches type-only files, service classes, etc.
 * 3. Relationship shapes — tiebreaker for ambiguous cases
 *
 * Deterministic: components are iterated in sorted order by file path.
 * No randomness, no inference calls.
 *
 * Performance: <1 second for repos under 500 components.
 *
 * Supports: AC-1.1, AC-1.2
 *
 * @param analysis - The structural analysis output from the analysis stage
 * @returns Map from file path to classification data (covers every component)
 */
export function classifyComponents(
  analysis: RepositoryAnalysis,
): Map<string, ClassifiedComponentData>;
```

```typescript
// src/classification/module-classifier.ts — public API

import type { PlannedModule } from "../types/planning.js";
import type { AnalyzedRelationship } from "../types/analysis.js";
import type { ClassifiedComponentData, ModuleArchetype } from "./types.js";

/**
 * Assigns an archetype to every planned module based on:
 * - Role distribution of constituent components
 * - Zone distribution of constituent components
 * - Cross-module relationship density
 *
 * Deterministic: modules are iterated in sorted order by name.
 * No randomness, no inference calls.
 *
 * Supports: AC-1.3
 *
 * @param modules - The planned modules from the clustering stage
 * @param classificationMap - Component classifications from classifyComponents()
 * @param relationships - All relationship edges from the analysis
 * @returns Map from module name to archetype (covers every module)
 */
export function classifyModules(
  modules: PlannedModule[],
  classificationMap: Map<string, ClassifiedComponentData>,
  relationships: AnalyzedRelationship[],
): Map<string, ModuleArchetype>;
```

### Strategy Types

```typescript
// src/strategy/types.ts — complete file

import type { CodeZone } from "../classification/types.js";

/**
 * High-level classification of the repository's purpose and structure.
 * Guides documentation conventions and page templates.
 *
 * Supports: AC-2.1
 */
export type RepoClassification =
  | "service-app"
  | "library"
  | "cli-tool"
  | "monolith"
  | "monorepo"
  | "mixed";

/**
 * Recommended page shape for modules within a documentation boundary.
 *
 * - full-structured: all sections (diagrams, entity tables, flow notes)
 * - summary-only: overview and responsibilities, no diagrams
 * - overview-only: single paragraph overview, minimal detail
 *
 * Supports: AC-2.1
 */
export type PageShape = "full-structured" | "summary-only" | "overview-only";

/**
 * A documentation boundary represents a natural subsystem in the
 * repository that should be documented as a cohesive unit.
 *
 * Boundaries are suggestions to the clustering algorithm, not hard
 * constraints. The clustering prompt uses them as hints when deciding
 * which components belong together.
 *
 * Supports: AC-2.1, AC-2.4
 */
export interface DocumentationBoundary {
  readonly name: string;
  readonly componentPatterns: string[];
  readonly recommendedPageShape: PageShape;
}

/**
 * Treatment guidance for a particular code zone.
 *
 * - document: generate full documentation for components in this zone
 * - summarize: generate summary-only pages for components in this zone
 * - exclude: do not generate documentation for components in this zone
 *
 * Supports: AC-2.1, AC-2.4
 */
export interface ZoneGuidance {
  readonly zone: CodeZone;
  readonly treatment: "document" | "summarize" | "exclude";
  readonly reason: string;
}

/**
 * The complete documentation strategy for a repository.
 *
 * Produced by a one-shot inference call in the strategy stage.
 * Persisted to .doc-strategy.json in the output directory.
 * Consumed by the planning stage (boundary hints), the archetype
 * classifier (zone-aware rules), and the agent runtime (page shape guidance).
 *
 * Supports: AC-2.1, AC-2.2
 */
export interface DocumentationStrategy {
  readonly repoClassification: RepoClassification;
  readonly boundaries: DocumentationBoundary[];
  readonly zoneGuidance: ZoneGuidance[];
}

/**
 * Deterministic input assembled from classified analysis output.
 * This is the structured data sent to the inference provider for
 * strategy selection. Not persisted — exists only as a function argument.
 *
 * All fields are computed deterministically from the RepositoryAnalysis
 * and the classification map. Same inputs always produce the same
 * StrategyInput (TC-2.3a).
 *
 * Supports: AC-2.3
 */
export interface StrategyInput {
  /** Total number of components in the analysis */
  readonly componentCount: number;

  /** Count of components per language (e.g., { "typescript": 45, "python": 12 }) */
  readonly languageDistribution: Readonly<Record<string, number>>;

  /**
   * Top-level directory names with component counts, sorted alphabetically.
   * e.g., ["src/ (52 components)", "test/ (18 components)", "scripts/ (3 components)"]
   */
  readonly directoryTreeSummary: readonly string[];

  /**
   * Relationship density: total relationship edges / total components.
   * A density of 3.5 means each component has on average 3.5 relationships.
   */
  readonly relationshipDensity: number;

  /** Count of components per CodeZone (e.g., { "production": 40, "test": 15 }) */
  readonly zoneDistribution: Readonly<Record<string, number>>;

  /** Count of components per ComponentRole (e.g., { "service": 8, "utility": 12 }) */
  readonly roleDistribution: Readonly<Record<string, number>>;
}
```

### Strategy Function Signatures

```typescript
// src/strategy/strategy-input.ts — public API

import type { RepositoryAnalysis } from "../types/analysis.js";
import type { ClassifiedComponentData } from "../classification/types.js";
import type { StrategyInput } from "./types.js";

/**
 * Assembles a StrategyInput from classified analysis output.
 *
 * Deterministic: iterates components in sorted order, counts categories,
 * computes density. No randomness, no timestamps, no I/O.
 *
 * Supports: AC-2.3
 *
 * @param analysis - The structural analysis output
 * @param classificationMap - Component classifications from classifyComponents()
 * @returns StrategyInput for the strategy inference call
 */
export function assembleStrategyInput(
  analysis: RepositoryAnalysis,
  classificationMap: Map<string, ClassifiedComponentData>,
): StrategyInput;
```

```typescript
// src/strategy/strategy-stage.ts — public API

import type { InferenceProvider } from "../inference/types.js";
import type { EngineResult } from "../types/common.js";
import type { DocumentationStrategy, StrategyInput } from "./types.js";

export interface StrategySelectionOptions {
  /** Directory where .doc-strategy.json is read from / written to */
  readonly outputDir: string;
  /** When true, load prior strategy for comparison (update mode) */
  readonly loadPrior: boolean;
}

/**
 * Runs the documentation strategy selection stage.
 *
 * 1. If loadPrior is true, attempts to load .doc-strategy.json from outputDir
 * 2. Makes a one-shot inference call with the strategy input
 * 3. Validates the response against the DocumentationStrategy Zod schema
 * 4. Persists the validated strategy to .doc-strategy.json
 * 5. Returns the strategy
 *
 * On inference failure or validation failure, returns EngineResult error
 * with code STRATEGY_ERROR.
 *
 * Supports: AC-2.1, AC-2.2
 *
 * @param provider - The inference provider for the one-shot call
 * @param strategyInput - The deterministic input from assembleStrategyInput()
 * @param options - Output directory and update-mode flag
 * @returns The documentation strategy or an error
 */
export function selectStrategy(
  provider: InferenceProvider,
  strategyInput: StrategyInput,
  options: StrategySelectionOptions,
): Promise<EngineResult<DocumentationStrategy>>;

/**
 * Loads a previously persisted strategy from .doc-strategy.json.
 * Returns null if the file doesn't exist or can't be parsed.
 * Does not throw — parsing failures are treated as "no prior strategy."
 *
 * Supports: AC-2.2
 *
 * @param outputDir - Directory containing the prior .doc-strategy.json
 * @returns The prior strategy or null
 */
export function loadPriorStrategy(
  outputDir: string,
): Promise<DocumentationStrategy | null>;
```

### Error Codes (addition to existing EngineErrorCode)

```typescript
// Added to existing EngineErrorCode union in src/types/common.ts

// Classification should never fail (heuristics are defensive), but the
// code exists for defensive completeness.
| "CLASSIFICATION_ERROR"

// Strategy inference call failed or returned unparseable output.
// Orchestrator should proceed with default strategy values.
| "STRATEGY_ERROR"
```

---

## TC to Test Mapping

Every test case from AC-1.1 through AC-1.4 and AC-2.1 through AC-2.4 is mapped to a test file and a chunk. Test descriptions reference the TC ID for traceability back to the epic.

### Classification Tests

**File: `test/classification/component-classifier.test.ts`**

| TC | Test Description | Chunk |
|----|-----------------|-------|
| TC-1.1a | classifies service role from export pattern (class with service name) | 1 |
| TC-1.1b | classifies type-definition role from type-only exports | 1 |
| TC-1.1c | assigns unknown role when no pattern matches | 1 |
| TC-1.1d | produces identical output for identical input (determinism check) | 1 |
| TC-1.2a | classifies test zone from `test/` directory | 1 |
| TC-1.2b | classifies production zone as default | 1 |
| TC-1.2c | classifies generated zone from `generated/` directory | 1 |
| TC-1.2d | classifies vendored zone from `vendor/` directory | 1 |
| TC-1.2e | classifies infrastructure zone from `.github/workflows/` path | 1 |
| TC-1.2f | classifies build-script zone from `scripts/` directory | 1 |

Additional unit tests (not directly from TCs but needed for coverage):

| Test Description | Chunk |
|-----------------|-------|
| path convention rules: each path pattern in the table produces the expected role | 1 |
| file suffix rules: each suffix produces the expected role | 1 |
| export pattern rules: type-only file overrides ambiguous path | 1 |
| relationship tiebreaker: high fan-out component gets controller/service role | 1 |
| pass ordering: confirmed path match is not overridden by later passes | 1 |
| zone priority: vendored directory outranks test suffix | 1 |
| all components covered: output map has same size as input component record | 1 |

**File: `test/classification/module-classifier.test.ts`**

| TC | Test Description | Chunk |
|----|-----------------|-------|
| TC-1.3a | assigns orchestration archetype from handler/service/controller roles with high cross-module edges | 1 |
| TC-1.3b | assigns type-definitions archetype from all type-definition roles | 1 |
| TC-1.3c | assigns mixed archetype when no dominant pattern | 1 |
| TC-1.3d | assigns domain-model archetype from model-heavy module with few cross-module deps | 1 |
| TC-1.3e | assigns test-suite archetype from all-test-zone module | 1 |

Additional unit tests:

| Test Description | Chunk |
|-----------------|-------|
| archetype priority: zone-based archetypes (test-suite) take precedence over role-based | 1 |
| archetype threshold: exactly 60% model roles triggers domain-model | 1 |
| archetype threshold: 59% model roles falls through to mixed | 1 |
| cross-module edge counting: only edges between different modules count | 1 |
| all modules covered: output map has same size as input module array | 1 |

### Strategy Tests

**File: `test/strategy/strategy-input.test.ts`**

| TC | Test Description | Chunk |
|----|-----------------|-------|
| TC-2.3a | produces byte-identical output from identical inputs | 3 |
| TC-2.3b | includes componentCount, languageDistribution, directoryTreeSummary, relationshipDensity, zoneDistribution, roleDistribution | 3 |

Additional unit tests:

| Test Description | Chunk |
|-----------------|-------|
| componentCount matches number of components in analysis | 3 |
| languageDistribution sums to componentCount | 3 |
| directoryTreeSummary is sorted alphabetically | 3 |
| relationshipDensity is totalEdges / componentCount | 3 |
| zoneDistribution sums to componentCount | 3 |
| roleDistribution sums to componentCount | 3 |
| empty analysis produces zero counts (no division by zero) | 3 |

**File: `test/strategy/strategy-stage.test.ts`**

| TC | Test Description | Chunk |
|----|-----------------|-------|
| TC-2.1a | produces strategy for standard TS repo with 20+ components | 3 |
| TC-2.1b | produces strategy for mixed-language repo | 3 |
| TC-2.1c | produces strategy for small repo (< 8 components) | 3 |
| TC-2.2a | writes .doc-strategy.json to output directory on success | 3 |
| TC-2.2b | loads prior strategy in update mode | 3 |
| TC-2.2c | fresh strategy replaces stale strategy when structure changes | 3 |
| TC-2.4a | strategy boundary recommendations included in planning prompt context | 3 |

Additional unit tests:

| Test Description | Chunk |
|-----------------|-------|
| returns STRATEGY_ERROR when inference call fails | 3 |
| returns STRATEGY_ERROR when response fails Zod validation | 3 |
| loadPriorStrategy returns null when file doesn't exist | 3 |
| loadPriorStrategy returns null when file is malformed JSON | 3 |
| .doc-strategy.json is valid JSON with 2-space indentation | 3 |

### Context Assembly Tests

Tests for AC-1.4 (classifications available in agent context) span this document and `td-agent-runtime.md`. The tests below verify the classification domain's contribution — that the merge utility works correctly. The agent context assembly tests live in the agent runtime test file.

**File: `test/classification/component-classifier.test.ts`** (additional tests)

| TC | Test Description | Chunk |
|----|-----------------|-------|
| TC-1.4a | classification map covers every component in analysis (no missing entries) | 1 |
| TC-1.4b | mergeComponentView produces correct view for classified component | 1 |

**File: `test/classification/module-classifier.test.ts`** (additional tests)

| TC | Test Description | Chunk |
|----|-----------------|-------|
| TC-1.4b | archetype map covers every module in plan (no missing entries) | 1 |

---

## Chunk Breakdown

### Chunk 0: Foundation Types

**Scope:** Type definitions and test fixtures that Chunk 1 and Chunk 3 depend on. No implementation logic.

**Deliverables:**

| File | Contents |
|------|----------|
| `src/classification/types.ts` | `ComponentRole`, `CodeZone`, `ModuleArchetype`, `ClassificationConfidence`, `ClassifiedComponentData`, `ClassifiedComponentView`, `mergeComponentView()` |
| `src/strategy/types.ts` | `RepoClassification`, `PageShape`, `DocumentationBoundary`, `ZoneGuidance`, `DocumentationStrategy`, `StrategyInput` |
| `src/types/common.ts` | `CLASSIFICATION_ERROR` and `STRATEGY_ERROR` added to `EngineErrorCode` union |
| `test/fixtures/classification-fixtures.ts` | Mock `RepositoryAnalysis` objects representing: standard TS repo (20+ components), mixed-language repo, small repo (<8 components), type-only repo, test-heavy repo |

**Exit criteria:**
- `npm run typecheck` passes with all new types
- No implementation code (only types, one pure merge function, and fixtures)
- All downstream files can import from the new type modules

**Estimated test count:** 3-5 tests for `mergeComponentView()` utility function. Type-level validation is handled by the typecheck gate.

### Chunk 1: Classification Implementation

**Scope:** Component classification (role + zone) and module archetype assignment. All deterministic, no inference.

**Prerequisites:** Chunk 0 (types and fixtures must exist)

**Deliverables:**

| File | Contents |
|------|----------|
| `src/classification/component-classifier.ts` | `classifyComponents()` — three-pass classification with path conventions, export patterns, relationship shapes |
| `src/classification/module-classifier.ts` | `classifyModules()` — archetype assignment from role/zone distribution and cross-module edges |
| `test/classification/component-classifier.test.ts` | TC-1.1a through TC-1.1d, TC-1.2a through TC-1.2f, TC-1.4a, TC-1.4b (merge view), plus additional unit tests |
| `test/classification/module-classifier.test.ts` | TC-1.3a through TC-1.3e, TC-1.4b (archetype coverage), plus additional unit tests |

**TDD sequence:**
1. Write all component classifier tests against the stub — they should fail with "Not implemented"
2. Implement Pass 1 (path conventions + zone detection) — zone tests and path-based role tests go green
3. Implement Pass 2 (export patterns) — export-based role tests go green
4. Implement Pass 3 (relationship tiebreaker) — remaining role tests go green
5. Write all module classifier tests against the stub — they should fail with "Not implemented"
6. Implement archetype assignment — archetype tests go green
7. Run full quality gate

**Exit criteria:**
- All TC-1.x tests pass
- `npm run typecheck` passes
- `npm run lint` passes
- Classification of the fixture repos is stable (determinism test passes)

**Estimated test count:** 25-30 tests across both test files.

### Chunk 3: Strategy Implementation

**Scope:** Strategy input assembly, strategy inference call, persistence, update-mode loading, and planning integration.

**Prerequisites:** Chunk 1 (classification must exist — strategy input is assembled from classified analysis)

**Deliverables:**

| File | Contents |
|------|----------|
| `src/strategy/strategy-input.ts` | `assembleStrategyInput()` — deterministic input assembly |
| `src/strategy/strategy-stage.ts` | `selectStrategy()`, `loadPriorStrategy()` — inference call, Zod validation, file I/O |
| `test/strategy/strategy-input.test.ts` | TC-2.3a, TC-2.3b, plus additional unit tests |
| `test/strategy/strategy-stage.test.ts` | TC-2.1a through TC-2.1c, TC-2.2a through TC-2.2c, TC-2.4a, plus additional unit tests |

**TDD sequence:**
1. Write strategy input tests against the stub — they should fail with "Not implemented"
2. Implement `assembleStrategyInput()` — input tests go green
3. Write strategy stage tests with mock provider — they should fail with "Not implemented"
4. Implement `selectStrategy()` — stage tests go green
5. Implement `loadPriorStrategy()` — update mode tests go green
6. Run full quality gate

**Mock strategy:** The strategy stage tests use a mock `InferenceProvider` that returns pre-canned `DocumentationStrategy` responses. This is a service mock (the provider is an external service boundary), consistent with the test hierarchy preference of mocking external services but using real internal infrastructure.

**Exit criteria:**
- All TC-2.x tests pass
- `.doc-strategy.json` written and readable in test output directory
- Strategy input determinism test passes
- `npm run typecheck` passes
- `npm run lint` passes

**Estimated test count:** 18-22 tests across both test files.

### Cross-Chunk Dependencies

```
Chunk 0 (types, fixtures)
   │
   ├──▶ Chunk 1 (classification)
   │       │
   │       └──▶ Chunk 3 (strategy) ──▶ [Chunk 4: agent runtime, other doc]
   │
   └──▶ [Chunk 2: provider tool-use, other doc]
```

Chunk 1 and Chunk 2 have no dependency on each other and can proceed in parallel. Chunk 3 depends on Chunk 1 because `assembleStrategyInput()` consumes the classification map. Chunk 4 (agent runtime, covered in `td-agent-runtime.md`) depends on Chunks 1, 2, and 3.

### Total Estimated Tests for This Domain

| Chunk | File | Estimated Tests |
|-------|------|----------------|
| 0 | `test/classification/types.test.ts` | 3-5 |
| 1 | `test/classification/component-classifier.test.ts` | 17-20 |
| 1 | `test/classification/module-classifier.test.ts` | 8-10 |
| 3 | `test/strategy/strategy-input.test.ts` | 8-10 |
| 3 | `test/strategy/strategy-stage.test.ts` | 10-12 |
| **Total** | | **46-57** |

---

## Design Decisions Log

| Decision | Rationale | Alternative Considered |
|----------|-----------|----------------------|
| Classification produces a separate map, not a type extension | Avoids breaking all `AnalyzedComponent` consumers. Multiple downstream stages need the classification at different points. | `ClassifiedComponent extends AnalyzedComponent` (epic's original contract) — rejected because it forces mutation of shared types |
| Three-pass classification with ordered confidence | Path conventions are the highest-signal heuristic and should be checked first. Export patterns catch what paths miss. Relationship shapes are a weak signal alone but a useful tiebreaker. | Single-pass with weighted scoring — rejected because it obscures which signal drove the classification and makes debugging harder |
| Components iterated in sorted order | Determinism guarantee. Prevents classification results from depending on object iteration order, which can vary across Node.js versions. | No ordering guarantee — rejected because TC-1.1d requires deterministic output |
| Strategy as separate `.doc-strategy.json` file | Clean comparison surface for update mode. Keeps module plan format unchanged. Three consumers read strategy at different pipeline points. | Embed in `.module-plan.json` — rejected because it couples strategy lifecycle to plan lifecycle and complicates update-mode diffing |
| Strategy is one-shot, not agentic | Strategy doesn't need to read source code or make iterative decisions. The classified analysis summary contains everything needed. One-shot keeps latency and cost low. | Agentic strategy with source reading — rejected because strategy operates at the repo level, not the file level, and the analysis summary is sufficient |
| Module archetype assignment runs after planning | Archetypes depend on knowing which components are in which module. That grouping is the output of planning, which hasn't run yet when classification runs. | Assign archetypes before planning — rejected because the input data doesn't exist yet |
| Zone priority ordering (test > vendored > generated > ...) | Ambiguous cases (test file in vendor directory) need a consistent tiebreaker. Structural containment (directory) outranks file-level markers. | No priority — rejected because it produces inconsistent results for edge cases |
| `mergeComponentView()` as a pure function, not a class method | The merge is a view transformation, not a stateful operation. A pure function is easier to test and doesn't introduce a class where none is needed. | `ClassifiedComponentView` class with constructor — rejected because it adds complexity without benefit |

---

## Related Documentation

- **Epic:** `docs/epics/agentic-module-generation.md`
- **Index:** `docs/epics/tech-design/index.md`
- **Companion (provider):** `docs/epics/tech-design/td-provider-tool-use.md`
- **Companion (agent runtime):** `docs/epics/tech-design/td-agent-runtime.md`
- **Companion (degradation):** `docs/epics/tech-design/td-degradation-cleanup.md`
