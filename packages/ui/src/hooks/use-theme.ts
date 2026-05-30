'use client';

import * as React from 'react';

// Light/dark theme persisted to localStorage per device. The initial
// document attribute is set by the inline theme-init script (rendered by
// each app in its root layout) before React hydrates, so there's no FOUC.
// This hook just keeps client-side state in sync with the DOM attribute
// and lets components toggle.

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'sparx:theme';

function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'dark' ? 'dark' : 'light';
}

function applyTheme(next: Theme) {
  document.documentElement.setAttribute('data-theme', next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // localStorage can throw in private mode / SSR / disabled storage —
    // silently skip persistence; the in-memory attribute still updates.
  }
}

export function useTheme(): {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
} {
  // useSyncExternalStore would be purer here, but for a once-per-app value
  // a useEffect read is plenty.
  const [theme, setThemeState] = React.useState<Theme>('light');

  React.useEffect(() => {
    setThemeState(readTheme());
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme(readTheme() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}

// Inline script body emitted before React hydration to set the initial
// `data-theme` attribute. Apps include this in their root layout via a
// `<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}>` so
// the document is themed before paint.
//
// The script:
//   1. Reads the saved theme from localStorage.
//   2. Validates it ('light' | 'dark').
//   3. Falls back to 'light' if nothing is saved.
//   4. Writes `data-theme` on <html>.
//
// We do NOT honor `prefers-color-scheme` — per docs/24 §7, theme is
// explicit and per-device; no system-pref auto-follow.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark')t='light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
