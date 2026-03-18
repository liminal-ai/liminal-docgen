/**
 * Input to publishDocumentation().
 * All optional fields have defaults.
 */
export interface PublishRequest {
  repoPath: string;
  outputPath?: string;
  branchName?: string;
  commitMessage?: string;
  createPullRequest?: boolean;
  prTitle?: string;
  prBody?: string;
  baseBranch?: string;
}

/**
 * Result of a successful publish operation.
 */
export interface PublishResult {
  branchName: string;
  commitHash: string;
  pushedToRemote: boolean;
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
  filesCommitted: string[];
}
