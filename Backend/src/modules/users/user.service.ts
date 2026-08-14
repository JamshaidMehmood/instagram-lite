import { MongoServerError } from 'mongodb';
import { Types, type FilterQuery } from 'mongoose';

import { Follow, type IFollow } from '../../models/Follow';
import { Post } from '../../models/Post';
import { User, type IUser } from '../../models/User';
import { ApiError } from '../../utils/ApiError';
import { buildCursorFilter, buildPage, decodeCursor } from '../../utils/pagination';
import * as mediaService from '../media/media.service';
import { clearFollowNotification, notifyFollow } from '../notifications/notification.service';
import type { PaginationQuery } from '../posts/post.schema';
import {
  AUTHOR_PROJECTION,
  toCurrentUser,
  toPublicUser,
  toUserSummary,
  type CurrentUserDTO,
  type FollowStateDTO,
  type PopulatedAuthor,
  type UserProfileDTO,
  type UserSummaryDTO,
} from './user.dto';
import type { UpdateProfileInput } from './user.schema';

/** Everything a user row in a list renders — never the whole document. */
const SUMMARY_PROJECTION = `${AUTHOR_PROJECTION} bio followerCount`;

export interface UserSummaryPage {
  items: UserSummaryDTO[];
  nextCursor: string | null;
  hasMore: boolean;
}

type SummaryUser = PopulatedAuthor & Pick<IUser, 'bio' | 'followerCount'>;

/** A follow edge with the side being listed resolved by `populate`. */
type FollowerEdge = Omit<IFollow, 'follower'> & { follower: SummaryUser };
type FollowingEdge = Omit<IFollow, 'following'> & { following: SummaryUser };

/**
 * Resolves "which of these accounts does the viewer follow?" in a single
 * indexed query, whatever the page size.
 *
 * Same batching as `resolveViewerLikes` in the posts module, and for the same
 * reason: asking per row turns one list request into an N+1, while this is one
 * `$in` covered by the `{ follower, following }` unique index.
 */
export async function resolveViewerFollows(
  userIds: Types.ObjectId[],
  viewerId?: string,
): Promise<Set<string>> {
  if (!viewerId || userIds.length === 0) return new Set();

  const edges = await Follow.find({
    follower: new Types.ObjectId(viewerId),
    following: { $in: userIds },
  })
    .select('following')
    .lean();

  return new Set(edges.map((edge) => String(edge.following)));
}

/**
 * The set of authors whose posts belong in the viewer's feed.
 *
 * Exported for `post.service`, which adds the viewer's own id and feeds the
 * whole list to a single `author: { $in: [...] }` filter — one query, still
 * keyset-paginated, instead of a lookup per candidate post. The edges are read
 * whole rather than counted because a follow list is small enough to hold in
 * memory and `{ follower, createdAt, _id }` answers the read from the index.
 */
export async function followingIdsFor(viewerId: string): Promise<Types.ObjectId[]> {
  const edges = await Follow.find({ follower: new Types.ObjectId(viewerId) })
    .select('following')
    .lean();

  return edges.map((edge) => edge.following);
}

/**
 * Profile header data.
 *
 * `postCount` is counted on demand rather than denormalised onto the user
 * document: it is read once per profile visit (not once per feed card like the
 * like/comment counters), and `countDocuments` here is answered entirely by
 * the `{ author, createdAt, _id }` index. Storing it would buy nothing and add
 * a second value that can drift. Follower counts *are* denormalised — they are
 * rendered on every list row too, where counting would not scale.
 */
export async function getProfile(username: string, viewerId?: string): Promise<UserProfileDTO> {
  const user = await User.findOne({ username }).lean();
  if (!user) throw ApiError.notFound('User');

  const [postCount, viewerFollows] = await Promise.all([
    Post.countDocuments({ author: user._id }),
    resolveViewerFollows([user._id], viewerId),
  ]);

  return {
    ...toPublicUser(user),
    bio: user.bio,
    postCount,
    followerCount: user.followerCount,
    followingCount: user.followingCount,
    joinedAt: user.createdAt.toISOString(),
    isViewer: String(user._id) === viewerId,
    viewerIsFollowing: viewerFollows.has(String(user._id)),
  };
}

