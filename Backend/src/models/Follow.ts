import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

import { baseSchemaOptions } from './serialization';

export interface IFollow {
  _id: Types.ObjectId;
  follower: Types.ObjectId; // the account doing the following
  following: Types.ObjectId; // the account being followed
  createdAt: Date;
  updatedAt: Date;
}

export type FollowDocument = HydratedDocument<IFollow>;

const followSchema = new Schema<IFollow>(
  {
    follower: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    following: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  baseSchemaOptions,
);

/**
 * The unique index *is* the double-follow guard.
 *
 * The service does not check "does this edge already exist?" first — that
 * read-then-write is racy, and two simultaneous taps would insert two rows and
 * increment `followerCount` twice. Instead it inserts unconditionally and
 * treats duplicate-key (E11000) as "already following", which is correct no
 * matter how the requests interleave.
 */
followSchema.index({ follower: 1, following: 1 }, { unique: true });

/**
 * Both list indexes end in `_id` because the keyset cursor sorts on
 * `(createdAt, _id)` — without the tiebreaker in the index, Mongo would have to
 * sort in memory on every page.
 *
 * They are two separate indexes rather than one because the two questions read
 * the edge from opposite ends: the followers list scans by `following`, while
 * the following list scans by `follower`. The unique index above cannot serve
 * the followers list at all, since its leading field is `follower`.
 */
followSchema.index({ following: 1, createdAt: -1, _id: -1 }); // "who follows this user?"
// "who does this user follow?" — also the lookup the home feed runs to decide
// whose posts belong in it.
followSchema.index({ follower: 1, createdAt: -1, _id: -1 });

export const Follow = model<IFollow>('Follow', followSchema);
