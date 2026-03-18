export interface AnalysisOptions {
  repoPath: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  focusDirs?: string[];
}

export interface RepositoryAnalysis {
  repoPath: string;
  commitHash: string;
  summary: AnalysisSummary;
  components: Record<string, AnalyzedComponent>;
  relationships: AnalyzedRelationship[];
  focusDirs: string[];
}

export interface AnalysisSummary {
  totalFilesAnalyzed: number;
  totalComponents: number;
  totalRelationships: number;
  languagesFound: string[];
  languagesSkipped: string[];
}

export interface AnalyzedComponent {
  filePath: string;
  language: string;
  exportedSymbols: ExportedSymbol[];
  linesOfCode: number;
}

export interface ExportedSymbol {
  name: string;
  kind:
    | "function"
    | "class"
    | "interface"
    | "type"
    | "variable"
    | "enum"
    | "constant"
    | "other";
  lineNumber: number;
}

export interface AnalyzedRelationship {
  source: string;
  target: string;
  type: "import" | "inheritance" | "implementation" | "composition" | "usage";
}
