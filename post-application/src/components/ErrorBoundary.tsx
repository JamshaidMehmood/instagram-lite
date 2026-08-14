import { Box, Button, Container, Stack, Typography } from '@mui/material';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so a bug in one component does not leave a blank
 * page. The previous version rendered the raw component stack into a modal —
 * useful to a developer, alarming and meaningless to a user — so the stack is
 * now console-only and shown on screen in development builds alone.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Where a real deployment would call Sentry / Datadog.
    console.error('Render error:', error, info.componentStack);
  }

  private handleReload = () => {
    this.setState({ error: null });
    window.location.assign('/');
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Container maxWidth="sm">
        <Stack spacing={2.5} alignItems="center" textAlign="center" sx={{ py: 12 }}>
          <Box
            sx={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'error.main',
              color: 'error.contrastText',
              '& svg': { fontSize: 36 },
            }}
          >
            <ReportProblemOutlinedIcon />
          </Box>

          <Typography variant="h4">Something went wrong</Typography>
          <Typography variant="body2" color="text.secondary">
            The page hit an unexpected error. Reloading usually clears it.
          </Typography>

          {process.env.NODE_ENV !== 'production' && (
            <Box
              component="pre"
              sx={{
                width: '100%',
                textAlign: 'left',
                p: 2,
                borderRadius: 2,
                bgcolor: 'action.hover',
                fontSize: 12,
                overflow: 'auto',
                maxHeight: 220,
              }}
            >
              {error.stack ?? error.message}
            </Box>
          )}

          <Button variant="contained" onClick={this.handleReload}>
            Back to safety
          </Button>
        </Stack>
      </Container>
    );
  }
}
