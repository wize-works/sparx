// Layout persistence.
//
// The workbench's whole promise is "arrange it once, it stays arranged." So the
// layout is saved on every change, not on an explicit Save — an operator who
// spends ten minutes building a working set and then closes the tab must get it
// back untouched.
//
// Storage is localStorage rather than the server, deliberately. Layout is a
// per-DEVICE fact: the arrangement someone builds across two 27" monitors is
// actively wrong on a laptop, so syncing it to the account would make the
// feature hostile on the second device. Named workspaces (below) are the
// escape hatch for people who do want to carry an arrangement around, and those
// are explicit, exported, and small enough to move by hand.

import type { PaneDescriptor } from '../surfaces/descriptor';

const LAYOUT_KEY = 'sparx-workbench-layout';
const WORKSPACES_KEY = 'sparx-workbench-workspaces';

/**
 * Layouts are per-SITE (per-site workspaces — the VS Code window-per-project
 * model). An entity pane belongs to exactly one site: an invoice open under
 * Site A does not exist under Site B, so "keep the panes, swap the data" would
 * strand half the layout on 404s. Instead each site keeps its own complete
 * arrangement, and switching sites saves yours and restores the other's.
 *
 * `siteKey` is the active property id, or 'default' for a tenant before any
 * site is resolved. Keying by id (not name) survives renames.
 */
function layoutKey(siteKey: string): string {
  return `${LAYOUT_KEY}:${siteKey}`;
}

/**
 * Bump when the persisted shape changes incompatibly; older payloads are dropped.
 *
 * This must also be bumped when the dockview PANEL CONFIG changes, not just when
 * our own fields do — `grid` is dockview's serialization and it replays the
 * component/tabComponent names captured at save time. Adding `tabComponent`
 * left every restored pane on dockview's default tab renderer until this moved
 * to 2, which looked like the custom tab was broken rather than simply not
 * being asked for.
 */
const SCHEMA_VERSION = 2;

export interface PersistedLayout {
  version: number;
  /** dockview's own serialized grid. Opaque to us by design — it owns layout. */
  grid: unknown;
  /** Descriptors keyed by pane id. dockview stores our pane ids; we store what they mean. */
  panes: Record<string, PaneDescriptor>;
  savedAt: number;
}

export interface NamedWorkspace extends PersistedLayout {
  id: string;
  name: string;
  /**
   * The presentation and zoom the arrangement was captured in.
   *
   * A grid is a set of pixel boxes, and those boxes were measured at whatever
   * zoom was on screen at the time — so replaying a 50% arrangement at 100%
   * brings every window back half size. Loosely typed on purpose: this file
   * stores what it is handed and the dock validates on the way back out.
   *
   * Optional, because arrangements saved before this existed have neither.
   */
  zoom?: number;
  mode?: string;
}

function readJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // A corrupt payload must not brick the app into a permanent blank screen —
    // fall through to the default layout instead.
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded, or storage blocked in a hardened browser profile. Losing
    // layout persistence is a degraded experience, not a failure worth throwing.
  }
}

export function saveLayout(
  siteKey: string,
  grid: unknown,
  panes: Record<string, PaneDescriptor>
): void {
  const payload: PersistedLayout = { version: SCHEMA_VERSION, grid, panes, savedAt: Date.now() };
  writeJson(layoutKey(siteKey), payload);
}

/**
 * Saves the pane SET while leaving the stored arrangement untouched.
 *
 * This is the mobile write path, and it exists to prevent silent data loss. A
 * phone has no grid — the stack host serializes to null — so going through
 * saveLayout() would replace a four-pane arrangement built across two monitors
 * with nothing, permanently, because someone checked an invoice at lunch. The
 * grid is a DESKTOP fact and only a desktop session is allowed to write it.
 *
 * Opening and closing panes on a phone still persists, so the two presentations
 * agree on what is open. They just disagree on how it is laid out, which is the
 * correct disagreement: a phone genuinely has no opinion about that.
 *
 * With no stored layout yet (a first-ever session on a phone) there is no grid
 * to preserve, so the panes are written with a null grid. loadLayout() rejects
 * that payload, which is right — a desktop opening next has nothing to restore
 * and starts from the default layout rather than a grid it never built.
 */
