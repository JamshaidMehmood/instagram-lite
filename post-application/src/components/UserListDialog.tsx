import {
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useGetFollowersQuery, useGetFollowingQuery } from '../api/apiSlice';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { getErrorMessage } from '../utils/errors';
import { EmptyState } from './EmptyState';
import { FollowButton } from './FollowButton';
import { UserAvatar } from './UserAvatar';

interface UserListDialogProps {
  open: boolean;
  onClose: () => void;
  username: string;
  mode: 'followers' | 'following';
}

/**
 * The followers / following sheet, opened from the counts on a profile.
 *
 * One component covers both lists because they differ only in which endpoint
 * they page through — the row, the paging and the empty treatment are the same
 * in each, and splitting them would mean maintaining that twice.
 */
export function UserListDialog({ open, onClose, username, mode }: UserListDialogProps) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // Both hooks run on every render — a hook cannot be picked at runtime — so
  // the list this sheet is not showing is skipped rather than omitted. `!open`
  // skips both, which is what stops a closed dialog holding a live
  // subscription and refetching in the background.
  const followersQuery = useGetFollowersQuery(
    { username, cursor },
    { skip: !open || mode !== 'followers' },
  );
  const followingQuery = useGetFollowingQuery(
    { username, cursor },
    { skip: !open || mode !== 'following' },
  );

  const { data, isLoading, isFetching, error } =
    mode === 'followers' ? followersQuery : followingQuery;

  // Reopening the sheet, or pointing it at another account, has to restart at
  // the first page: a cursor belongs to the list that produced it, and reusing
  // one here would append strangers to the new list.
  useEffect(() => {
    setCursor(undefined);
  }, [open, username, mode]);

  const hasMore = data?.meta.hasMore ?? false;

  const loadMore = useCallback(() => {
    if (!hasMore || isFetching) return;
    setCursor(data?.meta.nextCursor ?? undefined);
  }, [hasMore, isFetching, data?.meta.nextCursor]);

  const sentinelRef = useInfiniteScroll({ hasMore, isFetching, onLoadMore: loadMore });

  const users = data?.data ?? [];
  const title = mode === 'followers' ? 'Followers' : 'Following';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1.5 }}>
        <GroupOutlinedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
        <Typography variant="h5" component="span" sx={{ flexGrow: 1 }}>
          {title}
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {/* The scroll container: the sentinel below lives inside it, so paging is
          driven by this list reaching its end rather than by the page. */}
      <DialogContent dividers sx={{ px: 2, py: 2, minHeight: 240 }}>
        {isLoading && (
          <Stack spacing={2}>
            {[0, 1, 2, 3].map((index) => (
              <Stack key={index} direction="row" spacing={1.5} alignItems="center">
                <Skeleton variant="circular" width={40} height={40} />
                <Stack sx={{ flexGrow: 1 }}>
                  <Skeleton variant="text" width="45%" />
                  <Skeleton variant="text" width="65%" height={12} />
                </Stack>
                <Skeleton variant="rounded" width={88} height={30} />
              </Stack>
            ))}
          </Stack>
        )}

        {error && (
          <Typography variant="body2" color="error">
            {getErrorMessage(error, `Could not load ${title.toLowerCase()}`)}
          </Typography>
        )}

        {/* Keyed off `data`, not `!isLoading`: on the render where the dialog
            opens the query has not started yet, and "No followers yet" must
            not flash before the first request has even been made. */}
        {data && users.length === 0 && (
          <EmptyState
            icon={mode === 'followers' ? <GroupOutlinedIcon /> : <PersonAddAltOutlinedIcon />}
            title={mode === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
            description={
              mode === 'followers'
                ? `When someone follows @${username}, they will show up here.`
                : `The accounts @${username} follows will show up here.`
            }
          />
        )}

        <Stack spacing={2}>
          {users.map((user) => (
            <Stack key={user.id} direction="row" spacing={1.5} alignItems="center">
              {/* Only the identity block is the link. Wrapping the whole row
                  would put the follow <button> inside an <a>, which is invalid
                  markup and hands the click to the navigation instead. */}
              <Stack
                component={Link}
                to={`/u/${user.username}`}
                onClick={onClose}
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{ textDecoration: 'none', color: 'inherit', minWidth: 0, flexGrow: 1 }}
              >
                <UserAvatar user={user} size={40} linkToProfile={false} />
                <Stack sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap>
                    {user.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    @{user.username}
                  </Typography>
                  {user.bio && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {user.bio}
                    </Typography>
                  )}
                </Stack>
              </Stack>

              <FollowButton
                username={user.username}
                isFollowing={user.viewerIsFollowing}
                isViewer={user.isViewer}
              />
            </Stack>
          ))}
        </Stack>

        <Box ref={sentinelRef} sx={{ height: 1 }} />

        {isFetching && !isLoading && (
          <Stack alignItems="center" sx={{ pt: 2 }}>
            <CircularProgress size={20} thickness={5} />
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}
