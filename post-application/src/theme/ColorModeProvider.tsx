import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import type { PaletteMode } from '@mui/material';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { createAppTheme } from '.';

type Preference = PaletteMode | 'system';

interface ColorModeContextValue {
  mode: PaletteMode;
  preference: Preference;
  setPreference: (preference: Preference) => void;
  toggle: () => void;
}

const ColorModeContext = createContext<ColorModeContextValue | null>(null);
const STORAGE_KEY = 'ig-color-mode';

function readStoredPreference(): Preference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Private browsing can throw on localStorage access.
    return 'system';
  }
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<Preference>(readStoredPreference);
  // Defaults to the OS setting and keeps following it until the user opts out.
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  const mode: PaletteMode = preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;

  const setPreference = useCallback((next: Preference) => {
    setPreferenceState(next);
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persistence is a nicety; the session still works without it.
    }
  }, []);

  const toggle = useCallback(() => {
    setPreference(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setPreference]);

  // Keeps the browser's own UI (form controls, scrollbars) in step with ours.
  useEffect(() => {
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  // Rebuilding the theme is not cheap, and it feeds every styled component —
  // memoising on `mode` keeps a re-render of a parent from re-theming the app.
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const value = useMemo(
    () => ({ mode, preference, setPreference, toggle }),
    [mode, preference, setPreference, toggle],
  );

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeContextValue {
  const context = useContext(ColorModeContext);
  if (!context) throw new Error('useColorMode must be used inside <ColorModeProvider>');
  return context;
}
