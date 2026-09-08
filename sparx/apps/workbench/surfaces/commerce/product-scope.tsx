'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE PRODUCT-SCOPED SURFACE CONVENTION
//
// Read this before building any pane that shows one product's data — Stock,
// Fitment, Configurator, Trade pricing, Reviews, Channels, Dropshipping,
// Subscriptions. Every one of them implements the contract below, and the point
// of the contract is that they all behave the SAME when the product they are
// looking at goes away, changes, or was never chosen.
//
// ── Why these are panes and not tabs ─────────────────────────────────────
//
// Stock and Fitment are not facets of a product record; they are OTHER MODULES'
// functionality seen through one product. Making them tabs would mean you can
// only ever look at one at a time, inside a pane you cannot detach — which is
// the exact composition-over-surfaces mistake this app exists to undo. As panes
// they dock side by side, tear onto a second monitor, and survive a reload.
//
// ── How a pane learns which product it is about ──────────────────────────
//
// Two modes, decided by ONE param, and a pane never chooses for itself:
//
//   params.productId PRESENT  → PINNED.  This pane is about that product and
//                               nothing else, forever. Nothing can retarget it.
//   params.productId ABSENT   → FOLLOWING. It tracks the product selection (see
//                               below) and re-points as the operator moves.
//
// Pinned is the default everywhere it matters, because it is the one that
// survives: it round-trips through the persisted layout, through a deep link,
// and through a tear-off into another window. `openProductFacet()` below always
// pins, so every pane opened from a product's own toolbar is pinned.
//
// Following exists for the inspector habit — dock Stock once, leave it there,
// let it answer for whatever you are looking at. It is opt-in: an operator gets
// it by opening the facet from the launcher rather than from a product.
//
// ── The selection channel ────────────────────────────────────────────────
//
// A following pane cannot read "the active pane", because the moment you click
// INTO the Stock pane, the active pane is Stock. So selection is published
// deliberately: a pane that is ABOUT a product calls `useAnnounceProduct(id)`,
// and that announcement wins while that pane holds focus. The product detail
// pane is the only announcer today; a future "products in a grid" surface would
// announce too. Nothing else may write to this channel.
//
// It mirrors over BroadcastChannel for the same reason drafts do: a second
// independently-opened workbench tab has its own module instance. A dockview
// popout shares this module by reference and needs no message at all.
//
// ── Sharing a following pane ─────────────────────────────────────────────
//
// "Send me that" means the product on screen, so a following pane copies a link
// that PINS the product it is currently showing. It does that by declaring the
// params for links only (`useShareAs`, lib/workbench/share-as.ts) — its own
// descriptor is untouched, so the pane goes on following after the copy.
//
// ── The four states, and why a pane may not invent a fifth ───────────────
//
// `useProductScope` returns a discriminated union. Everything that is not
// `ready` is rendered by `<ProductScopeFallback>`, which every pane uses
// verbatim — so "no product chosen", "still loading", "that product was
// deleted" and "the server is unreachable" look and read identically in eight
// different panes instead of eight ways.
//
//   none    → following, nothing announced yet. Says how to choose one.
//   loading → we know the id, the record has not arrived.
//   missing → the server says that product does not exist (deleted, or a stale
//             pinned id restored from a saved layout).
//   error   → the fetch failed. Offers a retry. NOT the same as missing, and
//             conflating them tells someone their product was deleted when the
//             wifi dropped.
//   ready   → the product is here. The pane renders its own body.
//
// ── Deletion, and why a pinned pane must not re-point ────────────────────
//
// When a product is deleted, its detail pane closes and every scoped pane about
// it lands on `missing`. A PINNED pane stays there and offers to close itself.
// It must never quietly re-point at another product: the pane's tab still says
// the old name, and someone editing stock levels against a product that
// silently became a different product is the worst outcome this file can cause.
// A FOLLOWING pane also lands on `missing` rather than jumping, and moves only
// when a new product is genuinely announced.
//
// ── Unsaved work freezes following ───────────────────────────────────────
//
// A following pane holding unsaved edits must not re-point underneath them —
// that is data loss with no dialog. Pass `hold: true` (wire it to the same
// boolean you give `useDirtySource`) and the pane freezes on its current
// product until the work is saved or discarded. The correct habit for a pane
// that edits is to PIN on first edit instead; `scope.pin()` does that, keeps
// the pane's slot, and is a one-liner.
//
// ── Two panes on the same product ────────────────────────────────────────
//
// Nothing special happens, and that is the design. They read the same query
// keys (see products-data.ts), so it is one fetch, one cache entry, two
// renderers. A write in either invalidates the shared keys and both re-render.
// Duplicate panes on one product are a supported thing to want — Stock beside
// Fitment beside the editor is the whole reason for the split.
// ══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Button, EmptyState, Heading, Text } from '@wizeworks/silicaui-react';
import { Package, PackageX, Search, ServerCrash } from 'lucide-react';
import { useWorkbench } from '../../lib/workbench/context';
import { usePaneId } from '../../lib/workbench/dirty';
import { useShareAs } from '../../lib/workbench/share-as';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useProduct, type Product } from './products-data';

