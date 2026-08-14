import type { Types } from 'mongoose';

import type { IComment } from '../../models/Comment';
import { toPublicUser, type PopulatedAuthor, type PublicUserDTO } from '../users/user.dto';

export interface CommentDTO {
  id: string;
  text: string;
  author: PublicUserDTO;
  /**
   * Resolved server-side rather than left to the client to infer. The UI shows
   * a delete button off this flag, and the same rule is re-checked on the
   * delete request — the flag is a convenience, not the control.
   */
  viewerCanDelete: boolean;
  createdAt: string;
}

export type PopulatedComment = Omit<IComment, 'author'> & {
  _id: Types.ObjectId;
  author: PopulatedAuthor;
};

export function toCommentDTO(
  comment: PopulatedComment,
  options: { viewerId?: string | undefined; postAuthorId: string },
): CommentDTO {
  const { viewerId, postAuthorId } = options;

  return {
    id: String(comment._id),
    text: comment.text,
    author: toPublicUser(comment.author),
    // A comment can be removed by whoever wrote it, or by the owner of the
    // post it sits under — the same moderation rule Instagram uses.
    viewerCanDelete:
      Boolean(viewerId) && (String(comment.author._id) === viewerId || postAuthorId === viewerId),
    createdAt: comment.createdAt.toISOString(),
  };
}
