# Structural Analysis

The Structural Analysis module implements the repository code-analysis pipeline. It is responsible for scanning a repository's source files, extracting structural information (exports, imports, call relationships, file trees), and producing a normalized data model that downstream modules consume for documentation generation.

## Pipeline Overview

The analysis pipeline flows through four stages:

1. **Python AST Parsing** — A Python script walks the repository, parses TypeScript/Python source files using tree-sitter, and emits a raw JSON report.
2. **Adapter** — A TypeScript adapter spawns the Python script as a child process and captures the raw JSON output.
3. **Normalizer** — Transforms the raw, loosely-typed JSON into a strongly-typed `NormalizedAnalysis` structure.
4. **Orchestration Entry Point** — `analyzeRepository` ties the pieces together: resolves configuration, validates the git working directory, invokes the adapter, and normalizes the result.

## Components

### `analyze_repository.py`
`liminal-docgen/src/analysis/scripts/analyze_repository.py` (454 LOC)

Python script that performs the actual source-code analysis. Key responsibilities:
- File collection with include/exclude glob patterns (`collect_files`, `should_include`, `should_exclude`)
- Line counting and file-tree construction (`count_lines`, `build_file_tree`, `sort_tree`)
- Language-specific AST analysis via tree-sitter (`analyze_typescript_like_file`, `analyze_python_file`)
- Import resolution (`resolve_import_targets`, `resolve_relative_import`)

### `raw-output.ts`
`liminal-docgen/src/analysis/raw-output.ts` (54 LOC)

TypeScript interfaces that model the raw JSON shape emitted by the Python script: `RawAnalysisOutput`, `RawNode`, `RawCallRelationship`, `RawAnalysisSummary`, `RawAnalysisFile`, `RawFileTreeNode`.

### `adapter.ts`
`liminal-docgen/src/analysis/adapter.ts` (151 LOC)

Spawns the Python analysis script via the **External Adapters** module's `python` adapter, parses stdout as JSON, and validates the output against the analysis contract. Exports `runAnalysis` and `AnalysisAdapterError`.

### `normalizer.ts`
`liminal-docgen/src/analysis/normalizer.ts` (418 LOC)

Converts raw analysis output into the `NormalizedAnalysis` model. Handles language detection (via **Shared Utilities** `languages.ts`), deduplication, and structural reshaping. Exports `normalize`.

### `analyze.ts`
`liminal-docgen/src/analysis/analyze.ts` (103 LOC)

High-level entry point (`analyzeRepository`) consumed by the orchestration layer. Resolves configuration, validates the repository path with the **git adapter**, runs analysis, and normalizes results.

## Dependencies

| Dependency Module | Usage |
|---|---|
| **Configuration** | `analyze.ts` uses `config/resolver` to obtain resolved analysis settings |
| **External Adapters** | `adapter.ts` delegates process spawning to `adapters/python.ts`; `analyze.ts` uses `adapters/git.ts` for repo validation |
| **Contracts and Schemas** | `adapter.ts` validates raw output against `contracts/analysis.ts` |
| **Shared Utilities** | `normalizer.ts` uses `languages.ts` for language classification |
| **Type Definitions** | Shared types from `types/index.ts` and `types/common.ts` |

## Consumed By

- **Orchestration** — `orchestration/stages/structural-analysis.ts` calls `analyzeRepository` as the first pipeline stage.
- **Test Helpers** — `test/helpers/story5-fixtures.ts` imports `RawAnalysisOutput` types for test fixture construction.
