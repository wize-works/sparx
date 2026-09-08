'use client';

// Where you were looking, remembered.
//
// The canvas can be wider than the screen, so "the top-left corner" and "where
// your work is" stopped being the same place. Without this, a reload of a
// spread-out arrangement lands you on empty ground with everything off to the
// right — which reads as having lost the lot.
//
// Kept out of the layout format on purpose: a scroll position is per-device, has
// no bearing on what is open, and is not worth a schema version.

import { useEffect, type RefObject } from 'react';
import type { WindowMode } from '../window-mode';

const KEY = 'piggles-console-scroll';
/** Scrolling fires continuously; one write when it settles is plenty. */
const SAVE_DEBOUNCE_MS = 250;

interface Scroll {
  left: number;
  top: number;
}

function read(siteKey: string): Scroll | null {
  try {
    const raw = localStorage.getItem(`${KEY}:${siteKey}`);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { left, top } = value as Partial<Scroll>;
    if (typeof left !== 'number' || typeof top !== 'number') return null;
    return { left, top };
  } catch {
    return null;
  }
}

function write(siteKey: string, scroll: Scroll): void {
  try {
    localStorage.setItem(`${KEY}:${siteKey}`, JSON.stringify(scroll));
  } catch {
    // Storage blocked. The workspace still scrolls; it just forgets.
  }
}

/**
 * Restore on arrival, and record as you go.
 *
 * WINDOWS ONLY. Tabs mode tiles into the screen and never scrolls, so there is
 * nothing to remember — and writing its permanent 0,0 over a windows position
 * would lose the real one the moment somebody flipped presentations.
 *
 * The restore leans on hook ORDER: `useWindowCanvas` runs first and sizes the
 * scroll extent from the windows the dock has already restored, so by the time
 * this effect runs there is something to scroll to. Do it earlier and the
 * browser clamps every position to zero.
 */
export function useCanvasScroll(
  frame: RefObject<HTMLElement | null>,
  siteKey: string,
  mode: WindowMode | null
): void {
  useEffect(() => {
    const element = frame.current;
    if (!element || mode !== 'windows') return;

    const stored = read(siteKey);
    if (stored) {
      element.scrollLeft = stored.left;
      element.scrollTop = stored.top;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        write(siteKey, { left: element.scrollLeft, top: element.scrollTop });
      }, SAVE_DEBOUNCE_MS);
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      element.removeEventListener('scroll', onScroll);
    };
  }, [frame, mode, siteKey]);
}
