import type { Types } from 'mongoose';

import type { IUser } from '../../models/User';

/**
 * Responses are built from explicit mappers, never by serialising a document
 * directly. A schema gaining a field should not silently widen the public API,
 * and nothing can leak by accident because everything is opt-in.
 */

/** What anyone may see about another account. */
export interface PublicUserDTO {
  id: string;
  name: string;
  username: string;
  avatarColor: string;
  /** Google profile photo. `''` means the client draws the initial avatar instead. */
  avatarUrl: string;
}

/** One row of a follower/following list or the suggestions panel. */
export interface UserSummaryDTO extends PublicUserDTO {
  bio: string;
  followerCount: number;
  isViewer: boolean;
  viewerIsFollowing: boolean;
}

/** A profile page. */
export interface UserProfileDTO extends PublicUserDTO {
  bio: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  joinedAt: string;
  isViewer: boolean;
  viewerIsFollowing: boolean;
}

/** The signed-in user's own record — the only DTO that carries an email. */
export interface CurrentUserDTO extends PublicUserDTO {
  email: string;
  bio: string;
  joinedAt: string;
  followerCount: number;
  followingCount: number;
}

/**
 * What a follow button needs after a write. `followerCount` is the *target's*,
 * not the viewer's: it is the number rendered next to the button, so returning
 * it saves the client a profile refetch to learn the new total.
 */
export interface FollowStateDTO {
  following: boolean;
  followerCount: number;
}

/** Everything `toPublicUser` reads — projections must stay in step with it. */
export const AUTHOR_PROJECTION = 'name username avatarColor avatarUrl';

/**
 * An author as `populate(path, AUTHOR_PROJECTION)` hands it back. Shared so the
 * posts and comments modules describe their populated rows against one type
 * that moves with `AUTHOR_PROJECTION` instead of repeating an inline `Pick`.
 */
export type PopulatedAuthor = Pick<IUser, 'name' | 'username' | 'avatarColor' | 'avatarUrl'> & {
  _id: Types.ObjectId;
};

type UserLike = Pick<IUser, 'name' | 'username' | 'avatarColor' | 'avatarUrl'> & {
  _id: unknown;
};

export function toPublicUser(user: UserLike): PublicUserDTO {
  return {
    id: String(user._id),
    name: user.name,
    username: user.username,
    avatarColor: user.avatarColor,
    avatarUrl: user.avatarUrl,
  };
}

export function toCurrentUser(
  user: UserLike &
    Pick<IUser, 'email' | 'bio' | 'createdAt' | 'followerCount' | 'followingCount'>,
): CurrentUserDTO {
  return {
    ...toPublicUser(user),
    email: user.email,
    bio: user.bio,
    joinedAt: user.createdAt.toISOString(),
    followerCount: user.followerCount,
    followingCount: user.followingCount,
  };
}

/**
 * The viewer-relative flags are arguments rather than something this mapper
 * derives, because both are resolved once per page — `viewerIsFollowing` comes
 * from a single batched `$in` — and a mapper that queried would reintroduce the
 * N+1 that batching exists to remove.
 */
export function toUserSummary(
  user: UserLike & Pick<IUser, 'bio' | 'followerCount'>,
  options: { isViewer: boolean; viewerIsFollowing: boolean },
): UserSummaryDTO {
  return {
    ...toPublicUser(user),
    bio: user.bio,
    followerCount: user.followerCount,
    isViewer: options.isViewer,
    viewerIsFollowing: options.viewerIsFollowing,
  };
}
