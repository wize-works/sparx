'use client';

// Zoom, without scaling anything.
//
// ── WHY IT IS NOT A TRANSFORM ───────────────────────────────────────────────
//
// The obvious implementation is `transform: scale()` on the workspace, and it
// cannot work here. dockview derives a floating window's position from
// `getBoundingClientRect()` — in `Overlay`'s CONSTRUCTOR as well as in its drag
// handlers — and then writes the result back as a local pixel value. Under any
// scaled ancestor those are two different coordinate spaces, so every path that
// places a window comes out wrong by the scale factor: restoring a saved layout,
// tearing a tab out, evicting from the grid, and all three arrange actions. Not
// one seam to patch, but a compensation layer under everything, where a single
// missed path silently puts a window somewhere else.
//
// ── WHAT IT DOES INSTEAD ────────────────────────────────────────────────────
//
// The same result, in real pixels, from two independent halves:
//
//   • Every window's BOX is scaled — position and size — through the ordinary
//     public placement call. dockview only ever sees real pixels, so there is
//     nothing to compensate for and nothing to keep compensating at the next
//     upgrade.
//   • Every pane's CONTENTS are scaled, by the `data-zoom` rules in
//     app/globals.css. dockview never measures inside a content container, so
//     this half is invisible to it.
//
// Together: more windows on screen, each showing more than it did. Identical to
// a scaled canvas, and the chrome does not shrink with it — a 44px title bar on a
// 70% window stays something you can hit, which on the small laptop this exists
// for is the difference between usable and not.

import type { DockviewApi } from 'dockview';
import { boxOf, floatingGroups, scaleBox, type FloatBox } from './window-placement';

/**
 * Stepped rather than continuous, because each step re-places every window: a
 * slider would do that once per frame, and these are the sizes anybody would
 * actually stop at.
 */
export const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;
export type ZoomLevel = (typeof ZOOM_STEPS)[number];
export const DEFAULT_ZOOM: ZoomLevel = 1;

const KEY = 'sparx-workbench-zoom';

/** What the CSS rules and the label are keyed on. */
export function zoomPercent(zoom: ZoomLevel): number {
  return Math.round(zoom * 100);
}

/** A stored or restored number, if it is one of ours. */
export function coerceZoom(value: unknown): ZoomLevel | null {
  return ZOOM_STEPS.find((step) => step === Number(value)) ?? null;
}

export function readZoom(): ZoomLevel {
  try {
    return coerceZoom(localStorage.getItem(KEY)) ?? DEFAULT_ZOOM;
  } catch {
    return DEFAULT_ZOOM;
  }
}

/** One step in or out, stopping at the ends rather than wrapping. */
export function stepZoom(from: ZoomLevel, direction: 1 | -1): ZoomLevel {
  const index = ZOOM_STEPS.indexOf(from);
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))] ?? from;
}

export function writeZoom(zoom: ZoomLevel): void {
  try {
    localStorage.setItem(KEY, String(zoom));
  } catch {
    // Storage blocked. The zoom still applies for this session.
  }
}

/**
 * Put every window at `to`, sized and placed as it would have been if the
 * workspace had been at `to` all along.
 *
 * ── WHY THE 100% BOXES ARE REMEMBERED ───────────────────────────────────────
 *
 * Scaling by the ratio each time compounds its own rounding: out to 50% and back
 * leaves a window a few pixels from where it started, and every round trip moves
 * it again. `bases` holds what each window measured at 100%, so a step is always
 * one multiplication from a fixed number and a round trip is exact.
 *
 * A base is only a memo. Move or resize a window yourself and the caller clears
 * the map, so the next step re-derives from where the window actually is — which
 * is the only honest answer once a person has had a say.
 */
export function rescaleWindows(
  api: DockviewApi,
  from: ZoomLevel,
  to: ZoomLevel,
  canvas: HTMLElement | null,
  bases: Map<string, FloatBox>
): void {
  if (from === to || !canvas) return;

  const live = new Set<string>();
  for (const group of floatingGroups(api)) {
    live.add(group.id);
    const base = bases.get(group.id) ?? scaleBox(boxOf(group, canvas), 1 / from);
    bases.set(group.id, base);
    api.addFloatingGroup(group, scaleBox(base, to));
  }

  // Windows closed since the last step would otherwise sit in here forever.
  for (const id of [...bases.keys()]) {
    if (!live.has(id)) bases.delete(id);
  }
}
