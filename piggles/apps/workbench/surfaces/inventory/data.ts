'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE SHARED STOCK DATA LAYER
//
// Every read and write behind the Stock surfaces lives here: the list, the
// per-item pane, and anything added to the inventory module later. No surface
// in this folder declares a query key, a fetch or a row type of its own.
//
// ── The key contract ─────────────────────────────────────────────────────
//
//   stockKeys.all                   ['inventory','stock']
//   stockKeys.levels(query)         …,'levels',{query}   one list window
//   stockKeys.item(variantId)       …,'item',<id>        one SKU's levels
//   stockKeys.itemPart(id,'holds')  …,'item',<id>,'holds'
//
// Everything about ONE sku nests under `stockKeys.item(id)`, so invalidating
// that prefix refreshes the levels, the holds and the ledger for every pane
// docked against it in one call.
//
// ── One read per question, never a loop ──────────────────────────────────
//
// `GET /v1/inventory` answers "every level for this variant, all warehouses" in
// ONE request (`variant_id`, added for this surface), and the same endpoint
// answers the list with server-side search, location filter, low-stock filter,
// sort and paging. A client that loads a page and then sorts or filters it in
// the browser is sorting ONE page and presenting it as the answer — "what is
// nearly out of stock" would return the scarcest thing on page three.
//
// ── A note on the parallel copies in commerce/products-data.ts ───────────
//
// That file declares its own `ProductStockLevel` / `StockMovement` /
// `StockReservation` / `StockLocation` for the product-scoped Stock facet pane,
// and they describe the same server rows these do. Stock shapes belong to THIS
// module, so the two should collapse into one — with products-data re-exporting
// from here. Not done in this change because that file is being edited
// concurrently and a rename across both is how a merge breaks two panes at
// once. `stockKeys.locations()` is deliberately spelled identically to the key
// products-data uses, so the two at least share the one cache entry today.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';

/* ── Shapes ─────────────────────────────────────────────────────────────── */

/**
 * One (variant × location) stock level — the row this whole module is about.
 *
 * A SKU kept in three places is three of these, which is why the list is longer
 * than the catalog and why the item pane sums across them rather than expecting
 * one.
 */
export interface StockLevel {
  variantId: string;
  /** The product code. Null only on a variant saved without one. */
  sku: string | null;
  productId: string;
  productTitle: string | null;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  /** What is physically there. Only ever changed through the movement ledger. */
  onHand: number;
  /** Spoken for by baskets and orders that have not shipped. */
  allocated: number;
  /** The server's `onHand − allocated`. NOT what a shopper can buy — see `sellable`. */
  available: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  /** How long a restock takes to arrive. The other half of a reorder point:
   *  "reorder at 5" only means something against how long you then wait. */
  leadTimeDays: number | null;
  /** Units deliberately held back from your website as a cushion. */
  safetyBuffer: number;
  /** The standard cost, typed in. `avgCostCents` is the moving average the
   *  system recomputes from costed deliveries. */
  unitCostCents: number | null;
  avgCostCents: number | null;
  updatedAt: string;
  /** When the QUANTITY was last established — NOT when the row was last touched.
   *  Editing a reorder point moves `updatedAt` and leaves this alone, which is
   *  exactly why the freshness hint reads this one. */
  asOf: string;
  /** Seconds since `asOf`, worked out on the server so a browser with a wrong
   *  clock cannot paint a whole list as stale. */
  ageSeconds: number;
}

/** A place stock is kept — a warehouse, a shop floor, a van. */
export interface StockLocation {
  id: string;
  name: string;
  code: string;
  type: string;
  city: string | null;
  region: string | null;
  country: string | null;
  isActive: boolean;
}

/** One hold against stock — the itemisation of a level's `allocated` count. */
export interface StockHold {
  id: string;
  variantId: string;
  variantSku: string | null;
  warehouseId: string;
  warehouseName: string | null;
  warehouseCode: string | null;
  quantity: number;
  /** `cart` | `order` | `subscription`. */
  holderType: string;
  holderId: string;
  status: string;
  /** When a basket hold lapses on its own. Null on an order hold, which does not. */
  expiresAt: string | null;
  createdAt: string;
  releasedAt: string | null;
}

