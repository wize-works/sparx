import type { SparxModule } from '../../providers/module-provider';

// DOM glue for TopProgress: translate browser navigations into bar "start"
// signals, and map a path to the module whose color the bar should wear.
// Pure DOM + URL parsing — no React, no Next. The route-COMPLETE signal is the
// app feeding a changing `route` prop (it owns `usePathname()`); this file only
// detects when a navigation BEGINS.

/** Path segments that carry a module identity (each has a `--color-module-<name>`
 *  token). `platform` is intentionally absent — no segment → the bar shows the
 *  full-spectrum platform identity. */
const MODULE_SEGMENTS = new Set<string>([
  'builder',
  'commerce',
  'cms',
  'crm',
  'email',
  'b2b',
  'invoicing',
  'ai',
  'dropship',
  'inventory',
  'chat',
  'scheduling',
  'automations',
  'seo',
  'finance',
  'staff',
  'funnels',
]);

/** Legacy / not-1:1 route segments that still belong to a module's color. */
const SEGMENT_ALIASES: Record<string, SparxModule> = {
  sitebuilder: 'builder',
  storefront: 'builder',
};

/**
 * Resolve the module a route belongs to from its first path segment, or null
 * for platform-level routes (`/`, `/settings`, `/search`, …) → spectrum.
 */
export function resolveRouteModule(route: string | null | undefined): SparxModule | null {
  if (!route) return null;
  const path = route.split(/[?#]/)[0] ?? '';
  const seg = path.split('/').find(Boolean);
  if (!seg) return null;
  const lower = seg.toLowerCase();
  const alias = SEGMENT_ALIASES[lower];
  if (alias) return alias;
  return MODULE_SEGMENTS.has(lower) ? (lower as SparxModule) : null;
}

export type StartFn = (module: SparxModule | null) => void;

function isModifiedClick(e: MouseEvent): boolean {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

function anchorFrom(target: EventTarget | null): HTMLAnchorElement | null {
  let node = target as Node | null;
  while (node && node.nodeType !== 1) node = node.parentNode;
  const el = node as Element | null;
  return el?.closest?.('a') ?? null;
}

// The History patch is global and installed once; it dispatches to whichever
// listener is currently mounted (apps mount one bar for their lifetime). It is
// deliberately never un-patched — restoring on unmount would race a remount.
let historyPatched = false;
let activeStart: StartFn | null = null;

function patchHistory(): void {
  if (historyPatched || typeof history === 'undefined') return;
  historyPatched = true;
  (['pushState', 'replaceState'] as const).forEach((key) => {
    // Held unbound on purpose: `patched` below forwards the caller's own
    // receiver with `original.apply(this, args)`, so binding here would
    // pin `this` and change what a global History patch does.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = history[key];
    history[key] = function patched(
      this: History,
      ...args: Parameters<History['pushState']>
    ): void {
      const before = window.location.pathname;
      original.apply(this, args);
      const url = args[2];
      if (url == null) return;
      const after = new URL(String(url), window.location.href).pathname;
      // Path unchanged → not a real navigation (ignore search/hash-only
      // updates, e.g. a `?drawer=` sync, so the bar doesn't flash for in-page
      // state).
      if (after === before) return;
      // Defer the start signal to a microtask. App Router calls `pushState`
      // from inside a commit-phase (insertion) effect; notifying the
      // `useSyncExternalStore` bar synchronously there schedules a React update
      // mid-commit and throws "useInsertionEffect must not schedule updates."
      // A microtask runs once the commit unwinds, so the bar still starts
      // effectively immediately, just outside React's forbidden window.
      const module = resolveRouteModule(after);
      queueMicrotask(() => activeStart?.(module));
    };
  });
}

/**
 * Wire up navigation-start detection. Calls `onStart(destinationModule)` on:
 *   - a left-click on a same-origin in-app `<a>` to a different path,
 *   - back/forward (`popstate`),
 *   - programmatic `history.pushState` / `replaceState` (router.push/replace).
 * Returns a cleanup that removes the per-mount listeners.
 */
export function installNavigationListeners(onStart: StartFn): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const onClick = (e: MouseEvent): void => {
    if (isModifiedClick(e) || e.defaultPrevented) return;
    const a = anchorFrom(e.target);
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || a.target === '_blank' || a.hasAttribute('download')) return;
    if (a.origin !== window.location.origin) return;
    if (a.pathname === window.location.pathname) return; // same page / hash-only
    onStart(resolveRouteModule(a.pathname));
  };

  const onPop = (): void => onStart(resolveRouteModule(window.location.pathname));

  document.addEventListener('click', onClick, { capture: true });
  window.addEventListener('popstate', onPop);
  activeStart = onStart;
  patchHistory();

  return () => {
    document.removeEventListener('click', onClick, { capture: true });
    window.removeEventListener('popstate', onPop);
    if (activeStart === onStart) activeStart = null;
  };
}
