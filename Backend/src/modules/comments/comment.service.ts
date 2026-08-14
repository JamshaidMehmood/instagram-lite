import { Types } from 'mongoose';

import { Comment, type IComment } from '../../models/Comment';
import { Post } from '../../models/Post';
import { ApiError } from '../../utils/ApiError';
import { buildCursorFilter, buildPage, decodeCursor } from '../../utils/pagination';
import { notifyComment } from '../notifications/notification.service';
import type { PaginationQuery } from '../posts/post.schema';
import { AUTHOR_PROJECTION } from '../users/user.dto';
import { toCommentDTO, type CommentDTO, type PopulatedComment } from './comment.dto';
import type { CreateCommentInput } from './comment.schema';

export interface CommentPage {
  items: CommentDTO[];
  nextCursor: string | null;
  hasMore: boolean;
}

export async function listByPost(
  postId: string,
  query: PaginationQuery,
  viewerId?: string,
): Promise<CommentPage> {
  // Read the post once, for two reasons: it 404s a bad id before we page over
  // nothing, and it supplies the post author needed to decide who may delete
  // each comment — without re-reading it per comment.
  const post = await Post.findById(postId).select('author').lean();
  if (!post) throw ApiError.notFound('Post');

  const filter = query.cursor
    ? { post: new Types.ObjectId(postId), ...buildCursorFilter(decodeCursor(query.cursor)) }
    : { post: new Types.ObjectId(postId) };

  const rows = await Comment.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .populate('author', AUTHOR_PROJECTION)
    .lean<PopulatedComment[]>();

  const page = buildPage(rows, query.limit);
  const postAuthorId = String(post.author);

  return {
    items: page.items.map((comment) => toCommentDTO(comment, { viewerId, postAuthorId })),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

export async function addComment(
  postId: string,
  input: CreateCommentInput,
  viewerId: string,
): Promise<CommentDTO> {
  const post = await Post.findById(postId).select('author').lean();
  if (!post) throw ApiError.notFound('Post');

  const comment = await Comment.create({
    post: new Types.ObjectId(postId),
    author: new Types.ObjectId(viewerId),
    text: input.text,
  });

  // Atomic counter bump; never a read-modify-write of `commentCount`.
  await Post.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });

  // Unguarded on purpose: the service drops self-notifications itself, and it
  // swallows its own failures — a hiccup in the notifications collection must
  // not turn a comment that was already written into a failed request.
  await notifyComment(post.author, new Types.ObjectId(viewerId), post._id, comment._id);

  await comment.populate('author', AUTHOR_PROJECTION);

  return toCommentDTO(comment.toObject() as unknown as PopulatedComment, {
    viewerId,
    postAuthorId: String(post.author),
  });
}

export async function deleteComment(commentId: string, viewerId: string): Promise<void> {
  const comment = await Comment.findById(commentId).select('author post').lean<
    Pick<IComment, '_id' | 'author' | 'post'>
  >();
  if (!comment) throw ApiError.notFound('Comment');

  const post = await Post.findById(comment.post).select('author').lean();

  const isCommentAuthor = String(comment.author) === viewerId;
  const isPostAuthor = post ? String(post.author) === viewerId : false;

  if (!isCommentAuthor && !isPostAuthor) {
    throw ApiError.forbidden('You can only delete your own comments');
  }

  const result = await Comment.deleteOne({ _id: comment._id });

  // Only adjust the counter if this call is the one that actually removed the
  // row — two concurrent deletes must not decrement twice.
  if (result.deletedCount > 0 && post) {
    await Post.updateOne({ _id: post._id, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
  }
}
