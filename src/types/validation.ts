export interface ValidationRequest {
  outputPath: string;
  requirePersistedArtifacts?: boolean;
}

export interface ValidationResult {
  status: "pass" | "warn" | "fail";
  errorCount: number;
  warningCount: number;
  findings: ValidationFinding[];
}

export interface ValidationFinding {
  severity: "error" | "warning";
  category:
    | "missing-file"
    | "broken-link"
    | "metadata"
    | "module-tree"
    | "mermaid"
    | "required-section"
    | "entity-table"
    | "flow-notes";
  message: string;
  filePath?: string;
  target?: string;
}

export interface ModuleTreeEntry {
  name: string;
  page: string;
  children?: ModuleTreeEntry[];
}

export type ModuleTree = ModuleTreeEntry[];

export const STRUCTURAL_FILES = new Set(["overview.md"]);
