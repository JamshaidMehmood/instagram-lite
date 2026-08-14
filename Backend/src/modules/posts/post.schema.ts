import { Types } from 'mongoose';
import { z } from 'zod';

/** Rejects a malformed id at the edge so it never reaches Mongo as a CastError. */
export const objectIdParam = z.string().refine((value) => Types.ObjectId.isValid(value), {
  message: 'Invalid id',
});

export const postIdParamsSchema = z.object({ id: objectIdParam });

/**
 * Multipart fields always arrive as strings, so the schema coerces rather than
 * assuming the client sent proper types.
 */
export const createPostSchema = z.object({
  caption: z
    .string()
    .trim()
    .min(1, 'Caption is required')
    .max(2200, 'Caption must be at most 2200 characters'),
  location: z.string().trim().max(100, 'Location must be at most 100 characters').default(''),
});

export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  // Capped so a client cannot request an unbounded page and turn one request
  // into an accidental table scan.
  limit: z.coerce.number().int().min(1).max(30).default(9),
});

export const usernameParamsSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9._]+$/, 'Invalid username'),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
