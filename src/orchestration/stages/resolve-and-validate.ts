import path from "node:path";

import { z } from "zod";

import { resolveConfiguration } from "../../config/resolver.js";
import { validateInferenceCompatibility } from "../../inference/factory.js";
import { err, ok } from "../../types/common.js";
import type {
  DocumentationRunRequest,
  EngineResult,
  ResolvedRunConfig,
} from "../../types/index.js";

const inferenceConfigurationSchema = z.object({
  auth: z
    .discriminatedUnion("mode", [
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
    ])
    .optional(),
  model: z.string().optional(),
  provider: z.enum(["claude-sdk", "claude-cli", "openrouter-http"]),
});

const documentationRunRequestSchema = z.object({
  repoPath: z.string().trim().min(1),
  mode: z.enum(["full", "update"]),
  outputPath: z.string().optional(),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  focusDirs: z.array(z.string()).optional(),
  inference: inferenceConfigurationSchema.optional(),
  qualityReview: z
    .object({
      selfReview: z.boolean().optional(),
      secondModelReview: z.boolean().optional(),
    })
    .optional(),
});

export const resolveAndValidateRequest = async (
  request: DocumentationRunRequest,
): Promise<EngineResult<ResolvedRunConfig>> => {
  const parsedRequest = documentationRunRequestSchema.safeParse(request);

  if (!parsedRequest.success) {
    const issue = parsedRequest.error.issues[0];

    return err("CONFIGURATION_ERROR", "Documentation run request is invalid", {
      field: issue ? issue.path.join(".") || "request" : "request",
      issues: parsedRequest.error.issues,
      reason:
        issue?.message ??
        "Documentation run request does not match the expected shape",
    });
  }

  const repoPath = path.resolve(parsedRequest.data.repoPath);
  const configurationResult = await resolveConfiguration({
    excludePatterns: parsedRequest.data.excludePatterns,
    focusDirs: parsedRequest.data.focusDirs,
    inference: parsedRequest.data.inference,
    includePatterns: parsedRequest.data.includePatterns,
    outputPath: parsedRequest.data.outputPath,
    repoPath,
  });

  if (!configurationResult.ok) {
    return configurationResult;
  }

  if (!configurationResult.value.inference) {
    return err(
      "CONFIGURATION_ERROR",
      "Documentation runs require an explicit inference provider configuration",
      {
        field: "inference.provider",
        reason:
          "Set an inference provider via API input, CLI flags, or .liminal-docgen.json",
      },
    );
  }

  const inferenceCompatibility = validateInferenceCompatibility(
    configurationResult.value.inference,
  );

  if (!inferenceCompatibility.ok) {
    return inferenceCompatibility;
  }

  return ok({
    ...configurationResult.value,
    inference: configurationResult.value.inference,
    mode: parsedRequest.data.mode,
    qualityReview: {
      secondModelReview:
        parsedRequest.data.qualityReview?.secondModelReview ?? false,
      selfReview: parsedRequest.data.qualityReview?.selfReview ?? true,
    },
    repoPath,
  });
};