/* ── The selection channel ──────────────────────────────────────────────── */

interface Selection {
  productId: string;
  /** Carried so a following pane can title itself before the record loads. */
  title: string | null;
}

const SELECTION_CHANNEL = 'sparx-workbench-product-selection';

/* ── The selection outlives the page, because the layout does ─────────────
 *
 * A following pane came back from a reload saying "Choose a product first"
 * while the product pane it had been following sat two tabs away, fully
 * restored. Nothing was lost, but the screen said otherwise, and the way out —
 * click the product pane, come back — is not something the sentence suggests.
 *
 * The selection is one id, so it is kept beside the layout it belongs to: same
 * localStorage, same per-site key, same lifetime. Restore the workspace and the
 * pane is still looking at what it was looking at.
 *
 * Per SITE, not global: a product id means nothing under a different site, and
 * seeding one would land the pane on "that product does not exist", which reads
 * as a deletion rather than a switch.
 *
 * Found and driven on screen in the other console; this is its own copy, not an
 * import, since neither brand tree may depend on the other. */
function selectionKey(): string {
  const site = new URLSearchParams(window.location.search).get('site') ?? 'default';
  return `${SELECTION_CHANNEL}:${site}`;
}

function readStoredSelection(): Selection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(selectionKey());
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { productId, title } = parsed as Partial<Selection>;
    if (typeof productId !== 'string') return null;
    return { productId, title: typeof title === 'string' ? title : null };
  } catch {
    // A private window, cleared site data, or a half-written value. A pane with
    // no selection is the state this already handles well.
    return null;
  }
}

function storeSelection(next: Selection | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (next === null) window.localStorage.removeItem(selectionKey());
    else window.localStorage.setItem(selectionKey(), JSON.stringify(next));
  } catch {
    // Storage refused. The in-memory selection still works for this page.
  }
}

let selection: Selection | null = readStoredSelection();
const selectionListeners = new Set<() => void>();

let channel: BroadcastChannel | null = null;

function ensureChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  channel ??= new BroadcastChannel(SELECTION_CHANNEL);
  return channel;
}

function emitSelection(): void {
  for (const listener of selectionListeners) listener();
}

if (typeof BroadcastChannel !== 'undefined') {
  ensureChannel()?.addEventListener('message', (event: MessageEvent<Selection | null>) => {
    // Not persisted: the tab that announced has already written it under ITS
    // site.s key, and this tab may be on a different site.
    selection = event.data;
    emitSelection();
  });
}

function setSelection(next: Selection | null): void {
  if (selection?.productId === next?.productId && selection?.title === next?.title) return;
  selection = next;
  storeSelection(next);
  emitSelection();
  ensureChannel()?.postMessage(next);
}

function subscribeSelection(listener: () => void): () => void {
  selectionListeners.add(listener);
  return () => {
    selectionListeners.delete(listener);
  };
}

/** Server snapshot — nothing is selected until a pane announces in the browser. */
function serverSelection(): Selection | null {
  return null;
}

function useSelection(): Selection | null {
  return useSyncExternalStore(subscribeSelection, () => selection, serverSelection);
}

/**
 * Declares "this pane is about this product", which is what following panes
 * track. Call it from any pane that shows ONE product as its subject.
 *
 * Announces while this pane holds focus, and re-announces when focus returns to
 * it — so two product panes side by side hand the selection back and forth as
 * the operator moves between them, rather than the last one MOUNTED winning
 * forever. Passing null (the record has not loaded, or the pane is showing a
 * create form) announces nothing rather than clearing someone else's selection.
 */
export function useAnnounceProduct(productId: string | null, title: string | null): void {
  const ownPaneId = usePaneId();
  const activePaneId = useActivePaneId();
  // Mount announces once even before focus is reported, so a product opened
  // into a background tab group still becomes the selection. After that, only
  // the ACTIVE pane may announce.
  const announcedRef = useRef(false);

  useEffect(() => {
    if (!productId) return;
    const isActive = ownPaneId !== null && ownPaneId === activePaneId;
    // Without this guard every announcing pane re-runs its effect whenever
    // focus moves anywhere, and the winner is decided by effect order — i.e.
    // arbitrarily. Two product panes side by side would fight over the
    // selection on every click.
    if (!isActive && announcedRef.current) return;
    announcedRef.current = true;
    setSelection({ productId, title });
  }, [productId, title, ownPaneId, activePaneId]);
}

