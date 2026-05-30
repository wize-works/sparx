'use client';

import * as React from 'react';

// Matches a CSS media query and returns whether it currently matches.
// SSR-safe — defaults to `false` until first client mount, then syncs.
// Re-renders on viewport changes.

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
