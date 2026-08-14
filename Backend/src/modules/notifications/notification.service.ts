import { Types, type FilterQuery } from 'mongoose';

import { logger } from '../../config/logger';
import { Notification, type INotification } from '../../models/Notification';
import { buildCursorFilter, buildPage, decodeCursor } from '../../utils/pagination';
import type { PaginationQuery } from '../posts/post.schema';
import { AUTHOR_PROJECTION } from '../users/user.dto';
import {
  toNotificationDTO,
  type NotificationDTO,
  type PopulatedNotification,
} from './notification.dto';

export interface NotificationPage {
  items: NotificationDTO[];
  nextCursor: string | null;
  hasMore: boolean;
}

type NotificationDraft = Pick<INotification, 'recipient' | 'actor' | 'type'> &
  Partial<Pick<INotification, 'post' | 'comment'>>;

/**
 * Every `notify*` funnels through here, and the two rules it enforces are the
 * entire reason those helpers exist instead of a `Notification.create` at each
 * call site.
 *
 * 1. Nobody is told about their own action. Liking or commenting on your own
 *    post is a normal thing to do and produces an activity row that reads as a
 *    bug ("you liked your own post").
 * 2. A notification failure never reaches the caller. This try/catch looks
 *    pointless until you follow what a rethrow would do: the like has already
 *    been written and the counter already incremented, so propagating turns a
 *    successful write into a 500 and the client reverts a heart that is in fact
 *    filled in the database. A missing activity row is a far smaller lie than
 *    that, so the failure is logged and the request carries on.
 */
async function record(draft: NotificationDraft): Promise<void> {
  if (draft.recipient.equals(draft.actor)) return;

  try {
    await Notification.create(draft);
  } catch (error) {
    logger.error(
      { err: error, type: draft.type, recipient: String(draft.recipient) },
      'Could not record notification',
    );
  }
}

/**
 * Retraction, and failure-isolated for the same reason `record` is: an unfollow
 * that succeeded must not be reported as failed because its notification row
 * would not go away.
 */
async function retract(filter: FilterQuery<INotification>): Promise<void> {
  try {
    await Notification.deleteOne(filter);
  } catch (error) {
    logger.error({ err: error, filter }, 'Could not clear notification');
  }
}

export async function notifyFollow(
  recipientId: Types.ObjectId,
  actorId: Types.ObjectId,
): Promise<void> {
  await record({ recipient: recipientId, actor: actorId, type: 'follow' });
}

export async function notifyLike(
  recipientId: Types.ObjectId,
  actorId: Types.ObjectId,
  postId: Types.ObjectId,
): Promise<void> {
  await record({ recipient: recipientId, actor: actorId, type: 'like', post: postId });
}

/**
 * The comment id is stored alongside the post id so the row can quote the text
 * without the feed re-reading the thread — and so a deleted comment resolves to
 * null and simply loses its snippet.
 */
export async function notifyComment(
  recipientId: Types.ObjectId,
  actorId: Types.ObjectId,
  postId: Types.ObjectId,
  commentId: Types.ObjectId,
): Promise<void> {
  await record({
    recipient: recipientId,
    actor: actorId,
    type: 'comment',
    post: postId,
    comment: commentId,
  });
}

/**
 * Unfollowing takes its notification back.
 *
 * Deleted rather than left in place, because the row asserts a present-tense
 * fact — "X started following you" next to a Follow button — and a stale one is
 * a lie the reader has no way to spot. Nothing else is stored on the row worth
 * keeping, so there is no history being discarded.
 */
export async function clearFollowNotification(
  recipientId: Types.ObjectId,
  actorId: Types.ObjectId,
): Promise<void> {
  await retract({ recipient: recipientId, actor: actorId, type: 'follow' });
}

/** Same retraction for an unlike: the like is gone, so its row must go too. */
export async function clearLikeNotification(
  recipientId: Types.ObjectId,
  actorId: Types.ObjectId,
  postId: Types.ObjectId,
): Promise<void> {
  await retract({ recipient: recipientId, actor: actorId, type: 'like', post: postId });
}

/**
 * The activity feed: everything aimed at one account, newest first.
 *
 * Keyset-paginated off `{ recipient, createdAt, _id }` like every other list in
 * the API — this one especially, since notifications arrive while the user is
 * reading them and `skip` would double-serve or drop rows on every new arrival.
 */
export async function listForUser(
  userId: string,
  query: PaginationQuery,
): Promise<NotificationPage> {
  const recipient = new Types.ObjectId(userId);

  const filter: FilterQuery<INotification> = query.cursor
    ? { recipient, ...buildCursorFilter(decodeCursor(query.cursor)) }
    : { recipient };

  const rows = await Notification.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .populate('actor', AUTHOR_PROJECTION)
    .populate('post', 'image')
    .populate('comment', 'text')
    .lean<PopulatedNotification[]>();

  const page = buildPage(rows, query.limit);

  return {
    // An account deleted after acting leaves a row whose actor populate comes
    // back null, and a notification with no actor has nothing to say. Dropped
    // here exactly as `listLikers` drops them.
    items: page.items.filter((row) => row.actor).map((row) => toNotificationDTO(row)),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

/**
 * Backs the nav badge, which polls — so it must stay cheap at any inbox size.
 *
 * `countDocuments` on this filter is answered entirely by the
 * `{ recipient: 1, readAt: 1 }` index: the server counts index entries and
 * never loads a document, whatever the answer is. Listing the unread rows and
 * taking `.length` would fetch every one of them to produce a single integer.
 */
export async function unreadCount(userId: string): Promise<number> {
  return Notification.countDocuments({ recipient: new Types.ObjectId(userId), readAt: null });
}

export async function markAllRead(userId: string): Promise<void> {
  // `readAt: null` belongs in the filter, not just implied by the update. The
  // client fires this on every visit to the tab, and without it each visit
  // rewrites the user's entire history — overwriting timestamps that were
  // already correct, and paying for the writes to do it.
  await Notification.updateMany(
    { recipient: new Types.ObjectId(userId), readAt: null },
    { $set: { readAt: new Date() } },
  );
}
