export interface ChangedFile {
  path: string;
  changeType: "added" | "modified" | "deleted" | "renamed";
  oldPath?: string;
}

export interface AffectedModuleSet {
  modulesToRegenerate: string[];
  modulesToRemove: string[];
  unchangedModules: string[];
  unmappableFiles: string[];
  overviewNeedsRegeneration: boolean;
  warnings: string[];
}
