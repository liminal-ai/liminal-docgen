import { z } from "zod";

import type { InferenceProvider } from "../inference/types.js";
import type { ObservationCollector } from "./observation-collector.js";
import { SectionBuffer } from "./section-buffer.js";
import { executeReadSource } from "./tools/read-source.js";
import { executeReportObservation } from "./tools/report-observation.js";
import { executeWriteSection } from "./tools/write-section.js";
import {
  type AgentModuleContext,
  type AgentModuleResult,
  type AgentRuntimeConfig,
  PAGE_SECTION_KINDS,
} from "./types.js";

type SdkMcpToolDef =
  // biome-ignore lint/suspicious/noExplicitAny: SDK type requires `any` for generic tool schemas
  import("@anthropic-ai/claude-agent-sdk").SdkMcpToolDefinition<any>;

/**
 * Run an agent to generate a single module's documentation page.
 *
 * This is the primary entry point for the agent runtime.
 * Called by the generation stage for each module when the provider
 * supports tool use.
 *
 * References: AC-4.1 through AC-4.3 (generation), AC-4.5 (timeout),
 *             AC-3.1 through AC-3.3 (observations)
 */
export async function runAgentForModule(
  context: AgentModuleContext,
  provider: InferenceProvider,
  config: AgentRuntimeConfig,
  collector: ObservationCollector,
): Promise<AgentModuleResult> {
  const buffer = new SectionBuffer();
  let toolCallCount = 0;

  const tools = buildSdkToolDefinitions(
    config,
    buffer,
    context.moduleName,
    collector,
    () => {
      toolCallCount++;
    },
  );

  const systemPrompt = buildAgentSystemPrompt(context);

  const handle = provider.inferWithTools({
    systemPrompt,
    userMessage: `Generate the documentation page for the "${context.moduleName}" module.`,
    tools,
    maxTurns: config.maxTurns,
  });

  const timer = setTimeout(() => handle.cancel(), config.timeoutMs);

  try {
    const conversationResult = await handle.result;

    if (!conversationResult.ok) {
      const isCancelled =
        (conversationResult.error.details as Record<string, unknown>)
          ?.cancelled === true;
      return {
        status: "failed",
        failureReason: isCancelled
          ? `Agent exceeded time budget (${config.timeoutMs}ms)`
          : `Agent conversation failed: ${conversationResult.error.message}`,
        sections: {},
        observationCount: countObservationsForModule(
          collector,
          context.moduleName,
        ),
        turnCount: 0,
        toolCallCount,
        usage: { inputTokens: 0, outputTokens: 0 },
        costUsd: null,
      };
    }

    const result = conversationResult.value;
    const hasRequiredSections = buffer.hasRequiredSections();
    const missingSections = buffer.getMissingRequired();

    return {
      status: hasRequiredSections ? "success" : "failed",
      failureReason: hasRequiredSections
        ? undefined
        : `Agent completed without writing required sections: ${missingSections.join(", ")}`,
      sections: buffer.toSectionRecord(),
      observationCount: countObservationsForModule(
        collector,
        context.moduleName,
      ),
      turnCount: result.turnCount,
      toolCallCount,
      usage: result.usage ?? { inputTokens: 0, outputTokens: 0 },
      costUsd: result.costUsd,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "failed",
      failureReason: `Agent runtime error: ${message}`,
      sections: {},
      observationCount: countObservationsForModule(
        collector,
        context.moduleName,
      ),
      turnCount: 0,
      toolCallCount,
      usage: { inputTokens: 0, outputTokens: 0 },
      costUsd: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function countObservationsForModule(
  collector: ObservationCollector,
  moduleName: string,
): number {
  return collector.getAll().filter((obs) => obs.moduleName === moduleName)
    .length;
}

/**
 * Build SDK-native tool definitions with handlers.
 *
 * Constructs SdkMcpToolDefinition objects. Each handler dispatches to the
 * appropriate tool executor and wraps the result as a CallToolResult.
 *
 * The onToolCall callback is invoked before each handler runs, allowing the
 * caller to count tool calls.
 */
function buildSdkToolDefinitions(
  config: AgentRuntimeConfig,
  buffer: SectionBuffer,
  moduleName: string,
  collector: ObservationCollector,
  onToolCall: () => void,
): SdkMcpToolDef[] {
  return [
    {
      name: "read_source",
      description:
        "Read the contents of a source file from the repository. " +
        "The file path is relative to the repository root. " +
        "Returns file content (capped at 2000 lines) or an error.",
      inputSchema: {
        filePath: z
          .string()
          .describe("File path relative to the repository root"),
      },
      async handler(args: Record<string, unknown>) {
        onToolCall();
        const result = await executeReadSource(
          { filePath: String(args.filePath ?? "") },
          config,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      },
    },
    {
      name: "write_section",
      description:
        "Write a documentation section for the current module page. " +
        "Writing the same section again replaces the previous content.",
      inputSchema: {
        section: z
          .enum(PAGE_SECTION_KINDS)
          .describe("The section kind to write"),
        content: z.string().describe("Section content as markdown"),
      },
      async handler(args: Record<string, unknown>) {
        onToolCall();
        const result = executeWriteSection(
          {
            section: String(
              args.section ?? "",
            ) as (typeof PAGE_SECTION_KINDS)[number],
            content: String(args.content ?? ""),
          },
          buffer,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      },
    },
    {
      name: "report_observation",
      description:
        "Report a classification observation when code doesn't fit assigned labels. " +
        "Informational only — does not affect page generation.",
      inputSchema: {
        category: z
          .enum([
            "classification-gap",
            "relationship-gap",
            "zone-ambiguity",
            "archetype-mismatch",
          ])
          .describe("The kind of classification issue observed"),
        subject: z
          .string()
          .describe("File path, component, module, or relationship"),
        observation: z
          .string()
          .describe("What doesn't match the classification"),
        suggestedCategory: z
          .string()
          .optional()
          .describe("Suggested correct classification"),
      },
      async handler(args: Record<string, unknown>) {
        onToolCall();
        const result = executeReportObservation(
          {
            category: String(args.category ?? "") as Parameters<
              typeof executeReportObservation
            >[0]["category"],
            subject: String(args.subject ?? ""),
            observation: String(args.observation ?? ""),
            suggestedCategory: args.suggestedCategory
              ? String(args.suggestedCategory)
              : undefined,
          },
          moduleName,
          collector,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      },
    },
  ];
}

/**
 * Build the agent's system prompt from module context.
 */
function buildAgentSystemPrompt(context: AgentModuleContext): string {
  const componentList = context.componentPaths
    .map((p) => {
      const classification = context.componentClassifications.get(p);
      return classification
        ? `- ${p} (role: ${classification.role}, zone: ${classification.zone})`
        : `- ${p}`;
    })
    .join("\n");

  const entityList =
    context.entityCandidates.length === 0
      ? "  (none)"
      : context.entityCandidates
          .map(
            (e) =>
              `- ${e.name} | kind: ${e.kind} | file: ${e.filePath} | depends on: ${e.dependsOn.join(", ") || "none"} | used by: ${e.usedBy.join(", ") || "none"}`,
          )
          .join("\n");

  const flowList =
    context.flowCandidates.length === 0
      ? "  (none)"
      : context.flowCandidates
          .map(
            (f) =>
              `- ${f.actor} → ${f.target}: ${f.action} (weight: ${f.weight})`,
          )
          .join("\n");

  const internalRels =
    context.internalRelationships.length === 0
      ? "  (none)"
      : context.internalRelationships.map((r) => `- ${r}`).join("\n");

  const crossRels =
    context.crossModuleRelationships.length === 0
      ? "  (none)"
      : context.crossModuleRelationships.map((r) => `- ${r}`).join("\n");

  const otherModules =
    context.otherModuleNames.length === 0
      ? "  (none)"
      : context.otherModuleNames.map((n) => `- ${n}`).join("\n");

  return `You are a documentation agent generating a module page for a code wiki.

## Module: ${context.moduleName}
Description: ${context.moduleDescription}
Archetype: ${context.moduleArchetype}

## Components
${componentList}

## Entity Candidates
${entityList}

## Flow Candidates
${flowList}

## Internal Relationships
${internalRels}

## Cross-Module Relationships
${crossRels}

## Other Modules (for cross-references)
${otherModules}

${context.zoneGuidance ? `## Zone Guidance\n${context.zoneGuidance}` : ""}

## Instructions

Use the available tools to generate documentation for this module:

1. **read_source**: Read source files to understand the actual code. Read files before writing documentation.
2. **write_section**: Write documentation sections. Required sections: "overview" and "source-coverage". Optional: "responsibilities", "structure-diagram", "entity-table", "sequence-diagram", "flow-notes", "cross-module-context".
3. **report_observation**: If you notice a component's classification doesn't match the code, report it. This is optional and informational only.

### Quality Guidelines
- **Overview** (required): Concise summary of what this module does and why it exists.
- **Source Coverage** (required): List all component file paths covered by this module.
- **Structure Diagram**: Include a Mermaid class or flowchart diagram when the module has clear structural relationships (classes, interfaces, inheritance).
- **Entity Table**: Markdown table with columns: Name, Kind, Role. Include when the module has notable exported entities.
- **Sequence Diagram**: Include a Mermaid sequence diagram when the module has clear runtime flows between components.
- **Flow Notes**: Only include alongside a sequence diagram. Describes the steps in the flow.
- **Responsibilities**: Bullet list of what this module is responsible for.
- **Cross-Module Context**: Describe how this module relates to other modules.

Write sections as pre-formatted markdown. The system will assemble them into a page with headings.`;
}
