// The workbench controller — everything that acts on the open panes, in one place.
//
// Surfaces never touch the presentation. They call ctx.open() / ctx.close() /
// ctx.guard(), which land here. That indirection is what keeps surfaces from
// growing layout opinions: a surface literally cannot express "and put a preview
// panel to my right at 40% width", only "open the preview".
//
// It also turned out to be what makes the app work on a phone. The controller
// talks to a PaneHost (see ./pane-host.ts), never to dockview — so the dock is
// one host and the mobile stack is another, and every surface runs unchanged on
// both because none of them can tell which one it is in.

import type { OpenOptions, OpenTarget } from '../surfaces/registry';
import type { DetachedWindow, PaneHost, PaneHostCapabilities } from './pane-host';
import { getSurface, titleFor } from '../surfaces/registry';
import {
  createDescriptor,
  descriptorKey,
  type PaneDescriptor,
  type SurfaceParams,
} from '../surfaces/descriptor';

export interface DirtyGuard {
  isDirty: () => boolean;
  message: string;
}

const DEFAULT_GUARD_MESSAGE = 'You have unsaved changes. Close anyway and lose them?';

/** The id a surface's own top-level guard registers under. Fixed rather than
 *  minted so `ctx.guard()` called twice replaces rather than accumulates. */
export const SURFACE_DIRTY_SOURCE = 'surface';

const NO_CAPABILITIES: PaneHostCapabilities = { split: false, popout: false };

export class WorkbenchController {
  private host: PaneHost | null = null;
  private readonly descriptors = new Map<string, PaneDescriptor>();
  /** paneId → sourceId → guard. A pane has MANY dirty sources, not one: the
   *  surface's own form plus any nested editor (a line composer, a picker
   *  modal) holding uncommitted state. See ./dirty.tsx for why. */
  private readonly guards = new Map<string, Map<string, DirtyGuard>>();
  private readonly listeners = new Set<() => void>();
  /** Fired when a browsable surface is deliberately opened or re-focused — the
   *  recents recorder listens here. Separate from `listeners` (the render
   *  store): a visit is a discrete event, not a change to the pane snapshot, so
   *  it must not ride the same channel useSyncExternalStore reads. */
  private readonly visitListeners = new Set<(surfaceKey: string) => void>();
  private activePaneId: string | null = null;
  /** Per-pane async confirms, registered by each pane's window boundary so the
   *  dialog renders in the WINDOW the pane lives in (not always the opener). */
  private readonly confirmDelegates = new Map<string, (message: string) => Promise<boolean>>();
  /** Cached snapshot — getSnapshot callbacks must return a STABLE reference
   *  between emits or useSyncExternalStore re-renders forever. */
  private snapshotCache: Record<string, PaneDescriptor> | null = null;
  /** Set the instant we DELIBERATELY tear the window down — a site switch, which
   *  reloads on purpose (see shell-data switchSite). The `beforeunload` guards
   *  read this so an intentional reload the operator already consented to isn't
   *  second-guessed by the browser's native "Leave site?" prompt, which would
   *  eat the reload and leave the switch half-applied (cookie moved, page not).
   *  One-way: the page is on its way out, so there is nothing to reset it for. */
  private intentionalUnload = false;

  /** Called by whichever presentation mounted — the dock, or the mobile stack. */
  attach(host: PaneHost): void {
    this.host = host;
    this.emit();
  }

  detach(): void {
    this.host = null;
    this.emit();
  }

  /** Whether a presentation is mounted and can be opened into. Read by the
   *  deep-link arrival gate, which must not try to open a pane into nothing —
   *  and must try again once a host appears (or reappears, after a remount). */
  isAttached(): boolean {
    return this.host !== null;
  }

