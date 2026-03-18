import { z } from "zod";

const nonEmptyStringSchema = z.string().trim().min(1);

const isIso8601UtcTimestamp = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  !Number.isNaN(Date.parse(value));

export const generatedDocumentationMetadataSchema = z.object({
  generatedAt: nonEmptyStringSchema.refine(isIso8601UtcTimestamp, {
    message: "generatedAt must be an ISO 8601 UTC timestamp",
  }),
  commitHash: nonEmptyStringSchema,
  outputPath: nonEmptyStringSchema,
  filesGenerated: z.array(nonEmptyStringSchema),
  componentCount: z.number().int().nonnegative(),
  mode: z.enum(["full", "update"]),
});

export const metadataWriteRequestSchema = z.object({
  outputPath: nonEmptyStringSchema,
  metadata: generatedDocumentationMetadataSchema,
});
