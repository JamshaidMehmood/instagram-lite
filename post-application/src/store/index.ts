import { configureStore, type Middleware } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

import { api } from '../api/apiSlice';
import authReducer, { signedOut } from './authSlice';

/**
 * Empties the query cache whenever a session ends.
 *
 * Not one cache entry is keyed by who fetched it — `getSavedPosts` and
 * `getNotifications` collapse to their endpoint name alone — so without this
 * the previous account's private data outlives its session for
 * `keepUnusedDataFor` and is handed to whoever signs in next on the same tab.
 *
 * It watches for the action rather than sitting at the call sites because there
 * is more than one way out of a session: the button in the app shell, and the
 * silent path where a refresh token expires and `baseQueryWithReauth` gives up.
 * Both exist today; the third one somebody adds later would forget.
 */
const resetCacheOnSignOut: Middleware = (storeApi) => (next) => (action) => {
  const result = next(action);
  if (signedOut.match(action)) storeApi.dispatch(api.util.resetApiState());
  return result;
};

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // `createPost` carries a FormData instance, which is not serialisable
        // and does not need to be — it never lands in the store.
        ignoredActions: ['api/executeMutation/pending'],
        ignoredPaths: ['api.mutations'],
      },
    })
      .concat(api.middleware)
      .concat(resetCacheOnSignOut),
});

// Enables refetchOnFocus / refetchOnReconnect behaviour.
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
