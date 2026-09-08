'use client';

import type { DockviewApi, SerializedDockview } from 'dockview';
import type { WorkbenchController } from '@/lib/workbench/controller';
import type { PaneDescriptor } from '@/lib/surfaces/descriptor';
import { loadModeLayout, saveModeLayout } from './mode-layouts';
import { boxAtPoint, cascadeBox, type FloatPoint, type FloatViewport } from './window-placement';

// Windows or tabs — how the console presents what you have open.
//
// ── WHY THIS IS A CHOICE AND NOT A DEFAULT ──────────────────────────────────
//
// The two are genuinely different ways to work and neither is wrong.
//
//   TABS tile every pane into a grid: nothing overlaps, nothing is hidden, and
//   the whole screen is always in use. It is the denser, tidier answer, and it
//   is what somebody comparing two lists side by side wants.
//
//   WINDOWS let panes float and overlap, moved and sized freely, stacked the way
//   paper is stacked on a desk. It is the friendlier answer, and it is what
//   somebody who thinks in "things I have out" wants — which, for a business
//   owner who has never used a tiling window manager, is most people.
//
// BOTH consoles offer it, and that is a change. This file used to say "sparx is
// not offered it", on the reasoning that its audience is a doer at a desk who
// wants everything visible at once and so tiling is simply correct there. That
// reasoning described the DEFAULT well and did not survive contact with the
// toggle: tiling remains what sparx opens on, and having tried windows in the
// other console there was no argument left for withholding the choice. A
// presentation somebody can switch back from is not a risk (2026-09-05).
//
// ── WHY THE TOGGLE HAD TO EXIST AT ALL ──────────────────────────────────────
//
// dockview floats a group when a tab is dragged into empty space. A fully tiled
// grid HAS no empty space — so floating was enabled, documented, and completely
// unreachable. The capability was not missing; the door was. (The same shape of
// bug as `organization.setActive`, which was fully implemented server-side and
// had no client to call it.)

export type WindowMode = 'windows' | 'tabs';

const KEY = 'piggles-console-window-mode';

/** The stored choice, or null when nobody has chosen. */
export function readWindowMode(): WindowMode | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === 'windows' || raw === 'tabs' ? raw : null;
  } catch {
    return null;
  }
}

export function writeWindowMode(mode: WindowMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Storage blocked. The mode still applies for this session.
  }
}

/**
 * Put every open group into the requested presentation.
 *
 * Reads `group.api.location.type` rather than tracking state of its own: dockview
 * is the authority on where a group actually is, and a group can move without
 * this module being told (a tab dragged out, a popout dismissed). Anything
 * already in the right place is left alone, so calling this repeatedly is safe.
 *
 * POPOUT groups are deliberately untouched. A popout is a real operating-system
 * window somebody deliberately tore off; dragging it back because a toggle was
 * flipped would be the console reaching into another window and closing it.
 */
export function applyWindowMode(api: DockviewApi, mode: WindowMode, view: FloatViewport): void {
  if (mode === 'windows') {
    evictFromGrid(api, null, view);
    return;
  }

  // Snapshot first — moving a group mutates the collection being iterated.
  for (const group of [...api.groups]) {
    if (group.api.location.type !== 'floating') continue;
    // No target group + a position docks it against the grid's edge — the same
    // call the tear-off control uses to bring a popout back, so a window
    // returning to the grid behaves identically however it left.
    group.api.moveTo({ position: 'right' });
  }
}

/**
 * WINDOWS MODE HAS NO GRID, so anything that lands in one is lifted straight
 * back out — this is the invariant, not a tidy-up.
 *
 * Dropping a tab into empty space is dockview's way of asking for a new group,
 * and the group it makes is a GRID one: a full-bleed docked pane sitting behind
 * every floating window, which reads as the drag having failed. Passing `at`
 * puts that window where the drag was released; everything else cascades.
 */
export function evictFromGrid(api: DockviewApi, at: FloatPoint | null, view: FloatViewport): void {
  const stranded = [...api.groups].filter(
    (group) => group.api.location.type === 'grid' && group.panels.length > 0
  );
  if (stranded.length === 0) return;

  // Count what is ALREADY floating, so a newcomer joining a screenful of windows
  // continues the cascade instead of landing under the first one.
  let index = api.groups.filter((group) => group.api.location.type === 'floating').length;
  for (const group of stranded) {
    // The drop point describes ONE window. If a sweep found several (a stale
    // layout, a mode switch), only a cascade can place them all.
    const box = at && stranded.length === 1 ? boxAtPoint(view, at) : cascadeBox(view, index);
    api.addFloatingGroup(group, box);
    index += 1;
  }
}

