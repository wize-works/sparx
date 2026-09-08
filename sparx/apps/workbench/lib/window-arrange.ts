'use client';

// Tidying up, when there is no grid to tidy into.
//
// Windows mode trades the grid's guarantee — nothing overlaps, nothing is hidden
// — for the freedom to put things where you want them. These three are what buys
// that guarantee back on demand, and the canvas made the third one necessary: a
// window can now be parked past the edge of the screen, and something has to be
// able to fetch it.
//
// Every move goes through `addFloatingGroup`, which is dockview's only public
// way to reposition a window. It rebuilds the window's frame around the same
// panels, so nothing is closed and no descriptor is forgotten (`skipDispose`
// keeps the panels out of the removal path entirely).

import type { DockviewApi } from 'dockview';
import {
  boxOf,
  cascadeBox,
  floatingGroups,
  gatherBox,
  sameBox,
  tileBox,
  type FloatViewport,
} from './window-placement';

export type ArrangeStyle = 'cascade' | 'tile' | 'gather';
export type ArrangeWindows = (style: ArrangeStyle) => void;

/** Pull anything parked off the screen back onto it, and leave the rest alone. */
function gather(api: DockviewApi, view: FloatViewport, canvas: HTMLElement): void {
  for (const group of floatingGroups(api)) {
    const current = boxOf(group, canvas);
    const box = gatherBox(view, current);
    if (sameBox(box, current)) continue;
    api.addFloatingGroup(group, box);
  }
}

export function arrangeWindows(
  api: DockviewApi,
  style: ArrangeStyle,
  view: FloatViewport,
  canvas: HTMLElement | null
): void {
  const groups = floatingGroups(api);
  if (groups.length === 0) return;

  // Restored afterwards: every placement makes the window it placed the active
  // one, so without this, tidying up would also change what you were working on.
  const working = api.activePanel?.id ?? null;

  if (style === 'gather') {
    if (canvas) gather(api, view, canvas);
  } else {
    groups.forEach((group, index) => {
      api.addFloatingGroup(
        group,
        style === 'cascade' ? cascadeBox(view, index) : tileBox(view, index, groups.length)
      );
    });
  }

  if (working) api.getPanel(working)?.api.setActive();
}
