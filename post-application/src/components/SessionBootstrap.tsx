import { Box, CircularProgress } from '@mui/material';
import { useEffect, useRef, type ReactNode } from 'react';

import { useRefreshSessionMutation } from '../api/apiSlice';
import { sessionEstablished, signedOut } from '../store/authSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { BrandMark } from './layout/BrandMark';

/**
 * Restores the session before the router is allowed to make a decision.
 *
 * The access token lives in memory, so a page reload starts with nothing. One
 * `POST /auth/refresh` exchanges the httpOnly cookie for a fresh token. Until
 * that resolves the app renders a splash — otherwise the router would see
 * "no user", redirect to sign-in, and only then learn the session was valid.
 */
export function SessionBootstrap({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const status = useAppSelector((state) => state.auth.status);
  const [refreshSession] = useRefreshSessionMutation();
  // StrictMode double-invokes effects in development; refreshing twice would
  // rotate the token twice and trip the server's reuse detection.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    refreshSession()
      .unwrap()
      .then((response) => dispatch(sessionEstablished(response.data)))
      .catch(() => dispatch(signedOut())); // no cookie, or it expired
  }, [dispatch, refreshSession]);

  if (status === 'bootstrapping') {
    return (
      <Box
        sx={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          gap: 3,
          bgcolor: 'background.default',
        }}
      >
        <Box sx={{ display: 'grid', placeItems: 'center', gap: 3 }}>
          <BrandMark />
          <CircularProgress size={22} thickness={5} />
        </Box>
      </Box>
    );
  }

  return <>{children}</>;
}
