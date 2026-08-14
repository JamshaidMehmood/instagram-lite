import { Box, Card, Skeleton, Stack } from '@mui/material';

/**
 * Mirrors the real card's geometry — same avatar size, same 4:5 media box,
 * same padding. A skeleton that does not match causes a visible jolt when the
 * data lands, which is worse than showing nothing.
 */
export function PostCardSkeleton() {
  return (
    <Card>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2, py: 1.5 }}>
        <Skeleton variant="circular" width={40} height={40} />
        <Box sx={{ flexGrow: 1 }}>
          <Skeleton variant="text" width={130} height={18} />
          <Skeleton variant="text" width={80} height={14} />
        </Box>
      </Stack>

      <Skeleton variant="rectangular" sx={{ width: '100%', aspectRatio: '0.8' }} />

      <Stack direction="row" spacing={1.5} sx={{ px: 2, pt: 1.5 }}>
        <Skeleton variant="circular" width={26} height={26} />
        <Skeleton variant="circular" width={26} height={26} />
        <Skeleton variant="circular" width={26} height={26} />
      </Stack>

      <Box sx={{ px: 2, pb: 2, pt: 1 }}>
        <Skeleton variant="text" width={70} height={18} />
        <Skeleton variant="text" width="90%" height={16} />
        <Skeleton variant="text" width="55%" height={16} />
      </Box>
    </Card>
  );
}
