import { z } from "zod";
import { INFERENCE_PROVIDER_IDS } from "../inference/types.js";

const inferenceProviderIdSchema = z.enum(INFERENCE_PROVIDER_IDS);

const inferenceAuthSchema = z.discriminatedUnion("mode", [
  z.object({
    apiKeyEnvVar: z.string().optional(),
    mode: z.literal("env"),
  }),
  z.object({
    apiKey: z.string().optional(),
    apiKeyEnvVar: z.string().optional(),
    mode: z.literal("api-key"),
  }),
  z.object({
    mode: z.literal("oauth"),
  }),
]);

export const configurationRequestSchema = z.object({
  repoPath: z.string().optional(),
  outputPath: z.string().optional(),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  focusDirs: z.array(z.string()).optional(),
  configPath: z.string().optional(),
  inference: z
    .object({
      auth: inferenceAuthSchema.optional(),
      model: z.string().optional(),
      provider: inferenceProviderIdSchema,
    })
    .optional(),
});

export const configurationFileSchema = z.object({
  outputPath: z.string().optional(),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  focusDirs: z.array(z.string()).optional(),
  inference: z
    .object({
      auth: z
        .discriminatedUnion("mode", [
          z.object({
            apiKeyEnvVar: z.string().optional(),
            mode: z.literal("env"),
          }),
          z.object({
            mode: z.literal("oauth"),
          }),
        ])
        .optional(),
      model: z.string().optional(),
      provider: inferenceProviderIdSchema,
    })
    .optional(),
});

export const resolvedConfigurationSchema = z.object({
  outputPath: z.string(),
  includePatterns: z.array(z.string()),
  excludePatterns: z.array(z.string()),
  focusDirs: z.array(z.string()),
  inference: z
    .object({
      auth: inferenceAuthSchema,
      model: z.string().optional(),
      provider: inferenceProviderIdSchema,
    })
    .optional(),
});

export const defaultConfigurationSchema = resolvedConfigurationSchema;
