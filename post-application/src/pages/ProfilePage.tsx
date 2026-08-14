import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import BookmarkBorderOutlinedIcon from '@mui/icons-material/BookmarkBorderOutlined';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import type { MutableRefObject, ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useGetProfileQuery, useGetSavedPostsQuery, useGetUserPostsQuery } from '../api/apiSlice';
import type { Post } from '../api/types';
import { EditProfileDialog } from '../components/EditProfileDialog';
import { EmptyState } from '../components/EmptyState';
import { FollowButton } from '../components/FollowButton';
import { UserAvatar } from '../components/UserAvatar';
import { UserListDialog } from '../components/UserListDialog';
import { PostGridItem } from '../components/post/PostGridItem';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useAppSelector } from '../store/hooks';
import { getErrorMessage } from '../utils/errors';
import { formatCount } from '../utils/time';

type ProfileTab = 'posts' | 'saved';

const GRID_SX = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: { xs: '2px', sm: 1.5 },
} as const;

interface PostGridProps {
  posts: Post[];
  isLoading: boolean;
  isFetching: boolean;
  sentinelRef: MutableRefObject<HTMLDivElement | null>;
  /** Rendered instead of the grid when the page came back with nothing. */
  empty: ReactNode;
}

/**
 * The three states of a post grid — skeleton, empty, cells plus tripwire.
 *
 * POSTS and SAVED are the same grid, so it is written once for the same reason
 * `PostGridItem` was lifted out of this file when Explore arrived: two copies of
 * a hover treatment or a gap drift apart and nobody notices until it ships.
 * Each tab still owns its own query, cursor and sentinel, which is why those
 * arrive as props rather than being read in here.
 */
function PostGrid({ posts, isLoading, isFetching, sentinelRef, empty }: PostGridProps) {
  if (isLoading) {
    return (
      <Box sx={GRID_SX}>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <Skeleton
            key={index}
            variant="rectangular"
            sx={{ aspectRatio: '1', borderRadius: { xs: 0, sm: 1.5 } }}
          />
        ))}
      </Box>
    );
  }

  if (posts.length === 0) return <>{empty}</>;

  return (
    <>
      <Box sx={GRID_SX}>
        {posts.map((post) => (
          <PostGridItem key={post.id} post={post} />
        ))}
      </Box>

      <Box ref={sentinelRef} sx={{ height: 1 }} />

      {isFetching && (
        <Stack alignItems="center" sx={{ py: 3 }}>
          <CircularProgress size={22} thickness={5} />
        </Stack>
      )}
    </>
  );
}

interface StatButtonProps {
  count: number;
  label: string;
  ariaLabel: string;
  onClick: () => void;
}

/**
 * The two stats that lead somewhere are real `<button>`s, not styled spans: a
 * click target that cannot be tabbed to or announced is invisible to keyboard
 * and screen-reader users, and the counts are the only entry point to the
 * follower lists.
 */
function StatButton({ count, label, ariaLabel, onClick }: StatButtonProps) {
  return (
    <Typography
      component="button"
      type="button"
      variant="body2"
      onClick={onClick}
      aria-label={ariaLabel}
      sx={{
        // A native button arrives with its own chrome; strip it back so the
        // three stats read as one row rather than one row and a widget.
        p: 0,
        border: 0,
        bgcolor: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
        '&:hover': { color: 'text.secondary' },
      }}
    >
      <Box component="span" sx={{ fontWeight: 700 }}>
        {formatCount(count)}
      </Box>{' '}
      {label}
    </Typography>
  );
}

