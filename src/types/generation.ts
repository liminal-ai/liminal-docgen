export type ModuleDocumentationPacketMode = "full-packet" | "summary-only";

export type ModuleStructureDiagramKind = "classDiagram" | "flowchart";

export interface ModuleEntitySummary {
  name: string;
  kind: string;
  role: string;
  publicEntrypoints: string[];
  dependsOn: string[];
  usedBy: string[];
}

export interface ModuleFlowNote {
  step: number;
  actor: string;
  action: string;
  output: string;
}

export interface ModuleGenerationResult {
  title: string;
  crossLinks: string[];
  pageContent?: string;
  packetMode?: ModuleDocumentationPacketMode;
  overview?: string;
  responsibilities?: string[];
  structureDiagramKind?: ModuleStructureDiagramKind;
  structureDiagram?: string;
  entityTable?: ModuleEntitySummary[];
  sequenceDiagram?: string;
  flowNotes?: ModuleFlowNote[];
}

export interface OverviewGenerationResult {
  content: string;
  mermaidDiagram: string;
}

export type GeneratedModuleSet = Map<string, GeneratedModulePage>;

export interface GeneratedModulePage {
  moduleName: string;
  description: string;
  fileName: string;
  content: string;
  filePath: string;
}

export const moduleNameToFileName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .concat(".md");
};
