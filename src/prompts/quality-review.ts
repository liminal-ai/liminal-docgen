import type { QualityReviewConfig } from "../types/quality-review.js";
import type { ValidationResult } from "../types/validation.js";

export const buildQualityReviewPrompt = (
  validationResult: ValidationResult,
  fileContents: Record<string, string>,
  config: Required<QualityReviewConfig>,
): { systemPrompt: string; userMessage: string } => {
  const reviewMode = config.secondModelReview
    ? "second-model review"
    : "self-review";
  const findingsSection =
    validationResult.findings.length === 0
      ? "- none"
      : validationResult.findings
          .map((finding, index) =>
            [
              `${index + 1}. [${finding.severity}] ${finding.category}`,
              `message: ${finding.message}`,
              `file: ${finding.filePath ?? "n/a"}`,
              finding.target ? `target: ${finding.target}` : null,
            ]
              .filter((value) => value !== null)
              .join(" | "),
          )
          .join("\n");
  const fileContentsSection =
    Object.entries(fileContents).length === 0
      ? "No referenced file contents were available."
      : Object.entries(fileContents)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(
            ([filePath, content]) =>
              `File: ${filePath}\n\`\`\`md\n${content}\n\`\`\``,
          )
          .join("\n\n");

  const systemPrompt = `
You are performing a bounded quality review on generated repository documentation.

This is the ${reviewMode} pass. Fix only obvious, non-controversial issues that
are supported by the validation findings and the provided file contents.

Allowed fix scope:
- broken links and other broken internal cross-references
- malformed Mermaid blocks
- missing expected pages or sections when the fix can be made within existing generated markdown files
- thin or empty summary sections

Hard constraints:
- Return only review patch data for files you modify
- Return complete file contents for each modified file
- Do not re-cluster
- Do not change the module plan, metadata files, or run configuration
- Do not create new modules, new architecture, or structural rewrites
- Do not regenerate the documentation from scratch
- Keep page purpose, headings, and overall structure stable unless a small repair is required
- If no safe fix exists, return an empty patch array
  `.trim();

  const userMessage = `
Quality review mode: ${reviewMode}
Validation status: ${validationResult.status}
Validation finding count: ${validationResult.findings.length}

Validation findings:
${findingsSection}

Referenced file contents:
${fileContentsSection}
  `.trim();

  return { systemPrompt, userMessage };
};
