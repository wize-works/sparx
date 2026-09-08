// The surface registry — the single catalog of everything the workbench can show.
//
// A surface is registered once and is then openable from anywhere: the command
// palette, the launcher, a deep link, a restored layout, another surface's
// "open preview" action, or a drop from another window. Nothing hardcodes a
// surface anywhere else, which is what keeps the "surfaces, never compositions"
// rule enforceable rather than aspirational.

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { WorkbenchModule } from '../../components/module-scope';
import type { PaneDescriptor, SurfaceParams } from './descriptor';

/** Where a newly-opened pane should land. */
export type OpenTarget =
  /** New tab in the group that asked. The default — least disruptive. */
  | 'tab'
  /** Split the asking group and sit alongside it. What "open preview" wants. */
  | 'beside'
  /** Replace the asking pane's content, like following a link. */
  | 'replace'
  /** Straight into its own detached window. */
  | 'window';

export interface OpenOptions {
  target?: OpenTarget;
  /** Focus the new pane. Default true; pass false for background loads. */
  focus?: boolean;
}

/**
 * Handed to every surface. This is the surface's ONLY channel for affecting the
 * workbench — a surface can never reach the dock, the window manager, or another
 * pane directly, which is what stops surfaces from growing layout opinions.
 */
export interface SurfaceContext {
  readonly descriptor: PaneDescriptor;
  readonly params: SurfaceParams;
  /** Open another surface. Use `target: 'beside'` for the preview/companion pattern. */
  open: (surface: string, params?: SurfaceParams, options?: OpenOptions) => void;
  /** Retitle this pane's tab — e.g. once the entity's real name loads. */
  setTitle: (title: string) => void;
  /** Close this pane. Runs the dirty-guard first. */
  close: () => void;
  /**
   * Register a guard so closing, replacing, or tearing off this pane confirms
   * first. Returns a disposer. A detached window also wires this to
   * `beforeunload`, which is the one leave path the dashboard never covered.
   *
   * PREFER `useDirtySource(dirty, message)` from lib/workbench/dirty.tsx inside
   * a component: it needs no ctx, so a nested editor can protect its own
   * uncommitted state, and it withdraws on unmount rather than relying on the
   * caller to clear a flag. This imperative form registers under the single
   * `surface` source id and exists for registration outside React's render
   * cycle. Both feed the same per-pane set — a pane is dirty if ANY source is.
   */
  guard: (isDirty: () => boolean, message?: string) => () => void;
}

export interface SurfaceDefinition {
  /** Stable, namespaced, and PERSISTED in saved layouts — renaming one orphans panes. */
  readonly key: string;
  /** Tab label. A function so it can read params; the async real name arrives via setTitle. */
  readonly title: string | ((params: SurfaceParams) => string);
  /** Drives the pane's accent hue. A pane showing another module's data wears that module's color. */
  readonly module: WorkbenchModule;
  /**
   * Which activated modules make this surface worth OFFERING — any one of them
   * is enough. Absent means "gate on `module`", which is what almost every
   * surface wants and is the behaviour that existed before this field.
   *
   * It exists because hue and entitlement are not always the same question.
   * Finance is the case that forced it: the module group is one color and one
   * place in the rail, but half of it (Payments, Payouts, Owed to you) is a free
   * view of data the tenant already bought with commerce/invoicing/b2b, while
   * the spend + profitability half is the billable `finance` module. Gating the
   * whole group on one flag would either give the paid half away or take the
   * free half hostage.
   *
   * An EMPTY array means never gated — for a surface that must stay reachable
   * however the account is configured (Your sparx bill is where someone goes to
   * BUY a module; hiding it behind one is a locked door with the key inside).
   *
   * This is about what is worth showing, never about enforcement: api-rest gates
   * every module route independently.
   */
  readonly requiresModules?: readonly string[];
  readonly icon: LucideIcon;
  readonly component: ComponentType<{ ctx: SurfaceContext }>;
  /**
   * At most one instance may be open across ALL windows. For surfaces where a
   * second copy is meaningless rather than useful (settings, the activity feed).
   * Entity surfaces are never singletons — comparing two orders side by side is
   * a feature, not a mistake.
   */
  readonly singleton?: boolean;
  /** Shown in the launcher AND the navigation panel. Off for surfaces only reachable from a parent. */
  readonly listed?: boolean;
  /**
   * Group heading within the module's nav panel, e.g. 'Catalog', 'Orders'.
   * Surfaces with no section sit at the top of the panel, above every group —
   * that's the right place for a module's "everything" landing surface.
   *
   * Navigation is DERIVED from these, never hand-maintained. A surface cannot
   * exist-but-be-unreachable, which is the exact bug class the dashboard's
   * hand-synced registries produce.
   */
  readonly section?: string;
  /**
   * Sort order within the MODULE — not within the section. Lower sorts first;
   * ties fall back to title.
   *
   * Section order is then the order each section first appears in that sorted
   * list, so `order` controls BOTH item order and section order together.
   * Number across the whole module with gaps (Catalog 10/11/12, Pricing 20/21,
   * After the sale 30) rather than restarting per section — restarting makes
   * two sections tie on 1, and the winner is then decided alphabetically by
   * title, which is how "Pricing" ended up above "Catalog".
   */
  readonly order?: number;
  /**
   * Surface that CREATES one of these, e.g. `invoicing.invoice.edit`. When set,
   * the nav panel renders a `+` beside this row so "make a new one" skips the
   * trip through the list. Declared here rather than in the nav so the affordance
   * can only appear where creating is genuinely possible — a `+` that opens
   * nothing is worse than no `+`.
   */
  readonly createSurface?: string;
  /** Tooltip for that `+`, e.g. 'New invoice'. Falls back to 'New'. */
  readonly createLabel?: string;
  /**
   * A live count of things WAITING on a person here — posts to approve, comments to
   * answer — rendered as a badge on this surface's nav row.
   *
   * A React hook, not a number: the count has to stay current without anyone reloading,
   * and the surface that owns the data is the only place that knows how to read it. It is
   * called from a dedicated child component per row, so hook order stays stable.
   *
   * Return `0`/`null` for "nothing waiting" — a badge showing zero is worse than no badge,
   * because it trains people to ignore the thing that is supposed to catch their eye. Use
   * this ONLY where a number means someone has to act; a row count is not attention.
   */
  readonly useBadgeCount?: () => number | null | undefined;

