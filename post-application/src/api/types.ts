/**
 * Mirrors the DTOs the API returns. These are hand-written rather than
 * generated, so any drift shows up as a type error at the call site the moment
 * the backend contract changes here.
 */

export interface PublicUser {
  id: string;
  name: string;
  username: string;
  avatarColor: string;
  /** Google profile photo. Empty for password accounts — fall back to the
   *  initial-on-`avatarColor` avatar rather than rendering a broken image. */
  avatarUrl: string;
}

export interface CurrentUser extends PublicUser {
  email: string;
  bio: string;
  joinedAt: string;
  followerCount: number;
  followingCount: number;
}

export interface UserProfile extends PublicUser {
  bio: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  joinedAt: string;
  isViewer: boolean;
  viewerIsFollowing: boolean;
}

/**
 * The lighter shape returned by suggestions and the follower/following lists —
 * enough to render a row with a follow button, without the per-user post count
 * a full profile would have to aggregate.
 */
export interface UserSummary extends PublicUser {
  bio: string;
  followerCount: number;
  isViewer: boolean;
  viewerIsFollowing: boolean;
}

export interface PostImage {
  url: string;
  width: number;
  height: number;
  aspectRatio: number;
}

export interface Post {
  id: string;
  caption: string;
  location: string;
  image: PostImage;
  author: PublicUser;
  likeCount: number;
  commentCount: number;
  viewerHasLiked: boolean;
  viewerHasSaved: boolean;
  viewerIsAuthor: boolean;
  createdAt: string;
}

export interface Comment {
  id: string;
  text: string;
  author: PublicUser;
  viewerCanDelete: boolean;
  createdAt: string;
}

export interface LikeState {
  likeCount: number;
  viewerHasLiked: boolean;
}

/**
 * One row of the activity feed. `post` is absent for a follow, and absent again
 * when the post it pointed at has since been deleted — the row still reads
 * correctly without its thumbnail, so neither case may assume it is there.
 */
export interface Notification {
  id: string;
  type: 'like' | 'comment' | 'follow';
  actor: PublicUser;
  isRead: boolean;
  createdAt: string;
  post?: { id: string; imageUrl: string };
  /** Only for a comment — the row quotes what was said. */
  commentText?: string;
}

/** Result of a follow/unfollow. `followerCount` belongs to the target account,
 *  not the viewer, so the button and the count beside it update from one reply. */
export interface FollowState {
  following: boolean;
  followerCount: number;
}

export interface AuthPayload {
  user: CurrentUser;
  accessToken: string;
}

/** Envelope for cursor-paginated collections. */
export interface Paginated<T> {
  data: T[];
  meta: { nextCursor: string | null; hasMore: boolean };
}

/** Envelope for single resources. */
export interface Envelope<T> {
  data: T;
}

/** Error body produced by the API's central error handler. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Per-field validation messages, keyed by field name. */
    details?: Record<string, string>;
  };
}
