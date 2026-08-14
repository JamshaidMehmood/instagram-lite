import { MongoServerError } from 'mongodb';
import { Types, type FilterQuery } from 'mongoose';

import { Comment } from '../../models/Comment';
import { Like } from '../../models/Like';
import { Post, type IPost } from '../../models/Post';
import { SavedPost, type ISavedPost } from '../../models/SavedPost';
import { User } from '../../models/User';
import { ApiError } from '../../utils/ApiError';
import { buildCursorFilter, buildPage, decodeCursor } from '../../utils/pagination';
import * as mediaService from '../media/media.service';
import * as notificationService from '../notifications/notification.service';
import {
  AUTHOR_PROJECTION,
  toPublicUser,
  type PopulatedAuthor,
  type PublicUserDTO,
} from '../users/user.dto';
import { followingIdsFor } from '../users/user.service';
import { toPostDTO, type PopulatedPost, type PostDTO } from './post.dto';
import type { CreatePostInput, PaginationQuery } from './post.schema';

export interface PostPage {
  items: PostDTO[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * A saved row with its post — and that post's author — resolved by `populate`.
 * `post` is nullable because the reference can outlive its target: a post
 * deleted before the cleanup in `deletePost` existed leaves a save pointing at
 * nothing.
 */
type PopulatedSavedPost = Omit<ISavedPost, 'post'> & { post: PopulatedPost | null };

/**
 * Resolves "which of these posts has the viewer liked?" in a single indexed
 * query, whatever the page size.
 *
 * This replaces a per-post round trip: the old frontend fired one
 * `getLikesInfo` request for every card on screen and re-fired all of them
 * whenever any like changed. Both the request storm and the server-side N+1
 * collapse into one `$in` lookup covered by the `{ user: 1, post: 1 }` index.
 */
async function resolveViewerLikes(
  postIds: Types.ObjectId[],
  viewerId: string | undefined,
): Promise<Set<string>> {
  if (!viewerId || postIds.length === 0) return new Set();

  const likes = await Like.find({ user: new Types.ObjectId(viewerId), post: { $in: postIds } })
    .select('post')
    .lean();

  return new Set(likes.map((like) => String(like.post)));
}

/**
 * The saves twin of `resolveViewerLikes`, deliberately identical in shape: one
 * `$in` per page, covered by the `{ user: 1, post: 1 }` unique index on
 * SavedPost. Answering "has the viewer saved this?" per card would be the same
 * N+1 that batching the likes exists to remove.
 */
async function resolveViewerSaves(
  postIds: Types.ObjectId[],
  viewerId: string | undefined,
): Promise<Set<string>> {
  if (!viewerId || postIds.length === 0) return new Set();

  const saves = await SavedPost.find({ user: new Types.ObjectId(viewerId), post: { $in: postIds } })
    .select('post')
    .lean();

  return new Set(saves.map((saved) => String(saved.post)));
}

/**
 * One page of posts costs four queries no matter how many posts it holds: the
 * keyset-paginated `find`, the `populate` batch for authors, the like lookup
 * and the save lookup. It was three before saved posts existed; what the
 * number guards is not its own size but that it stays constant in the page
 * size rather than proportional to it.
 *
 * The two viewer lookups run concurrently — different collections, neither
 * reading the other's result — so the extra query costs a query, not a round
 * trip.
 *
 * `.lean()` skips Mongoose document hydration — we map straight to a DTO, so
 * getters, virtuals and change tracking would all be wasted work.
 */
async function paginatePosts(
  baseFilter: FilterQuery<IPost>,
  query: PaginationQuery,
  viewerId: string | undefined,
): Promise<PostPage> {
  const filter: FilterQuery<IPost> = query.cursor
    ? { ...baseFilter, ...buildCursorFilter(decodeCursor(query.cursor)) }
    : baseFilter;

  const rows = await Post.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .populate('author', AUTHOR_PROJECTION)
    .lean<PopulatedPost[]>();

  const page = buildPage(rows, query.limit);
  const postIds = page.items.map((post) => post._id);
  const [likedIds, savedIds] = await Promise.all([
    resolveViewerLikes(postIds, viewerId),
    resolveViewerSaves(postIds, viewerId),
  ]);

  return {
    items: page.items.map((post) =>
      toPostDTO(post, {
        viewerId,
        viewerHasLiked: likedIds.has(String(post._id)),
        viewerHasSaved: savedIds.has(String(post._id)),
      }),
    ),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

/**
 * The home feed: posts by the people the viewer follows, plus the viewer's own.
 *
 * Your own photos belong in your own feed — without them a new account sees an
 * empty home screen immediately after its first upload, which reads as a broken
 * post rather than an empty graph.
 *
 * The followed ids are fetched as a separate query instead of a `$lookup` into
 * `follows`. The lookup would have to run before the sort, so the page could no
 * longer be served straight off `{ createdAt: -1, _id: -1 }` and every keyset
 * page would degrade into a scan-and-sort. This way costs one extra read that
 * the `{ follower, createdAt, _id }` index covers outright, and leaves the post
 * query a plain indexed `$in`.
 *
 * An anonymous caller keeps the unfiltered feed: a logged-out visitor has no
 * graph to filter by, and showing them nothing at all would be worse than
 * showing them everything.
 */
export async function listFeed(query: PaginationQuery, viewerId?: string): Promise<PostPage> {
  if (!viewerId) return paginatePosts({}, query, viewerId);

  const following = await followingIdsFor(viewerId);
  const authorIds = [...following, new Types.ObjectId(viewerId)];

  return paginatePosts({ author: { $in: authorIds } }, query, viewerId);
}

/**
 * The explore feed: everything except the viewer's own posts.
 *
 * Not "people you don't follow", which is the obvious reading of a discovery
 * surface and the wrong one — that set shrinks every time you follow someone,
 * so the page whose whole job is finding new accounts empties out fastest for
 * the people using it most. Excluding only your own posts keeps it populated
 * forever while never showing you what is already on your profile.
 */
export function listExplore(query: PaginationQuery, viewerId?: string): Promise<PostPage> {
  const filter: FilterQuery<IPost> = viewerId
    ? { author: { $ne: new Types.ObjectId(viewerId) } }
    : {};

  return paginatePosts(filter, query, viewerId);
}

export function listByAuthor(
  authorId: Types.ObjectId,
  query: PaginationQuery,
  viewerId?: string,
): Promise<PostPage> {
  return paginatePosts({ author: authorId }, query, viewerId);
}

/**
 * The viewer's own saved posts, newest *save* first.
 *
 * The keyset runs over the SavedPost rows rather than the posts, which is why
 * this cannot reuse `paginatePosts` — the cursor belongs to a different
 * collection. That ordering is the point: a bookmarks list is sorted by when
 * you saved something, so saving a two-year-old photo puts it at the top,
 * where the person who just saved it will look for it. Sorting by post date
 * would bury it.
 *
 * `viewerHasSaved` is `true` by construction: every row here *is* one of the
 * viewer's saves, so `resolveViewerSaves` would be a query with a known
 * answer.
 */
export async function listSavedByUser(viewerId: string, query: PaginationQuery): Promise<PostPage> {
  const baseFilter: FilterQuery<ISavedPost> = { user: new Types.ObjectId(viewerId) };
  const filter: FilterQuery<ISavedPost> = query.cursor
    ? { ...baseFilter, ...buildCursorFilter(decodeCursor(query.cursor)) }
    : baseFilter;

  const rows = await SavedPost.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .populate({ path: 'post', populate: { path: 'author', select: AUTHOR_PROJECTION } })
    .lean<PopulatedSavedPost[]>();

  // Page first, then drop the dead references. Filtering first would build the
  // next cursor from a surviving row and silently skip every save between it
  // and the one actually last read.
  const page = buildPage(rows, query.limit);
  const posts = page.items
    .map((saved) => saved.post)
    .filter((post): post is PopulatedPost => post !== null);

  const likedIds = await resolveViewerLikes(
    posts.map((post) => post._id),
    viewerId,
  );

  return {
    items: posts.map((post) =>
      toPostDTO(post, {
        viewerId,
        viewerHasLiked: likedIds.has(String(post._id)),
        viewerHasSaved: true,
      }),
    ),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

export async function getPost(postId: string, viewerId?: string): Promise<PostDTO> {
  const post = await Post.findById(postId)
    .populate('author', AUTHOR_PROJECTION)
    .lean<PopulatedPost>();
  if (!post) throw ApiError.notFound('Post');

  const [likedIds, savedIds] = await Promise.all([
    resolveViewerLikes([post._id], viewerId),
    resolveViewerSaves([post._id], viewerId),
  ]);

  return toPostDTO(post, {
    viewerId,
    viewerHasLiked: likedIds.has(String(post._id)),
    viewerHasSaved: savedIds.has(String(post._id)),
  });
}

/**
 * Stores the image and the post together.
 *
 * MongoDB gives no cross-document atomicity here without a replica set, so the
 * image is written first and explicitly rolled back if the post insert fails.
 * Doing it the other way round would leave a post pointing at media that does
 * not exist — a broken card in the feed, which is worse than a few wasted
 * bytes.
 */
export async function createPost(
  input: CreatePostInput,
  file: Express.Multer.File,
  authorId: string,
): Promise<PostDTO> {
  const { id: mediaId, info } = await mediaService.storeImage(
    file.buffer,
    file.originalname || 'upload',
    authorId,
  );

  try {
    const post = await Post.create({
      author: new Types.ObjectId(authorId),
      caption: input.caption,
      location: input.location,
      image: {
        mediaId,
        width: info.width,
        height: info.height,
        contentType: info.contentType,
      },
    });

    await post.populate('author', AUTHOR_PROJECTION);

    return toPostDTO(post.toObject() as unknown as PopulatedPost, {
      viewerId: authorId,
      viewerHasLiked: false,
      viewerHasSaved: false,
    });
  } catch (error) {
    await mediaService.deleteImage(mediaId);
    throw error;
  }
}

/**
 * Deletes a post the caller owns, then its dependents.
 *
 * Ownership is checked against `req.user` from the verified token. The old
 * endpoint took an id from the URL and deleted it with no check at all, so any
 * caller could remove anyone's post.
 *
 * Order matters: the post goes first because that is the user-visible effect.
 * If cleanup then fails, the leftovers are likes, comments and saves pointing
 * at a post that no longer exists — unreachable rather than corrupting.
 *
 * The saves have to go too: a save is the one dependent that is still rendered
 * somewhere after the post dies, so skipping it would leave a permanent hole
 * in every collector's saved list rather than an orphan nobody reads.
 */
export async function deletePost(postId: string, viewerId: string): Promise<void> {
  const post = await Post.findById(postId).select('author image');
  if (!post) throw ApiError.notFound('Post');

  if (String(post.author) !== viewerId) {
    throw ApiError.forbidden('You can only delete your own posts');
  }

  await post.deleteOne();

  await Promise.all([
    Comment.deleteMany({ post: post._id }),
    Like.deleteMany({ post: post._id }),
    SavedPost.deleteMany({ post: post._id }),
    mediaService.deleteImage(post.image.mediaId),
  ]);
}

export interface LikeState {
  likeCount: number;
  viewerHasLiked: boolean;
}

/**
 * Idempotent like.
 *
 * No "have they already liked this?" read happens first — that check races
 * itself, and a double-tap would insert twice and inflate the counter. The
 * unique index on `{ post, user }` is the arbiter: the insert either wins (and
 * we increment) or comes back as E11000 (and the state is already correct).
 */
export async function likePost(postId: string, viewerId: string): Promise<LikeState> {
  const post = await Post.findById(postId).select('_id author likeCount');
  if (!post) throw ApiError.notFound('Post');

  try {
    await Like.create({ post: post._id, user: new Types.ObjectId(viewerId) });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return { likeCount: post.likeCount, viewerHasLiked: true };
    }
    throw error;
  }

  const updated = await Post.findByIdAndUpdate(
    post._id,
    { $inc: { likeCount: 1 } },
    { new: true, projection: { likeCount: 1 } },
  ).lean();

  // Notify only here, past the E11000 early return: this is the one call that
  // actually created the like, so a double-tap cannot produce two rows in the
  // recipient's activity feed. The service swallows its own failures — nobody's
  // like gets rejected because the notifications collection hiccuped — and it
  // drops self-likes, so no `author === viewer` check belongs at this call site.
  await notificationService.notifyLike(post.author, new Types.ObjectId(viewerId), post._id);

  return { likeCount: updated?.likeCount ?? post.likeCount + 1, viewerHasLiked: true };
}

export async function unlikePost(postId: string, viewerId: string): Promise<LikeState> {
  const post = await Post.findById(postId).select('_id author likeCount');
  if (!post) throw ApiError.notFound('Post');

  const result = await Like.deleteOne({ post: post._id, user: new Types.ObjectId(viewerId) });

  // Only decrement when a row was actually removed, so repeated unlikes cannot
  // drive the counter below the real total. The `$gt: 0` guard is a second
  // belt against ever persisting a negative count.
  if (result.deletedCount === 0) {
    return { likeCount: post.likeCount, viewerHasLiked: false };
  }

  const updated = await Post.findOneAndUpdate(
    { _id: post._id, likeCount: { $gt: 0 } },
    { $inc: { likeCount: -1 } },
    { new: true, projection: { likeCount: 1 } },
  ).lean();

  // Retract the notification with the like, and only on the call that removed
  // a row — the `deletedCount === 0` path returned above. An activity feed that
  // still says "X liked your post" after X unliked it is asserting something
  // that is no longer true, and tapping it would lead nowhere.
  await notificationService.clearLikeNotification(
    post.author,
    new Types.ObjectId(viewerId),
    post._id,
  );

  return { likeCount: updated?.likeCount ?? Math.max(post.likeCount - 1, 0), viewerHasLiked: false };
}

export interface SaveState {
  saved: boolean;
}

/**
 * Idempotent save, arbitrated exactly as a like is: no "has this user already
 * saved it?" read first, because that read-then-write races itself. The unique
 * `{ user, post }` index decides — the insert either wins or comes back as
 * E11000, and E11000 means the state the caller asked for is already on disk.
 *
 * Simpler than a like in one respect: there is no denormalised counter to move.
 * Nothing renders "how many people saved this" — a save is private to the
 * person who made it — so a counter would be write amplification with no
 * reader, and one more value that can drift.
 */
export async function savePost(postId: string, viewerId: string): Promise<SaveState> {
  const exists = await Post.exists({ _id: postId });
  if (!exists) throw ApiError.notFound('Post');

  try {
    await SavedPost.create({
      post: new Types.ObjectId(postId),
      user: new Types.ObjectId(viewerId),
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return { saved: true };
    throw error;
  }

  return { saved: true };
}

/**
 * The mirror image, and with no counter there is nothing for `deletedCount` to
 * guard: whether this call removed the row or found it already gone, the post
 * is not saved afterwards, which is what the caller asked for.
 *
 * Saving does not notify anyone — the author is not told, so unsaving has no
 * notification to retract either.
 */
export async function unsavePost(postId: string, viewerId: string): Promise<SaveState> {
  const exists = await Post.exists({ _id: postId });
  if (!exists) throw ApiError.notFound('Post');

  await SavedPost.deleteOne({
    post: new Types.ObjectId(postId),
    user: new Types.ObjectId(viewerId),
  });

  return { saved: false };
}

/** Backs the "liked by" sheet. */
export async function listLikers(postId: string, limit = 50): Promise<PublicUserDTO[]> {
  const exists = await Post.exists({ _id: postId });
  if (!exists) throw ApiError.notFound('Post');

  const likes = await Like.find({ post: new Types.ObjectId(postId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate<{ user: PopulatedAuthor }>('user', AUTHOR_PROJECTION)
    .lean();

  // A user deleted between the like and this read leaves a null populate.
  return likes.filter((like) => like.user).map((like) => toPublicUser(like.user));
}

/** Resolves a username to an id for the profile routes. */
export async function findUserByUsername(username: string) {
  const user = await User.findOne({ username }).lean();
  if (!user) throw ApiError.notFound('User');
  return user;
}
