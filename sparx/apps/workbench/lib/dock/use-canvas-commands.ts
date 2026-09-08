'use client';

// What the canvas tools do: tidy the windows up, and change how much of the
// workspace fits on screen. Both act on every window at once, and both go
// through `addFloatingGroup` — dockview's only public reposition.

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { DockviewApi } from 'dockview';
import { arrangeWindows, type ArrangeStyle } from '../window-arrange';
import { rescaleWindows, type ZoomLevel } from '../window-zoom';
import {
  boxOf,
  floatingGroups,
  sameBox,
  snapBox,
  type FloatBox,
  type FloatViewport,
} from '../window-placement';

export interface CanvasCommandOptions {
  api: RefObject<DockviewApi | null>;
  canvas: RefObject<HTMLElement | null>;
  readViewport: () => FloatViewport;
  zoom: ZoomLevel;
  /** Re-floor the scroll extent once the windows have moved. */
  fit: () => void;
  /** Each window's box at 100%, so zooming out and back is exact. */
  bases: RefObject<Map<string, FloatBox>>;
  /** Drop those memos — anything that moves a window makes them stale. */
  forget: () => void;
}

export interface CanvasCommands {
  arrange: (style: ArrangeStyle) => void;
  /** Runs when a window drag finishes — see `WindowCanvasOptions.onDragEnd`. */
  dragEnded: (moved: HTMLElement | null) => void;
}

export function useCanvasCommands({
  api,
  canvas,
  readViewport,
  zoom,
  fit,
  bases,
  forget,
}: CanvasCommandOptions): CanvasCommands {
  // The zoom ON SCREEN. The FIRST value is deliberately not applied: the layout
  // was saved at that zoom, so the boxes it restored are already the right size.
  const applied = useRef<ZoomLevel>(zoom);
  useEffect(() => {
    const dock = api.current;
    if (!dock || applied.current === zoom) return;
    const previous = applied.current;
    applied.current = zoom;
    rescaleWindows(dock, previous, zoom, canvas.current, bases.current);
    fit();
  }, [api, bases, canvas, fit, zoom]);

  const arrange = useCallback(
    (style: ArrangeStyle) => {
      const dock = api.current;
      if (!dock) return;
      arrangeWindows(dock, style, readViewport(), canvas.current);
      forget();
    },
    [api, canvas, forget, readViewport]
  );

  const dragEnded = useCallback(
    (moved: HTMLElement | null) => {
      // Somebody has had a say about where a window goes, so the zoom's memo of
      // its 100% box is out of date whatever else happens here.
      forget();

      const dock = api.current;
      const ground = canvas.current;
      if (!moved || !dock || !ground) return;

      const groups = floatingGroups(dock);
      const dragged = groups.find((group) => moved.contains(group.element));
      if (!dragged) return;

      const box = boxOf(dragged, ground);
      const snapped = snapBox(
        box,
        groups.filter((group) => group !== dragged).map((group) => boxOf(group, ground)),
        readViewport()
      );
      if (sameBox(box, snapped)) return;
      dock.addFloatingGroup(dragged, snapped);
      fit();
    },
    [api, canvas, fit, forget, readViewport]
  );

  return { arrange, dragEnded };
}
