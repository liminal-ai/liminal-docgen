# Contracts and Schemas

Zod schemas that define and enforce the shape of data exchanged between pipeline stages at runtime. Every major boundary in the documentation-generation pipeline validates its inputs and outputs against these contracts, providing a single source of truth for data structures.

## Purpose

- **Runtime validation** – Each schema uses [Zod](https://github.com/colinhacks/zod) to parse and validate objects at stage boundaries, catching malformed data early.
- **Shared vocabulary** – Downstream modules import schemas rather than inventing ad-hoc types, keeping the pipeline consistent.
- **Type inference** – TypeScript types are inferred from the schemas (`z.infer<…>`), so runtime checks and compile-time types stay in sync.

## Contract Files

| File | Key Exports | Consumed By |
|------|-------------|-------------|
| `liminal-docgen/src/contracts/analysis.ts` | `rawFileTreeNodeSchema`, `rawNodeSchema`, `rawCallRelationshipSchema`, `rawAnalysisSummarySchema`, `rawAnalysisOutputSchema` | Structural Analysis adapter |
| `liminal-docgen/src/contracts/configuration.ts` | `configurationRequestSchema`, `configurationFileSchema`, `resolvedConfigurationSchema`, `defaultConfigurationSchema` | Configuration file loader |
| `liminal-docgen/src/contracts/generation.ts` | `moduleGenerationResultSchema`, `overviewGenerationResultSchema` | Orchestration generation stages |
| `liminal-docgen/src/contracts/metadata.ts` | `generatedDocumentationMetadataSchema`, `metadataWriteRequestSchema` | Metadata writer, shape validator, Publish preflight |
| `liminal-docgen/src/contracts/planning.ts` | `modulePlanSchema`, `ModulePlan` type, `CLUSTERING_THRESHOLD` | Incremental Update prior-state, Type Definitions |
| `liminal-docgen/src/contracts/publish.ts` | `PublishRequestSchema`, `PublishResultSchema` | Publish module |
| `liminal-docgen/src/contracts/quality-review.ts` | `reviewFilePatchSchema`, `reviewPatchPayloadSchema` | Orchestration validation-and-review stage |
| `liminal-docgen/src/contracts/validation.ts` | `validationRequestSchema`, `validationFindingSchema`, `validationResultSchema`, `moduleTreeEntrySchema`, `moduleTreeSchema` | Validation module-tree check |

## Dependencies

- **Type Definitions** – `contracts/validation.ts` imports shared types from `types/index.ts`. The planning contract also re-exports its `ModulePlan` type, which the Type Definitions module consumes.

## Design Notes

- Each contract file is intentionally small (8–72 LOC) and focused on a single pipeline concern.
- The `CLUSTERING_THRESHOLD` constant in `planning.ts` is co-located with the planning schema because it directly governs how module plans are validated.
- No contract file contains business logic; they export only schemas, inferred types, and related constants.
