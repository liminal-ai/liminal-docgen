export interface ModuleGenerationResult {
  pageContent: string;
  title: string;
  crossLinks: string[];
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
