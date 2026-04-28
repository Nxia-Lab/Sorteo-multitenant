import { createContext, useContext, useEffect, useMemo } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'raffle-theme';

export function ThemeProvider({ children }) {
  const theme = 'light';

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme: () => {},
      toggleTheme: () => {},
    }),
    [],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}
