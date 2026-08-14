import { Box, useMediaQuery, useTheme } from '@mui/material';
import { Outlet, useNavigate } from 'react-router-dom';

import { useLogoutMutation } from '../../api/apiSlice';
import { signedOut } from '../../store/authSlice';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { layout } from '../../theme/tokens';
import { useToast } from '../ToastProvider';
import { MobileNav } from './MobileNav';
import { SideNav } from './SideNav';

/**
 * The persistent chrome around every signed-in route.
 *
 * Renders an `<Outlet />`, which is the fix for the original bug: the old
 * drawer was mounted as a *sibling* of `<Routes>` and given no children, so
 * the layout wrapper it defined never actually wrapped any page.
 */
export function AppShell() {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const user = useAppSelector((state) => state.auth.user);
  const [logout] = useLogoutMutation();

  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  // Between sm and lg the full sidebar would squeeze the feed column, so it
  // collapses to an icon rail rather than disappearing entirely.
  const isCompact = useMediaQuery(theme.breakpoints.between('sm', 'lg'));

  if (!user) return null; // ProtectedRoute guarantees this; satisfies the type.

  const handleSignOut = async () => {
    try {
      await logout().unwrap();
    } catch {
      // The local session is cleared regardless — a failed server-side
      // revocation must not strand the user in a signed-in-looking UI.
    }
    // Clearing the query cache is handled by a middleware watching for
    // `signedOut`, so every route out of a session gets it, not just this one.
    dispatch(signedOut());
    showToast('Signed out', 'success');
    navigate('/signin', { replace: true });
  };

  const sidebarWidth = isCompact ? layout.sidebarRailWidth : layout.sidebarWidth;

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      {isMobile ? (
        <MobileNav user={user} onSignOut={handleSignOut} />
      ) : (
        <SideNav user={user} compact={isCompact} onSignOut={handleSignOut} />
      )}

      <Box
        component="main"
        sx={{
          // Offsets match the fixed chrome exactly, so no content hides behind
          // the sidebar or the bottom bar.
          ml: isMobile ? 0 : `${sidebarWidth}px`,
          pt: isMobile ? `${layout.topBarHeight}px` : 0,
          pb: isMobile ? `calc(${layout.mobileNavHeight}px + env(safe-area-inset-bottom))` : 0,
          minHeight: '100dvh',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
