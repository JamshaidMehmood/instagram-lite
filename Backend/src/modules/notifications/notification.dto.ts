import type { Types } from 'mongoose';

import type { IComment } from '../../models/Comment';
import type { INotification, NotificationType } from '../../models/Notification';
import type { IPost } from '../../models/Post';
import { mediaUrl } from '../media/media.service';
import { toPublicUser, type PopulatedAuthor, type PublicUserDTO } from '../users/user.dto';

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  actor: PublicUserDTO;
  isRead: boolean;
  createdAt: string;
  /**
   * Absent for a follow, which has no post to point at, and absent again when
   * the post has since been deleted. The row still reads correctly without a
   * thumbnail, so a dangling reference costs a picture rather than the entry.
   */
  post?: { id: string; imageUrl: string };
  /** Only for a comment — the row quotes what was said. */
  commentText?: string;
}

/**
 * The two referenced documents are populated down to the single field each one
 * contributes. A notification row renders a thumbnail and a snippet; pulling
 * whole posts would drag every caption and counter into a list that shows
 * neither.
 */
export type PopulatedThumbnail = Pick<IPost, 'image'> & { _id: Types.ObjectId };
export type PopulatedSnippet = Pick<IComment, 'text'> & { _id: Types.ObjectId };

export type PopulatedNotification = Omit<INotification, 'actor' | 'post' | 'comment'> & {
  _id: Types.ObjectId;
  actor: PopulatedAuthor;
  // Null rather than merely optional: a deleted post or comment leaves the
  // reference in place and `populate` resolves it to null.
  post?: PopulatedThumbnail | null;
  comment?: PopulatedSnippet | null;
};

export function toNotificationDTO(notification: PopulatedNotification): NotificationDTO {
  return {
    id: String(notification._id),
    type: notification.type,
    actor: toPublicUser(notification.actor),
    // `Boolean` rather than `readAt !== null`, because a row that somehow
    // carries no `readAt` at all is matched as unread by the `{ readAt: null }`
    // filter behind the badge — this keeps the list telling the same story the
    // count does.
    isRead: Boolean(notification.readAt),
    createdAt: notification.createdAt.toISOString(),
    ...(notification.post
      ? {
          post: {
            id: String(notification.post._id),
            imageUrl: mediaUrl(notification.post.image.mediaId),
          },
        }
      : {}),
    ...(notification.comment ? { commentText: notification.comment.text } : {}),
  };
}
