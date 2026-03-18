# Orchestration

The Orchestration module is the core documentation generation pipeline for Liminal DocGen's wiki generator. It coordinates the end-to-end flow from environment validation through structural analysis, module planning, doc generation, quality review, and metadata persistence.

## Entry Point

- **`liminal-docgen/src/orchestration/generate.ts`** — The main `generateDocumentation` function that drives the full pipeline. It wires together all stages, manages incremental update logic (via `affected-module-mapper` and `prior-state`), and interfaces with the Agent SDK adapter.

## Run Context

- **`liminal-docgen/src/orchestration/run-context.ts`** — `RunContext` class that carries shared state (config, agent handle, analysis results) through the pipeline stages.

## Output Path

- **`liminal-docgen/src/orchestration/output-path.ts`** — `resolveOutputPath` utility for determining where generated wiki files are written.

## Pipeline Stages

Each stage is a discrete, composable step invoked by the main generate function:

| Stage | File | Purpose |
|---|---|---|
| Environment Check | `stages/environment-check.ts` | Validates runtime prerequisites (delegates to `environment/check.ts`) |
| Resolve & Validate | `stages/resolve-and-validate.ts` | Resolves configuration via `config/resolver.ts` and validates the request |
| Structural Analysis | `stages/structural-analysis.ts` | Runs codebase analysis via `analysis/analyze.ts` |
| Module Planning | `stages/module-planning.ts` | Uses LLM (via Agent SDK) + clustering prompts to plan which modules to document; includes `validateModulePlan` |
| Module Generation | `stages/module-generation.ts` | Generates documentation for each module using prompt builders and generation contracts; supports progress callbacks |
| Overview Generation | `stages/overview-generation.ts` | Produces the repository-level overview page |
| Validation & Review | `stages/validation-and-review.ts` | Quality review of generated docs using LLM-based review prompts and structural validation |
| Module Tree Write | `stages/module-tree-write.ts` | Writes the module hierarchy/tree structure to the output |
| Metadata Write | `stages/metadata-write.ts` | Persists run metadata and module plan file (`MODULE_PLAN_FILE_NAME`) for incremental update support |

All stage files live under `liminal-docgen/src/orchestration/stages/`.

## Key Dependencies

- **External Adapters** — Agent SDK adapter (`adapters/agent-sdk.ts`) used by generate, run-context, module-planning, module-generation, overview-generation, and validation stages
- **Prompt Builders** — Clustering, module-doc, overview, and quality-review prompts feed each LLM-powered stage
- **Contracts and Schemas** — Generation and quality-review contracts define structured output expectations
- **Configuration** — Config resolver used during the resolve-and-validate stage
- **Structural Analysis** — `analysis/analyze.ts` powers the structural-analysis stage
- **Validation** — `validation/validate.ts` used in the validation-and-review stage
- **Metadata** — `metadata/file.ts` and `metadata/writer.ts` for persisting run results
- **Environment Checks** — `environment/check.ts` for prerequisite validation
- **Incremental Update** — The orchestrator feeds into (and is depended on by) the incremental update subsystem via `update/affected-module-mapper.ts` and `update/prior-state.ts`
- **Type Definitions** — Common, generation, and planning types used throughout