/**
 * The active pane id, as a primitive so `useSyncExternalStore` gets a stable
 * snapshot. Read off the controller directly rather than through a shared hook
 * so this convention adds no exports to lib/workbench — one less shared file
 * for parallel work to collide on.
 */
function useActivePaneId(): string | null {
  const { controller } = useWorkbench();
  const getSnapshot = useCallback(() => controller.getActiveDescriptor()?.id ?? null, [controller]);
  return useSyncExternalStore(controller.subscribe, getSnapshot, () => null);
}

/* ── Opening a facet ────────────────────────────────────────────────────── */

/** Same modifier contract as every list in the app. */
export function facetTarget(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  // A facet is the companion-pane case by definition, so an unmodified click
  // opens it BESIDE rather than on top of the product it is about. Shift asks
  // for a plain tab, inverting the usual contract on purpose: covering the
  // product with its own stock levels is never what was meant.
  if (event.shiftKey) return 'tab';
  return 'beside';
}

/**
 * Opens a product-scoped pane, PINNED to that product.
 *
 * Every "open Stock for this product" affordance goes through here, so no pane
 * has to remember that the param is called `productId` or that pinning is the
 * default.
 */
export function openProductFacet(
  ctx: SurfaceContext,
  surface: string,
  productId: string,
  event?: { shiftKey: boolean; altKey: boolean }
): void {
  ctx.open(surface, { productId }, { target: event ? facetTarget(event) : 'beside' });
}

/* ── The scope hook ─────────────────────────────────────────────────────── */

export type ProductScope =
  | { state: 'none'; productId: null; product: null; isFollowing: true; pin: null; retry: null }
  | {
      state: 'loading' | 'missing' | 'error';
      productId: string;
      product: null;
      isFollowing: boolean;
      pin: () => void;
      retry: () => void;
    }
  | {
      state: 'ready';
      productId: string;
      product: Product;
      isFollowing: boolean;
      pin: () => void;
      retry: () => void;
    };

export interface ProductScopeOptions {
  /**
   * What this pane is, in the operator's words — "Stock", "Fitment". Used for
   * the tab title (`Stock · Enamel Camp Mug`) and in the empty states, so they
   * read as being about something rather than as a generic error.
   */
  label: string;
  /**
   * Freeze a following pane on its current product. Wire it to the same boolean
   * you pass `useDirtySource`. Ignored when pinned — a pinned pane never moves.
   */
  hold?: boolean;
}

/**
 * Resolves which product this pane is about, and the state of getting it.
 *
 * ```tsx
 * export function StockSurface({ ctx }: { ctx: SurfaceContext }) {
 *   const scope = useProductScope(ctx, { label: 'Stock' });
 *   if (scope.state !== 'ready') return <ProductScopeFallback ctx={ctx} scope={scope} label="Stock" />;
 *   return <StockBody product={scope.product} />;
 * }
 * ```
 */
export function useProductScope(ctx: SurfaceContext, options: ProductScopeOptions): ProductScope {
  const pinned = typeof ctx.params.productId === 'string' ? ctx.params.productId : null;
  const current = useSelection();

  // While held, a following pane keeps whatever it last resolved. The ref is
  // what makes "freeze" mean freeze: reading the live selection and ignoring it
  // would still re-render on every change, and any child keyed on the id would
  // remount underneath the unsaved work we are protecting.
  const heldRef = useRef<string | null>(null);
  const followed = current?.productId ?? null;
  if (!options.hold) heldRef.current = followed;
  const effective = pinned ?? (options.hold ? (heldRef.current ?? followed) : followed);

  const query = useProduct(effective ?? 'new');
  const product = effective ? (query.data ?? null) : null;

  const isFollowing = pinned === null;

  // "Send me that" means the product on screen. A following pane has no
  // productId in its own params — that absence IS what makes it follow — so
  // `buildPath` returns null and the copy-link control hides, which takes away
  // the one thing anybody actually wants to send. Declaring the params for LINKS
  // only fixes the address without touching the descriptor, so the pane goes on
  // following after the copy. See lib/workbench/share-as.ts.
  useShareAs(isFollowing && effective ? { ...ctx.params, productId: effective } : null);

  useEffect(() => {
    ctx.setTitle(product ? `${options.label} · ${product.title}` : options.label);
  }, [ctx, product, options.label]);

  const pin = useCallback(() => {
    if (!effective) return;
    // `replace` keeps this pane's slot, size and order — it is the same
    // mechanism a create form uses to become the manage form.
    ctx.open(ctx.descriptor.surface, { productId: effective }, { target: 'replace' });
  }, [ctx, effective]);

  const retry = useCallback(() => {
    void query.refetch();
  }, [query]);

  if (!effective) {
    return {
      state: 'none',
      productId: null,
      product: null,
      isFollowing: true,
      pin: null,
      retry: null,
    };
  }

  // A 404 is a FACT about the product ("it is gone"); anything else is a fact
  // about the network. Telling someone their product was deleted because a
  // request timed out is the one confusion worth writing extra code to avoid.
  const state: ProductScope['state'] = query.isError
    ? isNotFound(query.error)
      ? 'missing'
      : 'error'
    : product
      ? 'ready'
      : 'loading';

  if (state === 'ready' && product) {
    return { state: 'ready', productId: effective, product, isFollowing, pin, retry };
  }
  return {
    state: state === 'ready' ? 'loading' : state,
    productId: effective,
    product: null,
    isFollowing,
    pin,
    retry,
  };
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: unknown }).status === 404
  );
}

