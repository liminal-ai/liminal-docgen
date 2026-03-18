# Configuration

The Configuration module handles loading, merging, and resolving configuration for the liminal-docgen tool. It implements a layered config strategy: built-in defaults → file-based config → CLI arguments.

## Responsibilities

- **Defaults** — Provides baseline configuration values when no file or CLI overrides are present.
- **File Loading** — Discovers and parses a config file (by convention name) from the repository, validating it against the configuration contract.
- **Resolution** — Merges defaults with file-based config and validates the final resolved configuration used throughout the pipeline.
- **CLI Config Merging** — Combines CLI arguments with resolved config for each command type (analyze, run, status, publish), including utility helpers like comma-separated argument splitting.

## Components

| File | Purpose |
|---|---|
| `liminal-docgen/src/config/defaults.ts` | `getDefaults` — returns the baseline default configuration object |
| `liminal-docgen/src/config/file-loader.ts` | `loadConfigFile` — reads and parses the config file (`CONFIG_FILE_NAME`) from disk |
| `liminal-docgen/src/config/resolver.ts` | `resolveConfiguration` — merges defaults + file config + overrides into a validated config |
| `liminal-docgen/src/cli/config-merger.ts` | `mergeCliConfiguration`, `mergeAnalyzeRequest`, `mergeRunRequest`, `mergeStatusRequest`, `mergePublishRequest` — per-command CLI arg merging; also exports `ConfigurableCliArgs` and `PublishCliArgs` interfaces |

## Dependencies

- **Contracts and Schemas** — `file-loader.ts` imports the configuration contract for validation.
- **Type Definitions** — All config components depend on shared types from `types/common.ts` and `types/index.ts`.
- **Shared Utilities** — `file-loader.ts` uses the shared error types from `errors.ts`.

## Consumers

This module is consumed by several downstream modules:

- **Structural Analysis** (`analysis/analyze.ts`) — calls `resolveConfiguration` to get validated config before analysis.
- **Orchestration** (`orchestration/stages/resolve-and-validate.ts`) — resolves config as a pipeline stage.
- **Metadata** (`metadata/status.ts`) — reads resolved config for status reporting.

## Config Layering Order

```
Defaults  →  Config File  →  CLI Arguments
(lowest)                      (highest priority)
```

Each layer only overrides fields it explicitly sets, preserving values from lower layers for unspecified fields.
