import { z } from "zod";

export const PublishRequestSchema = z.object({
  repoPath: z.string().min(1),
  outputPath: z.string().optional(),
  branchName: z.string().optional(),
  commitMessage: z.string().optional(),
  createPullRequest: z.boolean().optional().default(true),
  prTitle: z.string().optional(),
  prBody: z.string().optional(),
  baseBranch: z.string().optional(),
});

export const PublishResultSchema = z.object({
  branchName: z.string(),
  commitHash: z.string(),
  pushedToRemote: z.boolean(),
  pullRequestUrl: z.string().nullable(),
  pullRequestNumber: z.number().nullable(),
  filesCommitted: z.array(z.string()),
});
