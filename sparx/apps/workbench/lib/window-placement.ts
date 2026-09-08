'use client';

import type { DockviewApi, DockviewGroupPanel } from 'dockview';

// How big a floating window is, and where it lands.
//
// A FRACTION of the workspace, never fixed pixels: the 720×520 this started as
// looked deliberate on the laptop it was chosen on and marooned on a 2286px one.
// The floors matter as much as the ratios — below roughly 520×380 a pane holding
// a toolbar, a filter row and a table is a peephole, so on a small canvas a
// window is allowed to take nearly all of it rather than shrink into uselessness.
//
// ── THE WORKSPACE IS WHAT YOU CAN SEE, NOT WHAT EXISTS ──────────────────────
//
// Every measurement here is against the VIEWPORT — the visible frame — and never
// against the canvas, which is larger whenever a window has been pushed off to
// one side (lib/dock/use-window-canvas.ts). Sizing against the canvas would make
// a new window a fraction of a workspace nobody is looking at, and place it at a
// cascade origin that has scrolled off the screen: a pane that opened correctly
// and appeared nowhere.
//
// So a window is sized from the visible frame and positioned in canvas
// coordinates by adding the scroll back on — dockview positions floating groups
// against the canvas, so that is the coordinate space it has to be handed.

export interface FloatViewport {
  /** The visible frame, in pixels. */
  width: number;
  height: number;
  /** Where that frame currently sits on the canvas. */
  scrollLeft: number;
  scrollTop: number;
  /** The workspace zoom, so a window opened at 70% joins the ones already at
   *  70% rather than towering over them. See lib/window-zoom.ts. */
  zoom: number;
}

const WIDTH_RATIO = 0.62;
const HEIGHT_RATIO = 0.72;
const MIN_WIDTH = 520;
const MIN_HEIGHT = 380;

/** Cascade offsets, so a screenful of windows doesn't land in one pile. */
const CASCADE_STEP = 32;
const CASCADE_ORIGIN = 24;
/** Restart the cascade after this many, so the seventh isn't off-screen. */
const CASCADE_WRAP = 6;

/** Half the 44px title bar — a window dropped at a point wears it under the
 *  cursor, so the thing you just let go of is the thing you can drag again. */
const GRAB_OFFSET = 22;

/** How close an edge has to land before it is treated as meant. Small enough
 *  that a deliberate near-miss survives, large enough to catch a real aim. */
const SNAP = 8;

/** The gutter an even split leaves, matching the dock theme's `gap`. */
const TILE_GAP = 10;
/** A tile never shrinks below this, however many windows are open. Past it a
 *  pane shows nothing at all, and eight of nothing is not an arrangement. */
const MIN_TILE = 220;

export interface FloatBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A position on the CANVAS, not the page and not the visible frame. */
export interface FloatPoint {
  x: number;
  y: number;
}

function frame(view: FloatViewport): { width: number; height: number } {
  return { width: Math.max(view.width, MIN_WIDTH), height: Math.max(view.height, MIN_HEIGHT) };
}

function windowSize(view: FloatViewport): { width: number; height: number } {
  const area = frame(view);
  // The floors are 100% figures, so the zoom goes on afterwards: at 70% a window
  // is 70% of the pixels and renders exactly as much content as it would at 100%.
  return {
    width: Math.round(
      view.zoom * Math.min(area.width, Math.max(MIN_WIDTH, area.width * WIDTH_RATIO))
    ),
    height: Math.round(
      view.zoom * Math.min(area.height, Math.max(MIN_HEIGHT, area.height * HEIGHT_RATIO))
    ),
  };
}

/** Kept fully inside the VISIBLE frame — a window that opened onto a part of the
 *  canvas nobody is looking at has, as far as anybody can tell, not opened. */
function clamp(value: number, limit: number): number {
  return Math.max(0, Math.min(value, limit));
}

/** Where the `index`-th window of a cascade goes, in canvas coordinates. */
export function cascadeBox(view: FloatViewport, index: number): FloatBox {
  const area = frame(view);
  const size = windowSize(view);
  const offset = CASCADE_ORIGIN + (index % CASCADE_WRAP) * CASCADE_STEP;
  return {
    x: view.scrollLeft + clamp(offset, area.width - size.width),
    y: view.scrollTop + clamp(offset, area.height - size.height),
    ...size,
  };
}

