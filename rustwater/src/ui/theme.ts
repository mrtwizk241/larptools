import { useCallback, useSyncExternalStore } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'rw.theme';

const listeners = new Set<() => void>();

function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** Saved choice, or 'system' when nothing valid is saved or storage is blocked. */
export function readStoredTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

/** Sets html[data-theme]. 'system' removes it so tokens.css follows prefers-color-scheme. */
export function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

let current: ThemeChoice = typeof window === 'undefined' ? 'system' : readStoredTheme();

export function setTheme(theme: ThemeChoice): void {
  current = theme;
  try {
    if (theme === 'system') {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Storage blocked (private mode): the choice still applies for this session.
  }
  applyTheme(theme);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ThemeChoice {
  return current;
}

/** Current theme choice and a setter. Every component using it stays in sync. */
export function useTheme(): { theme: ThemeChoice; setTheme: (theme: ThemeChoice) => void } {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const set = useCallback((next: ThemeChoice) => setTheme(next), []);
  return { theme, setTheme: set };
}