export function savePanes(siteKey: string, panes: Record<string, PaneDescriptor>): void {
  const existing = readJson<PersistedLayout>(layoutKey(siteKey));
  const payload: PersistedLayout = {
    version: SCHEMA_VERSION,
    grid: existing?.version === SCHEMA_VERSION ? existing.grid : null,
    panes,
    savedAt: Date.now(),
  };
  writeJson(layoutKey(siteKey), payload);
}

/** The stored pane set regardless of whether the grid is usable — the stack
 *  host needs the panes even when loadLayout() rejects the payload for having
 *  no grid (a layout last written by a phone). */
export function loadPanes(siteKey: string): Record<string, PaneDescriptor> | null {
  const stored = readJson<PersistedLayout>(layoutKey(siteKey));
  if (stored?.version !== SCHEMA_VERSION) return null;
  if (typeof stored.panes !== 'object') return null;
  return stored.panes;
}

export function loadLayout(siteKey: string): PersistedLayout | null {
  let stored = readJson<PersistedLayout>(layoutKey(siteKey));

  // One-time migration: layouts saved before site-keying lived under the bare
  // key. The FIRST site to load adopts it — and the legacy key is deleted in
  // the same breath, because "one-time" has to be enforced, not hoped for: left
  // in place, every site that had no layout yet would inherit the same panes,
  // including entity panes belonging to a different site — precisely the
  // dangling state per-site layouts exist to prevent.
  if (!stored) {
    const legacy = readJson<PersistedLayout>(LAYOUT_KEY);
    if (legacy) {
      writeJson(layoutKey(siteKey), legacy);
      try {
        localStorage.removeItem(LAYOUT_KEY);
      } catch {
        // Storage blocked — worst case the migration repeats, which is benign
        // compared to failing the load.
      }
      stored = legacy;
    }
  }

  if (stored?.version !== SCHEMA_VERSION) return null;
  if (!stored.grid || typeof stored.panes !== 'object') return null;
  return stored;
}

export function clearLayout(siteKey: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(layoutKey(siteKey));
  localStorage.removeItem(LAYOUT_KEY);
}

/* ── Named workspaces ──────────────────────────────────────────────────────
   A saved arrangement an operator can return to by name — "Month end",
   "Fulfilment", "Catalog cleanup". These are the answer to task-switching:
   rather than rebuilding a set of panes, you restore the one you built before. */

export function listWorkspaces(): NamedWorkspace[] {
  return readJson<NamedWorkspace[]>(WORKSPACES_KEY) ?? [];
}

export function saveWorkspace(
  name: string,
  grid: unknown,
  panes: Record<string, PaneDescriptor>,
  presentation?: { zoom?: number; mode?: string }
): NamedWorkspace {
  const workspace: NamedWorkspace = {
    id: `ws_${crypto.randomUUID().slice(0, 8)}`,
    name,
    version: SCHEMA_VERSION,
    grid,
    panes,
    savedAt: Date.now(),
    zoom: presentation?.zoom,
    mode: presentation?.mode,
  };
  writeJson(WORKSPACES_KEY, [...listWorkspaces(), workspace]);
  return workspace;
}

/* ── Nav panel state ───────────────────────────────────────────────────────
   Which module was last browsed, and whether the panel is pinned open. Kept
   with layout rather than on the account for the same reason: it is a per-device
   preference. Someone who pins the panel on a wide monitor does not want it
   pinned on a laptop where it costs a quarter of the canvas. */

const NAV_KEY = 'sparx-workbench-nav';

export interface NavState {
  module: string | null;
  pinned: boolean;
  /** Rail showing labels beside the icons. Collapsed (icons only) by default —
   *  the workbench's whole premise is that canvas belongs to the panes. */
  railExpanded: boolean;
}

export function loadNavState(): NavState {
  const stored = readJson<Partial<NavState>>(NAV_KEY);
  return {
    module: stored?.module ?? null,
    pinned: stored?.pinned ?? false,
    railExpanded: stored?.railExpanded ?? false,
  };
}

export function saveNavState(state: NavState): void {
  writeJson(NAV_KEY, state);
}

export function deleteWorkspace(id: string): void {
  writeJson(
    WORKSPACES_KEY,
    listWorkspaces().filter((workspace) => workspace.id !== id)
  );
}
