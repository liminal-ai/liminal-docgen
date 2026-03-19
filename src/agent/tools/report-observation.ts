import type {
  AgentObservation,
  ObservationCollector,
} from "../observation-collector.js";
import type {
  ReportObservationInput,
  ReportObservationOutput,
} from "../types.js";

/**
 * Execute a report_observation tool call. Appends to the shared collector.
 * Never throws — observations are fire-and-forget.
 *
 * References: AC-3.1 (agent reports observations), AC-3.3 (no failure propagation)
 */
export function executeReportObservation(
  input: ReportObservationInput,
  moduleName: string,
  collector: ObservationCollector,
): ReportObservationOutput {
  try {
    const observation: AgentObservation = {
      moduleName,
      category: input.category,
      subjectKind: inferSubjectKind(input.subject),
      subject: input.subject,
      observation: input.observation,
      suggestedCategory: input.suggestedCategory,
    };

    collector.add(observation);
  } catch {
    // Fire-and-forget per AC-3.3b
  }

  return { recorded: true };
}

/**
 * Best-effort inference of subject kind from the subject string.
 * Not critical — observations are informational.
 */
function inferSubjectKind(
  subject: string,
): "component" | "module" | "relationship" {
  if (subject.includes("->") || subject.includes("\u2192")) {
    return "relationship";
  }

  if (subject.includes("/") || subject.includes(".")) {
    return "component";
  }

  return "module";
}
