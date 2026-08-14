import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import type { ThunkDispatch, UnknownAction } from '@reduxjs/toolkit';

import { API_URL, PAGE_SIZE } from '../config';
import { profileUpdated, signedOut, socialGraphChanged, tokenRefreshed } from '../store/authSlice';
import type { RootState } from '../store';
import type {
  AuthPayload,
  Comment,
  CurrentUser,
  Envelope,
  FollowState,
  LikeState,
  Notification,
  Paginated,
  Post,
  PublicUser,
  UserProfile,
  UserSummary,
} from './types';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  // Required for the httpOnly refresh cookie to travel cross-origin.
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  },
});

/**
 * Shared in-flight refresh.
 *
 * When an access token expires, every query on screen fails with 401 at once.
 * Without this, each one would fire its own `/auth/refresh` — and because
 * refresh tokens rotate, the second request would replay an already-rotated
 * token, trip the server's reuse detection, and log the user out. Funnelling
 * them through one promise means exactly one rotation happens.
 */
let refreshInFlight: Promise<boolean> | null = null;

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  const url = typeof args === 'string' ? args : args.url;
  // The auth endpoints answer 401 legitimately; retrying them would loop.
  const isAuthCall = url.startsWith('/auth/');

  if (result.error?.status === 401 && !isAuthCall) {
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        const refresh = await rawBaseQuery(
          { url: '/auth/refresh', method: 'POST' },
          api,
          extraOptions,
        );

        if (refresh.data) {
          api.dispatch(tokenRefreshed((refresh.data as Envelope<AuthPayload>).data));
          return true;
        }

        api.dispatch(signedOut());
        return false;
      })().finally(() => {
        refreshInFlight = null;
      });
    }

    if (await refreshInFlight) {
      result = await rawBaseQuery(args, api, extraOptions);
    }
  }

  return result;
};

type AppDispatch = ThunkDispatch<RootState, unknown, UnknownAction>;

/**
 * Applies the same edit to a post wherever it is cached — the feed, the explore
 * grid, that author's profile grid, and the `/p/:id` permalink. Returns the
 * patches so a failed request can roll every one of them back.
 *
 * The permalink is easy to forget because it is the one entry that holds a
 * single post rather than a list, but it is reachable from every grid cell and
 * every activity thumbnail. Leaving it out does not just skip an animation:
 * `PostCard` decides whether to save or unsave from the value it renders, so a
 * stale flag makes the button toggle nothing at all.
 */
function patchPostEverywhere(
  dispatch: AppDispatch,
  postId: string,
  authorUsername: string,
  recipe: (post: Post) => void,
) {
  const apply = (draft: Paginated<Post>) => {
    const post = draft.data.find((item) => item.id === postId);
    if (post) recipe(post);
  };

  return [
    dispatch(api.util.updateQueryData('getFeed', {}, apply)),
    dispatch(api.util.updateQueryData('getExplore', {}, apply)),
    dispatch(api.util.updateQueryData('getUserPosts', { username: authorUsername }, apply)),
    dispatch(api.util.updateQueryData('getPost', postId, (draft) => recipe(draft.data))),
  ];
}

/**
 * Cache keys of every surface that lists other accounts and is held in the
 * store right now — the follower and following sheets, and search results.
 */
interface CachedFollowLists {
  followers: readonly { username: string; cursor?: string }[];
  following: readonly { username: string; cursor?: string }[];
  search: readonly { q: string }[];
}

/**
 * Follow state for one account is cached in five kinds of place at once: their
 * profile, any suggestion row naming them, every follower or following sheet
 * they appear in, and every search result that matched them. All of them have
 * to move together, or the button reads "Follow" in one place and "Following"
 * in another. Returns the patches so a rejected request can undo every one.
 *
 * The list-shaped ones are the awkward case. They are keyed by whose list it
 * is, or by the search term — never by who appears in the results — so one
 * account can sit inside any number of cached entries and there is no key to
 * guess at. Hence `lists`, resolved from the store by `cachedFollowLists`.
 */
