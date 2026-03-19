import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { ObservationCategory } from "./types.js";

/**
 * Structured observation reported by an agent during module generation.
 *
 * References: AC-3.1 (observation structure), AC-3.2c (required fields)
 */
export interface AgentObservation {
  moduleName: string;
  category: ObservationCategory;
  subjectKind: "component" | "module" | "relationship";
  subject: string;
  observation: string;
  suggestedCategory?: string;
}

/**
 * The persisted shape of the observations file.
 *
 * References: AC-3.2a (file structure), AC-3.2c (run metadata)
 */
export interface RunObservations {
  runId: string;
  timestamp: string;
  observationCount: number;
  observations: AgentObservation[];
}

/**
 * Collects observations across all module agents in a run.
 * Shared instance passed to each module's agent runtime.
 *
 * References: AC-3.2 (persistence), AC-3.3 (fire-and-forget)
 */
export class ObservationCollector {
  private readonly observations: AgentObservation[] = [];
  private readonly runId: string;

  constructor(runId: string) {
    this.runId = runId;
  }

  /**
   * Append an observation. Never throws.
   * If the input is malformed, the observation is silently dropped.
   */
  add(observation: AgentObservation): void {
    try {
      this.observations.push(observation);
    } catch {
      // Fire-and-forget per AC-3.3
    }
  }

  /** All observations collected so far. */
  getAll(): readonly AgentObservation[] {
    return this.observations;
  }

  /** Number of observations collected. */
  count(): number {
    return this.observations.length;
  }

  /**
   * Write observations to .doc-observations.json in the output directory.
   * No-op if no observations were collected (AC-3.2b).
   * Catches its own I/O errors — persistence failure does not propagate.
   *
   * References: AC-3.2a, AC-3.2b, AC-3.3
   */
  async persist(outputDir: string): Promise<void> {
    if (this.observations.length === 0) {
      return;
    }

    const payload: RunObservations = {
      runId: this.runId,
      timestamp: new Date().toISOString(),
      observationCount: this.observations.length,
      observations: this.observations,
    };

    try {
      const filePath = path.join(outputDir, ".doc-observations.json");
      await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
    } catch {
      // Observation persistence failure is non-fatal per AC-3.3
    }
  }
}
