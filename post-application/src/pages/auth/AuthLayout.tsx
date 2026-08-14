import { Box, Card, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import FavoriteIcon from '@mui/icons-material/Favorite';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import PublicIcon from '@mui/icons-material/Public';
import type { ReactNode } from 'react';

import { BrandMark } from '../../components/layout/BrandMark';
import { useColorMode } from '../../theme/ColorModeProvider';
import { brand } from '../../theme/tokens';

const HIGHLIGHTS = [
  { icon: PhotoCameraOutlinedIcon, text: 'Share photos in a feed that never jumps as it loads' },
  { icon: FavoriteIcon, text: 'Likes and comments update the instant you tap' },
  { icon: PublicIcon, text: 'Follow along on any device, light or dark' },
];

/**
 * Split layout: a brand panel that only appears once there is room for it, and
 * a form column that is the entire screen on a phone. The panel is decorative,
 * so it is the part that gets dropped rather than squeezing the form.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { mode, toggle } = useColorMode();

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', bgcolor: 'background.default' }}>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flex: '1 1 50%',
          position: 'relative',
          background: brand.gradient,
          color: '#fff',
          p: 8,
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        {/* Soft light blooms; they keep a flat gradient from looking like a
            solid colour block at large sizes. */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            width: 520,
            height: 520,
            borderRadius: '50%',
            top: -160,
            right: -120,
            background: 'radial-gradient(circle, rgba(255,255,255,0.28) 0%, transparent 68%)',
          }}
        />
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            width: 420,
            height: 420,
            borderRadius: '50%',
            bottom: -140,
            left: -80,
            background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, transparent 68%)',
          }}
        />

        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ position: 'relative' }}>
          <PhotoCameraOutlinedIcon sx={{ fontSize: 30 }} />
          <Typography sx={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
            Instagram
          </Typography>
        </Stack>

        <Stack spacing={4} sx={{ position: 'relative', maxWidth: 460 }}>
          <Typography variant="h1" sx={{ color: '#fff' }}>
            Moments worth keeping.
          </Typography>

          <Stack spacing={2.5}>
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <Stack key={text} direction="row" spacing={2} alignItems="center">
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: 2,
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: 'rgba(255,255,255,0.18)',
                    flexShrink: 0,
                  }}
                >
                  <Icon sx={{ fontSize: 19 }} />
                </Box>
                <Typography variant="body1" sx={{ opacity: 0.95 }}>
                  {text}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>

        <Typography variant="caption" sx={{ position: 'relative', opacity: 0.75 }}>
          Built with React, TypeScript, Express and MongoDB.
        </Typography>
      </Box>

      <Box
        sx={{
          flex: '1 1 50%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 2.5, sm: 5 },
          position: 'relative',
        }}
      >
        <Tooltip title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}>
          <IconButton
            onClick={toggle}
            aria-label="Toggle colour mode"
            sx={{ position: 'absolute', top: 20, right: 20 }}
          >
            {mode === 'dark' ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
          </IconButton>
        </Tooltip>

        <Card sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 4 } }}>
          <Stack spacing={3}>
            <Stack spacing={1}>
              <Box sx={{ display: { xs: 'flex', md: 'none' }, mb: 1 }}>
                <BrandMark />
              </Box>
              <Typography variant="h2">{title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            </Stack>

            {children}
          </Stack>
        </Card>

        <Box sx={{ mt: 3 }}>{footer}</Box>
      </Box>
    </Box>
  );
}