/* ── The shared non-ready rendering ─────────────────────────────────────── */

/**
 * Everything a scoped pane shows when it does not have a product. Used verbatim
 * by every facet pane so the eight of them cannot drift into eight dialects of
 * "nothing here".
 *
 * It renders the full pane shell (including a toolbar) rather than bare
 * content, because a pane that loses its toolbar when it loses its product
 * jumps by the height of the bar every time the selection changes.
 */
export function ProductScopeFallback({
  ctx,
  scope,
  label,
}: {
  ctx: SurfaceContext;
  scope: ProductScope;
  label: string;
}) {
  return (
    <div className={PANE_SHELL}>
      <PaneToolbar label={`${label} actions`}>
        <Heading level={2} className="text-base font-semibold">
          {label}
        </Heading>
      </PaneToolbar>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
        <ScopeMessage ctx={ctx} scope={scope} label={label} />
      </div>
    </div>
  );
}

function ScopeMessage({
  ctx,
  scope,
  label,
}: {
  ctx: SurfaceContext;
  scope: ProductScope;
  label: string;
}) {
  if (scope.state === 'none') {
    return (
      <EmptyState
        icon={<Search className="size-6" aria-hidden />}
        title="Choose a product first"
        description={`This panel shows ${label.toLowerCase()} for one product at a time. Open a product and it will follow along — or open this from a product to keep it fixed on that one.`}
        actions={
          <Button
            size="sm"
            color="module"
            onClick={(event) => {
              ctx.open('commerce.products.list', undefined, {
                target: event.shiftKey ? 'beside' : 'tab',
              });
            }}
          >
            <Package className="size-4" aria-hidden />
            Browse products
          </Button>
        }
      />
    );
  }

  if (scope.state === 'loading') {
    return (
      <p className="text-sm" role="status">
        Loading…
      </p>
    );
  }

  if (scope.state === 'missing') {
    return (
      <EmptyState
        icon={<PackageX className="size-6" aria-hidden />}
        title="That product is no longer here"
        description="It has been deleted, or it belongs to a different site from the one you are working in. Nothing shown here applies to it any more."
        actions={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              size="sm"
              color="module"
              onClick={(event) => {
                ctx.open('commerce.products.list', undefined, {
                  target: event.shiftKey ? 'beside' : 'tab',
                });
              }}
            >
              Browse products
            </Button>
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              onClick={() => {
                ctx.close();
              }}
            >
              Close this panel
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={<ServerCrash className="size-6" aria-hidden />}
      title={`Could not load ${label.toLowerCase()}`}
      description="This is a problem reaching the server. Nothing about the product has changed — it just could not be read just now."
      actions={
        <Button size="sm" color="module" onClick={scope.retry}>
          Try again
        </Button>
      }
    />
  );
}

/**
 * The one-line strip a FOLLOWING pane shows above its body, so it is never a
 * mystery why the panel changed under you. A pinned pane shows nothing — it
 * cannot change, so saying so every time is noise.
 */
export function FollowingNotice({ scope }: { scope: ProductScope }) {
  if (!scope.isFollowing || scope.state !== 'ready') return null;
  return (
    <div className="border-base-300 flex flex-wrap items-center gap-2 border-b px-1 pb-2">
      <Text className="text-sm">Following whichever product you open.</Text>
      <Button size="sm" variant="ghost" color="module" onClick={scope.pin}>
        Keep it on {scope.product.title}
      </Button>
    </div>
  );
}
