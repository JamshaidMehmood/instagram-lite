import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { AuthPayload, CurrentUser } from '../api/types';

/**
 * `bootstrapping` exists so the router can tell "not signed in" apart from
 * "we have not asked yet". Without it, a refresh on a protected route bounces
 * the user to the sign-in page for a frame before the session is restored.
 */
export type AuthStatus = 'bootstrapping' | 'authenticated' | 'anonymous';

interface AuthState {
  user: CurrentUser | null;
  /**
   * Held in memory only, never in localStorage.
   *
   * A token in localStorage is readable by any script on the page, so a single
   * XSS bug hands over the session. The long-lived credential is the httpOnly
   * refresh cookie, which JavaScript cannot read; this short-lived token is
   * re-minted from it on every page load.
   */
  accessToken: string | null;
  status: AuthStatus;
  /**
   * Bumped every time the viewer follows or unfollows someone.
   *
   * Who you follow decides what `GET /posts` contains, so the feed is stale the
   * moment the graph moves. Invalidating the feed tag would be wrong: the feed
   * is one accumulated multi-page cache entry, and its cursor lives in
   * component state — a refetch would pull whichever page was last requested
   * and splice it onto pages that no longer belong. A counter lets the page
   * notice the change and restart cleanly from page one.
   */
  graphVersion: number;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  status: 'bootstrapping',
  graphVersion: 0,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionEstablished(state, action: PayloadAction<AuthPayload>) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.status = 'authenticated';
    },
    /** Silent-refresh succeeded: swap the token, keep everything else. */
    tokenRefreshed(state, action: PayloadAction<AuthPayload>) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.status = 'authenticated';
    },
    signedOut(state) {
      state.user = null;
      state.accessToken = null;
      state.status = 'anonymous';
      // `graphVersion` deliberately survives: it is a monotonic signal, and
      // resetting it could hand a still-mounted subscriber the number it
      // already acted on.
    },
    /**
     * The viewer edited their own profile or avatar.
     *
     * Only `user` moves: the profile endpoints answer with a fresh
     * `CurrentUser` but never re-mint a token, so reusing `sessionEstablished`
     * here would mean inventing an `accessToken` to satisfy its payload.
     */
    profileUpdated(state, action: PayloadAction<CurrentUser>) {
      state.user = action.payload;
    },
    /** Dispatched by the follow/unfollow mutations once the server agrees. */
    socialGraphChanged(state) {
      state.graphVersion += 1;
    },
  },
});

export const { sessionEstablished, tokenRefreshed, signedOut, profileUpdated, socialGraphChanged } =
  authSlice.actions;
export default authSlice.reducer;
