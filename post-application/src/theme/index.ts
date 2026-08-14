import { alpha, createTheme, type PaletteMode, type Theme } from '@mui/material/styles';

import { brand, fontStack, neutral, radii, semantic } from './tokens';

/**
 * Two brand values live on the palette so components can read them from the
 * theme instead of importing tokens directly — which keeps them mode-aware.
 */
declare module '@mui/material/styles' {
  interface Palette {
    gradient: string;
    like: string;
  }
  interface PaletteOptions {
    gradient?: string;
    like?: string;
  }
}

function buildPalette(mode: PaletteMode) {
  const isLight = mode === 'light';

  return {
    mode,
    gradient: brand.gradient,
    like: semantic.like,
    primary: {
      main: isLight ? brand.rose : '#FF5C8A',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: isLight ? brand.violet : '#A78BFA',
      contrastText: '#FFFFFF',
    },
    error: { main: semantic.error },
    warning: { main: semantic.warning },
    success: { main: semantic.success },
    info: { main: semantic.info },
    background: {
      // Not pure black in dark mode: an OLED-black canvas next to a dark-grey
      // card reads as a rendering artefact, and pure black kills the sense of
      // elevation the cards rely on.
      default: isLight ? neutral[50] : neutral[1000],
      paper: isLight ? neutral[0] : neutral[950],
    },
    text: {
      primary: isLight ? neutral[900] : neutral[50],
      secondary: isLight ? neutral[500] : neutral[400],
      disabled: isLight ? neutral[400] : neutral[600],
    },
    divider: isLight ? neutral[200] : alpha(neutral[300], 0.12),
    action: {
      hover: isLight ? alpha(neutral[900], 0.04) : alpha(neutral[0], 0.06),
      selected: isLight ? alpha(neutral[900], 0.07) : alpha(neutral[0], 0.1),
    },
  } as const;
}

export function createAppTheme(mode: PaletteMode): Theme {
  const palette = buildPalette(mode);
  const isLight = mode === 'light';

  return createTheme({
    palette,
    shape: { borderRadius: radii.md },
    typography: {
      fontFamily: fontStack,
      // Negative tracking on large text is what makes a system font stack look
      // deliberate rather than default.
      h1: { fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 },
      h2: { fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.15 },
      h3: { fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' },
      h4: { fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.015em' },
      h5: { fontSize: '1.0625rem', fontWeight: 600, letterSpacing: '-0.01em' },
      h6: { fontSize: '0.9375rem', fontWeight: 600 },
      subtitle2: { fontSize: '0.875rem', fontWeight: 600 },
      body1: { fontSize: '0.9375rem', lineHeight: 1.55 },
      body2: { fontSize: '0.875rem', lineHeight: 1.5 },
      caption: { fontSize: '0.75rem', letterSpacing: '0.01em' },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
          body: { backgroundColor: palette.background.default },
          '::selection': {
            backgroundColor: alpha(palette.primary.main, 0.24),
          },
          // A slim scrollbar that matches the surface, instead of the default
          // chrome punching a light strip through a dark layout.
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: isLight ? neutral[300] : neutral[800],
            borderRadius: radii.pill,
            border: `2px solid ${palette.background.default}`,
          },
          '*::-webkit-scrollbar-thumb:hover': {
            backgroundColor: isLight ? neutral[400] : neutral[700],
          },
          // Keyboard users get a visible ring; mouse users do not. Removing
          // outlines outright is the accessibility bug this avoids.
          '*:focus-visible': {
            outline: `2px solid ${palette.primary.main}`,
            outlineOffset: 2,
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: radii.sm,
            paddingInline: 16,
            transition: 'transform 120ms ease, background-color 160ms ease, opacity 160ms ease',
            '&:active': { transform: 'scale(0.985)' },
          },
          sizeLarge: { padding: '11px 22px', fontSize: '0.9375rem' },
          sizeSmall: { padding: '4px 12px' },
          containedPrimary: {
            '&:hover': { backgroundColor: palette.primary.main, filter: 'brightness(1.08)' },
          },
          outlined: { borderColor: palette.divider },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: radii.sm,
            backgroundColor: isLight ? neutral[50] : alpha(neutral[0], 0.03),
            transition: 'background-color 160ms ease, box-shadow 160ms ease',
            '& fieldset': { borderColor: palette.divider },
            '&:hover fieldset': { borderColor: isLight ? neutral[300] : neutral[700] },
            '&.Mui-focused': {
              backgroundColor: palette.background.paper,
              boxShadow: `0 0 0 4px ${alpha(palette.primary.main, 0.12)}`,
            },
            '&.Mui-focused fieldset': { borderWidth: 1, borderColor: palette.primary.main },
          },
          input: { padding: '12px 14px' },
        },
      },
      MuiInputLabel: { styleOverrides: { root: { fontSize: '0.9375rem' } } },
      MuiFormHelperText: { styleOverrides: { root: { marginLeft: 2, fontSize: '0.75rem' } } },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: radii.lg,
            border: `1px solid ${palette.divider}`,
            backgroundImage: 'none',
          },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: radii.xl,
            border: `1px solid ${palette.divider}`,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: radii.md,
            border: `1px solid ${palette.divider}`,
            boxShadow: isLight
              ? '0 12px 32px rgba(16,24,40,0.12)'
              : '0 12px 32px rgba(0,0,0,0.55)',
          },
        },
      },
      MuiMenuItem: { styleOverrides: { root: { borderRadius: radii.sm, margin: '2px 6px' } } },
      MuiIconButton: {
        styleOverrides: {
          root: {
            transition: 'transform 140ms ease, color 140ms ease, background-color 140ms ease',
            '&:active': { transform: 'scale(0.92)' },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: radii.sm,
            fontSize: '0.75rem',
            paddingInline: 10,
            backgroundColor: isLight ? neutral[800] : neutral[700],
          },
        },
      },
      MuiSkeleton: {
        defaultProps: { animation: 'wave' },
        styleOverrides: {
          root: { backgroundColor: isLight ? neutral[100] : alpha(neutral[0], 0.06) },
        },
      },
      MuiListItemButton: { styleOverrides: { root: { borderRadius: radii.md } } },
      MuiAvatar: { styleOverrides: { root: { fontWeight: 600 } } },
      MuiChip: { styleOverrides: { root: { borderRadius: radii.sm, fontWeight: 500 } } },
      MuiDivider: { styleOverrides: { root: { borderColor: palette.divider } } },
      MuiLink: { defaultProps: { underline: 'hover' } },
    },
  });
}
