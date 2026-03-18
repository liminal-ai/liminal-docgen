# Prompt Builders

LLM prompt construction functions for each stage of the wiki generation pipeline. Each builder takes structured analysis/planning data and produces a well-formatted prompt string ready to send to an LLM.

## Responsibilities

- Construct stage-specific LLM prompts with appropriate context, instructions, and output format expectations
- Accept typed inputs from the analysis and planning phases and serialize them into prompt-friendly representations
- Keep prompt logic decoupled from orchestration so prompts can be tested and iterated independently

## Components

| File | Export | Purpose |
|------|--------|---------|
| `liminal-docgen/src/prompts/clustering.ts` | `buildClusteringPrompt` | Builds the prompt for grouping repository components into logical modules |
| `liminal-docgen/src/prompts/module-doc.ts` | `buildModuleDocPrompt` | Builds the prompt for generating a single module's wiki documentation page |
| `liminal-docgen/src/prompts/overview.ts` | `buildOverviewPrompt` | Builds the prompt for generating the top-level wiki overview page |
| `liminal-docgen/src/prompts/quality-review.ts` | `buildQualityReviewPrompt` | Builds the prompt for LLM-based quality review of generated wiki content |

## Dependencies

All builders import their input types from the **Type Definitions** module:

- `clustering.ts` → `types/analysis.ts`
- `module-doc.ts` → `types/analysis.ts`, `types/planning.ts`
- `overview.ts` → `types/analysis.ts`, `types/planning.ts`, `types/generation.ts`
- `quality-review.ts` → `types/quality-review.ts`, `types/validation.ts`

## Consumed By

The **Orchestration** module imports each builder in its corresponding pipeline stage:

- `module-planning.ts` → `buildClusteringPrompt`
- `module-generation.ts` → `buildModuleDocPrompt`
- `overview-generation.ts` → `buildOverviewPrompt`
- `validation-and-review.ts` → `buildQualityReviewPrompt`