/** Where a window goes when somebody dropped a tab to make it. */
export function boxAtPoint(view: FloatViewport, point: FloatPoint): FloatBox {
  const area = frame(view);
  const size = windowSize(view);
  // The point arrives in canvas coordinates; the clamp is about what is on
  // screen, so it happens in frame coordinates and the scroll goes back on after.
  const x = point.x - view.scrollLeft;
  const y = point.y - view.scrollTop;
  return {
    x: view.scrollLeft + clamp(Math.round(x - size.width / 2), area.width - size.width),
    y: view.scrollTop + clamp(Math.round(y - GRAB_OFFSET), area.height - size.height),
    ...size,
  };
}

/** One tile of an even split of the visible frame — the `index`-th of `count`. */
export function tileBox(view: FloatViewport, index: number, count: number): FloatBox {
  const area = frame(view);
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const width = Math.max(MIN_TILE, Math.floor((area.width - TILE_GAP * (columns + 1)) / columns));
  const height = Math.max(MIN_TILE, Math.floor((area.height - TILE_GAP * (rows + 1)) / rows));
  return {
    x: view.scrollLeft + TILE_GAP + (index % columns) * (width + TILE_GAP),
    y: view.scrollTop + TILE_GAP + Math.floor(index / columns) * (height + TILE_GAP),
    width,
    height,
  };
}

/**
 * The smallest move that puts a window back on screen.
 *
 * Deliberately minimal: somebody asking for their windows back has an
 * arrangement they like and one stray they cannot see, and rearranging the lot
 * to fetch it would cost them more than the stray did. A window too big for the
 * screen is also shrunk, since there is no position that would show all of it.
 */
export function gatherBox(view: FloatViewport, box: FloatBox): FloatBox {
  const area = frame(view);
  const width = Math.min(box.width, Math.max(MIN_TILE, area.width - TILE_GAP * 2));
  const height = Math.min(box.height, Math.max(MIN_TILE, area.height - TILE_GAP * 2));
  return {
    x: view.scrollLeft + clamp(Math.round(box.x - view.scrollLeft), area.width - width),
    y: view.scrollTop + clamp(Math.round(box.y - view.scrollTop), area.height - height),
    width,
    height,
  };
}

/** The windows on the canvas, in the order dockview holds them. */
export function floatingGroups(api: DockviewApi): DockviewGroupPanel[] {
  return api.groups.filter((group) => group.api.location.type === 'floating');
}

/** A window's box in CANVAS pixels, which is the space dockview places them in. */
export function boxOf(group: DockviewGroupPanel, canvas: HTMLElement): FloatBox {
  const base = canvas.getBoundingClientRect();
  const box = group.element.getBoundingClientRect();
  return {
    x: Math.round(box.left - base.left),
    y: Math.round(box.top - base.top),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

/** The same window, `factor` times the size — position included, so a workspace
 *  scaled down keeps its shape rather than collapsing into the corner. */
export function scaleBox(box: FloatBox, factor: number): FloatBox {
  return {
    x: Math.round(box.x * factor),
    y: Math.round(box.y * factor),
    width: Math.round(box.width * factor),
    height: Math.round(box.height * factor),
  };
}

export function sameBox(a: FloatBox, b: FloatBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** The smallest nudge that puts one of `start`/`end` on a line, or none at all. */
function bestOffset(start: number, end: number, lines: number[]): number {
  let best = 0;
  let closest = SNAP + 1;
  for (const line of lines) {
    for (const delta of [line - start, line - end]) {
      const distance = Math.abs(delta);
      if (distance <= SNAP && distance < closest) {
        closest = distance;
        best = delta;
      }
    }
  }
  return Math.round(best);
}

/**
 * Line a window up with its neighbours or the edges of the screen.
 *
 * Position only, and only after a MOVE: a person dragging a window to sit beside
 * another one is aiming at an edge, and landing three pixels off is a miss they
 * then have to correct by hand. Nothing moves further than SNAP, so a window
 * genuinely meant to sit askew stays askew.
 */
export function snapBox(box: FloatBox, others: FloatBox[], view: FloatViewport): FloatBox {
  const edgesX = [view.scrollLeft, view.scrollLeft + view.width];
  const edgesY = [view.scrollTop, view.scrollTop + view.height];
  const linesX = [...edgesX, ...others.flatMap((other) => [other.x, other.x + other.width])];
  const linesY = [...edgesY, ...others.flatMap((other) => [other.y, other.y + other.height])];
  return {
    ...box,
    x: box.x + bestOffset(box.x, box.x + box.width, linesX),
    y: box.y + bestOffset(box.y, box.y + box.height, linesY),
  };
}
