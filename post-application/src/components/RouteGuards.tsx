import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAppSelector } from '../store/hooks';

/**
 * Blocks anonymous callers and remembers where they were headed, so signing in
 * returns them to the page they asked for instead of dumping them on the feed.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAppSelector((state) => state.auth.status);
  const location = useLocation();

  if (status !== 'authenticated') {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

/**
 * The mirror image: keeps a signed-in user off the sign-in and sign-up pages.
 *
 * It has to honour the same `from` state `RequireAuth` set, because it races
 * the sign-in page for the redirect and wins. `sessionEstablished` flips
 * `status` in the same tick the form dispatches it, so this guard re-renders
 * and navigates before the page's own `navigate(from)` runs — sending anyone
 * who followed a deep link to the feed instead of the page they asked for.
 * Reading `from` here makes the race harmless: both routes lead to the same
 * place.
 */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const status = useAppSelector((state) => state.auth.status);
  const location = useLocation();

  if (status === 'authenticated') {
    const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
    return <Navigate to={from ?? '/'} replace />;
  }

  return <>{children}</>;
}
