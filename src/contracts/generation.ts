import { z } from "zod";

const moduleEntitySummarySchema = z.object({
  dependsOn: z.array(z.string()),
  kind: z.string().min(1),
  name: z.string().min(1),
  publicEntrypoints: z.array(z.string()),
  role: z.string().min(1),
  usedBy: z.array(z.string()),
});

const moduleFlowNoteSchema = z.object({
  action: z.string().min(1),
  actor: z.string().min(1),
  output: z.string().min(1),
  step: z.number().int().positive(),
});

export const moduleGenerationResultSchema = z
  .object({
    pageContent: z.string().min(1).optional(),
    packetMode: z.enum(["full-packet", "summary-only"]).optional(),
    overview: z.string().min(1).optional(),
    responsibilities: z.array(z.string().min(1)).optional(),
    structureDiagramKind: z.enum(["classDiagram", "flowchart"]).optional(),
    structureDiagram: z.string().min(1).optional(),
    entityTable: z.array(moduleEntitySummarySchema).optional(),
    sequenceDiagram: z.string().min(1).optional(),
    flowNotes: z.array(moduleFlowNoteSchema).optional(),
    title: z.string().min(1),
    crossLinks: z.array(z.string()),
  })
  .superRefine((value, context) => {
    if (!value.pageContent && !value.overview) {
      context.addIssue({
        code: "custom",
        message:
          "Module generation result must include pageContent or overview",
        path: ["overview"],
      });
    }

    if (
      value.sequenceDiagram &&
      (!value.flowNotes || value.flowNotes.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Module generation result with sequenceDiagram must include flowNotes",
        path: ["flowNotes"],
      });
    }
  });

export const overviewGenerationResultSchema = z.object({
  content: z.string().min(1),
  mermaidDiagram: z.string(),
});
