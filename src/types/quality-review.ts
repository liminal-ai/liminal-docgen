export interface QualityReviewConfig {
  selfReview?: boolean;
  secondModelReview?: boolean;
}

export interface ReviewFilePatch {
  filePath: string;
  newContent: string;
}

export interface QualityReviewPassResult {
  patchesApplied: number;
  filesModified: string[];
}
