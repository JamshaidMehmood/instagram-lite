import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

import { baseSchemaOptions } from './serialization';

export interface IComment {
  _id: Types.ObjectId;
  post: Types.ObjectId;
  author: Types.ObjectId;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CommentDocument = HydratedDocument<IComment>;

const commentSchema = new Schema<IComment>(
  {
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: {
      type: String,
      required: [true, 'Comment text is required'],
      trim: true,
      minlength: [1, 'Comment cannot be empty'],
      maxlength: [1000, 'Comment must be at most 1000 characters'],
    },
  },
  baseSchemaOptions,
);

/**
 * Comments are referenced rather than embedded in the post document. Embedding
 * reads well for a fixed handful, but comment counts are unbounded — an
 * embedded array grows the post document on every insert, drags the full
 * thread into every feed query, and eventually hits the 16 MB ceiling.
 */
commentSchema.index({ post: 1, createdAt: -1, _id: -1 });

export const Comment = model<IComment>('Comment', commentSchema);
