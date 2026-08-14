/**
 * Design tokens — the single source of truth for colour, type, spacing and
 * elevation.
 *
 * Every value the UI renders comes from here via the MUI theme. Nothing in a
 * component should contain a raw hex code, so dark mode, contrast tweaks and
 * rebrands are one-file changes rather than a search-and-replace across forty
 * `sx` props.
 */

export const brand = {
  /** Signature gradient: avatar rings, the auth panel, primary emphasis. */
  gradient: 'linear-gradient(135deg, #FEC163 0%, #F5576C 45%, #8B5CF6 100%)',
  gradientSubtle: 'linear-gradient(135deg, rgba(245,87,108,0.12) 0%, rgba(139,92,246,0.12) 100%)',
  rose: '#E1306C',
  violet: '#7C3AED',
  amber: '#F59E0B',
} as const;

/**
 * A single neutral ramp used by both modes — light reads it forwards, dark
 * reads it backwards. One ramp keeps the two themes visually related instead
 * of drifting into two unrelated palettes.
 */
export const neutral = {
  0: '#FFFFFF',
  25: '#FCFCFD',
  50: '#F8F9FB',
  100: '#F1F3F6',
  200: '#E4E7EC',
  300: '#D0D5DD',
  400: '#98A2B3',
  500: '#667085',
  600: '#475467',
  700: '#344054',
  800: '#1D2433',
  900: '#131A26',
  950: '#0B0F17',
  1000: '#06080D',
} as const;

export const semantic = {
  like: '#F43F5E',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
} as const;

/**
 * System font stack. Deliberately no webfont: the first paint of a feed should
 * not wait on a font download, and every target platform already ships a
 * high-quality UI face.
 */
export const fontStack = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  '"Noto Sans"',
  'sans-serif',
  '"Apple Color Emoji"',
  '"Segoe UI Emoji"',
].join(',');

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/**
 * Layout constants shared between the shell and the pages it wraps, so the
 * content column and the sidebar cannot disagree about how wide the sidebar is.
 */
export const layout = {
  sidebarWidth: 248,
  sidebarRailWidth: 76,
  contentMaxWidth: 618,
  mobileNavHeight: 56,
  topBarHeight: 56,
} as const;
