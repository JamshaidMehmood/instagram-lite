import { Box, CircularProgress, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useGetNotificationsQuery, useMarkNotificationsReadMutation } from '../api/apiSlice';
import type { Notification } from '../api/types';
import { EmptyState } from '../components/EmptyState';
import { FollowButton } from '../components/FollowButton';
import { UserAvatar } from '../components/UserAvatar';
import { mediaSrc } from '../config';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { layout } from '../theme/tokens';
import { getErrorMessage } from '../utils/errors';
import { formatAbsoluteTime, formatRelativeTime } from '../utils/time';

/** Square, and the same size as the avatar opposite it, so rows stay even. */
const THUMBNAIL_SIZE = 46;

function describeAction(notification: Notification): string {
  switch (notification.type) {
    case 'like':
      return 'liked your photo';
    case 'comment':
      // The text is optional even on a comment row: the comment may have been
      // deleted since. The sentence still has to read without it.
      return notification.commentText
        ? `commented: ${notification.commentText}`
        : 'commented on your photo';
    case 'follow':
      return 'started following you';
  }
}

interface ActivityRowProps {
  notification: Notification;
  /** Arrived since the last visit — tinted, and decided by the page, not by
   *  `notification.isRead`. See the snapshot in `ActivityPage`. */
  unread: boolean;
}

function ActivityRow({ notification, unread }: ActivityRowProps) {
  const { actor } = notification;

  return (
    <Stack
      direction="row"
      spacing={1.5}
      alignItems="center"
      sx={{
        px: 1.5,
        py: 1.25,
        borderRadius: 2,
        // Tinted from the primary hue rather than a flat grey: grey is what
        // `action.hover` already means here, and the two would be
        // indistinguishable under the pointer.
        bgcolor: (theme) => (unread ? alpha(theme.palette.primary.main, 0.08) : 'transparent'),
      }}
    >
      <UserAvatar user={actor} size={44} />

      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        {/* Clamped rather than truncated to one line: a quoted comment is the
            whole point of a comment row, and two lines carry most of them. */}
        <Typography
          variant="body2"
          sx={{
            wordBreak: 'break-word',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 2,
            overflow: 'hidden',
          }}
        >
          <Box
            component={Link}
            to={`/u/${actor.username}`}
            sx={{ fontWeight: 600, color: 'text.primary', textDecoration: 'none', mr: 0.75 }}
          >
            {actor.username}
          </Box>
          {describeAction(notification)}
        </Typography>

        <Tooltip title={formatAbsoluteTime(notification.createdAt)}>
          <Typography
            variant="caption"
            color="text.secondary"
            component="time"
            dateTime={notification.createdAt}
          >
            {formatRelativeTime(notification.createdAt)}
          </Typography>
        </Tooltip>
      </Box>

      {notification.type === 'follow' ? (
        // Starts from "Follow" because a notification carries only the actor's
        // public profile — there is no follow-back state on it to read, and
        // asking for one per row would be a request per notification. A
        // redundant follow is idempotent on the server, so the cost of guessing
        // wrong is a no-op write; the profile behind the avatar remains the
        // authoritative view.
        <FollowButton username={actor.username} isFollowing={false} />
      ) : notification.post ? (
        <Box
          component={Link}
          to={`/p/${notification.post.id}`}
          aria-label={`View the post ${actor.username} ${
            notification.type === 'like' ? 'liked' : 'commented on'
          }`}
          sx={{
            flexShrink: 0,
            display: 'block',
            width: THUMBNAIL_SIZE,
            height: THUMBNAIL_SIZE,
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: 'action.hover',
          }}
        >
          <Box
            component="img"
            src={mediaSrc(notification.post.imageUrl)}
            // Decorative: the link's label already says what this points at,
            // and an image whose only description is "post" adds nothing.
            alt=""
            loading="lazy"
            decoding="async"
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </Box>
      ) : null}
    </Stack>
  );
}

