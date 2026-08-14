import { Box, CircularProgress } from '@mui/material';
import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

import { AppShell } from './components/layout/AppShell';
import { RedirectIfAuthenticated, RequireAuth } from './components/RouteGuards';

/**
 * Route-level code splitting. Each page becomes its own chunk, so signing in
 * does not download the upload page, the profile grid and the post view first.
 * The named-export mapping is needed because `lazy` expects a default export.
 */
const FeedPage = lazy(() => import('./pages/FeedPage').then((m) => ({ default: m.FeedPage })));
const ExplorePage = lazy(() =>
  import('./pages/ExplorePage').then((m) => ({ default: m.ExplorePage })),
);
const SearchPage = lazy(() =>
  import('./pages/SearchPage').then((m) => ({ default: m.SearchPage })),
);
const CreatePostPage = lazy(() =>
  import('./pages/CreatePostPage').then((m) => ({ default: m.CreatePostPage })),
);
const ActivityPage = lazy(() =>
  import('./pages/ActivityPage').then((m) => ({ default: m.ActivityPage })),
);
const ProfilePage = lazy(() =>
  import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const PostPage = lazy(() => import('./pages/PostPage').then((m) => ({ default: m.PostPage })));
const SignInPage = lazy(() =>
  import('./pages/auth/SignInPage').then((m) => ({ default: m.SignInPage })),
);
const SignUpPage = lazy(() =>
  import('./pages/auth/SignUpPage').then((m) => ({ default: m.SignUpPage })),
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

function RouteFallback() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60dvh' }}>
      <CircularProgress size={24} thickness={5} />
    </Box>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route
          path="/signin"
          element={
            <RedirectIfAuthenticated>
              <SignInPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/signup"
          element={
            <RedirectIfAuthenticated>
              <SignUpPage />
            </RedirectIfAuthenticated>
          }
        />

        {/* Layout route: AppShell renders the nav chrome plus an <Outlet />,
            so every child below is wrapped by it and guarded once. */}
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<FeedPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/create" element={<CreatePostPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/u/:username" element={<ProfilePage />} />
          <Route path="/p/:postId" element={<PostPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
