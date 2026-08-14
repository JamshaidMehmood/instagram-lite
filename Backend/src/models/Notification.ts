import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

import { baseSchemaOptions } from './serialization';

export type NotificationType = 'like' | 'comment' | 'follow';

export interface INotification {
  _id: Types.ObjectId;
  recipient: Types.ObjectId; // the account being told
  actor: Types.ObjectId; // the account that did the thing
  type: NotificationType;
  post?: Types.ObjectId;
  comment?: Types.ObjectId;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationDocument = HydratedDocument<INotification>;

const notificationSchema = new Schema<INotification>(
  {
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, enum: ['like', 'comment', 'follow'] },

    /**
     * `post` and `comment` are optional refs on one collection rather than
     * three per-type collections or a Mongoose discriminator.
     *
     * There is exactly one read pattern: "the next page of everything that
     * happened to me, newest first". Split across three collections that query
     * becomes three keyset scans plus an in-memory merge, and the cursor stops
     * being a single `(createdAt, _id)` pair. A discriminator would keep one
     * collection but buys nothing here — the per-type difference is which of
     * two optional refs is populated, not distinct behaviour or validation
     * worth a subclass. One collection means one index serves the whole feed.
     *
     * Which of them is set is a function of `type`, and the service is the only
     * writer: 'follow' carries neither, 'like' carries `post`, 'comment'
     * carries both. Not enforced with a `required` function because that would
     * push a write-time validator between the caller and a notification whose
     * failure must never fail the action that triggered it.
     */
    post: { type: Schema.Types.ObjectId, ref: 'Post' },
    comment: { type: Schema.Types.ObjectId, ref: 'Comment' },

    /**
     * A nullable timestamp rather than an `isRead` boolean: it answers both
     * "is this unread?" (`readAt: null`) and "when did they see it?" with one
     * field, where a boolean answers only the first and would need a second
     * column the day anything wants the seen time. `null` rather than absent so
     * the index below covers every document — a missing field and an explicit
     * null are the same key to Mongo, but a default keeps the shape honest.
     */
    readAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

/**
 * Ends in `_id` because the keyset cursor sorts on `(createdAt, _id)` — without
 * the tiebreaker in the index, Mongo would have to sort in memory on every page.
 */
notificationSchema.index({ recipient: 1, createdAt: -1, _id: -1 });

/**
 * The unread badge. Counting on `{ recipient, readAt: null }` is a covered
 * index scan of exactly the unread rows, so the badge does not get slower as a
 * user's history grows — the feed index above cannot serve it, since it would
 * have to walk every notification the recipient ever received to filter on
 * `readAt`.
 */
notificationSchema.index({ recipient: 1, readAt: 1 });

export const Notification = model<INotification>('Notification', notificationSchema);