/**
 * The activity feed: everything other people did to the viewer's content, newest
 * first.
 */
export function ActivityPage() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading, isFetching, error, refetch } = useGetNotificationsQuery({ cursor });
  const [markAllRead] = useMarkNotificationsReadMutation();

  /**
   * Which rows to tint, frozen at the moment the first page landed.
   *
   * Opening this page is what marks everything read, and that mutation patches
   * `isRead` on every cached row optimistically — so a row that read its own
   * flag would lose its highlight while the user was still looking at it. The
   * snapshot is taken *before* the mutation is fired and never grows again,
   * which is what makes "new since your last visit" survive the visit.
   */
  const [unreadIds, setUnreadIds] = useState<ReadonlySet<string>>(() => new Set());
  const hasMarkedRead = useRef(false);

  useEffect(() => {
    // Waits for the first page rather than firing on mount: marking read before
    // the list arrives means it comes back with nothing unread on it, and there
    // would be nothing left to highlight.
    if (hasMarkedRead.current || !data) return;
    hasMarkedRead.current = true;

    const unread = new Set(data.data.filter((row) => !row.isRead).map((row) => row.id));
    setUnreadIds(unread);

    // Unread rows are always a prefix of a newest-first feed, so an entirely
    // read first page means the badge is already at zero and there is nothing
    // for the write to do.
    if (unread.size > 0) void markAllRead();
  }, [data, markAllRead]);

  const hasMore = data?.meta.hasMore ?? false;

  const loadMore = useCallback(() => {
    // Guarding on `isFetching` stops the observer firing a second time while
    // the previous page is still in flight.
    if (!hasMore || isFetching) return;
    setCursor(data?.meta.nextCursor ?? undefined);
  }, [hasMore, isFetching, data?.meta.nextCursor]);

  const sentinelRef = useInfiniteScroll({ hasMore, isFetching, onLoadMore: loadMore });

  const shell = (children: React.ReactNode) => (
    <Box sx={{ maxWidth: layout.contentMaxWidth, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 3, sm: 4 } }}>
      <Typography variant="h2" sx={{ mb: { xs: 2, sm: 3 } }}>
        Activity
      </Typography>
      {children}
    </Box>
  );

  if (isLoading) {
    return shell(
      <Stack spacing={1}>
        {[0, 1, 2, 3, 4].map((index) => (
          // Same geometry as a real row, so nothing shifts when the data lands.
          <Stack key={index} direction="row" spacing={1.5} alignItems="center" sx={{ px: 1.5, py: 1.25 }}>
            <Skeleton variant="circular" width={44} height={44} />
            <Stack sx={{ flexGrow: 1 }}>
              <Skeleton variant="text" width="70%" />
              <Skeleton variant="text" width="20%" height={12} />
            </Stack>
            <Skeleton variant="rounded" width={THUMBNAIL_SIZE} height={THUMBNAIL_SIZE} />
          </Stack>
        ))}
      </Stack>,
    );
  }

  if (error && !data) {
    return shell(
      <EmptyState
        icon={<WifiOffIcon />}
        title="Couldn't load your activity"
        description={getErrorMessage(error)}
        action={{ label: 'Try again', onClick: () => void refetch() }}
      />,
    );
  }

  const notifications = data?.data ?? [];

  if (notifications.length === 0) {
    return shell(
      <EmptyState
        icon={<NotificationsNoneIcon />}
        title="No activity yet"
        // Nothing here is the viewer's fault, but it is usually a symptom of an
        // account nobody has found yet — so the way out is more people.
        description="Likes, comments and new followers show up here."
        action={{ label: 'Find people to follow', onClick: () => navigate('/explore') }}
      />,
    );
  }

  return shell(
    <Stack spacing={0.5}>
      {notifications.map((notification) => (
        <ActivityRow
          key={notification.id}
          notification={notification}
          unread={unreadIds.has(notification.id)}
        />
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
