import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

import { baseSchemaOptions } from './serialization';

export interface ISavedPost {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  post: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type SavedPostDocument = HydratedDocument<ISavedPost>;

const savedPostSchema = new Schema<ISavedPost>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
  },
  baseSchemaOptions,
);

/**
 * The unique index *is* the double-save guard.
 *
 * The service does not check "has this user already saved it?" first — that
 * read-then-write is racy, and two simultaneous taps would insert two rows, so
 * the saved list would show the post twice and one unsave would not clear it.
 * Instead it inserts unconditionally and treats duplicate-key (E11000) as
 * "already saved", which is correct no matter how the requests interleave and
 * is what makes POST /posts/:id/save idempotent.
 *
 * Leading with `user` — the reverse of Like's `{ post, user }` — because unlike
 * likes there is no per-post count to maintain and nobody asks "who saved this
 * post?". Every read starts from the viewer, so this index also serves the
 * `$in` lookup that resolves `viewerHasSaved` for a whole feed page at once.
 */
savedPostSchema.index({ user: 1, post: 1 }, { unique: true });

/**
 * The "my saved posts" list, newest first. Ends in `_id` because the keyset
 * cursor sorts on `(createdAt, _id)` — without the tiebreaker in the index,
 * Mongo would have to sort in memory on every page. The unique index above
 * cannot serve it: it is ordered by `post`, not by save time.
 *
 * Sorting on when the post was *saved* rather than when it was created is
 * deliberate — the list is a bookmark shelf, so the thing you just saved
 * belongs at the top even if the post itself is old.
 */
savedPostSchema.index({ user: 1, createdAt: -1, _id: -1 });

export const SavedPost = model<ISavedPost>('SavedPost', savedPostSchema);
