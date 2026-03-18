import { z } from "zod";

export const reviewFilePatchSchema = z.object({
  filePath: z.string().min(1),
  newContent: z.string(),
});

export const reviewPatchPayloadSchema = z.array(reviewFilePatchSchema);
