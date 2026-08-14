import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

import { baseSchemaOptions } from './serialization';

export interface IPostImage {
  mediaId: Types.ObjectId;
  width: number;
  height: number;
  contentType: string;
}

export interface IPost {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  caption: string;
  location: string;
  image: IPostImage;
  likeCount: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type PostDocument = HydratedDocument<IPost>;

const postImageSchema = new Schema<IPostImage>(
  {
    // Points at a GridFS file. The bytes never live in this document, so a
    // feed page stays a few hundred bytes per post instead of megabytes of
    // base64 — and a post can never approach the 16 MB BSON limit.
    mediaId: { type: Schema.Types.ObjectId, required: true },
    // Measured server-side at upload. The client uses the ratio to reserve
    // space before the image loads, which is what keeps the feed from
    // shifting as you scroll.
    width: { type: Number, required: true, min: 1 },
    height: { type: Number, required: true, min: 1 },
    contentType: { type: String, required: true },
  },
  { _id: false },
);

const postSchema = new Schema<IPost>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    caption: {
      type: String,
      required: [true, 'Caption is required'],
      trim: true,
      maxlength: [2200, 'Caption must be at most 2200 characters'],
    },
    location: { type: String, trim: true, maxlength: 100, default: '' },
    image: { type: postImageSchema, required: true },

    // Denormalised counters. The feed renders like and comment totals for
    // every visible post; deriving them would mean a count query per post per
    // page. These are maintained with atomic `$inc` alongside the write that
    // changes them, so they cannot drift under concurrency.
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
  },
  baseSchemaOptions,
);

/**
 * Both indexes end in `_id` because the keyset cursor sorts on
 * `(createdAt, _id)` — without the tiebreaker in the index, Mongo would have
 * to sort in memory on every page.
 */
postSchema.index({ createdAt: -1, _id: -1 }); // global feed
postSchema.index({ author: 1, createdAt: -1, _id: -1 }); // profile grid

export const Post = model<IPost>('Post', postSchema);
