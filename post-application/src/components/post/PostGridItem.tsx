import { Box, Stack, Typography } from '@mui/material';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { Link } from 'react-router-dom';

import type { Post } from '../../api/types';
import { mediaSrc } from '../../config';
import { formatCount } from '../../utils/time';

/**
 * One cell of a post grid. Lifted out of ProfilePage when Explore arrived so the
 * two surfaces cannot drift — a hover treatment that only half the grids have is
 * the kind of inconsistency nobody notices until it ships.
 */
export function PostGridItem({ post }: { post: Post }) {
  return (
    <Box
      component={Link}
      to={`/p/${post.id}`}
      sx={{
        position: 'relative',
        display: 'block',
        // Square cells regardless of the source ratio — an even grid is the
        // whole point of this view.
        aspectRatio: '1',
        overflow: 'hidden',
        bgcolor: 'action.hover',
        borderRadius: { xs: 0, sm: 1.5 },
        '&:hover .overlay': { opacity: 1 },
        '&:hover img': { transform: 'scale(1.04)' },
      }}
    >
      <Box
        component="img"
        src={mediaSrc(post.image.url)}
        alt={post.caption}
        loading="lazy"
        decoding="async"
        sx={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          transition: 'transform 400ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      />

      {/* Hover-only stats. Touch devices never trigger it, and they do not
          need it — tapping opens the post anyway. */}
      <Stack
        className="overlay"
        direction="row"
        spacing={2.5}
        justifyContent="center"
        alignItems="center"
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: 'rgba(0,0,0,0.45)',
          color: '#fff',
          opacity: 0,
          transition: 'opacity 220ms ease',
          '@media (hover: none)': { display: 'none' },
        }}
      >
        <Stack direction="row" spacing={0.75} alignItems="center">
          <FavoriteIcon sx={{ fontSize: 18 }} />
          <Typography variant="subtitle2">{formatCount(post.likeCount)}</Typography>
        </Stack>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <ChatBubbleIcon sx={{ fontSize: 16 }} />
          <Typography variant="subtitle2">{formatCount(post.commentCount)}</Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
