import { Box, CircularProgress, Skeleton, Stack, Typography } from '@mui/material';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useGetExploreQuery } from '../api/apiSlice';
import { EmptyState } from '../components/EmptyState';
import { SuggestionsPanel } from '../components/SuggestionsPanel';
import { PostGridItem } from '../components/post/PostGridItem';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { getErrorMessage } from '../utils/errors';

/** Matches the profile grid, which is wider than the single-column feed. */
const GRID_MAX_WIDTH = 940;

const GRID_SX = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: { xs: '2px', sm: 1.5 },
} as const;

/**
 * Discovery surface. The home feed only shows accounts you already follow, so
 * without this page a new account would see an empty app and have no way out of
 * it — which is also why the suggestions sit here rather than on the feed.
 */
export function ExplorePage() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading, isFetching, error, refetch } = useGetExploreQuery({ cursor });

  const hasMore = data?.meta.hasMore ?? false;

  const loadMore = useCallback(() => {
    // Guarding on `isFetching` stops the observer firing a second time while
    // the previous page is still in flight.
    if (!hasMore || isFetching) return;
    setCursor(data?.meta.nextCursor ?? undefined);
  }, [hasMore, isFetching, data?.meta.nextCursor]);

  const sentinelRef = useInfiniteScroll({ hasMore, isFetching, onLoadMore: loadMore });

  // The panel lives inside the shell rather than in the success branch: an
  // empty or broken grid is exactly when someone most needs people to follow.
  const shell = (children: React.ReactNode) => (
    <Box sx={{ maxWidth: GRID_MAX_WIDTH, mx: 'auto', px: { xs: 0, sm: 3 }, py: { xs: 2, sm: 4 } }}>
      <Box sx={{ px: { xs: 2, sm: 0 }, mb: { xs: 2, sm: 3 } }}>
        <SuggestionsPanel />
      </Box>
      {children}
    </Box>
  );

  if (isLoading) {
    return shell(
      <Box sx={GRID_SX}>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton
            key={index}
            variant="rectangular"
            sx={{ aspectRatio: '1', borderRadius: { xs: 0, sm: 1.5 } }}
          />
        ))}
      </Box>,
    );
  }

  if (error && !data) {
    return shell(
      <EmptyState
        icon={<WifiOffIcon />}
        title="Couldn't load Explore"
        description={getErrorMessage(error)}
        action={{ label: 'Try again', onClick: () => void refetch() }}
      />,
    );
  }

  const posts = data?.data ?? [];

  if (posts.length === 0) {
    return shell(
      <EmptyState
        icon={<PhotoCameraOutlinedIcon />}
        title="Nothing to explore yet"
        // Explore hides the viewer's own posts, so empty means nobody else has
        // shared anything — not that the viewer has been idle.
        description="When other people share photos, they will show up here."
        action={{ label: 'Share your own photo', onClick: () => navigate('/create') }}
      />,
    );
  }

  return shell(
    <>
      <Box sx={GRID_SX}>
        {posts.map((post) => (
          <PostGridItem key={post.id} post={post} />
        ))}
      </Box>

      {/* Tripwire for the next page; sits well below the fold. */}
      <Box ref={sentinelRef} sx={{ height: 1 }} />

      {isFetching && (
        <Stack alignItems="center" sx={{ py: 3 }}>
          <CircularProgress size={22} thickness={5} />
        </Stack>
      )}

      {!hasMore && (
        <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 3 }}>
          You're all caught up.
        </Typography>
      )}
    </>,
  );
}
