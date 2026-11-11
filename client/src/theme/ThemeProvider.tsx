import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { safeGet, safeSet } from '../lib/storage';

export type Theme = 'light' | 'dark' | 'eyecare';
const KEY = 'speaksafe.theme';

function initialTheme(): Theme {
  const saved = safeGet(KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'eyecare') return saved;
  // First visit follows the device setting (FR-41).
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'light',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    safeSet(KEY, t);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
