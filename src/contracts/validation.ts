import { z } from "zod";
import type { ModuleTree, ModuleTreeEntry } from "../types/index.js";

export const validationRequestSchema = z.object({
  outputPath: z.string(),
  requirePersistedArtifacts: z.boolean().optional().default(true),
});

export const validationFindingSchema = z.object({
  severity: z.enum(["error", "warning"]),
  category: z.enum([
    "missing-file",
    "broken-link",
    "metadata",
    "module-tree",
    "mermaid",
  ]),
  message: z.string(),
  filePath: z.string().optional(),
  target: z.string().optional(),
});

export const validationResultSchema = z.object({
  status: z.enum(["pass", "warn", "fail"]),
  errorCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  findings: z.array(validationFindingSchema),
});

export const moduleTreeEntrySchema: z.ZodType<ModuleTreeEntry> = z.lazy(() =>
  z.object({
    name: z.string(),
    page: z.string(),
    children: z.array(moduleTreeEntrySchema).optional(),
  }),
);

export const moduleTreeSchema: z.ZodType<ModuleTree> = z.array(
  moduleTreeEntrySchema,
);
