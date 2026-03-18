import { z } from "zod";

const rawAnalysisFileSchema = z
  .object({
    language: z.string().nullable().optional(),
    lines_of_code: z.number().int().nonnegative().optional(),
    path: z.string(),
    supported: z.boolean().optional(),
  })
  .passthrough();

type RawFileTreeShape = {
  type?: string;
  name?: string;
  path?: string;
  extension?: string;
  language?: string | null;
  lines_of_code?: number;
  children?: RawFileTreeShape[];
  [key: string]: unknown;
};

export const rawFileTreeNodeSchema: z.ZodType<RawFileTreeShape> = z
  .object({
    children: z.array(z.lazy(() => rawFileTreeNodeSchema)).optional(),
    extension: z.string().optional(),
    language: z.string().nullable().optional(),
    lines_of_code: z.number().int().nonnegative().optional(),
    name: z.string().optional(),
    path: z.string().optional(),
    type: z.string().optional(),
  })
  .passthrough();

export const rawNodeSchema = z.object({
  class_name: z.string().optional(),
  component_type: z.string(),
  depends_on: z.array(z.string()),
  end_line: z.number().int(),
  file_path: z.string(),
  id: z.string(),
  name: z.string(),
  parameters: z.array(z.string()).optional(),
  relative_path: z.string(),
  start_line: z.number().int(),
});

export const rawCallRelationshipSchema = z.object({
  call_line: z.number().int().optional(),
  callee: z.string(),
  caller: z.string(),
  is_resolved: z.boolean(),
});

export const rawAnalysisSummarySchema = z
  .object({
    files: z.array(z.union([z.string(), rawAnalysisFileSchema])).optional(),
    files_analyzed: z.number().int().nonnegative().optional(),
    languages_found: z.array(z.string()).optional(),
    total_files: z.number().int().nonnegative().optional(),
    unsupported_files: z
      .array(z.union([z.string(), rawAnalysisFileSchema]))
      .optional(),
  })
  .passthrough();

export const rawAnalysisOutputSchema = z.object({
  file_tree: rawFileTreeNodeSchema,
  functions: z.array(rawNodeSchema),
  relationships: z.array(rawCallRelationshipSchema),
  summary: rawAnalysisSummarySchema,
});
