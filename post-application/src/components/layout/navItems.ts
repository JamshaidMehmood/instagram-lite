import AddBoxOutlinedIcon from '@mui/icons-material/AddBoxOutlined';
import AddBoxIcon from '@mui/icons-material/AddBox';
import ExploreOutlinedIcon from '@mui/icons-material/ExploreOutlined';
import ExploreIcon from '@mui/icons-material/Explore';
import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import FavoriteIcon from '@mui/icons-material/Favorite';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import HomeIcon from '@mui/icons-material/Home';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import PersonIcon from '@mui/icons-material/Person';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import SearchIcon from '@mui/icons-material/Search';
import type { SvgIconComponent } from '@mui/icons-material';

export interface NavItem {
  label: string;
  to: string;
  icon: SvgIconComponent;
  /** Filled variant for the active route — the standard social-app cue. */
  activeIcon: SvgIconComponent;
}

/**
 * Shared by the desktop sidebar and the mobile bottom bar so the two can never
 * drift out of sync.
 */
export function buildNavItems(username: string | undefined): NavItem[] {
  return [
    { label: 'Home', to: '/', icon: HomeOutlinedIcon, activeIcon: HomeIcon },
    { label: 'Explore', to: '/explore', icon: ExploreOutlinedIcon, activeIcon: ExploreIcon },
    { label: 'Search', to: '/search', icon: SearchOutlinedIcon, activeIcon: SearchIcon },
    { label: 'Create', to: '/create', icon: AddBoxOutlinedIcon, activeIcon: AddBoxIcon },
    // Discovery (Explore, Search) sits before creation, and Activity after it,
    // so the order runs look -> post -> react rather than interleaving them.
    {
      label: 'Activity',
      to: '/activity',
      icon: FavoriteBorderOutlinedIcon,
      activeIcon: FavoriteIcon,
    },
    {
      label: 'Profile',
      to: username ? `/u/${username}` : '/signin',
      icon: PersonOutlineIcon,
      activeIcon: PersonIcon,
    },
  ];
}