/**
 * Move between presentations, keeping each one's arrangement.
 *
 * ── WHAT MAKES THIS SAFE ────────────────────────────────────────────────────
 *
 * `fromJSON` with `reuseExistingPanels` MOVES the panels that appear in both
 * layouts instead of destroying and rebuilding them (dockview stashes them in a
 * temporary group, clears the layout, then re-adopts each one into its new
 * slot). That is the difference between a toggle and a data-loss bug: a pane
 * holding a half-typed invoice keeps its React tree, its scroll position and
 * its unsaved values, and comes out the other side in a different place on
 * screen and otherwise untouched.
 *
 * Without that flag this whole feature would be unshippable — restoring the
 * other arrangement would silently discard work, and a VIEW toggle must never
 * be able to do that.
 *
 * ── AND WHY IT STILL RECONCILES AFTERWARDS ──────────────────────────────────
 *
 * A snapshot is a photograph of an arrangement, taken when you last left that
 * presentation. The pane SET has moved on since: panes opened in tabs are
 * missing from the windows photograph, and panes closed in tabs are still IN
 * it. Replaying the photograph alone would quietly close the first group and
 * resurrect the second as panes with no descriptor behind them.
 *
 * So the live descriptors are the authority and the snapshot only supplies
 * ARRANGEMENT: anything in the photograph that is no longer open is dropped,
 * and anything open that the photograph never saw is added back.
 */
export function switchWindowMode(
  api: DockviewApi,
  controller: WorkbenchController,
  siteKey: string,
  from: WindowMode,
  to: WindowMode,
  view: FloatViewport
): void {
  // Photograph the arrangement being left FIRST, and unconditionally — even if
  // everything below fails, the way it looked is not what gets lost.
  saveModeLayout(siteKey, from, api.toJSON());

  const snapshot = loadModeLayout(siteKey, to);
  if (!snapshot) {
    // Never been in this presentation on this site. Synthesise one.
    applyWindowMode(api, to, view);
    return;
  }

  // ── READ THE OPEN SET BEFORE TOUCHING THE LAYOUT ──────────────────────────
  //
  // This line looks like caution and is actually load-bearing. `fromJSON` calls
  // `clear()` internally, and clear() runs OUTSIDE dockview's moving-lock — so
  // every panel it destroys fires `onDidRemovePanel`, and this dock's listener
  // answers that by forgetting the pane's descriptor.
  //
  // The panels reused across the restore are exempt (dockview parks them in a
  // detached group under the lock, which suppresses the event). The ones that
  // are NOT exempt are precisely the panes the snapshot has never seen — the
  // ones opened while the other presentation was on screen, which are the whole
  // reason reconciliation exists. Reading the set afterwards would read it
  // already pruned, and those panes would vanish with nothing reporting it.
  const openBefore = controller.snapshotDescriptors();

  try {
    api.fromJSON(snapshot as SerializedDockview, { reuseExistingPanels: true });
  } catch (error) {
    // A snapshot written by an older build can fail to deserialize, and a dock
    // that threw mid-restore is in no state to be trusted. Synthesising from
    // whatever survived beats a workspace nobody can get out of.
    console.warn('[piggles] could not restore that arrangement; rebuilding it', error);
    applyWindowMode(api, to, view);
    return;
  }

  reconcile(api, controller, to, openBefore, view);
  controller.hostChanged();
}

/**
 * Make the restored arrangement agree with what is actually open.
 *
 * `openBefore` is the authority on what "open" means — see the note at the call
 * site for why it cannot be re-read here.
 */
function reconcile(
  api: DockviewApi,
  controller: WorkbenchController,
  mode: WindowMode,
  openBefore: Record<string, PaneDescriptor>,
  view: FloatViewport
): void {
  // Panes the snapshot remembers that have since been closed, resurrected by the
  // restore. Straight to `panel.api.close()` rather than the controller's guard:
  // the pane is already gone as far as the person is concerned, it has no
  // descriptor and therefore no unsaved work, and asking "close this?" about
  // something they closed minutes ago is a question with no good answer.
  //
  // Synchronous, in the same tick as the restore, so React never paints them.
  for (const panel of [...api.panels]) {
    if (openBefore[panel.id]) continue;
    panel.api.close();
  }

  // Panes opened while the other presentation was on screen — absent from the
  // photograph, and re-opened rather than dropped. Closing something because it
  // was opened at an awkward moment is the one outcome nobody would forgive.
  for (const descriptor of Object.values(openBefore)) {
    if (api.getPanel(descriptor.id)) continue;
    controller.open(descriptor.surface, descriptor.params, { focus: false });
  }

  // Those re-openings land wherever `open` puts them, which is the grid — so
  // give the new arrivals the presentation too. Anything the snapshot already
  // placed is in the right place and is left alone, which is what
  // applyWindowMode does by reading each group's real location.
  applyWindowMode(api, mode, view);
}