export async function findByUsername(username: string) {
  const user = await User.findOne({ username }).select('_id').lean();
  if (!user) throw ApiError.notFound('User');
  return user;
}

/**
 * Loads the signed-in account for a write against it.
 *
 * A token outlives the row it names — the account can be deleted while a valid
 * access token is still in someone's tab — so this is 401, not 404: the caller
 * is not looking something up, their own credential has stopped meaning
 * anything, and the client's 401 handler already knows to sign them out.
 */
async function requireOwnAccount(viewerId: string) {
  const user = await User.findById(viewerId);
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  return user;
}

/**
 * Edits the caller's own profile.
 *
 * Each field is applied only when the request actually carried it. Assigning
 * the parsed object wholesale would write `undefined` over the keys the client
 * omitted, which is what makes a PATCH that only changes the name silently
 * blank the bio — the difference between PATCH and PUT, spelled out.
 */
export async function updateProfile(
  viewerId: string,
  input: UpdateProfileInput,
): Promise<CurrentUserDTO> {
  const user = await requireOwnAccount(viewerId);

  if (input.name !== undefined) user.name = input.name;
  if (input.username !== undefined) user.username = input.username;
  if (input.bio !== undefined) user.bio = input.bio;

  try {
    await user.save();
  } catch (error) {
    // Deliberately no `findOne({ username })` availability check before the
    // save. Two people claiming the same handle at the same moment would both
    // pass that check and both attempt the write, so it prevents nothing while
    // costing a round trip — and the second write would fail here regardless.
    // The unique index is the only arbiter that cannot be raced; all this does
    // is translate its verdict into the message the form renders.
    if (
      error instanceof MongoServerError &&
      error.code === 11000 &&
      error.keyPattern?.['username']
    ) {
      throw ApiError.conflict('That username is taken', 'USERNAME_TAKEN');
    }
    throw error;
  }

  return toCurrentUser(user);
}

/**
 * Replaces the caller's avatar with an uploaded image.
 *
 * Ordered exactly as `createPost` argues: the bytes are stored first and rolled
 * back if the pointer fails to persist, because the opposite order would leave
 * a profile whose `avatarUrl` names media that does not exist — a broken image
 * on every card the user appears on, which is worse than a few orphaned bytes.
 *
 * The old file is reclaimed last, and only when `avatarMediaId` was set.
 * `avatarUrl` may hold a Google profile photo, whose bytes are not ours to
 * delete; `avatarMediaId` is the only thing that distinguishes the two.
 */
export async function setAvatar(
  viewerId: string,
  file: Express.Multer.File,
): Promise<CurrentUserDTO> {
  const user = await requireOwnAccount(viewerId);
  const previousMediaId = user.avatarMediaId;

  const { id: mediaId } = await mediaService.storeImage(
    file.buffer,
    file.originalname || 'avatar',
    viewerId,
  );

  try {
    user.avatarMediaId = mediaId;
    user.avatarUrl = mediaService.mediaUrl(mediaId);
    await user.save();
  } catch (error) {
    await mediaService.deleteImage(mediaId);
    throw error;
  }

  if (previousMediaId) await mediaService.deleteImage(previousMediaId);

  return toCurrentUser(user);
}

/**
 * Drops the caller's avatar back to the generated colour-and-initial one.
 *
 * Both fields clear together: `avatarUrl` alone would leave `avatarMediaId`
 * pointing at bytes nothing renders and the next upload would try to reclaim
 * them twice, while `avatarMediaId` alone would leave the profile rendering a
 * URL whose file is about to be deleted. `''` rather than unset because every
 * client tests `avatarUrl` for falsiness to decide whether to draw the initial.
 */
export async function removeAvatar(viewerId: string): Promise<CurrentUserDTO> {
  const user = await requireOwnAccount(viewerId);
  const mediaId = user.avatarMediaId;

  user.avatarMediaId = undefined;
  user.avatarUrl = '';
  await user.save();

  // After the save, never before: deleting first and then failing to persist
  // would leave the profile pointing at a file that no longer exists.
  if (mediaId) await mediaService.deleteImage(mediaId);

  return toCurrentUser(user);
}

