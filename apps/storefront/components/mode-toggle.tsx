'use client';

// Light/dark mode toggle — rendered only when the merchant's appearancePolicy
// is `toggle`. Flips `data-theme` on <html> and persists the choice in a cookie
// so SSR resolves the same mode on the next request (no flash). The cookie is
// read by the layout's no-flash inline script (see app/layout.tsx).

import { useEffect, useState } from 'react';

const COOKIE = 'sparx_theme';

function readCookie(): 'light' | 'dark' | null {
  const m = /(?:^|;\s*)sparx_theme=(light|dark)/.exec(document.cookie);
  return m ? (m[1] as 'light' | 'dark') : null;
}

export function ModeToggle({ initial }: { initial: 'light' | 'dark' }) {
  const [mode, setMode] = useState<'light' | 'dark'>(initial);

  // Sync to whatever the no-flash script already resolved (cookie wins).
  useEffect(() => {
    const fromCookie = readCookie();
    const current =
      (document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null) ??
      fromCookie;
    if (current && current !== mode) setMode(current);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    document.documentElement.setAttribute('data-theme', next);
    // 1-year cookie; Lax so it rides top-level navigations.
    document.cookie = `${COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  const next = mode === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="sf-iconbtn"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
