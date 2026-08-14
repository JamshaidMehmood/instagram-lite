import { keyframes } from '@emotion/react';
import { Box, Skeleton } from '@mui/material';
import BrokenImageOutlinedIcon from '@mui/icons-material/BrokenImageOutlined';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { useCallback, useRef, useState } from 'react';

import type { PostImage as PostImageDTO } from '../../api/types';
import { mediaSrc } from '../../config';

const burst = keyframes`
  0%   { opacity: 0; transform: scale(0.3); }
  15%  { opacity: 0.95; transform: scale(1.15); }
  40%  { opacity: 0.95; transform: scale(0.95); }
  70%  { opacity: 0.9; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.25); }
`;

interface PostImageProps {
  image: PostImageDTO;
  alt: string;
  /** Fired on double-tap / double-click. Only ever *adds* a like. */
  onDoubleTapLike?: () => void;
  rounded?: boolean;
}

/**
 * The image surface.
 *
 * The box is sized from the aspect ratio the server measured at upload, so the
 * space is reserved before a single byte of the image arrives. That is what
 * keeps the feed from reflowing as you scroll — the old implementation let the
 * image dictate its own height on load and the whole column jumped.
 */
export function PostImage({ image, alt, onDoubleTapLike, rounded = false }: PostImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [bursting, setBursting] = useState(false);
  const burstTimer = useRef<number | undefined>(undefined);

  const handleDoubleClick = useCallback(() => {
    if (!onDoubleTapLike) return;
    onDoubleTapLike();

    setBursting(true);
    window.clearTimeout(burstTimer.current);
    burstTimer.current = window.setTimeout(() => setBursting(false), 900);
  }, [onDoubleTapLike]);

  return (
    <Box
      onDoubleClick={handleDoubleClick}
      sx={{
        position: 'relative',
        width: '100%',
        // Clamped so an extreme panorama or a very tall image still fits a
        // reasonable slot instead of dominating the viewport.
        aspectRatio: String(Math.min(Math.max(image.aspectRatio, 0.6), 1.91)),
        bgcolor: 'action.hover',
        overflow: 'hidden',
        borderRadius: rounded ? 2 : 0,
        cursor: onDoubleTapLike ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {!loaded && !failed && (
        <Skeleton variant="rectangular" width="100%" height="100%" sx={{ position: 'absolute', inset: 0 }} />
      )}

      {failed ? (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'text.disabled',
            '& svg': { fontSize: 40 },
          }}
        >
          <BrokenImageOutlinedIcon />
        </Box>
      ) : (
        <Box
          component="img"
          src={mediaSrc(image.url)}
          alt={alt}
          // Native lazy loading plus async decode keeps offscreen cards from
          // competing with the ones the user is actually looking at.
          loading="lazy"
          decoding="async"
          width={image.width}
          height={image.height}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: loaded ? 1 : 0,
            transition: 'opacity 320ms ease',
            display: 'block',
          }}
        />
      )}

      {bursting && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
            color: 'like',
            '& svg': {
              fontSize: 96,
              filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.35))',
              animation: `${burst} 900ms cubic-bezier(0.2, 0.9, 0.3, 1) forwards`,
            },
          }}
        >
          <FavoriteIcon />
        </Box>
      )}
    </Box>
  );
}
