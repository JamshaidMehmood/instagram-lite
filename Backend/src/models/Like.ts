import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

import { baseSchemaOptions } from './serialization';

export interface ILike {
  _id: Types.ObjectId;
  post: Types.ObjectId;
  user: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type LikeDocument = HydratedDocument<ILike>;

const likeSchema = new Schema<ILike>(
  {
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseSchemaOptions,
);

/**
 * The unique index *is* the double-like guard.
 *
 * The service does not check "has this user already liked?" first — that
 * read-then-write is racy, and two simultaneous taps would insert two rows and
 * increment `likeCount` twice. Instead it inserts unconditionally and treats
 * duplicate-key (E11000) as "already liked", which is correct no matter how
 * the requests interleave.
 */
likeSchema.index({ post: 1, user: 1 }, { unique: true });

/**
 * Serves "which of these posts has the viewer liked?" — the `$in` lookup the
 * feed runs once per page. The unique index above cannot answer it because its
 * leading field is `post`.
 */
likeSchema.index({ user: 1, post: 1 });

export const Like = model<ILike>('Like', likeSchema);
