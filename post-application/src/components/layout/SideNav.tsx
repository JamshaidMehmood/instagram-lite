import {
  Badge,
  Box,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import { Link, useLocation } from 'react-router-dom';

import { useGetUnreadCountQuery } from '../../api/apiSlice';
import type { CurrentUser } from '../../api/types';
import { useColorMode } from '../../theme/ColorModeProvider';
import { layout } from '../../theme/tokens';
import { UserAvatar } from '../UserAvatar';
import { BrandMark } from './BrandMark';
import { buildNavItems } from './navItems';

interface SideNavProps {
  user: CurrentUser;
  /** Icon-only rail for medium screens, where a full sidebar crowds the feed. */
  compact: boolean;
  onSignOut: () => void;
}

export function SideNav({ user, compact, onSignOut }: SideNavProps) {
  const { pathname } = useLocation();
  const { mode, toggle } = useColorMode();
  const items = buildNavItems(user.username);

  // A minute, not something tighter: this is ambient information the user is
  // not waiting on, the query is subscribed for the whole session in every open
  // tab, and anyone actually expecting a notification opens Activity — which
  // fetches the list first-hand and clears the badge anyway. Seconds-scale
  // polling would multiply requests all day to watch a number that moves a
  // handful of times.
  const { data: unread } = useGetUnreadCountQuery(undefined, { pollingInterval: 60_000 });
  const unreadCount = unread?.data.count ?? 0;

  const width = compact ? layout.sidebarRailWidth : layout.sidebarWidth;

  const renderItem = (item: ReturnType<typeof buildNavItems>[number]) => {
    // `/` must match exactly or every route would light up Home.
    const active = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
    const Icon = active ? item.activeIcon : item.icon;

    // Matched on the destination rather than the item's position: the order of
    // `buildNavItems` belongs to that module and is free to change.
    const icon =
      item.to === '/activity' ? (
        // No `showZero`, so a count of zero renders the bare icon.
        <Badge badgeContent={unreadCount} color="primary" overlap="circular">
          <Icon />
        </Badge>
      ) : (
        <Icon />
      );

    const button = (
      <ListItemButton
        key={item.to}
        component={Link}
        to={item.to}
        sx={{
          px: compact ? 1.5 : 2,
          py: 1.25,
          mb: 0.5,
          justifyContent: compact ? 'center' : 'flex-start',
          color: active ? 'text.primary' : 'text.secondary',
        }}
      >
        <ListItemIcon sx={{ minWidth: compact ? 0 : 40, color: 'inherit' }}>{icon}</ListItemIcon>
        {!compact && (
          <ListItemText
            primary={item.label}
            primaryTypographyProps={{ fontWeight: active ? 700 : 500, fontSize: '0.95rem' }}
          />
        )}
      </ListItemButton>
    );

    return compact ? (
      <Tooltip key={item.to} title={item.label} placement="right">
        {button}
      </Tooltip>
    ) : (
      button
    );
  };

  return (
    <Box
      component="nav"
      aria-label="Main navigation"
      sx={{
        width,
        flexShrink: 0,
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        borderRight: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        px: compact ? 1 : 1.5,
        py: 2.5,
        zIndex: (theme) => theme.zIndex.appBar,
      }}
    >
      <Box sx={{ px: compact ? 0.5 : 1, mb: 3, display: 'flex', justifyContent: compact ? 'center' : 'flex-start' }}>
        <BrandMark compact={compact} />
      </Box>

      <List sx={{ flexGrow: 1 }}>{items.map(renderItem)}</List>

      <Divider sx={{ my: 1.5 }} />

      <Stack spacing={0.5}>
        <Tooltip title={compact ? `Switch to ${mode === 'dark' ? 'light' : 'dark'} mode` : ''} placement="right">
          <ListItemButton onClick={toggle} sx={{ px: compact ? 1.5 : 2, justifyContent: compact ? 'center' : 'flex-start' }}>
            <ListItemIcon sx={{ minWidth: compact ? 0 : 40, color: 'text.secondary' }}>
              {mode === 'dark' ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
            </ListItemIcon>
            {!compact && (
              <ListItemText
                primary={mode === 'dark' ? 'Light mode' : 'Dark mode'}
                primaryTypographyProps={{ fontSize: '0.95rem' }}
              />
            )}
          </ListItemButton>
        </Tooltip>

        <Tooltip title={compact ? 'Sign out' : ''} placement="right">
          <ListItemButton onClick={onSignOut} sx={{ px: compact ? 1.5 : 2, justifyContent: compact ? 'center' : 'flex-start' }}>
            <ListItemIcon sx={{ minWidth: compact ? 0 : 40, color: 'text.secondary' }}>
              <LogoutIcon />
            </ListItemIcon>
            {!compact && (
              <ListItemText primary="Sign out" primaryTypographyProps={{ fontSize: '0.95rem' }} />
            )}
          </ListItemButton>
        </Tooltip>

        {!compact && (
          <Stack direction="row" spacing={1.25} alignItems="center" sx={{ px: 2, pt: 1.5, minWidth: 0 }}>
            <UserAvatar user={user} size={34} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" noWrap>
                {user.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                @{user.username}
              </Typography>
            </Box>
          </Stack>
        )}
      </Stack>
    </Box>
  );
}
