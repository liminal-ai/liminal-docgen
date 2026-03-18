import { z } from "zod";

export const moduleGenerationResultSchema = z.object({
  pageContent: z.string().min(1),
  title: z.string().min(1),
  crossLinks: z.array(z.string()),
});

export const overviewGenerationResultSchema = z.object({
  content: z.string().min(1),
  mermaidDiagram: z.string(),
});
