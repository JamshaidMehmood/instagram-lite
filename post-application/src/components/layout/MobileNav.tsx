import { AppBar, Badge, Box, IconButton, Paper, Stack, Toolbar } from '@mui/material';
import BottomNavigation from '@mui/material/BottomNavigation';
import BottomNavigationAction from '@mui/material/BottomNavigationAction';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useGetUnreadCountQuery } from '../../api/apiSlice';
import type { CurrentUser } from '../../api/types';
import { useColorMode } from '../../theme/ColorModeProvider';
import { layout } from '../../theme/tokens';
import { BrandMark } from './BrandMark';
import { buildNavItems } from './navItems';

interface MobileNavProps {
  user: CurrentUser;
  onSignOut: () => void;
}

/**
 * Phone layout: a translucent top bar for branding and account actions, and a
 * thumb-reachable bottom bar for navigation — where a hand actually rests,
 * rather than behind a hamburger menu.
 */
export function MobileNav({ user, onSignOut }: MobileNavProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { mode, toggle } = useColorMode();
  const items = buildNavItems(user.username);

  // A minute, not something tighter: this is ambient information the user is
  // not waiting on, the query is subscribed for as long as the app is open, and
  // anyone actually expecting a notification taps Activity — which fetches the
  // list first-hand and clears the badge anyway. On a phone the case against
  // seconds-scale polling is stronger still: it is someone's battery and
  // metered data being spent to watch a number that moves a handful of times.
  const { data: unread } = useGetUnreadCountQuery(undefined, { pollingInterval: 60_000 });
  const unreadCount = unread?.data.count ?? 0;

  const activeIndex = items.findIndex((item) =>
    item.to === '/' ? pathname === '/' : pathname.startsWith(item.to),
  );

  return (
    <>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          bgcolor: (theme) => `${theme.palette.background.paper}cc`,
          // Frosted bar: content scrolling underneath stays faintly visible,
          // which keeps the page feeling continuous instead of clipped.
          backdropFilter: 'blur(12px)',
          borderBottom: 1,
          borderColor: 'divider',
          color: 'text.primary',
        }}
      >
        <Toolbar sx={{ minHeight: layout.topBarHeight, px: 2 }}>
          <BrandMark />
          <Box sx={{ flexGrow: 1 }} />
          <Stack direction="row" spacing={0.5}>
            <IconButton onClick={toggle} aria-label="Toggle colour mode" size="small">
              {mode === 'dark' ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
            </IconButton>
            <IconButton onClick={onSignOut} aria-label="Sign out" size="small">
              <LogoutIcon />
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>

      <Paper
        elevation={0}
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          borderTop: 1,
          borderColor: 'divider',
          zIndex: (theme) => theme.zIndex.appBar,
          // Keeps the bar clear of the iOS home indicator.
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        <BottomNavigation
          value={activeIndex === -1 ? false : activeIndex}
          onChange={(_event, index: number) => navigate(items[index].to)}
          sx={{ height: layout.mobileNavHeight, bgcolor: 'transparent' }}
        >
          {items.map((item, index) => {
            const Icon = index === activeIndex ? item.activeIcon : item.icon;
            return (
              <BottomNavigationAction
                key={item.to}
                label={item.label}
                icon={
                  // Matched on the destination rather than the index this map
                  // already has to hand: the order of `buildNavItems` belongs to
                  // that module and is free to change.
                  item.to === '/activity' ? (
                    // No `showZero`, so a count of zero renders the bare icon.
                    <Badge badgeContent={unreadCount} color="primary" overlap="circular">
                      <Icon />
                    </Badge>
                  ) : (
                    <Icon />
                  )
                }
                component={Link}
                to={item.to}
                sx={{ minWidth: 0 }}
              />
            );
          })}
        </BottomNavigation>
      </Paper>
    </>
  );
}
