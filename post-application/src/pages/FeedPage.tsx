import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useGetFeedQuery } from '../api/apiSlice';
import { EmptyState } from '../components/EmptyState';
import { SuggestionsPanel } from '../components/SuggestionsPanel';
import { PostCard } from '../components/post/PostCard';
import { PostCardSkeleton } from '../components/post/PostCardSkeleton';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useAppSelector } from '../store/hooks';
import { layout } from '../theme/tokens';
import { getErrorMessage } from '../utils/errors';

/**
 * The last `graphVersion` this page has already restarted for.
 *
 * Module scope, not a ref, and that is the whole point: following someone
 * happens on Explore, on a profile, or in a follower sheet — FeedPage is
 * unmounted at that moment. A ref seeded on mount would come back equal to the
 * counter it never acted on, conclude nothing had changed, and serve the
 * pre-follow feed from cache. That is exactly the "my feed is empty, let me go
 * find someone to follow" path the counter exists to fix.
 *
 * Zero rather than the store's current value so a bump that lands before the
 * first mount is still noticed.
 */
let appliedGraphVersion = 0;

export function FeedPage() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const graphVersion = useAppSelector((state) => state.auth.graphVersion);

  const { data, isLoading, isFetching, error, refetch } = useGetFeedQuery({ cursor });

  const hasMore = data?.meta.hasMore ?? false;

  const loadMore = useCallback(() => {
    // Guarding on `isFetching` stops the observer firing a second time while
    // the previous page is still in flight.
    if (!hasMore || isFetching) return;
    setCursor(data?.meta.nextCursor ?? undefined);
  }, [hasMore, isFetching, data?.meta.nextCursor]);

  const sentinelRef = useInfiniteScroll({ hasMore, isFetching, onLoadMore: loadMore });

  // The cursor is read inside the effect below but must not re-run it: a page
  // change is exactly what the effect should ignore.
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  useEffect(() => {
    // A first mount with nothing followed since boot lands here with both at
    // zero and correctly does nothing.
    if (appliedGraphVersion === graphVersion) return;
    appliedGraphVersion = graphVersion;

    // Following someone changes what `GET /posts` returns, so every accumulated
    // page is now wrong. Both branches restart from page one, but only one of
    // them can: clearing a non-empty cursor changes the query arg, which
    // `forceRefetch` turns into a first-page request that replaces the merged
    // cache. If the user never paged, the cursor is already undefined and
    // setting it again is a no-op RTK Query would never notice, so the refetch
    // has to be asked for directly.
    if (cursorRef.current === undefined) {
      void refetch();
    } else {
      setCursor(undefined);
    }
  }, [graphVersion, refetch]);

  const shell = (children: React.ReactNode) => (
    <Box sx={{ maxWidth: layout.contentMaxWidth, mx: 'auto', px: { xs: 0, sm: 2 }, py: { xs: 2, sm: 3 } }}>
      {children}
    </Box>
  );

  if (isLoading) {
    return shell(
      <Stack spacing={3}>
        {[0, 1, 2].map((index) => (
          <PostCardSkeleton key={index} />
        ))}
      </Stack>,
    );
  }

  if (error && !data) {
    return shell(
      <EmptyState
        icon={<WifiOffIcon />}
        title="Couldn't load your feed"
        description={getErrorMessage(error)}
        action={{ label: 'Try again', onClick: () => void refetch() }}
      />,
    );
  }

  const posts = data?.data ?? [];

  if (posts.length === 0) {
    // An empty feed no longer means "nobody has posted" — it means the viewer
    // follows nobody who has. The copy has to send them somewhere to fix that,
    // and the suggestions below turn the dead end into one tap.
    return shell(
      <>
        <EmptyState
          icon={<PeopleOutlineIcon />}
          title="Your feed is quiet"
          description="Photos from the people you follow land here. Follow a few accounts and this fills up."
          action={{ label: 'Find people to follow', onClick: () => navigate('/explore') }}
        />
        <SuggestionsPanel />
      </>,
    );
  }

  return shell(
    <Stack spacing={3}>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

      {/* Tripwire for the next page; sits well below the fold. */}
      <Box ref={sentinelRef} sx={{ height: 1 }} />

      {isFetching && (
        <Stack alignItems="center" sx={{ py: 2 }}>
          <CircularProgress size={22} thickness={5} />
        </Stack>
      )}

      {!hasMore && (
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 3 }}>
          You're all caught up.
        </Typography>
      )}
    </Stack>,
  );
}
