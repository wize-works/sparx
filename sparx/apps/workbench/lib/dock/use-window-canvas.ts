'use client';

// The workspace is a CANVAS, and it is bigger than the screen.
//
// Windows mode is a desk, and a desk does not stop at the edge of what you can
// see: you should be able to shove a window aside, out of the way, and get back
// to it by scrolling. dockview clamps a floating group to its container, so the
// container is what has to be big — and it is, permanently, at a fixed size no
// interaction ever changes.
//
// Three layers, and which one does what matters:
//
//   FRAME   the scrolling element. Fixed to the screen. The app rail sits
//           outside it, which is what stops a window ever reaching the
//           navigation — there is no coordinate a window can hold that is not
//           somewhere in here.
//   CLIP    sized to exactly what the windows occupy, so it alone decides how
//           far the frame scrolls. Bigger than the frame ⇒ scrollbars; back
//           inside ⇒ none. `overflow-clip` keeps the canvas behind it from
//           contributing any scroll of its own.
//   CANVAS  what dockview is sized to, and the space it positions windows in.
//           A CONSTANT in windows mode.
//
// The constant is the point. Resizing dockview's container looks like the
// obvious way to grow the workspace and is a trap: `Overlay.setBounds` anchors
// each window to whichever edge it is CLOSER to, so every window in the right
// half slides whenever that container resizes. Growing mid-drag tows the others
// along and their new positions grow it again — a runaway — and shrinking
// afterwards yanks them back. Sizing the CLIP instead moves nothing, because no
// window is positioned against it.
//
// It also means a saved arrangement restores intact: a window at x=2600 would
// have been clamped back on load by a screen-sized container.

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { FloatViewport } from '../window-placement';
import type { ZoomLevel } from '../window-zoom';
import { installCanvasGestures } from './canvas-gestures';

/** Every floating window dockview has placed on the canvas. */
function windowsOn(canvas: HTMLElement): HTMLElement[] {
  return [...canvas.querySelectorAll<HTMLElement>('.dv-resize-container')];
}

/** How far right and how far down the windows actually reach. */
function extentOf(canvas: HTMLElement): { width: number; height: number } {
  const base = canvas.getBoundingClientRect();
  let width = 0;
  let height = 0;
  for (const element of windowsOn(canvas)) {
    const box = element.getBoundingClientRect();
    width = Math.max(width, box.right - base.left);
    height = Math.max(height, box.bottom - base.top);
  }
  return { width, height };
}

export interface WindowCanvasHandle {
  frameRef: RefObject<HTMLDivElement | null>;
  clipRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  /** What is on screen, for placing new windows where somebody is looking. */
  readViewport: () => FloatViewport;
  /** Settle the scroll extent to what the windows occupy. Safe to call often. */
  fit: () => void;
}

export interface WindowCanvasOptions {
  zoom: ZoomLevel;
  /** A window drag finished — see `CanvasGestureOptions.onDragEnd`. */
  onDragEnd: (moved: HTMLElement | null) => void;
  onZoomStep: (direction: 1 | -1) => void;
}

export function useWindowCanvas({
  zoom,
  onDragEnd,
  onZoomStep,
}: WindowCanvasOptions): WindowCanvasHandle {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const clipRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // Sampled, not depended on: `readViewport` has to keep one identity or every
  // callback built on it rebuilds each time somebody zooms.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const dragEndRef = useRef(onDragEnd);
  dragEndRef.current = onDragEnd;
  const zoomStepRef = useRef(onZoomStep);
  zoomStepRef.current = onZoomStep;

  const size = useCallback((mayShrink: boolean) => {
    const frame = frameRef.current;
    const clip = clipRef.current;
    const canvas = canvasRef.current;
    if (!frame || !clip || !canvas) return;

    const extent = extentOf(canvas);
    // `clientWidth` already excludes a scrollbar that has appeared, so a
    // vertical one cannot conjure a horizontal one.
    let width = Math.max(frame.clientWidth, Math.ceil(extent.width));
    let height = Math.max(frame.clientHeight, Math.ceil(extent.height));
    if (!mayShrink) {
      // Mid-drag the extent only ever leads the window. Shrinking then would
      // claw back scroll the browser has to clamp, which reads as a jolt.
      width = Math.max(width, clip.clientWidth);
      height = Math.max(height, clip.clientHeight);
    }

    const next = { width: `${width}px`, height: `${height}px` };
    // Only on a real change — a resize observer watches the frame, and
    // re-asserting the same pixel value is a cheap way to make it chatter.
    if (clip.style.width !== next.width) clip.style.width = next.width;
    if (clip.style.height !== next.height) clip.style.height = next.height;
  }, []);

  const fit = useCallback(() => {
    size(true);
  }, [size]);

  const readViewport = useCallback((): FloatViewport => {
    const frame = frameRef.current;
    if (!frame) return { width: 0, height: 0, scrollLeft: 0, scrollTop: 0, zoom: zoomRef.current };
    return {
      width: frame.clientWidth,
      height: frame.clientHeight,
      scrollLeft: frame.scrollLeft,
      scrollTop: frame.scrollTop,
      zoom: zoomRef.current,
    };
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const release = installCanvasGestures({
      frame,
      // Bare ground is these elements THEMSELVES — anything deeper belongs to
      // dockview, and a gutter in tabs mode is a sash, not a place to grab.
      isGround: (target) =>
        target === frame || target === clipRef.current || target === canvasRef.current,
      onWindowDrag: () => {
        size(false);
      },
      onDragEnd: (moved) => {
        // Settles to what the windows occupy, which is what turns the scrollbars
        // on — or off again, if everything came back inside.
        size(true);
        dragEndRef.current(moved);
      },
      onZoomStep: (direction) => {
        zoomStepRef.current(direction);
      },
    });

    // The screen itself changing — a browser resize, the rail's panel opening —
    // re-floors the extent, which is how a workspace that now fits loses its
    // scrollbars again.
    const observer = new ResizeObserver(() => {
      size(true);
    });
    observer.observe(frame);
    size(true);

    return () => {
      release();
      observer.disconnect();
    };
  }, [size]);

  return { frameRef, clipRef, canvasRef, readViewport, fit };
}
