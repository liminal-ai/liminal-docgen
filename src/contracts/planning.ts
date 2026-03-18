import { z } from "zod";

export const CLUSTERING_THRESHOLD = 8;

export const modulePlanSchema = z.object({
  modules: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      components: z.array(z.string()),
      parentModule: z.string().optional(),
    }),
  ),
  unmappedComponents: z.array(z.string()),
});

export type ModulePlan = z.infer<typeof modulePlanSchema>;
