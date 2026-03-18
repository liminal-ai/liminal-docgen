export interface RawAnalysisOutput {
  functions: RawNode[];
  relationships: RawCallRelationship[];
  file_tree: RawFileTreeNode;
  summary: RawAnalysisSummary;
}

export interface RawNode {
  id: string;
  name: string;
  component_type: string;
  file_path: string;
  relative_path: string;
  start_line: number;
  end_line: number;
  depends_on: string[];
  parameters?: string[];
  class_name?: string;
}

export interface RawCallRelationship {
  caller: string;
  callee: string;
  call_line?: number;
  is_resolved: boolean;
}

export interface RawAnalysisSummary {
  total_files?: number;
  files_analyzed?: number;
  languages_found?: string[];
  unsupported_files?: Array<string | RawAnalysisFile>;
  files?: Array<string | RawAnalysisFile>;
  [key: string]: unknown;
}

export interface RawAnalysisFile {
  path: string;
  language?: string | null;
  lines_of_code?: number;
  supported?: boolean;
  [key: string]: unknown;
}

export interface RawFileTreeNode {
  type?: string;
  name?: string;
  path?: string;
  extension?: string;
  language?: string | null;
  lines_of_code?: number;
  children?: RawFileTreeNode[];
  [key: string]: unknown;
}
