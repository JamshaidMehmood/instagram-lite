import { Avatar, Box } from '@mui/material';
import { Link } from 'react-router-dom';

import type { PublicUser } from '../api/types';
import { mediaSrc } from '../config';
import { brand } from '../theme/tokens';

interface UserAvatarProps {
  user: Pick<PublicUser, 'name' | 'username' | 'avatarColor' | 'avatarUrl'>;
  size?: number;
  /** Draws the brand gradient ring. Used to give authored content presence. */
  ring?: boolean;
  linkToProfile?: boolean;
}

/**
 * The colour comes from the user record, not from a client-side hash, so the
 * same person is the same colour in every session and on every device.
 *
 * A photo may also be present — either Google's, an uploaded one, or the local
 * `blob:` preview of an upload still in flight. All three go through
 * `mediaSrc`, because an uploaded avatar is stored as a path relative to the
 * *API* origin and the browser would otherwise resolve it against the SPA's.
 *
 * Passing `undefined` rather than '' for a missing photo matters: MUI renders
 * the children whenever `src` is absent *or* the image fails to load, so the
 * colour-and-initial treatment is both the default and the free error path —
 * no `onError` of our own needed.
 */
export function UserAvatar({ user, size = 38, ring = false, linkToProfile = true }: UserAvatarProps) {
  const initial = (user.name || user.username || '?').charAt(0).toUpperCase();

  const avatar = (
    <Avatar
      src={user.avatarUrl ? mediaSrc(user.avatarUrl) : undefined}
      // `no-referrer` is load-bearing, not hygiene: lh3.googleusercontent.com
      // answers 403 for some referrers, which would blank every Google avatar
      // and silently fall back to the initial.
      imgProps={{ referrerPolicy: 'no-referrer', loading: 'lazy' }}
      sx={{
        width: size,
        height: size,
        bgcolor: user.avatarColor,
        fontSize: size * 0.42,
        color: '#fff',
      }}
    >
      {initial}
    </Avatar>
  );

  // The ring is a gradient border drawn as padding around an inner surface,
  // which is how it stays crisp at any size without a second image.
  const content = ring ? (
    <Box
      sx={{
        p: '2px',
        borderRadius: '50%',
        background: brand.gradient,
        display: 'inline-flex',
      }}
    >
      <Box
        sx={{
          p: '2px',
          borderRadius: '50%',
          bgcolor: 'background.paper',
          display: 'inline-flex',
        }}
      >
        {avatar}
      </Box>
    </Box>
  ) : (
    avatar
  );

  if (!linkToProfile) return content;

  return (
    <Box
      component={Link}
      to={`/u/${user.username}`}
      aria-label={`View ${user.name}'s profile`}
      sx={{ display: 'inline-flex', textDecoration: 'none', flexShrink: 0 }}
    >
      {content}
    </Box>
  );
}