/** One line of the append-only stock ledger. */
export interface StockMovement {
  id: string;
  variantId: string;
  variantSku: string | null;
  warehouseId: string;
  warehouseName: string | null;
  warehouseCode: string | null;
  /** Signed change to on-hand. */
  delta: number;
  balanceAfter: number | null;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  actorType: string;
  actorId: string | null;
  note: string | null;
  createdAt: string;
}

/* ── Query keys ─────────────────────────────────────────────────────────── */

export type StockSortKey = 'updatedAt' | 'available' | 'sku' | 'product';
export type SortDirection = 'asc' | 'desc';

export interface StockQuery {
  q?: string;
  /** Narrow to one location. Undefined means everywhere. */
  warehouseId?: string;
  /** Only what is at or below its reorder point AND still sellable. */
  lowStockOnly?: boolean;
  /** Only what has nothing left to sell. Disjoint from `lowStockOnly` above. */
  outOfStockOnly?: boolean;
  sortBy: StockSortKey;
  order: SortDirection;
  take: number;
  skip: number;
}

export const stockKeys = {
  all: ['inventory', 'stock'] as const,
  levels: (query: StockQuery) => [...stockKeys.all, 'levels', query] as const,
  item: (variantId: string) => [...stockKeys.all, 'item', variantId] as const,
  itemPart: (variantId: string, part: string) => [...stockKeys.item(variantId), part] as const,
  /** Spelled to match the key commerce/products-data.ts uses, so the two share
   *  one cache entry rather than fetching the same list twice. */
  locations: () => ['inventory', 'locations'] as const,
};

/* ── Reads ──────────────────────────────────────────────────────────────── */

/**
 * Products whose name or code matches a search that turned up NO counted stock.
 *
 * The dead end this exists for: the Stock list can only find what has a level
 * row, and a level row appears only when somebody counts something. So a real
 * product typed in by its real name comes back "Nothing matches that — try part
 * of a product name", which is advice to redo the thing that just worked. The
 * product is not missing; it has never been counted, and those are different
 * problems with different answers.
 *
 * Only fires on that dead end (`enabled`), so the ordinary path costs nothing.
 * Five is enough to recognise the one you meant without becoming a second list.
 */
export function useCatalogMatches(search: string, enabled: boolean) {
  return useQuery({
    queryKey: [...stockKeys.all, 'catalog-matches', search] as const,
    queryFn: () =>
      api.list<CatalogMatch>('/v1/commerce/products', {
        q: search,
        sort_by: 'title',
        order: 'asc',
        take: 5,
        skip: 0,
      }),
    enabled: enabled && search.length > 0,
  });
}

/**
 * Whether the scope in view holds ANY counted stock, ignoring every other
 * narrowing.
 *
 * Only asked on the dead end it exists for: "nothing is running low here" and
 * "everything has some to sell here" are good news, and both are false over a
 * location nobody has counted anything into. A place holding nothing scores zero
 * on every worry there is, so a screen that reads zero as reassurance reports
 * absence as a measurement.
 */
export function useScopeHasStock(warehouseId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...stockKeys.all, 'scope-has-stock', warehouseId] as const,
    queryFn: () =>
      api.list<StockLevel>('/v1/inventory', {
        ...(warehouseId ? { warehouse_id: warehouseId } : {}),
        take: 1,
        skip: 0,
      }),
    enabled,
  });
}

/**
 * A version on sale that has NO count anywhere.
 *
 * Not a stock position, which is why it cannot come from the list above: that
 * endpoint reads `inventory_levels`, and a version nobody has counted has no row
 * in it. It is its own question and its own route.
 */
export interface UncountedVariant {
  variantId: string;
  sku: string;
  variantTitle: string | null;
  productId: string;
  productTitle: string;
  /** What it says should happen when it runs out. `deny` here is the sharp case:
   *  the setting says stop selling, and it never fires because there is nothing
   *  to run out of. */
  inventoryPolicy: string;
}

/**
 * How many versions the current search covers that nobody has counted, and which.
 *
 * Asked ALONGSIDE the level list rather than instead of it. The catalog fallback
 * beside this one only fires when the list comes back EMPTY, so a search that
 * matched fifteen counted versions of a twenty-version shirt reported
 * "Showing 1-15 of 15" and said nothing at all about the other five (issue 444).
 *
 * The window is wider than the three codes the band names, because the band also
 * decides whether ONE product accounts for all of them — the ordinary case, and
 * the only one where a single button can finish the job. That is knowable only
 * when the whole set is in hand, so it asks for enough to usually have it and
 * falls back to naming when it does not. `total` is the number that matters and
 * the server sends it whatever the window.
 */
