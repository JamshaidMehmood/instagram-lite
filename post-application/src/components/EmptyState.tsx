import { Box, Button, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

/**
 * Shared treatment for "nothing here yet" and "that failed".
 *
 * An empty feed previously rendered an indefinite loading spinner, which reads
 * as a hung app. An explicit empty state with a next action does not.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Stack alignItems="center" textAlign="center" spacing={2} sx={{ py: { xs: 6, sm: 10 }, px: 3 }}>
      <Box
        sx={{
          width: 76,
          height: 76,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'action.hover',
          color: 'text.secondary',
          '& svg': { fontSize: 34 },
        }}
      >
        {icon}
      </Box>

      <Stack spacing={0.75} sx={{ maxWidth: 380 }}>
        <Typography variant="h5">{title}</Typography>
        {description && (
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        )}
      </Stack>

      {action && (
        <Button variant="contained" onClick={action.onClick} sx={{ mt: 1 }}>
          {action.label}
        </Button>
      )}
    </Stack>
  );
}