function patchFollowEverywhere(
  dispatch: AppDispatch,
  lists: CachedFollowLists,
  username: string,
  recipe: (target: { viewerIsFollowing: boolean; followerCount: number }) => void,
) {
  const patchRow = (draft: Paginated<UserSummary>) => {
    const row = draft.data.find((user) => user.username === username);
    if (row) recipe(row);
  };

  return [
    dispatch(api.util.updateQueryData('getProfile', username, (draft) => recipe(draft.data))),
    dispatch(
      api.util.updateQueryData('getSuggestions', undefined, (draft) => {
        const row = draft.data.find((user) => user.username === username);
        if (row) recipe(row);
      }),
    ),
    ...lists.followers.map((arg) =>
      dispatch(api.util.updateQueryData('getFollowers', arg, patchRow)),
    ),
    ...lists.following.map((arg) =>
      dispatch(api.util.updateQueryData('getFollowing', arg, patchRow)),
    ),
    ...lists.search.map((arg) =>
      dispatch(
        api.util.updateQueryData('searchUsers', arg, (draft) => {
          const row = draft.data.find((user) => user.username === username);
          if (row) recipe(row);
        }),
      ),
    ),
  ];
}

/**
 * Asks RTK Query which account-list entries are actually cached, rather than
 * guessing at keys. Search is included because `/search` renders the same
 * `FollowButton` off its own cache entry — the button has no local state, so an
 * unpatched row leaves it permanently reading "Follow".
 *
 * The `as RootState` at each call site is the same assertion `prepareHeaders`
 * makes above, for the same reason: RTK types `getState` as the API's own root
 * state, which knows the api reducer but nothing about this app's `auth` slice.
 * The store really is the wider shape.
 */
