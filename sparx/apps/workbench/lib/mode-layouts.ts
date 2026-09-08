'use client';

// One remembered arrangement per presentation, per site.
//
// ── THE PROBLEM THIS SOLVES ─────────────────────────────────────────────────
//
// Windows and tabs are not two views of one arrangement — they are two
// arrangements. A grid is splits and ratios; a set of floating windows is
// positions and sizes. Neither can express the other, so switching used to
// throw one away and synthesise the other from scratch: every window landed on
// the same cascade, every grid became a row of equal columns docked to the
// right. Somebody who spent a minute placing four windows lost that minute
// every time they looked at the tidy view, which is enough to make the toggle
// not worth touching.
//
// So each presentation keeps its OWN snapshot and gets it back on return. The
// pane SET is shared and stays live across the switch — only the arrangement is
// per-mode. That is the honest split: "what I have open" is one fact, "how it
// is laid out" is two.
//
// ── WHY THIS IS SEPARATE FROM THE MAIN LAYOUT ───────────────────────────────
//
// `lib/workbench/persistence` stores the live arrangement — what a
// reload restores — and stays the single source of truth for that. These
// snapshots are the arrangement you were NOT looking at, which the live layout
// has no place to keep. Storing them here also means the shared persistence
// module never learns that Piggles has modes, which sparx does not.
//
// Per-site for the same reason layouts are (see that file): an arrangement is
// about one business's panes, and an entity pane under one site does not exist
// under another.

import type { WindowMode } from './window-mode';

const KEY = 'sparx-workbench-mode-layout';

/** Bump when the stored shape changes incompatibly; older payloads are dropped.
 *  `grid` is dockview's own serialization, so this must also move if the panel
 *  config changes — the same trap documented in the shared persistence module,
 *  where adding `tabComponent` silently restored every pane on the default tab
 *  renderer until the version moved. */
const VERSION = 1;

interface ModeSnapshot {
  version: number;
  /** dockview's `toJSON()`. Opaque by design — dockview owns layout. */
  grid: unknown;
  savedAt: number;
}

function storageKey(siteKey: string, mode: WindowMode): string {
  return `${KEY}:${siteKey}:${mode}`;
}

export function saveModeLayout(siteKey: string, mode: WindowMode, grid: unknown): void {
  if (typeof localStorage === 'undefined') return;
  const payload: ModeSnapshot = { version: VERSION, grid, savedAt: Date.now() };
  try {
    localStorage.setItem(storageKey(siteKey, mode), JSON.stringify(payload));
  } catch {
    // Quota or a hardened profile. Losing the remembered arrangement means the
    // toggle falls back to synthesising one — degraded, not broken.
  }
}

/** The remembered arrangement for a presentation, or null if there isn't one
 *  yet (or it is unreadable, or from an older shape). */
export function loadModeLayout(siteKey: string, mode: WindowMode): unknown {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(siteKey, mode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ModeSnapshot;
    if (parsed?.version !== VERSION || !parsed.grid) return null;
    return parsed.grid;
  } catch {
    // A corrupt payload must never brick the toggle — fall through to
    // synthesising the arrangement, which always works.
    return null;
  }
}

/** Forget both arrangements for a site. Used when the layout itself is reset,
 *  so a "start fresh" does not leave one presentation restoring a stale grid. */
export function clearModeLayouts(siteKey: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(siteKey, 'windows'));
    localStorage.removeItem(storageKey(siteKey, 'tabs'));
  } catch {
    // Nothing to do — the snapshots are reconciled against the live pane set on
    // restore, so a stale one cannot resurrect a closed pane.
  }
}
