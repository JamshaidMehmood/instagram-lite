import { Box, Stack, Typography } from '@mui/material';
import CameraOutlinedIcon from '@mui/icons-material/CameraOutlined';
import { Link } from 'react-router-dom';

import { brand } from '../../theme/tokens';

/**
 * The wordmark uses `background-clip: text` so the logotype carries the same
 * gradient as the avatar rings and the auth panel — one visual signature
 * rather than three unrelated accents.
 */
export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Stack
      component={Link}
      to="/"
      direction="row"
      spacing={1.25}
      alignItems="center"
      sx={{ textDecoration: 'none', color: 'inherit' }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: 2,
          background: brand.gradient,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        <CameraOutlinedIcon sx={{ fontSize: 21 }} />
      </Box>

      {!compact && (
        <Typography
          component="span"
          sx={{
            fontSize: '1.3rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            background: brand.gradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Instagram
        </Typography>
      )}
    </Stack>
  );
}