function cachedFollowLists(state: RootState): CachedFollowLists {
  return {
    followers: api.util.selectCachedArgsForQuery(state, 'getFollowers'),
    following: api.util.selectCachedArgsForQuery(state, 'getFollowing'),
    search: api.util.selectCachedArgsForQuery(state, 'searchUsers'),
  };
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Post', 'Profile', 'Comments', 'Suggestions', 'Follows', 'Saved', 'Notifications'],
  endpoints: (builder) => ({
    // ---------------------------------------------------------------- auth
    login: builder.mutation<Envelope<AuthPayload>, { email: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),

    signup: builder.mutation<
      Envelope<AuthPayload>,
      { name: string; email: string; password: string }
    >({
      query: (body) => ({ url: '/auth/signup', method: 'POST', body }),
    }),

    /**
     * Exchanges a Google ID token for a session. The token is opaque to us on
     * purpose — the API verifies its signature and audience before believing
     * any claim in it, so nothing is read out of it here.
     */
    googleAuth: builder.mutation<Envelope<AuthPayload>, { idToken: string }>({
      query: (body) => ({ url: '/auth/google', method: 'POST', body }),
    }),

    /** Called once on boot to restore a session from the refresh cookie. */
    refreshSession: builder.mutation<Envelope<AuthPayload>, void>({
      query: () => ({ url: '/auth/refresh', method: 'POST' }),
    }),

    logout: builder.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
    }),

    // ---------------------------------------------------------------- feed
    getFeed: builder.query<Paginated<Post>, { cursor?: string }>({
      query: ({ cursor }) => ({
        url: '/posts',
        params: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
      }),
      // Every page collapses into one cache entry so the feed accumulates
      // instead of replacing itself on each scroll.
      serializeQueryArgs: ({ endpointName }) => endpointName,
      merge: (cache, incoming, { arg }) => {
        if (!arg.cursor) {
          // No cursor means "first page" — a fresh load or a pull-to-refresh.
          cache.data = incoming.data;
          cache.meta = incoming.meta;
          return;
        }
        // Guard against a duplicate slipping in if a post is created while the
        // user is paging.
        const seen = new Set(cache.data.map((post) => post.id));
        cache.data.push(...incoming.data.filter((post) => !seen.has(post.id)));
        cache.meta = incoming.meta;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
      providesTags: ['Post'],
    }),

    /**
     * Discovery grid. Its own cache entry rather than a parameter on `getFeed`,
     * because the two accumulate independently — paging explore must not
     * disturb where the user had scrolled to in their feed.
     */
    getExplore: builder.query<Paginated<Post>, { cursor?: string }>({
      query: ({ cursor }) => ({
        url: '/posts/explore',
        // 12, not PAGE_SIZE: a three-column grid shows far more per screen
        // than the single-column feed, so a feed-sized page lands short.
        params: { limit: 12, ...(cursor ? { cursor } : {}) },
      }),
      serializeQueryArgs: ({ endpointName }) => endpointName,
      merge: (cache, incoming, { arg }) => {
        if (!arg.cursor) {
          cache.data = incoming.data;
          cache.meta = incoming.meta;
          return;
        }
        const seen = new Set(cache.data.map((post) => post.id));
        cache.data.push(...incoming.data.filter((post) => !seen.has(post.id)));
        cache.meta = incoming.meta;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
      providesTags: ['Post'],
    }),

    getUserPosts: builder.query<Paginated<Post>, { username: string; cursor?: string }>({
      query: ({ username, cursor }) => ({
        url: `/users/${username}/posts`,
        params: { limit: 12, ...(cursor ? { cursor } : {}) },
      }),
      // Keyed by username so two profiles do not share one cache entry.
      serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}(${queryArgs.username})`,
      merge: (cache, incoming, { arg }) => {
        if (!arg.cursor) {
          cache.data = incoming.data;
          cache.meta = incoming.meta;
          return;
        }
        const seen = new Set(cache.data.map((post) => post.id));
        cache.data.push(...incoming.data.filter((post) => !seen.has(post.id)));
        cache.meta = incoming.meta;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
    }),

    /** Single post — backs the shareable `/p/:id` permalink. */
    getPost: builder.query<Envelope<Post>, string>({
      query: (postId) => `/posts/${postId}`,
      providesTags: (_result, _error, postId) => [{ type: 'Post', id: postId }],
    }),

    getProfile: builder.query<Envelope<UserProfile>, string>({
      query: (username) => `/users/${username}`,
      providesTags: (_result, _error, username) => [{ type: 'Profile', id: username }],
    }),

    // ------------------------------------------------------- profile edits
    /**
     * All three profile mutations answer with the whole `CurrentUser`, and all
     * three push it straight into the auth slice. The sidebar renders from
     * `auth.user`, not from a query, so without that dispatch the new name or
     * avatar would only appear after the next silent refresh.
     *
     * A username change also moves the profile URL. Nothing here can fix that —
     * the cache has no idea which route is on screen — so the caller is
     * responsible for navigating to the new `/u/:username` after this resolves.
     */
    updateProfile: builder.mutation<
      Envelope<CurrentUser>,
      { name?: string; username?: string; bio?: string }
    >({
      query: (body) => ({ url: '/users/me', method: 'PATCH', body }),
      async onQueryStarted(_arg, { dispatch, getState, queryFulfilled }) {
        const previousUsername = (getState() as RootState).auth.user?.username;

        // Bailing out on failure is load-bearing, not defensive.
        //
        // RTK Query calls this handler as a bare statement and never handles
        // the promise it returns, so a rejection that escapes here lands on
        // `window` as an *unhandled* rejection — and because it rejects with a
        // plain `{ error, meta }` object rather than an `Error`, it surfaces
        // with no message at all, as a bare "[object Object]".
        //
        // The failure itself is already the caller's to render: the same
        // rejection is unwrapped in `EditProfileDialog`, which puts a 409 on
        // the username field. This handler only syncs caches, and a save that
        // did not happen has nothing to sync.
        //
        // `.catch` on the await alone, rather than a try block around the whole
        // body, so a genuine bug thrown by the dispatches below still surfaces.
        const result = await queryFulfilled.catch(() => null);
        if (!result) return;
        const { data } = result;

        dispatch(profileUpdated(data.data));

        // A rename leaves the old username behind in two places, and both go
        // stale in a way the user can see.
        //
        // The obvious one is the abandoned profile entry, still claiming to
        // describe a page that now 404s; `invalidatesTags` below only knows the
        // new name, so it is dropped here.
        //
        // The subtler one is that every cached post embeds `author.username`.
        // The viewer's own posts are in their feed, in Explore, and on their
        // profile grid, all still carrying the old handle — so tapping their
        // own name on their own photo navigates to a profile that no longer
        // exists. Nothing is keyed by author, so there is no narrower tag than
        // dropping the post caches wholesale.
        if (previousUsername && previousUsername !== data.data.username) {
          dispatch(
            api.util.invalidateTags([{ type: 'Profile', id: previousUsername }, 'Post', 'Saved']),
          );
        }
      },
      invalidatesTags: (result) => (result ? [{ type: 'Profile', id: result.data.username }] : []),
    }),

    uploadAvatar: builder.mutation<Envelope<CurrentUser>, FormData>({
      // No Content-Type header, for the same reason as `createPost`: the
      // browser has to set the multipart boundary itself.
      query: (body) => ({ url: '/users/me/avatar', method: 'PUT', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        // See `updateProfile`: an escaping rejection becomes an unhandled one.
        // `EditProfileDialog.acceptFile` renders the failure.
        const result = await queryFulfilled.catch(() => null);
        if (!result) return;
        dispatch(profileUpdated(result.data.data));
      },
      invalidatesTags: (result) => (result ? [{ type: 'Profile', id: result.data.username }] : []),
    }),

    removeAvatar: builder.mutation<Envelope<CurrentUser>, void>({
      query: () => ({ url: '/users/me/avatar', method: 'DELETE' }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        // See `updateProfile`: an escaping rejection becomes an unhandled one.
        // `EditProfileDialog.handleRemovePhoto` renders the failure.
        const result = await queryFulfilled.catch(() => null);
        if (!result) return;
        dispatch(profileUpdated(result.data.data));
      },
      invalidatesTags: (result) => (result ? [{ type: 'Profile', id: result.data.username }] : []),
    }),

    // --------------------------------------------------------------- posts
    createPost: builder.mutation<Envelope<Post>, FormData>({
      // No Content-Type header: the browser must set the multipart boundary
      // itself, and forcing application/json here would corrupt the body.
      query: (body) => ({ url: '/posts', method: 'POST', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        // See `updateProfile`: an escaping rejection becomes an unhandled one.
        // `CreatePostPage` renders the failure, and a post that was never
        // created has nothing to prepend.
        const result = await queryFulfilled.catch(() => null);
        if (!result) return;
        const { data } = result;

        // Prepend into the cached feed rather than invalidating it: the post
        // appears instantly and the user keeps their scroll position.
        dispatch(
          api.util.updateQueryData('getFeed', {}, (draft) => {
            draft.data.unshift(data.data);
          }),
        );
        dispatch(
          api.util.updateQueryData(
            'getUserPosts',
            { username: data.data.author.username },
            (draft) => {
              draft.data.unshift(data.data);
            },
          ),
        );
      },
      invalidatesTags: (result) =>
        result ? [{ type: 'Profile', id: result.data.author.username }] : [],
    }),

    deletePost: builder.mutation<void, { postId: string; authorUsername: string }>({
      query: ({ postId }) => ({ url: `/posts/${postId}`, method: 'DELETE' }),
      async onQueryStarted({ postId, authorUsername }, { dispatch, queryFulfilled }) {
        const remove = (draft: Paginated<Post>) => {
          const index = draft.data.findIndex((post) => post.id === postId);
          if (index !== -1) draft.data.splice(index, 1);
        };

        const patches = [
          dispatch(api.util.updateQueryData('getFeed', {}, remove)),
          dispatch(api.util.updateQueryData('getUserPosts', { username: authorUsername }, remove)),
        ];

        try {
          await queryFulfilled;
        } catch {
          patches.forEach((patch) => patch.undo());
        }
      },
      // 'Saved' as well as the profile: the server drops the SavedPost rows for
      // a deleted post, but the viewer's own Saved grid is a separate cache
      // entry that would keep rendering a thumbnail linking to a dead permalink.
      invalidatesTags: (_result, _error, { authorUsername }) => [
        { type: 'Profile', id: authorUsername },
        'Saved',
      ],
    }),

    // --------------------------------------------------------------- likes
    /**
     * Optimistic: the heart fills the instant it is tapped and only reverts if
     * the server rejects the write. The previous implementation round-tripped
     * before showing anything, then refetched like data for every post on
     * screen.
     */
    likePost: builder.mutation<Envelope<LikeState>, { postId: string; authorUsername: string }>({
      query: ({ postId }) => ({ url: `/posts/${postId}/likes`, method: 'POST' }),
      async onQueryStarted({ postId, authorUsername }, { dispatch, queryFulfilled }) {
        const patches = patchPostEverywhere(dispatch, postId, authorUsername, (post) => {
          if (post.viewerHasLiked) return;
          post.viewerHasLiked = true;
          post.likeCount += 1;
        });

        try {
          // Reconcile with the authoritative count — other users may have
          // liked the same post while this request was in flight.
          const { data } = await queryFulfilled;
          patchPostEverywhere(dispatch, postId, authorUsername, (post) => {
            post.likeCount = data.data.likeCount;
            post.viewerHasLiked = data.data.viewerHasLiked;
          });
        } catch {
          patches.forEach((patch) => patch.undo());
        }
      },
    }),

    unlikePost: builder.mutation<Envelope<LikeState>, { postId: string; authorUsername: string }>({
      query: ({ postId }) => ({ url: `/posts/${postId}/likes`, method: 'DELETE' }),
      async onQueryStarted({ postId, authorUsername }, { dispatch, queryFulfilled }) {
        const patches = patchPostEverywhere(dispatch, postId, authorUsername, (post) => {
          if (!post.viewerHasLiked) return;
          post.viewerHasLiked = false;
          post.likeCount = Math.max(0, post.likeCount - 1);
        });

        try {
          const { data } = await queryFulfilled;
          patchPostEverywhere(dispatch, postId, authorUsername, (post) => {
            post.likeCount = data.data.likeCount;
            post.viewerHasLiked = data.data.viewerHasLiked;
          });
        } catch {
          patches.forEach((patch) => patch.undo());
        }
      },
    }),

    getLikers: builder.query<Envelope<PublicUser[]>, string>({
      query: (postId) => `/posts/${postId}/likes`,
    }),

    // --------------------------------------------------------------- saved
    /** Backs the Saved tab. Grid-sized pages, like the other post grids. */
    getSavedPosts: builder.query<Paginated<Post>, { cursor?: string }>({
      query: ({ cursor }) => ({
        url: '/users/me/saved',
        params: { limit: 12, ...(cursor ? { cursor } : {}) },
      }),
      serializeQueryArgs: ({ endpointName }) => endpointName,
      merge: (cache, incoming, { arg }) => {
        if (!arg.cursor) {
          cache.data = incoming.data;
          cache.meta = incoming.meta;
          return;
        }
        const seen = new Set(cache.data.map((post) => post.id));
        cache.data.push(...incoming.data.filter((post) => !seen.has(post.id)));
        cache.meta = incoming.meta;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
      providesTags: ['Saved'],
    }),

    /**
     * Optimistic like the heart, and for the same reason: the bookmark is a
     * one-tap affordance and must not wait on a round trip. The same post can
     * be on screen in the feed, the explore grid and a profile grid at once, so
     * every copy moves together.
     *
     * The saved *list* is invalidated rather than patched. It is one
     * accumulated multi-page entry ordered by when things were saved, and this
     * response carries no post to splice into it — so it is refetched, and is
     * correct the next time the Saved tab is opened.
     */
    savePost: builder.mutation<
      Envelope<{ saved: boolean }>,
      { postId: string; authorUsername: string }
    >({
      query: ({ postId }) => ({ url: `/posts/${postId}/save`, method: 'POST' }),
      async onQueryStarted({ postId, authorUsername }, { dispatch, queryFulfilled }) {
        const patches = patchPostEverywhere(dispatch, postId, authorUsername, (post) => {
          post.viewerHasSaved = true;
        });

        try {
          await queryFulfilled;
        } catch {
          patches.forEach((patch) => patch.undo());
        }
      },
      invalidatesTags: ['Saved'],
    }),

    unsavePost: builder.mutation<
      Envelope<{ saved: boolean }>,
      { postId: string; authorUsername: string }
    >({
      query: ({ postId }) => ({ url: `/posts/${postId}/save`, method: 'DELETE' }),
      async onQueryStarted({ postId, authorUsername }, { dispatch, queryFulfilled }) {
        const patches = patchPostEverywhere(dispatch, postId, authorUsername, (post) => {
          post.viewerHasSaved = false;
        });

        try {
          await queryFulfilled;
        } catch {
          patches.forEach((patch) => patch.undo());
        }
      },
      invalidatesTags: ['Saved'],
    }),

    // ------------------------------------------------------------ comments
    getComments: builder.query<Paginated<Comment>, { postId: string; cursor?: string }>({
      query: ({ postId, cursor }) => ({
        url: `/posts/${postId}/comments`,
        params: { limit: 10, ...(cursor ? { cursor } : {}) },
      }),
      serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}(${queryArgs.postId})`,
      merge: (cache, incoming, { arg }) => {
        if (!arg.cursor) {
          cache.data = incoming.data;
          cache.meta = incoming.meta;
          return;
        }
        const seen = new Set(cache.data.map((comment) => comment.id));
        cache.data.push(...incoming.data.filter((comment) => !seen.has(comment.id)));
        cache.meta = incoming.meta;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
      providesTags: (_result, _error, { postId }) => [{ type: 'Comments', id: postId }],
    }),

    addComment: builder.mutation<
      Envelope<Comment>,
      { postId: string; authorUsername: string; text: string }
    >({
      query: ({ postId, text }) => ({
        url: `/posts/${postId}/comments`,
        method: 'POST',
        body: { text },
      }),
      async onQueryStarted({ postId, authorUsername }, { dispatch, queryFulfilled }) {
        // See `updateProfile`: an escaping rejection becomes an unhandled one.
        // The composer renders the failure; nothing was inserted to roll back.
        const result = await queryFulfilled.catch(() => null);
        if (!result) return;
        const { data } = result;

        dispatch(
          api.util.updateQueryData('getComments', { postId }, (draft) => {
            draft.data.unshift(data.data);
          }),
        );
        patchPostEverywhere(dispatch, postId, authorUsername, (post) => {
          post.commentCount += 1;
        });
      },
    }),

    deleteComment: builder.mutation<
      void,
      { commentId: string; postId: string; authorUsername: string }
    >({
      query: ({ commentId }) => ({ url: `/comments/${commentId}`, method: 'DELETE' }),
      async onQueryStarted({ commentId, postId, authorUsername }, { dispatch, queryFulfilled }) {
        const patches = [
          dispatch(
            api.util.updateQueryData('getComments', { postId }, (draft) => {
              const index = draft.data.findIndex((comment) => comment.id === commentId);
              if (index !== -1) draft.data.splice(index, 1);
            }),
          ),
          ...patchPostEverywhere(dispatch, postId, authorUsername, (post) => {
            post.commentCount = Math.max(0, post.commentCount - 1);
          }),
        ];

        try {
          await queryFulfilled;
        } catch {
          patches.forEach((patch) => patch.undo());
        }
      },
    }),

    // --------------------------------------------------------- user search
    /**
     * A plain query keyed on `q` — one cache entry per term, no accumulation:
     * the API answers with a single ranked page and there is nothing to page
     * through.
     *
     * `keepUnusedDataFor` is stated rather than left implicit because search is
     * the one place where the retention actually matters: a term is typed one
     * character at a time, so every prefix of it is an entry that just fell out
     * of use. Keeping them for a minute means backspacing, or retrying a term
     * the user tried seconds ago, paints from cache instead of re-asking the
     * API for an answer that has not moved.
     */
    searchUsers: builder.query<Envelope<UserSummary[]>, { q: string }>({
      query: ({ q }) => ({ url: '/users/search', params: { q, limit: 20 } }),
      keepUnusedDataFor: 60,
    }),

    // -------------------------------------------------------- social graph
    getSuggestions: builder.query<Envelope<UserSummary[]>, void>({
      query: () => '/users/suggestions',
      providesTags: ['Suggestions'],
    }),

    getFollowers: builder.query<Paginated<UserSummary>, { username: string; cursor?: string }>({
      query: ({ username, cursor }) => ({
        url: `/users/${username}/followers`,
        params: { limit: 20, ...(cursor ? { cursor } : {}) },
      }),
      // Keyed by username so one profile's followers never leak into another's.
      serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}(${queryArgs.username})`,
      merge: (cache, incoming, { arg }) => {
        if (!arg.cursor) {
          cache.data = incoming.data;
          cache.meta = incoming.meta;
          return;
        }
        const seen = new Set(cache.data.map((user) => user.id));
        cache.data.push(...incoming.data.filter((user) => !seen.has(user.id)));
        cache.meta = incoming.meta;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
      providesTags: (_result, _error, { username }) => [{ type: 'Follows', id: username }],
    }),

    getFollowing: builder.query<Paginated<UserSummary>, { username: string; cursor?: string }>({
      query: ({ username, cursor }) => ({
        url: `/users/${username}/following`,
        params: { limit: 20, ...(cursor ? { cursor } : {}) },
      }),
      serializeQueryArgs: ({ endpointName, queryArgs }) => `${endpointName}(${queryArgs.username})`,
      merge: (cache, incoming, { arg }) => {
        if (!arg.cursor) {
          cache.data = incoming.data;
          cache.meta = incoming.meta;
          return;
        }
        const seen = new Set(cache.data.map((user) => user.id));
        cache.data.push(...incoming.data.filter((user) => !seen.has(user.id)));
        cache.meta = incoming.meta;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
      providesTags: (_result, _error, { username }) => [{ type: 'Follows', id: username }],
    }),

    /**
     * Optimistic, like the heart: the button flips on tap and only reverts if
     * the server refuses.
     *
     * Note what is *not* here — an `invalidatesTags: ['Post']`. Following
     * somebody does change what `GET /posts` returns, but the feed is a single
     * accumulated multi-page cache entry: invalidating it refetches whichever
     * page was last requested and splices that page onto earlier ones that no
     * longer belong together. `socialGraphChanged` is the mechanism instead —
     * FeedPage watches the counter and restarts from the first page.
     */
    followUser: builder.mutation<Envelope<FollowState>, { username: string }>({
      query: ({ username }) => ({ url: `/users/${username}/follow`, method: 'POST' }),
      async onQueryStarted({ username }, { dispatch, getState, queryFulfilled }) {
        const lists = cachedFollowLists(getState() as RootState);
        const patches = patchFollowEverywhere(dispatch, lists, username, (target) => {
          if (target.viewerIsFollowing) return;
          target.viewerIsFollowing = true;
          target.followerCount += 1;
        });

        try {
          // Reconcile with the authoritative count — somebody else may have
          // followed the same account while this request was in flight.
          const { data } = await queryFulfilled;
          patchFollowEverywhere(dispatch, lists, username, (target) => {
            target.viewerIsFollowing = data.data.following;
            target.followerCount = data.data.followerCount;
          });
          dispatch(socialGraphChanged());
        } catch {
          patches.forEach((patch) => patch.undo());
        }
      },
    }),

    unfollowUser: builder.mutation<Envelope<FollowState>, { username: string }>({
      query: ({ username }) => ({ url: `/users/${username}/follow`, method: 'DELETE' }),
      async onQueryStarted({ username }, { dispatch, getState, queryFulfilled }) {
        const lists = cachedFollowLists(getState() as RootState);
        const patches = patchFollowEverywhere(dispatch, lists, username, (target) => {
          if (!target.viewerIsFollowing) return;
          target.viewerIsFollowing = false;
          target.followerCount = Math.max(0, target.followerCount - 1);
        });

        try {
          const { data } = await queryFulfilled;
          patchFollowEverywhere(dispatch, lists, username, (target) => {
            target.viewerIsFollowing = data.data.following;
            target.followerCount = data.data.followerCount;
          });
          dispatch(socialGraphChanged());
        } catch {
          patches.forEach((patch) => patch.undo());
        }
      },
    }),

    // ------------------------------------------------------- notifications
    getNotifications: builder.query<Paginated<Notification>, { cursor?: string }>({
      query: ({ cursor }) => ({
        url: '/notifications',
        params: { limit: 20, ...(cursor ? { cursor } : {}) },
      }),
      serializeQueryArgs: ({ endpointName }) => endpointName,
      merge: (cache, incoming, { arg }) => {
        if (!arg.cursor) {
          cache.data = incoming.data;
          cache.meta = incoming.meta;
          return;
        }
        // A notification arriving mid-scroll shifts the keyset window, so the
        // same row can come back on the following page.
        const seen = new Set(cache.data.map((notification) => notification.id));
        cache.data.push(...incoming.data.filter((notification) => !seen.has(notification.id)));
        cache.meta = incoming.meta;
      },
      forceRefetch: ({ currentArg, previousArg }) => currentArg?.cursor !== previousArg?.cursor,
      providesTags: ['Notifications'],
    }),

    /** Drives the badge on the Activity nav item. */
    getUnreadCount: builder.query<Envelope<{ count: number }>, void>({
      query: () => '/notifications/unread-count',
      providesTags: ['Notifications'],
    }),

    markNotificationsRead: builder.mutation<void, void>({
      query: () => ({ url: '/notifications/read', method: 'POST' }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        // Optimistic because this fires as the Activity page opens: the badge
        // has to clear under the user's finger, not a round trip later. The
        // invalidation below is still what makes the numbers authoritative.
        const patches = [
          dispatch(
            api.util.updateQueryData('getUnreadCount', undefined, (draft) => {
              draft.data.count = 0;
            }),
          ),
          dispatch(
            api.util.updateQueryData('getNotifications', {}, (draft) => {
              draft.data.forEach((notification) => {
                notification.isRead = true;
              });
            }),
          ),
        ];

        try {
          await queryFulfilled;
        } catch {
          patches.forEach((patch) => patch.undo());
        }
      },
      invalidatesTags: ['Notifications'],
    }),
  }),
});

export const {
  useLoginMutation,
  useSignupMutation,
  useGoogleAuthMutation,
  useRefreshSessionMutation,
  useLogoutMutation,
  useGetFeedQuery,
  useGetExploreQuery,
  useGetUserPostsQuery,
  useGetPostQuery,
  useGetProfileQuery,
  useUpdateProfileMutation,
  useUploadAvatarMutation,
  useRemoveAvatarMutation,
  useCreatePostMutation,
  useDeletePostMutation,
  useLikePostMutation,
  useUnlikePostMutation,
  useGetLikersQuery,
  useGetSavedPostsQuery,
  useSavePostMutation,
  useUnsavePostMutation,
  useGetCommentsQuery,
  useAddCommentMutation,
  useDeleteCommentMutation,
  useSearchUsersQuery,
  useGetSuggestionsQuery,
  useGetFollowersQuery,
  useGetFollowingQuery,
  useFollowUserMutation,
  useUnfollowUserMutation,
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useMarkNotificationsReadMutation,
} = api;