export function ProfilePage() {
  const { username = '' } = useParams();
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [savedCursor, setSavedCursor] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<ProfileTab>('posts');
  const [editOpen, setEditOpen] = useState(false);

  // `EditProfileDialog` edits the session's own account, so it needs the
  // `CurrentUser` — the profile DTO on this page is the public projection and
  // is missing the fields the form writes back.
  const currentUser = useAppSelector((state) => state.auth.user);

  // Open state is separate from the mode so the mode survives the closing
  // animation — folding them into one nullable value swaps the dialog's title
  // and list back to followers while it is still fading out.
  const [listOpen, setListOpen] = useState(false);
  const [listMode, setListMode] = useState<'followers' | 'following'>('followers');

  const openList = useCallback((mode: 'followers' | 'following') => {
    setListMode(mode);
    setListOpen(true);
  }, []);

  /**
   * `/u/:username` maps to a single element, so React Router keeps this
   * component mounted when only the param changes — following a name out of the
   * follower sheet lands on another profile with the previous one's cursor
   * still set. The keyset cursor is generic `(createdAt, _id)`, so the server
   * answers it happily with "posts older than that", silently omitting the new
   * profile's newest photos and leaving the grid disagreeing with its own
   * post count.
   *
   * Reset during render rather than from an effect: an effect runs after the
   * commit, so one request would already have gone out with the mismatched
   * pair, and `merge` would splice that deep page onto page one.
   */
  const [cursorOwner, setCursorOwner] = useState(username);
  if (cursorOwner !== username) {
    setCursorOwner(username);
    setCursor(undefined);
    setListOpen(false);
    // SAVED exists only on your own profile, so it must not survive a walk to
    // someone else's page and be waiting when you come back — by then its
    // cursor points into a list the tab is no longer showing.
    setTab('posts');
    setSavedCursor(undefined);
  }

  const profileQuery = useGetProfileQuery(username, { skip: !username });
  const postsQuery = useGetUserPostsQuery({ username, cursor }, { skip: !username });

  const profile = profileQuery.data?.data;
  const isViewer = profile?.isViewer ?? false;

  // Saved posts are private, so the tab is only ever mounted on your own
  // profile. Hooks cannot be conditional, so the query is always called and the
  // one that is not on screen is skipped rather than branched around.
  const showSaved = isViewer && tab === 'saved';
  const savedQuery = useGetSavedPostsQuery({ cursor: savedCursor }, { skip: !showSaved });

  const hasMore = postsQuery.data?.meta.hasMore ?? false;
  const isFetching = postsQuery.isFetching;

  const loadMore = useCallback(() => {
    if (!hasMore || isFetching) return;
    setCursor(postsQuery.data?.meta.nextCursor ?? undefined);
  }, [hasMore, isFetching, postsQuery.data?.meta.nextCursor]);

  const sentinelRef = useInfiniteScroll({ hasMore, isFetching, onLoadMore: loadMore });

  const savedHasMore = savedQuery.data?.meta.hasMore ?? false;
  const savedIsFetching = savedQuery.isFetching;

  const loadMoreSaved = useCallback(() => {
    if (!savedHasMore || savedIsFetching) return;
    setSavedCursor(savedQuery.data?.meta.nextCursor ?? undefined);
  }, [savedHasMore, savedIsFetching, savedQuery.data?.meta.nextCursor]);

  const savedSentinelRef = useInfiniteScroll({
    hasMore: savedHasMore,
    isFetching: savedIsFetching,
    onLoadMore: loadMoreSaved,
  });

  if (profileQuery.error) {
    return (
      <EmptyState
        icon={<PersonOffOutlinedIcon />}
        title="Profile not found"
        description={getErrorMessage(profileQuery.error, `No account exists for @${username}.`)}
        action={{ label: 'Go to feed', onClick: () => navigate('/') }}
      />
    );
  }

  const posts = postsQuery.data?.data ?? [];

  return (
    <Box sx={{ maxWidth: 940, mx: 'auto', px: { xs: 0, sm: 3 }, py: { xs: 2, sm: 4 } }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={{ xs: 2, sm: 5 }}
        alignItems={{ xs: 'center', sm: 'flex-start' }}
        sx={{ px: { xs: 2, sm: 0 }, mb: 4, textAlign: { xs: 'center', sm: 'left' } }}
      >
        {profile ? (
          <UserAvatar user={profile} size={104} ring linkToProfile={false} />
        ) : (
          <Skeleton variant="circular" width={112} height={112} />
        )}

        <Stack spacing={1.5} sx={{ flexGrow: 1, alignItems: { xs: 'center', sm: 'flex-start' } }}>
          {profile ? (
            <>
              {/* Column on a phone so the centred header stays centred, row on
                  wider screens so the button sits beside the name instead of
                  pushing the stats down. */}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={{ xs: 1.5, sm: 2 }}
                alignItems="center"
              >
                <Stack spacing={0.25} sx={{ alignItems: { xs: 'center', sm: 'flex-start' } }}>
                  <Typography variant="h3">{profile.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    @{profile.username}
                  </Typography>
                </Stack>

                {/* One slot, two actions: your own profile has nothing to
                    follow, and the thing you can do there instead is edit it.
                    Medium, not the list-row default — on a profile this is the
                    primary action, not a per-row affordance. */}
                {profile.isViewer ? (
                  <Button
                    variant="outlined"
                    size="medium"
                    onClick={() => setEditOpen(true)}
                    sx={{
                      flexShrink: 0,
                      // Neutral rather than the accent: this is housekeeping,
                      // and the page's own photos should stay the loudest thing
                      // on it.
                      color: 'text.primary',
                      borderColor: 'divider',
                      '&:hover': { borderColor: 'text.disabled', bgcolor: 'action.hover' },
                    }}
                  >
                    Edit profile
                  </Button>
                ) : (
                  <FollowButton
                    username={profile.username}
                    isFollowing={profile.viewerIsFollowing}
                    isViewer={profile.isViewer}
                    size="medium"
                  />
                )}
              </Stack>

              <Stack direction="row" spacing={3}>
                <Typography variant="body2">
                  <Box component="span" sx={{ fontWeight: 700 }}>
                    {formatCount(profile.postCount)}
                  </Box>{' '}
                  {profile.postCount === 1 ? 'post' : 'posts'}
                </Typography>
                {/* A zero count still opens the dialog. Disabling it would leave
                    a number that looks tappable but is not; the list's own empty
                    state answers the question the tap was asking. */}
                <StatButton
                  count={profile.followerCount}
                  label={profile.followerCount === 1 ? 'follower' : 'followers'}
                  ariaLabel={`View followers of @${profile.username}`}
                  onClick={() => openList('followers')}
                />
                <StatButton
                  count={profile.followingCount}
                  label="following"
                  ariaLabel={`View accounts @${profile.username} follows`}
                  onClick={() => openList('following')}
                />
              </Stack>

              <Typography variant="body2" color="text.secondary">
                Joined{' '}
                {new Date(profile.joinedAt).toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                })}
              </Typography>

              {profile.bio && (
                <Typography variant="body2" sx={{ maxWidth: 460, whiteSpace: 'pre-wrap' }}>
                  {profile.bio}
                </Typography>
              )}
            </>
          ) : (
            <Stack spacing={1} sx={{ width: '100%', alignItems: { xs: 'center', sm: 'flex-start' } }}>
              <Skeleton variant="text" width={190} height={34} />
              <Skeleton variant="text" width={120} />
              <Skeleton variant="text" width={230} />
            </Stack>
          )}
        </Stack>
      </Stack>

      <Divider />

      {/* Other people get the plain heading, not a disabled tab: a SAVED tab
          they can see advertises a shelf that is not theirs to open, and
          invites them to wonder whose posts are on it. */}
      {isViewer ? (
        <Tabs
          value={tab}
          onChange={(_event, next: ProfileTab) => {
            setTab(next);
            // Leaving SAVED drops its cursor with it. The accumulated cache
            // entry the cursor is paired with can be evicted while the tab is
            // off screen, and coming back with a page-three cursor would then
            // fetch page three into an empty list with no way up to page one.
            if (next !== 'saved') setSavedCursor(undefined);
          }}
          centered
          aria-label="Your posts and saved posts"
          sx={(theme) => ({
            minHeight: 0,
            // The indicator rides the top edge so the selected tab hangs off
            // the divider above, rather than underlining it a second time.
            '& .MuiTabs-indicator': {
              top: 0,
              bottom: 'auto',
              backgroundColor: theme.palette.text.primary,
            },
            '& .MuiTab-root': {
              minHeight: 0,
              py: 2,
              // Borrowed wholesale from the caption above so the header keeps
              // the same small-caps weight whichever profile you land on.
              ...theme.typography.caption,
              letterSpacing: '0.08em',
              fontWeight: 600,
              color: theme.palette.text.secondary,
              '&.Mui-selected': { color: theme.palette.text.primary },
            },
          })}
        >
          <Tab
            value="posts"
            label="POSTS"
            icon={<GridOnOutlinedIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
          />
          <Tab
            value="saved"
            label="SAVED"
            icon={<BookmarkBorderOutlinedIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
          />
        </Tabs>
      ) : (
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="center"
          sx={{ py: 2 }}
        >
          <GridOnOutlinedIcon sx={{ fontSize: 16 }} />
          <Typography variant="caption" sx={{ letterSpacing: '0.08em', fontWeight: 600 }}>
            POSTS
          </Typography>
        </Stack>
      )}

      {showSaved ? (
        <PostGrid
          posts={savedQuery.data?.data ?? []}
          // A query one render out of `skip` reports `isUninitialized`, not
          // `isLoading`. Without folding it in, the first frame after tapping
          // SAVED flashes "Nothing saved yet" before the request has left.
          isLoading={savedQuery.isLoading || savedQuery.isUninitialized}
          isFetching={savedIsFetching}
          sentinelRef={savedSentinelRef}
          empty={
            <EmptyState
              icon={<BookmarkBorderOutlinedIcon />}
              title="Nothing saved yet"
              // Saying it is private is the point: a bookmark usually tells the
              // author someone kept their photo, and this one never does.
              description="Save a post and it lands here. Nobody else can see this list, not even the person who posted it."
              action={{ label: 'Find something to save', onClick: () => navigate('/explore') }}
            />
          }
        />
      ) : (
        <PostGrid
          posts={posts}
          isLoading={postsQuery.isLoading}
          isFetching={isFetching}
          sentinelRef={sentinelRef}
          empty={
            <EmptyState
              icon={<PhotoCameraOutlinedIcon />}
              title={isViewer ? 'You have not posted yet' : 'No posts yet'}
              description={
                isViewer
                  ? 'Share a photo and it will appear here.'
                  : `When @${username} posts, you will see it here.`
              }
              {...(isViewer
                ? { action: { label: 'Create a post', onClick: () => navigate('/create') } }
                : {})}
            />
          }
        />
      )}

      <UserListDialog
        open={listOpen}
        onClose={() => setListOpen(false)}
        username={username}
        mode={listMode}
      />

      {/* `isViewer` already implies a signed-in session; the null check is what
          makes that fact legible to the compiler. */}
      {currentUser && (
        <EditProfileDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          user={currentUser}
          onUsernameChanged={(next) => navigate(`/u/${next}`, { replace: true })}
        />
      )}
    </Box>
  );
}
