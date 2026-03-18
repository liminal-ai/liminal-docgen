# CLI Module

The CLI module provides the command-line interface for Liminal DocGen's wiki generation tool. It handles command definitions, argument parsing, output formatting (human-readable and JSON), progress rendering, graceful cancellation via signals, and standardized exit codes.

## Entry Point

- **`liminal-docgen/src/cli.ts`** — Defines and exports `mainCommand`, the top-level CLI entry point that wires together all subcommands.

## Core Infrastructure (`liminal-docgen/src/cli/`)

| File | Purpose |
|---|---|
| **`cancellation.ts`** | Installs SIGINT/SIGTERM handlers and exposes `isCancelled()` for cooperative cancellation throughout command execution. |
| **`exit-codes.ts`** | Defines exit code constants (`EXIT_SUCCESS`, `EXIT_OPERATIONAL_FAILURE`, `EXIT_USAGE_ERROR`, `EXIT_SIGINT`) and a `mapToExitCode` helper. |
| **`output.ts`** | Dual-format output layer with `writeJson*` functions for machine-readable output and `writeHuman*` functions for terminal-friendly display across all command results. |
| **`progress.ts`** | `createProgressRenderer` produces a renderer that displays step-by-step progress during long-running operations. Depends on orchestration types from the **Type Definitions** module. |

## Commands (`liminal-docgen/src/commands/`)

Each file registers a subcommand on the main CLI:

| File | Command | Description |
|---|---|---|
| **`analyze.ts`** | `analyze` | Analyzes a repository's structure and components. |
| **`check.ts`** | `check` | Runs environment/prerequisite checks. |
| **`generate.ts`** | `generate` | Generates wiki pages from analysis results. |
| **`publish.ts`** | `publish` | Publishes generated wiki content to a target. |
| **`status.ts`** | `status` | Shows current state of wiki generation. |
| **`update.ts`** | `update` | Incrementally updates existing wiki pages. |
| **`validate.ts`** | `validate` | Validates generated wiki content for correctness. |

## Dependencies

- **Type Definitions** — The progress renderer imports orchestration types (`liminal-docgen/src/types/orchestration.ts`) to track step progress.

## Design Notes

- Output formatting is centralized in `output.ts`, keeping command files focused on orchestration logic rather than display concerns.
- Cancellation is cooperative: commands check `isCancelled()` at safe points rather than being forcibly terminated.
- Exit codes follow Unix conventions and are mapped from error types via `mapToExitCode`.
