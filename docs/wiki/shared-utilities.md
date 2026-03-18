# Shared Utilities

Small, foundational utilities used across the entire `liminal-docgen` package. This module has **no internal dependencies** on other modules, making it the leaf layer of the dependency graph.

## Responsibilities

| File | Purpose |
|---|---|
| `liminal-docgen/src/errors.ts` | Exports `getErrorMessage` — a helper that safely extracts a human-readable message from an unknown thrown value. |
| `liminal-docgen/src/languages.ts` | Exports `LANGUAGE_BY_EXTENSION` — a constant map from file extensions (e.g. `.ts`, `.py`) to language names, used for language detection and normalization. |
| `liminal-docgen/src/index.ts` | Package entry point that re-exports the public API surface of the library. |

## Usage Across the Codebase

### `getErrorMessage`

Imported by modules that perform I/O or other fallible operations and need consistent error reporting:

- **Configuration** — `config/file-loader.ts`
- **Structural Analysis** — `analysis/adapter.ts`, `analysis/analyze.ts`
- **Metadata** — `metadata/reader.ts`, `metadata/status.ts`, `metadata/writer.ts`
- **Incremental Update** — `orchestration/update/prior-state.ts`

### `LANGUAGE_BY_EXTENSION`

Used wherever file extensions need to be resolved to a programming language:

- **Structural Analysis** — `analysis/normalizer.ts`
- **Environment Checks** — `environment/language-detector.ts`

## Design Notes

- Both utility files are intentionally tiny (2 and 26 LOC respectively) to keep the shared surface area minimal and easy to reason about.
- Because every major module depends on these utilities, changes here have a wide blast radius — treat modifications with care and ensure tests pass across all consumers.