export function useUncountedVariants(search: string, enabled: boolean) {
  return useQuery({
    queryKey: [...stockKeys.all, 'uncounted', search] as const,
    queryFn: () =>
      api.list<UncountedVariant>('/v1/inventory/uncounted', {
        ...(search ? { q: search } : {}),
        take: 25,
        skip: 0,
      }),
    enabled,
  });
}

/** Just enough of a product to name it and open its stock panel. */
export interface CatalogMatch {
  id: string;
  title: string;
}

/**
 * One window of the stock list.
 *
 * Every narrowing is a SERVER filter, including "running low" — which is an
 * expression over three columns and therefore something only the database can
 * decide. Filtering the loaded page in the browser would answer "what is nearly
 * out of stock" with "the scarcest of the fifty rows you happen to be holding".
 */
export function useStockLevels(query: StockQuery) {
  return useQuery({
    queryKey: stockKeys.levels(query),
    queryFn: () =>
      api.list<StockLevel>('/v1/inventory', {
        ...(query.q ? { q: query.q } : {}),
        ...(query.warehouseId ? { warehouse_id: query.warehouseId } : {}),
        // `sellable_only` alongside `low_stock_only` is what makes the filter
        // agree with the badge: bare, the low predicate also matches levels at
        // zero, which every row badges "None to sell" and never "Running low".
        ...(query.lowStockOnly ? { low_stock_only: true, sellable_only: true } : {}),
        ...(query.outOfStockOnly ? { out_of_stock_only: true } : {}),
        sort_by: query.sortBy,
        order: query.order,
        take: query.take,
        skip: query.skip,
      }),
    // Keeps the current window on screen while the next one loads, so paging
    // and re-sorting don't blink the table out to an empty state and back.
    placeholderData: (previous) => previous,
  });
}

/**
 * Every level for ONE sku, across every location, in one request.
 *
 * `take: 200` is the endpoint's ceiling and clears any realistic number of
 * locations several times over. A business that genuinely exceeds it needs a
 * paged item pane, never a loop over warehouses.
 */
export function useStockItem(variantId: string) {
  return useQuery({
    queryKey: stockKeys.item(variantId),
    queryFn: () => api.list<StockLevel>('/v1/inventory', { variant_id: variantId, take: 200 }),
    // A 404 means the variant is gone, which is an answer rather than a fault —
    // retrying it three times just delays saying so.
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/** What is holding this sku's stock right now. */
export function useStockHolds(variantId: string) {
  return useQuery({
    queryKey: stockKeys.itemPart(variantId, 'holds'),
    queryFn: () =>
      api.list<StockHold>('/v1/inventory/reservations', {
        variant_id: variantId,
        status: 'active',
        take: 100,
      }),
  });
}

/** What has happened to this sku's counts lately, newest first. */
export function useStockHistory(variantId: string) {
  return useQuery({
    queryKey: stockKeys.itemPart(variantId, 'history'),
    queryFn: () =>
      api.list<StockMovement>('/v1/inventory/movements', { variant_id: variantId, take: 50 }),
  });
}

/**
 * Every place this business keeps stock.
 *
 * Long-lived: locations are set up once and then referenced constantly. The
 * item pane needs the FULL list, not just the ones with a level row, because
 * "this is not stocked at the Portland shop" is a real answer and it can only
 * be given by knowing Portland exists.
 */
export function useStockLocations() {
  return useQuery({
    queryKey: stockKeys.locations(),
    queryFn: () => api.list<StockLocation>('/v1/inventory/locations', { take: 250 }),
    staleTime: 5 * 60_000,
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

/**
 * The ONE way anything in this cluster says "that changed".
 *
 * Also reaches ACROSS to the commerce product cache, and that is the point: a
 * count recorded here moves the number in the product's Stock panel, which may
 * be docked in the next pane along. Two surfaces onto one fact, so a write in
 * either has to refresh both — the alternative is a saved count sitting beside
 * a stale one with no indication which is true.
 */
export function useInvalidateStock() {
  const queryClient = useQueryClient();

  return (variantId?: string, productId?: string) => {
    void queryClient.invalidateQueries({ queryKey: stockKeys.all });
    if (variantId) void queryClient.invalidateQueries({ queryKey: stockKeys.item(variantId) });
    if (productId) {
      void queryClient.invalidateQueries({ queryKey: ['commerce', 'products', productId] });
    }
  };
}

/* ── Writes ─────────────────────────────────────────────────────────────── */

/**
 * Correct the counted quantity of one sku at one place.
 *
 * Sends an ABSOLUTE `onHand` rather than a difference, because that is what the
 * person is doing: they counted the shelf and it says nine. Making them work
 * out "minus two" from a figure they already believe is wrong is how a
 * correction becomes a second error. The server reconciles it to a movement
 * under a row lock, so a sale landing mid-count cannot be overwritten.
 */
export function useRecordCount() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (input: {
      variantId: string;
      productId?: string;
      warehouseId: string;
      onHand: number;
      note?: string;
    }) =>
      api.patch<{ onHand: number; available: number }>(`/v1/inventory/${input.variantId}`, {
        warehouseId: input.warehouseId,
        onHand: input.onHand,
        reason: 'recount',
        ...(input.note ? { note: input.note } : {}),
      }),
    onSuccess: (_result, input) => {
      invalidate(input.variantId, input.productId);
    },
  });
}

/** When to reorder this sku at this place, how many to get, and how long it
 *  takes to arrive. All three together, because a trigger without a lead time
 *  is a guess. */
export function useSetReorderRule() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (input: {
      variantId: string;
      productId?: string;
      warehouseId: string;
      reorderPoint: number;
      reorderQuantity: number;
      leadTimeDays?: number;
    }) =>
      api.post('/v1/inventory/reorder-policy', {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        reorderPoint: input.reorderPoint,
        reorderQuantity: input.reorderQuantity,
        ...(input.leadTimeDays != null ? { leadTimeDays: input.leadTimeDays } : {}),
      }),
    onSuccess: (_result, input) => {
      invalidate(input.variantId, input.productId);
    },
  });
}