/**
 * Idempotent follow.
 *
 * Deliberately no "are they already following?" read first — that check races
 * itself, and a double tap would insert twice and inflate both counters. The
 * unique index on `{ follower, following }` is the arbiter: the insert either
 * wins (and we increment) or comes back as E11000, in which case the state is
 * already what the caller asked for.
 */
export async function followUser(username: string, viewerId: string): Promise<FollowStateDTO> {
  const target = await User.findOne({ username }).select('_id followerCount').lean();
  if (!target) throw ApiError.notFound('User');

  if (String(target._id) === viewerId) throw ApiError.badRequest('You cannot follow yourself');

  try {
    await Follow.create({ follower: new Types.ObjectId(viewerId), following: target._id });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      return { following: true, followerCount: target.followerCount };
    }
    throw error;
  }

  // One edge moves two counters, on two different documents. Both are atomic
  // `$inc`s; only the target's count is read back because that is the number
  // the caller is about to render.
  const [updated] = await Promise.all([
    User.findByIdAndUpdate(
      target._id,
      { $inc: { followerCount: 1 } },
      { new: true, projection: { followerCount: 1 } },
    ).lean(),
    User.updateOne({ _id: new Types.ObjectId(viewerId) }, { $inc: { followingCount: 1 } }),
  ]);

  // Only a real state change notifies. The E11000 path above returns before
  // reaching here, so a double tap cannot push a second "started following
  // you" onto someone's activity feed. `notifyFollow` swallows its own
  // failures — a notifications outage must not turn a successful follow into
  // an error the user sees.
  await notifyFollow(target._id, new Types.ObjectId(viewerId));

  return { following: true, followerCount: updated?.followerCount ?? target.followerCount + 1 };
}

export async function unfollowUser(username: string, viewerId: string): Promise<FollowStateDTO> {
  const target = await User.findOne({ username }).select('_id followerCount').lean();
  if (!target) throw ApiError.notFound('User');

  const result = await Follow.deleteOne({
    follower: new Types.ObjectId(viewerId),
    following: target._id,
  });

  // Only decrement when this call is the one that actually removed the edge,
  // so repeated unfollows cannot drive the counters below the real total. The
  // `$gt: 0` guards are a second belt against ever persisting a negative count.
  if (result.deletedCount === 0) {
    return { following: false, followerCount: target.followerCount };
  }

  const [updated] = await Promise.all([
    User.findOneAndUpdate(
      { _id: target._id, followerCount: { $gt: 0 } },
      { $inc: { followerCount: -1 } },
      { new: true, projection: { followerCount: 1 } },
    ).lean(),
    User.updateOne(
      { _id: new Types.ObjectId(viewerId), followingCount: { $gt: 0 } },
      { $inc: { followingCount: -1 } },
    ),
  ]);

  // Symmetrically guarded by the `deletedCount === 0` early return above: only
  // the call that actually removed the edge retracts the notification, so an
  // unfollow repeated twice cannot delete a *newer* follow notification that a
  // re-follow in between had legitimately created.
  await clearFollowNotification(target._id, new Types.ObjectId(viewerId));

  return {
    following: false,
    followerCount: updated?.followerCount ?? Math.max(target.followerCount - 1, 0),
  };
}

/**
 * Follow rows carry `createdAt` and `_id` like every other collection, so the
 * shared keyset helpers apply to them unchanged — the lists page over the
 * edges, not over the users, and stay stable while new follows arrive.
 */
function edgeFilter(base: FilterQuery<IFollow>, cursor?: string): FilterQuery<IFollow> {
  return cursor ? { ...base, ...buildCursorFilter(decodeCursor(cursor)) } : base;
}

async function toSummaries(
  users: SummaryUser[],
  viewerId: string | undefined,
): Promise<UserSummaryDTO[]> {
  const followedIds = await resolveViewerFollows(
    users.map((user) => user._id),
    viewerId,
  );

  return users.map((user) =>
    toUserSummary(user, {
      isViewer: String(user._id) === viewerId,
      viewerIsFollowing: followedIds.has(String(user._id)),
    }),
  );
}

