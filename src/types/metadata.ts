export interface DocumentationStatusRequest {
  repoPath: string;
  outputPath?: string;
}

export interface DocumentationStatus {
  state: "not_generated" | "current" | "stale" | "invalid";
  outputPath: string;
  lastGeneratedAt: string | null;
  lastGeneratedCommitHash: string | null;
  currentHeadCommitHash: string | null;
}

export interface MetadataWriteRequest {
  outputPath: string;
  metadata: GeneratedDocumentationMetadata;
}

export interface GeneratedDocumentationMetadata {
  generatedAt: string;
  commitHash: string;
  outputPath: string;
  filesGenerated: string[];
  componentCount: number;
  mode: "full" | "update";
}