/** How many units to hold back from your website as a cushion. */
export function useSetSafetyBuffer() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (input: {
      variantId: string;
      productId?: string;
      warehouseId: string;
      safetyBuffer: number;
    }) =>
      api.post('/v1/inventory/safety-buffer', {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        safetyBuffer: input.safetyBuffer,
      }),
    onSuccess: (_result, input) => {
      invalidate(input.variantId, input.productId);
    },
  });
}

/* ── Saying what a number means ─────────────────────────────────────────── */

/**
 * The color a value's MEANING resolves to, handed straight to a silicaui
 * `color` prop.
 *
 * The five semantics carry state — is this good, bad, or worth a second look.
 * The two module identities carry WHOSE functionality a value belongs to, which
 * is a different axis and one the semantics cannot express: an ownership badge
 * saying "on consignment" is not a warning and not a success, it is a fact about
 * which module owns the arrangement (DESIGN.md, RULE #4). Reaching for `neutral`
 * there would flatten four distinct classes into the same grey, which is exactly
 * what neutral has to be earned against.
 */
export type Tone =
  'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'module-inventory' | 'module-crm';

/**
 * How many a shopper could actually buy right now.
 *
 * NOT `level.available`, and the difference is the whole reason this exists.
 * The server's `available` is `onHand − allocated` and stops there, but the sell
 * path also withholds the safety buffer — so on a buffered level `available` is
 * a number nobody can ever reach. Derived here rather than corrected in the API
 * because `available` is a documented public field integrators already read.
 */
export function sellable(level: {
  onHand: number;
  allocated: number;
  safetyBuffer: number;
}): number {
  return Math.max(0, level.onHand - level.allocated - level.safetyBuffer);
}

export interface StockState {
  label: string;
  tone: Tone;
}

/**
 * What a level means for selling, in the words an owner would use.
 *
 * Derived from what a shopper can BUY — not from on-hand, which can be
 * plentiful while every unit is already spoken for or held back.
 */
export function levelState(level: {
  onHand: number;
  allocated: number;
  safetyBuffer: number;
  reorderPoint: number | null;
}): StockState {
  const canSell = sellable(level);
  if (canSell <= 0) return { label: 'None to sell', tone: 'danger' };
  if (level.reorderPoint !== null && canSell <= level.reorderPoint) {
    return { label: 'Running low', tone: 'warning' };
  }
  return { label: 'In stock', tone: 'success' };
}