/** Who follows this account — newest follower first. */
export async function listFollowers(
  username: string,
  query: PaginationQuery,
  viewerId?: string,
): Promise<UserSummaryPage> {
  const user = await findByUsername(username);

  const rows = await Follow.find(edgeFilter({ following: user._id }, query.cursor))
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .populate('follower', SUMMARY_PROJECTION)
    .lean<FollowerEdge[]>();

  const page = buildPage(rows, query.limit);
  // An account deleted after following leaves a dangling edge whose populate
  // comes back null, exactly as `listLikers` handles.
  const users = page.items.filter((edge) => edge.follower).map((edge) => edge.follower);

  return {
    items: await toSummaries(users, viewerId),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

/** Who this account follows — newest follow first. */
export async function listFollowing(
  username: string,
  query: PaginationQuery,
  viewerId?: string,
): Promise<UserSummaryPage> {
  const user = await findByUsername(username);

  const rows = await Follow.find(edgeFilter({ follower: user._id }, query.cursor))
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit + 1)
    .populate('following', SUMMARY_PROJECTION)
    .lean<FollowingEdge[]>();

  const page = buildPage(rows, query.limit);
  const users = page.items.filter((edge) => edge.following).map((edge) => edge.following);

  return {
    items: await toSummaries(users, viewerId),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

/**
 * Who to follow next.
 *
 * Ordered by follower count so a new account sees the people worth seeing
 * first, with `createdAt` breaking ties deterministically — otherwise the panel
 * reshuffles between renders for no reason. Anonymous callers get the same list
 * minus the exclusions, which is what makes it usable on a logged-out profile.
 */
export async function listSuggestions(
  viewerId: string | undefined,
  limit = 5,
): Promise<UserSummaryDTO[]> {
  const excluded: Types.ObjectId[] = viewerId
    ? [new Types.ObjectId(viewerId), ...(await followingIdsFor(viewerId))]
    : [];

  const filter: FilterQuery<IUser> = excluded.length > 0 ? { _id: { $nin: excluded } } : {};

  const users = await User.find(filter)
    .sort({ followerCount: -1, createdAt: -1 })
    .limit(limit)
    .select(SUMMARY_PROJECTION)
    .lean();

  // Everyone the viewer already follows was excluded above, so every result is
  // not-yet-followed by construction — no batched `$in` needed here.
  return users.map((user) => toUserSummary(user, { isViewer: false, viewerIsFollowing: false }));
}

/**
 * Neutralises every regex metacharacter in a caller-supplied string.
 *
 * Without this the search box is an injection point into our own query engine:
 * `.*` matches every account regardless of what was typed, and a nested
 * quantifier like `(a+)+$` is a ReDoS that pins the event loop for the whole
 * process — one request taking the server down for everyone. The input is data,
 * and escaping is what keeps `new RegExp` from treating it as control flow.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Type-ahead over usernames and display names.
 *
 * The username half is anchored with `^`, which is what lets the unique
 * `{ username: 1 }` index serve it as a range scan — an unanchored regex on an
 * indexed field cannot use the index at all, so the anchor is load-bearing
 * rather than a UX choice about prefix matching.
 *
 * The name half is an unanchored substring match and honestly does not use any
 * index: it is a collection scan on every keystroke. That is a deliberate
 * tradeoff at this app's size, where the user collection fits comfortably in
 * memory and matching "smith" inside "John Smith" is worth more than the scan
 * costs. The fix when it stops being true is a text or n-gram index, not a
 * cleverer regex — no amount of regex tuning makes an unanchored match
 * indexable.
 *
 * Nobody is excluded, not even the viewer: someone searching their own name and
 * not finding themselves reads as a broken search, and `isViewer` lets the row
 * render as a link to their own profile instead of a follow button.
 */
export async function searchUsers(
  q: string,
  viewerId: string | undefined,
  limit = 8,
): Promise<UserSummaryDTO[]> {
  const pattern = escapeRegex(q);

  const users = await User.find({
    $or: [
      { username: { $regex: `^${pattern}`, $options: 'i' } },
      { name: { $regex: pattern, $options: 'i' } },
    ],
  })
    // Same ordering as the suggestions panel, and for the same reason:
    // `createdAt` breaks ties so an unchanged query cannot reshuffle its
    // results between keystrokes.
    .sort({ followerCount: -1, createdAt: -1 })
    .limit(limit)
    .select(SUMMARY_PROJECTION)
    .lean();

  return toSummaries(users, viewerId);
}
