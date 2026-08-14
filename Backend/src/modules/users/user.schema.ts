import { z } from 'zod';

/**
 * Usernames that would shadow a route.
 *
 * `/users/:username` is a param route, so every literal segment mounted beside
 * it is also a structurally valid username. An account that claimed
 * `suggestions` would live at a path Express already answers with a suggestion
 * list: the client asks for one profile object and is handed an array, and the
 * page renders `undefined` all the way down. Reserving them costs nothing, and
 * the alternative is an account nobody — including its owner — can ever view.
 *
 * Keep this in step with the literal segments declared in `user.routes.ts`.
 */
export const RESERVED_USERNAMES = new Set([
  'me',
  'search',
  'suggestions',
  'admin',
  'api',
  'auth',
]);

/**
 * The name/username/bio rules are duplicated from the model on purpose.
 *
 * Mongoose would reject the same values at `save()`, but as a ValidationError
 * that reaches the client as one opaque failure with no field to attach it to.
 * Stating the rules here — the same reason `passwordSchema` lives in
 * `auth.schema` rather than on the model — turns each one into a per-field 400
 * that the edit form can render inline next to the input that caused it.
 *
 * Uniqueness is the one rule deliberately *not* restated: it cannot be checked
 * without a read that races the write, so the unique index decides it and
 * `updateProfile` translates the resulting 11000.
 */
export const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(60, 'Name must be at most 60 characters')
      .optional(),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must be at most 30 characters')
      .regex(/^[a-z0-9._]+$/, 'Username may only contain letters, numbers, dots and underscores')
      .refine((value) => !RESERVED_USERNAMES.has(value), 'That username is not available')
      .optional(),
    // `''` is a legal value, not an omission: it is how the form clears a bio.
    // A `.min(1)` here would make a bio impossible to remove once set.
    bio: z.string().trim().max(160, 'Bio must be at most 160 characters').optional(),
  })
  // An empty PATCH is a bug in the caller, not a no-op worth a 200. Failing it
  // here means the service never has to distinguish "changed nothing" from
  // "changed something", and a form that submits with no edits gets told so.
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  });

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Enter something to search for').max(50),
  // Small by default: this backs a type-ahead panel, where a long list is
  // slower to scan than it is useful. Capped for the same reason the feed's
  // limit is — a client must not be able to ask for an unbounded scan.
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type SearchQuery = z.infer<typeof searchQuerySchema>;