  /** What the CURRENT presentation can do, so chrome omits the impossible
   *  rather than disabling it. Both false when nothing is attached. */
  capabilities(): PaneHostCapabilities {
    return this.host?.capabilities ?? NO_CAPABILITIES;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Subscribe to visits — one call per interactive foreground open of a
   *  browsable surface. Returns a disposer. Only the surface KEY is passed:
   *  recents share the favorites vocabulary (surface keys, no params), so an
   *  entity pane records nothing — see the guard in `open()`. */
  onVisit(listener: (surfaceKey: string) => void): () => void {
    this.visitListeners.add(listener);
    return () => this.visitListeners.delete(listener);
  }

  private emit(): void {
    this.snapshotCache = null;
    for (const listener of this.listeners) listener();
  }

  getDescriptor(paneId: string): PaneDescriptor | undefined {
    return this.descriptors.get(paneId);
  }

  /* ── Focus tracking ──────────────────────────────────────────────────────
     The dock reports dockview's active panel here so chrome OUTSIDE the dock
     (the toolbar's star, feedback context) can answer "what is the operator
     looking at" without touching dockview. */

  setActivePane(paneId: string | null): void {
    if (this.activePaneId === paneId) return;
    this.activePaneId = paneId;
    this.emit();
  }

  getActiveDescriptor(): PaneDescriptor | null {
    if (!this.activePaneId) return null;
    return this.descriptors.get(this.activePaneId) ?? null;
  }

  snapshotDescriptors(): Record<string, PaneDescriptor> {
    this.snapshotCache ??= Object.fromEntries(this.descriptors);
    return this.snapshotCache;
  }

  /** The host's serialized arrangement, for callers that must flush a save NOW
   *  (site switch, named-workspace save) rather than wait for the debounce.
   *  Null from a host with no arrangement of its own — see StackPaneHost. */
  serializeGrid(): unknown {
    return this.host?.serialize() ?? null;
  }

  /** Restores descriptors from a persisted layout, before dockview rebuilds the grid. */
  hydrate(panes: Record<string, PaneDescriptor>): void {
    this.descriptors.clear();
    for (const [id, descriptor] of Object.entries(panes)) this.descriptors.set(id, descriptor);
    this.emit();
  }

  /**
   * Opens a surface. Returns the pane id, or null if the surface is unknown.
   *
   * Re-focus rather than duplicate when the exact same surface+params is already
   * open — opening "Orders" twice from the launcher almost always means "show me
   * orders", not "give me a second copy". Explicit duplication stays available
   * through the pane menu, where it reads as a deliberate act.
   */
  open(
    surface: string,
    params?: SurfaceParams,
    options?: OpenOptions & { fromPaneId?: string }
  ): string | null {
    const host = this.host;
    const definition = getSurface(surface);
    if (!host || !definition) return null;

    const descriptor = createDescriptor(surface, params);
    const key = descriptorKey(descriptor);

    // Record the visit BEFORE the dedupe branch, so re-opening an already-open
    // surface still bumps it up the recents list — re-focusing "Orders" is as
    // much a visit as opening it fresh. Three exclusions, all deliberate:
    //   • background loads (focus:false) aren't visits — nobody looked at them;
    //   • unlisted child surfaces (a preview only reachable from a parent)
    //     aren't destinations someone would want to return to directly;
    //   • entity panes (params present) can't be recorded, because recents are
    //     surface keys with no params — the SAME rule the toolbar star obeys.
    const isEntityPane = Boolean(params && Object.keys(params).length > 0);
    if (options?.focus !== false && definition.listed !== false && !isEntityPane) {
      for (const listener of this.visitListeners) listener(definition.key);
    }

    for (const [existingId, existing] of this.descriptors) {
      if (descriptorKey(existing) !== key) continue;
      // A descriptor whose pane is gone is a ghost — the controller outlives
      // the host across remounts (dev strict-mode, popout re-parenting, the
      // desktop⇄mobile shell swap), so descriptors can reference panes that
      // only existed on a previous host. Deduping against a ghost silently
      // opens nothing; drop it and fall through to a real open instead.
      if (!host.has(existingId)) {
        this.descriptors.delete(existingId);
        this.guards.delete(existingId);
        continue;
      }
      if (definition.singleton === true || options?.target !== 'replace') {
        host.focus(existingId);
        return existingId;
      }
    }

    let target: OpenTarget = options?.target ?? 'tab';
    if (target === 'replace' && options?.fromPaneId) {
      return this.replace(options.fromPaneId, descriptor);
    }
    // A host that cannot split still honours the INTENT behind `beside` —
    // "next to what I was looking at" — it just expresses adjacency in its own
    // terms. Silently downgraded here rather than at every call site, so no
    // surface has to know what it is running inside.
    if (target === 'beside' && !host.capabilities.split) target = 'tab';

    // BESIDE WHAT? The pane you were looking at. A surface answers this itself
    // (context.tsx passes its own id), but CHROME — the launcher, the app panel,
    // a favourite — has no pane to name, and `positionFor` treats a missing one
    // as "no opinion". So every ⇧-click from outside a surface silently became a
    // tab, in a palette whose own footer advertises "⇧↵ alongside".
    //
    // `host.has` for the same reason the dedupe loop above needs it: the
    // controller outlives the host across remounts, so the active id can name a
    // pane that only existed on a previous one. dockview THROWS on an unknown
    // referencePanel rather than ignoring it, and that throw takes down the whole
    // shell tree — an unguarded read here crashed the console on every boot.
    //
    // NOT extended to `replace`: retargeting is destructive, and a caller that
    // named no pane must never be answered with "the active one, then".
    const active = this.activePaneId;
    const anchor = options?.fromPaneId ?? (active && host.has(active) ? active : undefined);

    this.descriptors.set(descriptor.id, descriptor);
    host.add(descriptor, titleFor(descriptor), {
      target,
      fromPaneId: anchor,
      focus: options?.focus !== false,
    });

    this.emit();
    return descriptor.id;
  }

  /** Retargets an existing pane at a new surface, keeping its place. */
  private replace(paneId: string, next: PaneDescriptor): string {
    if (!this.host?.has(paneId)) return paneId;

    // Reuse the pane id so the pane's slot, size and order all survive.
    const retargeted: PaneDescriptor = { ...next, id: paneId };
    this.descriptors.set(paneId, retargeted);
    this.host.retarget(paneId, titleFor(retargeted));
    this.emit();
    return paneId;
  }

  setTitle(paneId: string, title: string): void {
    const descriptor = this.descriptors.get(paneId);
    if (!descriptor) return;
    // IDEMPOTENT, and it has to be. A surface renames itself from an effect
    // ("Invoice" ⇒ "INV-000004" once the record loads), so a setTitle that
    // always emits means: effect → emit → re-render → effect → emit. The dock
    // absorbed it because dockview's own setTitle no-ops on an unchanged title;
    // the stack emitted every time and the pane hit React's update-depth limit
    // instantly. Bailing here fixes it for every present and future host.
    if (descriptor.title === title) return;
    this.descriptors.set(paneId, { ...descriptor, title });
    this.host?.setTitle(paneId, title);
    this.emit();
  }

  /* ── Dirty guards ────────────────────────────────────────────────────────
     Every leave path consults these: closing a pane, replacing its content,
     tearing it into a window, and — in a detached window — the browser's own
     unload. That last one is the path the dashboard never covered, and a
     popout makes it far more likely. */

  /**
   * Registers ONE dirty source on a pane. Many may be live at once; the pane is
   * dirty when any of them is.
   *
   * `sourceId` identifies the contributor, so a nested editor that unmounts
   * withdraws only its own claim. Re-registering the same id replaces it — that
   * is what makes a hook able to re-register on a message change without
   * accumulating stale closures.
   */
  registerGuard(
    paneId: string,
    sourceId: string,
    isDirty: () => boolean,
    message?: string
  ): () => void {
    let sources = this.guards.get(paneId);
    if (!sources) {
      sources = new Map<string, DirtyGuard>();
      this.guards.set(paneId, sources);
    }
    sources.set(sourceId, { isDirty, message: message ?? DEFAULT_GUARD_MESSAGE });
    return () => {
      const live = this.guards.get(paneId);
      live?.delete(sourceId);
      if (live?.size === 0) this.guards.delete(paneId);
    };
  }

  /**
   * The guard that should speak for a pane right now — the FIRST source
   * reporting dirty, in registration order.
   *
   * Order is the whole point: a surface registers on mount, a nested editor when
   * it opens, so the surface's own message wins whenever the surface itself has
   * changes, and the nested editor's more specific wording ("a line you haven't
   * added yet") surfaces only when it is the sole thing at risk.
   */
  private dirtyGuardFor(paneId: string): DirtyGuard | null {
    const sources = this.guards.get(paneId);
    if (!sources) return null;
    for (const guard of sources.values()) if (guard.isDirty()) return guard;
    return null;
  }

  /** Whether one pane has uncommitted work in any of its sources. */
  isPaneDirty(paneId: string): boolean {
    return this.dirtyGuardFor(paneId) !== null;
  }

  hasUnsavedWork(): boolean {
    for (const paneId of this.guards.keys()) if (this.isPaneDirty(paneId)) return true;
    return false;
  }

  /** Announce that the window is about to be torn down on purpose (a site
   *  switch), so the `beforeunload` guards stand down for this one reload — the
   *  operator has already answered the in-app "switch with unsaved changes?"
   *  confirm, and a second native prompt only serves to cancel the reload. */
  markIntentionalUnload(): void {
    this.intentionalUnload = true;
  }

  /** Whether the imminent unload is a deliberate one (see markIntentionalUnload). */
  isUnloadIntentional(): boolean {
    return this.intentionalUnload;
  }

  /** Every pane with unsaved work right now — the status bar's count. */
  dirtyPanes(): PaneDescriptor[] {
    const dirty: PaneDescriptor[] = [];
    for (const paneId of this.guards.keys()) {
      if (!this.isPaneDirty(paneId)) continue;
      const descriptor = this.descriptors.get(paneId);
      if (descriptor) dirty.push(descriptor);
    }
    return dirty;
  }

  focusPane(paneId: string): void {
    this.host?.focus(paneId);
  }

  /** A pane's window boundary registers how to ask "are you sure" IN THAT
   *  pane's window — a styled dialog beats window.confirm, and it must appear
   *  where the operator is looking, which for a torn-off pane is not the
   *  opener. Returns a disposer, like registerGuard. */
  setConfirmDelegate(paneId: string, confirm: (message: string) => Promise<boolean>): () => void {
    this.confirmDelegates.set(paneId, confirm);
    return () => this.confirmDelegates.delete(paneId);
  }

  /**
   * The close path with the guard conversation: clean panes close immediately;
   * a dirty pane asks first, through its own window's dialog. window.confirm is
   * the fallback only for a pane whose boundary never registered (should not
   * happen — but silently discarding unsaved work must not be the failure mode).
   *
   * Resolves to whether the pane actually closed — false means the operator kept
   * it. A batch caller (close-others, close-to-the-right) reads that to STOP at
   * the first pane someone chose to keep, rather than closing past it.
   */
  async requestClose(paneId: string): Promise<boolean> {
    const guard = this.dirtyGuardFor(paneId);
    if (guard) {
      const confirm = this.confirmDelegates.get(paneId);
      const ok = confirm
        ? await confirm(guard.message)
        : typeof window !== 'undefined' && window.confirm(guard.message);
      if (!ok) return false;
    }
    this.close(paneId);
    return true;
  }

  /** Closes unconditionally. Surfaces closing THEMSELVES (a deleted draft's
   *  editor) come through here — prompting "unsaved changes?" about a document
   *  that no longer exists would be nonsense. Interactive closes go through
   *  requestClose, which holds the guard conversation first. */
  close(paneId: string): void {
    this.guards.delete(paneId);
    this.confirmDelegates.delete(paneId);
    this.descriptors.delete(paneId);
    this.host?.close(paneId);
    this.emit();
  }

  /** Forgets a pane dockview already removed (user hit the tab's ×). */
  forget(paneId: string): void {
    this.guards.delete(paneId);
    this.descriptors.delete(paneId);
    this.emit();
  }

  /** Tears a pane into its own window. A no-op on a host without windows —
   *  chrome should be reading capabilities() and not offering it at all. */
  popout(paneId: string): void {
    this.host?.popout?.(paneId);
  }

  /**
   * The windows panes have been torn into. Empty on a host without windows.
   *
   * Returns a FRESH array every call — callers must diff it themselves rather
   * than feeding it straight to useSyncExternalStore (see useDetachedWindows).
   */
  detachedWindows(): DetachedWindow[] {
    return this.host?.detachedWindows?.() ?? [];
  }

  /**
   * The host rearranged itself without going through us — a group popped out,
   * a popout was closed from its own title bar. Nothing the controller OWNS
   * changed, but chrome reading through it (the detached-windows chip) is now
   * stale, so re-notify.
   */
  hostChanged(): void {
    this.emit();
  }
}
