# Metadata Module

The Metadata module is responsible for reading, writing, and validating documentation generation metadata. This includes tracking timestamps, commit hashes, and detecting when generated documentation has become stale relative to the source code.

## Components

| File | Purpose |
|---|---|
| `liminal-docgen/src/metadata/file.ts` | Defines the metadata file name constant (`METADATA_FILE_NAME`) and a helper to resolve its path (`getMetadataFilePath`). |
| `liminal-docgen/src/metadata/reader.ts` | Reads and parses an existing metadata file from disk (`readMetadata`). |
| `liminal-docgen/src/metadata/writer.ts` | Serializes and writes metadata to disk (`writeMetadata`), using the metadata contract schema. |
| `liminal-docgen/src/metadata/validate-shape.ts` | Validates that a parsed metadata object conforms to the expected schema (`validateMetadataShape`). |
| `liminal-docgen/src/metadata/status.ts` | Determines overall documentation status/staleness (`getDocumentationStatus`) by comparing stored metadata against the current git state and resolved configuration. |

## Key Responsibilities

- **Persistence** — Read/write a JSON metadata file that records when documentation was last generated and against which commit.
- **Shape Validation** — Ensure metadata on disk matches the expected contract schema before consuming it.
- **Staleness Detection** — Compare the recorded commit hash against the current repository HEAD (via the git adapter) to determine if docs are out of date.

## Dependencies

| Module | Usage |
|---|---|
| **Contracts and Schemas** | `metadata.ts` contract used by `validate-shape.ts` and `writer.ts` for schema enforcement. |
| **External Adapters** | `git.ts` adapter used by `status.ts` to query the current commit hash. |
| **Configuration** | `config/resolver.ts` used by `status.ts` to resolve repo-level config for staleness checks. |
| **Shared Utilities** | `errors.ts` for domain-specific error types. |
| **Type Definitions** | `types/common.ts` and `types/index.ts` for shared type interfaces. |

## Consumed By

- **Orchestration** — The metadata-write stage calls `writeMetadata` and uses `getMetadataFilePath` after doc generation completes.
- **Incremental Update** — `prior-state.ts` calls `readMetadata` to load the previous generation state for diffing.
- **Validation** — File-presence and metadata-shape validation checks use `METADATA_FILE_NAME`, `getMetadataFilePath`, and `validateMetadataShape`.
