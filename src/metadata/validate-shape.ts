import { generatedDocumentationMetadataSchema } from "../contracts/metadata.js";
import type { GeneratedDocumentationMetadata } from "../types/index.js";

export const validateMetadataShape = (
  parsed: unknown,
):
  | { valid: true; metadata: GeneratedDocumentationMetadata }
  | { valid: false; reason: string } => {
  const result = generatedDocumentationMetadataSchema.safeParse(parsed);

  if (result.success) {
    return {
      valid: true,
      metadata: result.data,
    };
  }

  const issue = result.error.issues[0];
  const field = issue?.path.length ? issue.path.join(".") : "metadata";

  return {
    valid: false,
    reason: issue
      ? `${field}: ${issue.message}`
      : "metadata does not match the expected shape",
  };
};
