import { z } from 'zod';

import { objectIdParam } from '../posts/post.schema';

export const createCommentSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Comment cannot be empty')
    .max(1000, 'Comment must be at most 1000 characters'),
});

export const commentIdParamsSchema = z.object({ commentId: objectIdParam });

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