/** The worst state across a set of levels — what the sku as a whole is like. */
export function overallState(levels: StockLevel[]): StockState {
  if (levels.length === 0) return { label: 'Not counted', tone: 'info' };
  const states = levels.map(levelState);
  if (states.some((state) => state.tone === 'danger')) {
    return states.every((state) => state.tone === 'danger')
      ? { label: 'None to sell', tone: 'danger' }
      : { label: 'Out somewhere', tone: 'danger' };
  }
  if (states.some((state) => state.tone === 'warning')) {
    return { label: 'Running low', tone: 'warning' };
  }
  return { label: 'In stock', tone: 'success' };
}

/**
 * Does an uncounted version of this break a promise the shop has made?
 *
 * A version that has never been counted is UNTRACKED, so the website sells it
 * without limit (availability.ts). Whether that is a PROBLEM is the version's
 * own setting:
 *
 * - `deny` — "stop selling it when it runs out". It cannot fire while nothing
 *   has ever been counted, so the shop is promising something it cannot keep.
 *   This is the one worth telling somebody about.
 * - `continue` — "keep selling when out". Unlimited is what was asked for, so an
 *   uncounted one is behaving correctly and there is nothing to report.
 *
 * And a version that is not posted cannot sit on a shelf, so it cannot be
 * counted at all.
 *
 * The rule lives here because TWO screens ask it — the band over the stock list
 * and the summary on a product's stock pane — and the server's `/uncounted`
 * query is the third. Leaving it out of the first cut told a shop to go and
 * count 33 memberships and reports (issue 445).
 */
export function countingMatters(variant: {
  inventoryPolicy: string;
  requiresShipping: boolean;
}): boolean {
  return variant.inventoryPolicy === 'deny' && variant.requiresShipping;
}

/**
 * Name a few things inside a sentence, and stop before the sentence turns into a
 * list.
 *
 * WHICH ones is the useful part when there are three; past that the number is
 * the news and the product is where to go. `total` is the server's count, not
 * `codes.length` — the band holds a window, so counting what it happens to be
 * holding would report the window instead of the answer.
 */
export function listCodes(codes: string[], total: number): string {
  if (codes.length === 0) return '';
  const shown = codes.slice(0, 3);
  if (total > shown.length) {
    return `${shown.join(', ')} and ${String(total - shown.length)} more.`;
  }
  if (shown.length === 1) return `${String(shown[0])}.`;
  return `${shown.slice(0, -1).join(', ')} and ${String(shown[shown.length - 1])}.`;
}

/** The ledger's stored reason said in plain words. The stored words are the
 *  engineer's ("sync", "transfer_out"); these are the shop's. */
export function movementReason(reason: string): string {
  switch (reason) {
    case 'sale':
      return 'Sold';
    case 'return':
      return 'Came back from a customer';
    case 'cancel':
      return 'Put back after a cancelled order';
    case 'recount':
      return 'Counted';
    case 'loss':
      return 'Lost';
    case 'damage':
      return 'Damaged';
    case 'transfer_in':
      return 'Arrived from another location';
    case 'transfer_out':
      return 'Sent to another location';
    case 'receive':
      return 'Received from a supplier';
    case 'return_to_supplier':
      return 'Sent back to the supplier';
    case 'reserve':
      return 'Put aside for an order';
    case 'release':
      return 'Freed up again';
    case 'sync':
      return 'Corrected by a connected system';
    default:
      return 'Changed by hand';
  }
}

/** What is holding a unit, in plain words. */
export function holderLabel(holderType: string): string {
  switch (holderType) {
    case 'cart':
      return 'In someone’s basket';
    case 'order':
      return 'On an order not yet shipped';
    case 'subscription':
      return 'Held for a repeating order';
    default:
      return 'Held';
  }
}

/* ── Errors + formatting ────────────────────────────────────────────────── */

/**
 * The server's own sentence for a 4xx, shown verbatim: these routes name the
 * actual problem ("Warehouse is archived", "Variant not found") far better than
 * anything this side could infer from a status code. A 5xx carries no such
 * sentence, so it falls back to the caller's wording.
 */
export function stockErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/** True when the sku behind this pane no longer exists — a different problem
 *  from "the server is unreachable", and it deserves different words. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

export function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** How a location is named on screen. The code is what is printed on the shelf
 *  labels, so it earns its place beside the name. */
export function locationLabel(level: { warehouseName: string; warehouseCode: string }): string {
  return level.warehouseName === level.warehouseCode
    ? level.warehouseName
    : `${level.warehouseName} (${level.warehouseCode})`;
}
