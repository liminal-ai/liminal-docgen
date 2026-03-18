# Type Definitions

Shared TypeScript interfaces and utility types that form the data contracts across the entire `liminal-docgen` codebase. Every major subsystem imports from this module, making it the foundational type layer of the application.

## Purpose

This module centralises all TypeScript type declarations so that every other module works against a single, consistent set of shapes. It covers the full liminal-docgen lifecycle: configuration, environment checks, analysis, planning, generation, validation, quality review, metadata, publishing, orchestration, and CLI output.

## Files

| File | Key Exports |
|---|---|
| `liminal-docgen/src/types/index.ts` | Barrel re-export of all type files |
| `liminal-docgen/src/types/common.ts` | `EngineResult`, `EngineError`, `EngineErrorCode`, `ok()`, `err()` – Result-type utilities used everywhere |
| `liminal-docgen/src/types/analysis.ts` | `AnalysisOptions`, `RepositoryAnalysis`, `AnalyzedComponent`, `AnalyzedRelationship`, `ExportedSymbol`, `AnalysisSummary` |
| `liminal-docgen/src/types/cli.ts` | `CliResultEnvelope`, `CliExitCode` |
| `liminal-docgen/src/types/configuration.ts` | `ConfigurationRequest`, `ResolvedConfiguration`, `DefaultConfiguration`, `ConfigurationErrorDetails` |
| `liminal-docgen/src/types/environment.ts` | `EnvironmentCheckRequest`, `EnvironmentCheckResult`, `EnvironmentCheckFinding` |
| `liminal-docgen/src/types/generation.ts` | `ModuleGenerationResult`, `OverviewGenerationResult`, `GeneratedModuleSet`, `GeneratedModulePage`, `moduleNameToFileName` |
| `liminal-docgen/src/types/metadata.ts` | `DocumentationStatusRequest`, `DocumentationStatus`, `MetadataWriteRequest`, `GeneratedDocumentationMetadata` |
| `liminal-docgen/src/types/orchestration.ts` | `DocumentationRunRequest`, `DocumentationRunResult`, `DocumentationProgressEvent`, `ProgressCallback`, `ResolvedRunConfig`, and related success/failure types |
| `liminal-docgen/src/types/planning.ts` | `PlannedModule` (depends on `contracts/planning.ts` schema) |
| `liminal-docgen/src/types/publish.ts` | `PublishRequest`, `PublishResult` |
| `liminal-docgen/src/types/quality-review.ts` | `QualityReviewConfig`, `ReviewFilePatch`, `QualityReviewPassResult` |
| `liminal-docgen/src/types/update.ts` | `ChangedFile`, `AffectedModuleSet` |
| `liminal-docgen/src/types/validation.ts` | `ValidationRequest`, `ValidationResult`, `ValidationFinding`, `ModuleTree`, `STRUCTURAL_FILES` |

## Key Patterns

### Result Type (`EngineResult`)

`common.ts` defines a discriminated-union Result type (`EngineResult<T>`) with `ok()` and `err()` constructors. Nearly every function in the codebase returns an `EngineResult`, giving the system a consistent, exception-free error-handling pattern.

### Barrel Export

`index.ts` re-exports all sibling type files, so consumers can import from `types/index.ts` (or individual files for narrower imports like `types/common.ts`).

## Dependencies

- **Contracts and Schemas** – `planning.ts` imports the planning Zod schema from `contracts/planning.ts` to derive its `PlannedModule` interface.

## Dependents

This module is imported by virtually every other module in the system, including CLI, Configuration, Environment Checks, External Adapters, Incremental Update, Metadata, Orchestration, Prompt Builders, Publish, Structural Analysis, Test Helpers, and Validation.
