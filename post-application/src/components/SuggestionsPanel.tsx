import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

import { useGetSuggestionsQuery } from '../api/apiSlice';
import { formatCount } from '../utils/time';
import { FollowButton } from './FollowButton';
import { UserAvatar } from './UserAvatar';

interface SuggestionsPanelProps {
  /** Caps the rows drawn. The API returns more than a sidebar has room for. */
  max?: number;
  /** Tighter rhythm, for sitting inside a feed empty state rather than a rail. */
  dense?: boolean;
}

/**
 * Accounts worth following, from the API's suggestion endpoint.
 *
 * Renders nothing when there is nothing to suggest — a heading with no rows
 * under it reads as a component that failed, and on a brand-new install (or a
 * signed-out viewer) that is the common case, not the exception.
 */
export function SuggestionsPanel({ max = 5, dense = false }: SuggestionsPanelProps) {
  const { data, isLoading } = useGetSuggestionsQuery();

  const gap = dense ? 1.25 : 2;
  const avatarSize = dense ? 36 : 40;

  const heading = (
    <Typography variant="subtitle2" color="text.secondary">
      Suggested for you
    </Typography>
  );

  if (isLoading) {
    return (
      <Stack spacing={gap}>
        {heading}
        {/* Same geometry as a real row, so nothing shifts when the data lands. */}
        {[0, 1, 2].slice(0, max).map((index) => (
          <Stack key={index} direction="row" spacing={1.5} alignItems="center">
            <Skeleton variant="circular" width={avatarSize} height={avatarSize} />
            <Stack sx={{ flexGrow: 1 }}>
              <Skeleton variant="text" width="50%" />
              <Skeleton variant="text" width="70%" height={12} />
            </Stack>
            <Skeleton variant="rounded" width={88} height={30} />
          </Stack>
        ))}
      </Stack>
    );
  }

  // Covers the error case too: a failed request suggests nobody, and this panel
  // is never the reason the user came to the page.
  const users = (data?.data ?? []).slice(0, max);
  if (users.length === 0) return null;

  return (
    <Stack component="aside" aria-label="Suggested accounts" spacing={gap}>
      {heading}

      {users.map((user) => (
        <Stack key={user.id} direction="row" spacing={1.5} alignItems="center">
          <UserAvatar user={user} size={avatarSize} />

          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Box
              component={Link}
              to={`/u/${user.username}`}
              sx={{ textDecoration: 'none', color: 'text.primary', minWidth: 0 }}
            >
              <Typography variant="subtitle2" noWrap>
                {user.name}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              @{user.username} · {formatCount(user.followerCount)}{' '}
              {user.followerCount === 1 ? 'follower' : 'followers'}
            </Typography>
          </Box>

          <FollowButton
            username={user.username}
            isFollowing={user.viewerIsFollowing}
            isViewer={user.isViewer}
          />
        </Stack>
      ))}
    </Stack>
  );
}
