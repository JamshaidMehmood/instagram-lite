import { Button } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useState } from 'react';

import { useFollowUserMutation, useUnfollowUserMutation } from '../api/apiSlice';
import { getErrorMessage } from '../utils/errors';
import { useToast } from './ToastProvider';

interface FollowButtonProps {
  username: string;
  isFollowing: boolean;
  /** The viewer's own row — there is nothing to follow, so nothing renders. */
  isViewer?: boolean;
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
}

/**
 * Reserved widths per size. "Following" and "Unfollow" do not measure the same,
 * and without a floor the row would resize under the pointer at the exact
 * moment the user is aiming at the button.
 */
const MIN_WIDTH = { small: 92, medium: 104, large: 116 } as const;

/**
 * The one follow control, shared by the profile header, the followers /
 * following sheet and the suggestions panel.
 *
 * State comes from the `isFollowing` prop rather than anything local: the
 * mutations patch the RTK Query cache optimistically, so the prop has already
 * flipped by the time the request resolves. A spinner in here would only fight
 * that instant feedback, which is why the button merely disables itself.
 */
export function FollowButton({
  username,
  isFollowing,
  isViewer = false,
  size = 'small',
  fullWidth = false,
}: FollowButtonProps) {
  const [followUser, followState] = useFollowUserMutation();
  const [unfollowUser, unfollowState] = useUnfollowUserMutation();
  const { showToast } = useToast();
  // Hover is the discoverable half of the "Following -> Unfollow" affordance.
  // The flag exists so a keyboard user who tabs onto the button is told what
  // pressing it does, rather than having to press it to find out.
  const [armed, setArmed] = useState(false);

  if (isViewer) return null;

  const busy = followState.isLoading || unfollowState.isLoading;

  const handleClick = async () => {
    try {
      if (isFollowing) await unfollowUser({ username }).unwrap();
      else await followUser({ username }).unwrap();
    } catch (error) {
      const fallback = isFollowing
        ? `Could not unfollow @${username}`
        : `Could not follow @${username}`;
      showToast(getErrorMessage(error, fallback), 'error');
    }
  };

  return (
    <Button
      variant={isFollowing ? 'outlined' : 'contained'}
      size={size}
      fullWidth={fullWidth}
      disabled={busy}
      onClick={handleClick}
      onMouseEnter={() => setArmed(true)}
      onMouseLeave={() => setArmed(false)}
      onFocus={() => setArmed(true)}
      onBlur={() => setArmed(false)}
      aria-label={`${isFollowing ? 'Unfollow' : 'Follow'} @${username}`}
      sx={(theme) => ({
        flexShrink: 0,
        minWidth: MIN_WIDTH[size],
        ...(isFollowing
          ? {
              // Neutral at rest so a page full of "Following" pills does not
              // shout, destructive only once it is about to be pressed.
              color: theme.palette.text.primary,
              borderColor: theme.palette.divider,
              '&:hover, &:focus-visible': {
                color: theme.palette.error.main,
                borderColor: theme.palette.error.main,
                backgroundColor: alpha(theme.palette.error.main, 0.08),
              },
            }
          : {}),
      })}
    >
      {isFollowing ? (armed ? 'Unfollow' : 'Following') : 'Follow'}
    </Button>
  );
}
