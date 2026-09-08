'use client';

// Is this element narrow enough that its toolbar has to collapse?
//
// A viewport query is the wrong instrument: the same 420px toolbar happens on a
// phone AND in a pane docked beside an editor on a 27" monitor. Only the pane's
// own width answers it. `useIsCompact` stays what it is — a device question,
// dock-vs-stack — and does not apply here.
//
// WHY THIS IS SAFE FROM THE OSCILLATION TRAP. Measuring an element and then
// changing what is inside it is how a responsive toolbar starts flickering:
// collapse because it overflows, and now it fits, so expand, so it overflows.
// (Silica's own scrollable TabsList hits the same shape and solves it the same
// way.) This is immune because the element it measures is `w-full` inside
// PANE_SHELL, so its width is set by the PANE, not by its own contents —
// changing the children cannot change the measurement.

import { useEffect, useState, type RefObject } from 'react';

/** Below this pane width the toolbar cannot hold filters inline and stay honest. */
export const TOOLBAR_COLLAPSE_PX = 672;

/**
 * True once the element has been measured and is under `threshold`.
 *
 * Starts false, like `useIsCompact` starts "desktop": the first paint has no
 * measurement, and guessing "narrow" would flash a collapsed toolbar onto every
 * wide pane in the app.
 */
export function useNarrowContainer(
  ref: RefObject<HTMLElement | null>,
  threshold: number = TOOLBAR_COLLAPSE_PX
): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === 'number' && width > 0) setNarrow(width < threshold);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref, threshold]);

  return narrow;
}
