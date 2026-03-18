# Incremental Update

Differential update logic that enables selective wiki regeneration by reading prior generation state and mapping changed files to the specific modules that need to be re-generated.

## Purpose

When the wiki generator runs after an initial generation, it doesn't need to regenerate every module page from scratch. This module provides the intelligence to:

1. **Read prior generation state** — Load metadata from a previous run to understand what was already generated.
2. **Map changed files to affected modules** — Given a set of changed files, determine which modules are impacted and need selective regeneration.

## Components

### `liminal-docgen/src/orchestration/update/prior-state.ts`

Exports `PriorGenerationState` (interface) and `readPriorGenerationState` (function). Reads metadata from a previous generation run by leveraging the metadata reader and planning contracts. Reconstructs the state needed to perform differential comparisons.

**Key dependencies:**
- `src/contracts/planning.ts` — Planning contract types
- `src/metadata/reader.ts` — Reading persisted metadata
- `src/orchestration/stages/metadata-write.ts` — Metadata structure alignment
- `src/errors.ts` — Shared error types
- `src/types/common.ts` — Common type definitions

### `liminal-docgen/src/orchestration/update/affected-module-mapper.ts`

Exports `AffectedModuleMappingResult` (interface) and `mapToAffectedModules` (function). At 343 LOC, this is the core logic that takes a set of changed files and resolves which modules are affected, reusing module planning logic to understand file-to-module relationships.

**Key dependencies:**
- `src/orchestration/stages/module-planning.ts` — Module planning stage for mapping context
- `src/types/common.ts` — Common type definitions
- `src/types/update.ts` — Update-specific type definitions

## Usage

Both components are imported by the main generation orchestrator (`src/orchestration/generate.ts`), which uses them to short-circuit full regeneration when only a subset of files have changed.

## Module Dependencies

| Direction | Module |
|-----------|--------|
| Depends on | **Contracts and Schemas**, **Metadata**, **Orchestration** (stages), **Shared Utilities**, **Type Definitions** |
| Depended on by | **Orchestration** (main generate flow) |