  /**
   * Params to open this row with, when the row is not simply "the surface".
   *
   * ONE surface, MANY nav rows. A tenant that invents Projects, Venues and
   * Contracts gets three rows in Customers, and all three are the same generic
   * records surface told which record type it is looking at — the alternative
   * is registering a surface per record type at runtime, and surface keys are
   * persisted in saved layouts, so minting them from tenant data would put a
   * tenant's vocabulary inside everyone's stored layout forever.
   *
   * Static surfaces leave this unset and open with no params, exactly as before.
   */
  readonly defaultParams?: SurfaceParams;

  /** Extra command-palette search terms beyond the title. */
  readonly keywords?: readonly string[];
  /** Preferred initial width as a fraction of the window, when opened `beside`. */
  readonly besideWidth?: number;
}

const registry = new Map<string, SurfaceDefinition>();

export function registerSurface(definition: SurfaceDefinition): void {
  if (registry.has(definition.key)) {
    throw new Error(
      `Surface "${definition.key}" is already registered. Surface keys are persisted in saved layouts, so they must be unique and stable.`
    );
  }
  registry.set(definition.key, definition);
}

export function registerSurfaces(definitions: readonly SurfaceDefinition[]): void {
  for (const definition of definitions) registerSurface(definition);
}

export function getSurface(key: string): SurfaceDefinition | undefined {
  return registry.get(key);
}

export function listSurfaces(): SurfaceDefinition[] {
  return [...registry.values()];
}

/** Surfaces the launcher and command palette offer, grouped-friendly (module order preserved). */
export function listedSurfaces(): SurfaceDefinition[] {
  return listSurfaces().filter((surface) => surface.listed !== false);
}

export function resolveTitle(definition: SurfaceDefinition, params: SurfaceParams): string {
  return typeof definition.title === 'function' ? definition.title(params) : definition.title;
}

/**
 * What the console calls the screen at `key`, for a sentence or a button that
 * points at it. Null when the key is unknown, which is the caller's cue to not
 * offer the pointer at all rather than to name a screen that is not there.
 *
 * Read rather than typed: a screen's name is settled in the registry, so prose
 * that hard-codes it goes stale the moment the registry moves. A FUNCTION title
 * is naming a record, not a screen, so there is nothing static to hand back.
 */
export function surfaceTitle(key: string): string | null {
  const definition = registry.get(key);
  if (!definition || typeof definition.title === 'function') return null;
  return definition.title;
}

/** Tab label for a descriptor, preferring an operator-set title. */
export function titleFor(descriptor: PaneDescriptor): string {
  if (descriptor.title) return descriptor.title;
  const definition = registry.get(descriptor.surface);
  if (!definition) return 'Unknown';
  return resolveTitle(definition, descriptor.params ?? {});
}
