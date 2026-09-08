'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE SHARED PRODUCT DATA LAYER
//
// One module owns every product-shaped read and write in the workbench. The six
// tabs of the detail pane and the eight product-scoped facet panes all import
// from here, and none of them may declare a query key, a fetch, or a type of
// their own for product data.
//
// That is not tidiness. Two definitions of the same row is how a list ends up
// reading a field the other one never fetched, and two spellings of the same
// query key is how a Save in one pane leaves a stale number in the pane docked
// beside it. Both failures are invisible in the surface that causes them.
//
// ── The key contract ─────────────────────────────────────────────────────
//
//   productKeys.all                     ['commerce','products']
//   productKeys.lists()                 …,'list'          every list window
//   productKeys.list(query)             …,'list',{query}  one list window
//   productKeys.facets()                …,'facets'        type/vendor/tag lookups
//   productKeys.detail(id)              …,id              the product record
//   productKeys.facet(id,'variants')    …,id,'variants'   one facet of one product
//
// Everything about ONE product nests under `productKeys.detail(id)`, so a
// coarse invalidate of that prefix refreshes the product and every facet pane
// docked against it in one call. Two panes on the same product share the cache
// entry by construction — that is the whole answer to "what happens when two
// scoped panes are open on the same product": one fetch, two renderers, and a
// write in either updates both.
//
// ── Options and variants are related, not one blob ───────────────────────
//
// A product's OPTIONS are the axes it is sold along (Size, Color) and its
// VARIANTS are the sellable points in that space. They are separate resources
// on the server, separate query keys here, and separate tabs in the UI — an
// edit to the axes has a blast radius (removing a value destroys the SKUs
// sitting on it) that routine price entry does not.
//
// They are COUPLED, though, and the coupling is declared once in
// `DERIVED_FACETS` rather than remembered at each call site: writing the option
// lattice invalidates variants, because the server rebinds them.
//
// ── Batching, and the N+1 not to repeat ──────────────────────────────────
//
// The dashboard's product page fetches stock with one request per variant. On a
// forty-variant product that is forty round trips for one panel — and in a
// DOCKABLE app it is worse than it looks, because the operator can have Stock
// open beside the editor beside a second product, multiplying it again.
//
// So every facet here reads in ONE request keyed on the product, never a loop
// over variants. `useProductStock` is the reference: it calls
// `/v1/inventory?product_id=…`, a filter added for exactly this (see
// wizeworks/packages/inventory/src/services/public-api.ts). Any facet added later follows
// the same rule — if the endpoint cannot answer per-product in one call, the
// endpoint gets fixed rather than the client looping.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';
// The API origin, for the ONE request that cannot go through `api`: the media
// upload PUT, whose URL is pre-authorised and must not carry a bearer token.
import { getTokenState } from '../../lib/api/token';
// Stock shapes are the inventory module's (it owns stock; a product's Stock facet
// is a consumer). Imported under the commerce names the facet has always used and
// re-exported below, so there is ONE definition of each row that cannot drift.
import type {
  StockLevel as ProductStockLevel,
  StockHold as StockReservation,
  StockMovement,
  StockLocation,
} from '../inventory/data';
import { slugify, slugifyUpper } from '../../lib/slugify';
import type { ProductDeposit } from './made-to-order-data';
import { usePaymentConfig } from './providers-data';

/* ── Shapes: the product itself ─────────────────────────────────────────── */

/** Stored lifecycle. `draft` is written but not on sale, `active` is on sale,
 *  `archived` is retired but kept for history. */
export type ProductStatus = 'draft' | 'active' | 'archived';

/** A row in the catalog list. Names only what the list actually reads. */
export interface ProductRow {
  id: string;
  title: string;
  handle: string;
  status: ProductStatus;
  vendor: string | null;
  productType: string | null;
  variantCount: number;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  imageUrl: string | null;
  tags: string[];
  updatedAt: string;
}

/** One product in full, as the detail pane edits it. */
export interface Product {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  status: ProductStatus;
  productType: string | null;
  /** The typed product TYPE this product's `attributes` are governed by (docs/143),
   *  or null for an untyped product. Distinct from `productType` (the free-text
   *  merchandising label): this is the schema link. */
  productTypeKey: string | null;
  /** The typed, schema-validated attribute bag — keyed by the type's field keys.
   *  Empty on an untyped product. Edited on the Attributes tab. */
  attributes: Record<string, unknown>;
  vendor: string | null;
  tags: string[];
  fulfillmentType: string;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  hazmatClass: string;
  requiresShipping: boolean;
  taxClass: string | null;
  originCountry: string | null;
  hsCode: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
  defaultWarehouseId: string | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  inStock: boolean;
  averageRating: number | null;
  reviewCount: number;
  variantCount: number;
  /** How many option AXES this product has. Zero means a single unnamed
   *  version; anything else means the variant set is derived from the lattice
   *  and must not be added to by hand. */
  optionCount: number;
  categoryIds: string[];
  /** Every collection this product is in, however it got there. Almost nothing
   *  should read this — `collectionMemberships` says WHY, and the why is what
   *  decides whether a person is allowed to change it. */
  collectionIds: string[];
  /** The delivery group this product ships under, or null for the standard
   *  way. At most one: the rate that prices a basket has to pick exactly one. */
  shippingProfileId: string | null;
  /**
   * Why this product is in each of its collections.
   *
   * `manual` means a person put it there and a person can take it out.
   * `rule` means the collection's own rule matched this product — the indexer
   * recomputes that membership, so it is not the product's to edit, and
   * re-saving it as a manual pin would freeze the product into the collection
   * forever. See "Where shoppers find it" in product-overview.tsx.
   */
  collectionMemberships: { collectionId: string; addedBy: 'manual' | 'rule' }[];
  /** sparx.market opt-in — read by the Channels facet. */
  marketListed: boolean;
  marketCategory: string | null;
  /** Days of notice a customer has to give. Null means none. */
  orderAheadDays: number | null;
  /** How much of the price is taken up front, in one of three shapes. */
  deposit: ProductDeposit;
  /** How many can be ordered in one day. Null means no ceiling. */
  dailyLimit: number | null;
  /** Sites this product is shown on. EMPTY means every site — the default. */
  propertyIds: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

/* ── Shapes: the option lattice (the AXES) ──────────────────────────────── */

/** How an option is offered on the storefront. `swatch` needs `swatchHex`;
 *  `image_swatch` needs `swatchImageId`. */
export type OptionDisplayType = 'dropdown' | 'swatch' | 'image_swatch' | 'radio' | 'segmented';

export interface ProductOptionValue {
  id: string;
  optionId: string;
  value: string;
  /** `#RRGGBB`, set by the operator through a color control. Stored data, not
   *  a design token — this is the color of the THING being sold. */
  swatchHex: string | null;
  swatchImageId: string | null;
  position: number;
}

export interface ProductOption {
  id: string;
  productId: string;
  name: string;
  displayType: OptionDisplayType;
  position: number;
  values: ProductOptionValue[];
}

/* ── Shapes: variants (the POINTS in that space) ────────────────────────── */

export interface Variant {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  title: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  costCents: number | null;
  currency: string;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  /** What happens when stock runs out: `deny` blocks the sale, `continue`
   *  allows a backorder. */
  inventoryPolicy: string;
  requiresShipping: boolean;
  /** Overrides the product's own fulfilment type when set. */
  fulfillmentType: string | null;
  dropshipSourceId: string | null;
  /** Set when the price is derived from a markup rule rather than typed. A
   *  variant bound to a rule must not be repriced by hand without saying so. */
  markupRuleId: string | null;
  isDefault: boolean;
  position: number;
  /** Where this variant sits in the lattice — one option-value id per axis.
   *  Empty on a product with no options, and on a RETIRED one whose value was
   *  removed: the ids cascade away with it. `metadata.latticeCoordinate` is what
   *  survives that — see lastCoordinate below. */
  optionValueIds: string[];
  /** The platform's own scratch space on a variant (`customFields` is the
   *  tenant's). Read it through a named helper, never by key at a call site. */
  metadata: Record<string, unknown>;
  imageCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/* ── Shapes: media ──────────────────────────────────────────────────────── */

export interface ProductImage {
  id: string;
  /** The specific variant this image belongs to, or null for a product-level
   *  image shown for every variant. */
  variantId: string | null;
  mediaAssetId: string;
  position: number;
  /** The product's hero image — the one lists, cards and search show. */
  isPrimary: boolean;
  alt: string | null;
  /** Option values this image is pinned to, e.g. "show when Color = Red". */
  optionValueIds: string[];
}

/**
 * The FILE behind a `ProductImage`.
 *
 * `GET /products/:id/images` hands back a `mediaAssetId` and nothing you can put
 * in an `<img>` — the bytes live in the shared media library, which is its own
 * resource. So a gallery is two reads: the bindings (which image, where, pinned
 * to what) and the assets (what they look like). Both are batched; see
 * `useMediaAssets`.
 */
export interface MediaAsset {
  id: string;
  filename: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  /** The alt text stored on the FILE. A `ProductImage.alt` overrides it here. */
  altText: string | null;
  /** A URL that will actually render, or null while the file is still being
   *  processed (or, in production, if only the private original exists). */
  url: string | null;
  /**
   * Whether `url` may be handed to Next's image optimizer.
   *
   * NOT a performance hint — a correctness guard. `next/image` THROWS on a host
   * that is not in `images.remotePatterns`, and a thrown error in an `<img>`
   * takes the whole pane down. A media asset's URL is NOT guaranteed to be on
   * our own media host: a blueprint installs hot-linked stock photos and a
   * dropship supplier's catalogue import keeps the supplier's own CDN URL, and
   * both are stored verbatim as the asset key (see `serializeAsset` in
   * wizeworks/services/api-rest/src/routes/v1/media/assets.ts). No static allow-list can
   * cover "whatever CDN this merchant's supplier uses".
   *
   * So callers pass `unoptimized={!asset.canOptimize}`, which bypasses the
   * loader and the host check entirely. Ours get optimized; a stranger's render
   * as a plain image instead of crashing the tab.
   */
  canOptimize: boolean;
  /** `uploading` while the transcoder is still working, then `ready` or `failed`. */
  status: string;
}

/** The media API is snake_case and returns every transcoded size; panes want one
 *  camelCase row with one URL. Kept here so no surface ever parses this shape. */
interface MediaAssetWire {
  id: string;
  original_filename: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  status: string;
  original_url: string | null;
  variants: { id: string; format: string; width: number; height: number; url: string }[];
}

/**
 * Picks the variant to show in a gallery tile.
 *
 * Smallest rendition at least 320px wide — big enough that a tile stays sharp on
 * a high-density screen, small enough that twelve of them are not twelve full-
 * size photos. Falls back to the largest rendition, then to the original (which
 * is public in local development and private in production, hence nullable).
 */
function thumbnailUrl(wire: MediaAssetWire): string | null {
  const sorted = [...wire.variants].sort((a, b) => a.width - b.width);
  const big = sorted.find((variant) => variant.width >= 320);
  return big?.url ?? sorted.at(-1)?.url ?? wire.original_url;
}

/**
 * Is this one of OUR media URLs?
 *
 * Decided on the PATH, not the host, because the host differs per environment
 * (media.sparx.works in production, the api-rest origin in development) while
 * the path never does. It is deliberately the same predicate the allow-list in
 * next.config.mjs spells as `pathname: '/v1/public/media/**'` — if the two ever
 * disagree, the optimizer throws, so they are written to be read together.
 */
function isOwnMediaUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    return new URL(url, 'http://localhost').pathname.startsWith('/v1/public/media/');
  } catch {
    return false;
  }
}

function toMediaAsset(wire: MediaAssetWire): MediaAsset {
  const url = thumbnailUrl(wire);
  return {
    id: wire.id,
    filename: wire.original_filename,
    mimeType: wire.mime_type,
    width: wire.width,
    height: wire.height,
    altText: wire.alt_text,
    url,
    canOptimize: isOwnMediaUrl(url),
    status: wire.status,
  };
}

/* ── Shapes: pricing ────────────────────────────────────────────────────── */

/**
 * "Buy ten or more and each one is $8."
 *
 * Scoped to EITHER a variant (a storefront quantity break) or a price list (a
 * trade-account one) — never both; the server rejects a tier that sets neither
 * or sets both. The product Pricing tab only ever writes the variant kind.
 */
export interface BulkPriceTier {
  id: string;
  variantId: string | null;
  priceListId: string | null;
  /** The quantity at which this price starts applying. */
  minQuantity: number;
  unitPriceCents: number;
}

/**
 * One trade price: what a particular price list charges for one variant of this
 * product.
 *
 * A price list is a named set of prices for a channel or a trade account (a
 * wholesale sheet, a distributor's rates). A shopper on that list pays these
 * instead of the shelf price. The Pricing tab reads them ONLY to show them —
 * entries are authored on the price list itself, which is where the currency,
 * targeting and status live too. `priceListStatus` is `draft` (not live yet) or
 * `active`; archived lists are not returned.
 *
 * Priced EITHER as a flat `fixedPriceCents` or as `percentOffList` (a discount
 * off the variant's own price) — exactly one is set, mirroring how the entry was
 * written. `minQuantity` is the count at which the price starts applying.
 */
export interface ProductPriceListEntry {
  id: string;
  priceListId: string;
  priceListName: string;
  priceListStatus: string;
  currency: string;
  variantId: string;
  variantSku: string;
  fixedPriceCents: number | null;
  percentOffList: number | null;
  minQuantity: number;
  maxQuantity: number | null;
}

/**
 * A rule that WORKS OUT a price from what a variant cost, so nobody types it.
 *
 * The full server row is much larger (bands, rounding, floors, ceilings, scope,
 * recompute mode). Named here is only what the product Pricing tab reads: enough
 * to say which rule a variant is on and what it does, in a sentence. Editing a
 * rule is the rules surface's job, not a product's.
 */
export interface MarkupRule {
  id: string;
  name: string;
  /** How the price is derived — `percent`, `multiplier`, `fixed`, `bands`, … */
  method: string;
  /** The number `method` uses. Null for band-based rules, whose value varies. */
  value: number | null;
  /** Which cost it marks up — `last_cost`, `avg_cost`, `supplier_cost`, … */
  costBasis: string;
  isActive: boolean;
  /** How many variants across the whole catalog are priced by this rule. */
  boundVariantCount: number;
}

/** A supplier this business buys from. Named here only to turn a variant's
 *  `dropshipSourceId` into a name someone recognises. */
export interface DropshipSupplier {
  id: string;
  name: string;
}

/* ── Shapes: stock (owned by the inventory module) ──────────────────────── */

// The stock shapes are imported from the inventory module at the top of this
// file (under the commerce names the facet has always used) and re-exported here,
// so consumers that reach for them alongside the product shapes still find them
// on this data layer — while a SINGLE definition of each row lives one folder over.
export type { ProductStockLevel, StockReservation, StockMovement, StockLocation };

/* ── Shapes: lookups ────────────────────────────────────────────────────── */

/** Suggestions for the free-text lookups on the detail pane. The server merges a
 *  platform baseline with whatever this business already uses, so these are never
 *  empty and never a closed list. */
export interface ProductFacets {
  productTypes: string[];
  vendors: string[];
  tags: string[];
  taxClasses: string[];
}

/* ── The query-key contract ─────────────────────────────────────────────── */

/**
 * Every facet a product can have a pane or tab for.
 *
 * Adding one here is what reserves its cache namespace — do that in the same
 * change that registers its surface, so a facet can never exist with an
 * ad-hoc key.
 */
export type ProductFacetKey =
  | 'options'
  | 'variants'
  | 'media'
  /** Quantity-break tiers for every variant of this product, in one read. */
  | 'bulk-tiers'
  /** Trade (price-list) prices for this product, across every list, in one read. */
  | 'price-list-entries'
  | 'translations'
  | 'inventory'
  | 'fitment'
  | 'configurator'
  | 'b2b-pricing'
  | 'reviews'
  | 'channels'
  | 'dropship'
  | 'subscriptions';

export const productKeys = {
  all: ['commerce', 'products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (query: ProductQuery) => [...productKeys.lists(), query] as const,
  facets: () => [...productKeys.all, 'facets'] as const,
  detail: (id: string) => [...productKeys.all, id] as const,
  facet: (id: string, facet: ProductFacetKey) => [...productKeys.all, id, facet] as const,
  /**
   * The FILES behind a set of product images.
   *
   * Deliberately NOT under `detail(id)`: the same photo can be on two products,
   * and the media library is not a facet of any one of them. Keying on the id
   * set means two panes showing overlapping galleries share nothing they should
   * not, and a product whose image set is unchanged does not refetch its files
   * because something else about the product moved. Sorted so the same set in a
   * different order is the same key.
   */
  mediaAssets: (ids: string[]) =>
    [...productKeys.all, 'media-assets', [...ids].sort().join(',')] as const,
  /** Markup rules — tenant-wide, not per product, so they sit beside the other
   *  lookup lists rather than under a product id. */
  markupRules: () => [...productKeys.all, 'markup-rules'] as const,
  /** Connected dropship suppliers, for naming who prices a sourced variant. */
  suppliers: () => [...productKeys.all, 'dropship-suppliers'] as const,
  /**
   * A facet that genuinely reads TWO endpoints.
   *
   * Reviews and questions are one PANE but two resources with two moderation
   * verbs, so folding them into one query would mean answering a question
   * refetches every review. It nests UNDER the facet key rather than beside it,
   * so `invalidate(id, 'reviews')` still catches both halves and no caller has
   * to know the facet was split. Use it only for that case — a facet with one
   * endpoint uses `facet()`.
   */
  facetPart: (id: string, facet: ProductFacetKey, part: string) =>
    [...productKeys.facet(id, facet), part] as const,
};

/** Retained for callers that only need the root prefix. */
export const PRODUCTS_KEY = productKeys.all;

/**
 * Facets whose contents are a FUNCTION of another facet, so writing the one
 * must refresh the other.
 *
 * Declared once here rather than remembered at each mutation, because the
 * failure mode is silent: rebuild the option lattice, and the variants pane
 * docked beside it goes on showing SKUs bound to option values that no longer
 * exist.
 */
const DERIVED_FACETS: Partial<Record<ProductFacetKey, ProductFacetKey[]>> = {
  // The server rebinds variants when the lattice is replaced, and media
  // pinned to an option value loses its binding with it.
  options: ['variants', 'media'],
  // A new variant needs a stock row; a retired one stops having one. Media is
  // per-variant too, and quantity-break tiers hang off a variant — retiring one
  // takes its tiers out of the list the Pricing tab is showing.
  variants: ['inventory', 'media', 'bulk-tiers'],
};

/* ── Queries ────────────────────────────────────────────────────────────── */

/** Server-side sort. The list is paged, so sorting the loaded window in the
 *  browser would sort ONE page and present it as the answer — "cheapest product"
 *  would hand back the cheapest one on page three. */
export type ProductSortKey = 'updatedAt' | 'title' | 'priceMinCents';
export type SortDirection = 'asc' | 'desc';

export interface ProductQuery {
  q?: string;
  status?: ProductStatus;
  /** Include retired products. The server hides them unless asked. */
  includeArchived?: boolean;
  sortBy: ProductSortKey;
  order: SortDirection;
  take: number;
  skip: number;
}

export function useProducts(query: ProductQuery) {
  return useQuery({
    queryKey: productKeys.list(query),
    queryFn: () =>
      api.list<ProductRow>('/v1/commerce/products', {
        ...(query.q ? { q: query.q } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.includeArchived ? { include_archived: true } : {}),
        sort_by: query.sortBy,
        order: query.order,
        take: query.take,
        skip: query.skip,
      }),
    // Keeps the current window on screen while the next one loads, so paging and
    // re-sorting don't blink the table out to an empty state and back.
    placeholderData: (previous) => previous,
  });
}

/**
 * The product record itself — read by the detail pane AND by every scoped pane
 * through `useProductScope`. One key, so eight docked panes are one request.
 *
 * A 404 is meaningful to callers (it means deleted, not broken), so it is NOT
 * retried into a generic failure — see `isNotFound` in product-scope.tsx.
 */
export function useProduct(id: string) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => api.get<Product>(`/v1/commerce/products/${id}`),
    // 'new' is the detail pane before the product exists — nothing to fetch.
    enabled: id !== 'new',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/** The AXES this product is sold along. Separate from variants deliberately. */
export function useProductOptions(productId: string) {
  return useQuery({
    queryKey: productKeys.facet(productId, 'options'),
    queryFn: () => api.get<ProductOption[]>(`/v1/commerce/products/${productId}/variants/options`),
    enabled: productId !== 'new',
  });
}

/**
 * The sellable SKUs. Each carries `optionValueIds` placing it in the lattice.
 *
 * `includeArchived` asks for retired versions as well, and gets its own cache
 * entry NESTED under the variants key — so it still refreshes on every
 * `invalidateProduct(id, …)`, which matches by prefix.
 *
 * A surface that offers Restore needs this, and so does anything that has to
 * explain a SKU conflict: a retired variant keeps its code, and that code is
 * unique across the whole business, so "that code already exists" can be caused
 * by a row the operator cannot otherwise see.
 */
export function useProductVariants(productId: string, includeArchived = false) {
  return useQuery({
    queryKey: includeArchived
      ? ([...productKeys.facet(productId, 'variants'), 'archived'] as const)
      : productKeys.facet(productId, 'variants'),
    queryFn: () =>
      api.get<Variant[]>(
        `/v1/commerce/products/${productId}/variants`,
        includeArchived ? { include_archived: true } : undefined
      ),
    enabled: productId !== 'new',
  });
}

/** Every image on the product, product-level and per-variant, in one call. */
export function useProductMedia(productId: string) {
  return useQuery({
    queryKey: productKeys.facet(productId, 'media'),
    queryFn: () => api.get<ProductImage[]>(`/v1/commerce/products/${productId}/images`),
    enabled: productId !== 'new',
  });
}

/**
 * Every stock level for this product — all its variants, all warehouses, ONE
 * request.
 *
 * This is the batching rule made concrete. The obvious implementation is a
 * query per variant, and it is what the dashboard does; at forty variants that
 * is forty round trips to render one panel, and the workbench can have this
 * pane open twice. `take: 200` is the endpoint's ceiling and comfortably clears
 * the largest realistic product (a variant in three warehouses is three rows,
 * so the true limit is ~66 variants); beyond that the answer is a paged facet
 * pane, never a loop.
 */
export function useProductStock(productId: string) {
  return useQuery({
    queryKey: productKeys.facet(productId, 'inventory'),
    queryFn: () =>
      api.list<ProductStockLevel>('/v1/inventory', { product_id: productId, take: 200 }),
    enabled: productId !== 'new',
  });
}

/**
 * The files behind a set of product images — ALL of them in ONE request.
 *
 * The batching rule again. `/v1/media/assets/:id` per image is twelve round
 * trips on a twelve-photo product, so the list endpoint takes an explicit `ids`
 * filter (added for this; see wizeworks/services/api-rest/src/routes/v1/media/assets.ts).
 *
 * Files are effectively immutable once transcoded — the bytes never change under
 * an id — so this holds for five minutes rather than the default minute, and a
 * gallery re-render after a reorder costs nothing.
 */
export function useMediaAssets(ids: string[]) {
  return useQuery({
    queryKey: productKeys.mediaAssets(ids),
    queryFn: async () => {
      const { items } = await api.list<MediaAssetWire>('/v1/media/assets', {
        ids: ids.join(','),
        take: Math.min(ids.length, 250),
      });
      return items.map(toMediaAsset);
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });
}

/**
 * Quantity-break tiers for every variant of this product, in one read.
 *
 * `product_id` is a real server-side filter (pricing-service `listBulkTiers`),
 * not a client-side sieve over the tenant's whole tier table.
 */
export function useProductBulkTiers(productId: string) {
  return useQuery({
    queryKey: productKeys.facet(productId, 'bulk-tiers'),
    queryFn: () => api.get<BulkPriceTier[]>('/v1/commerce/bulk-tiers', { product_id: productId }),
    enabled: productId !== 'new',
  });
}

/**
 * Every trade (price-list) price for this product, across ALL its price lists,
 * in ONE read.
 *
 * The batching rule again. There is no per-list loop here: reading these by
 * asking each price list for its entries and keeping the ones that match this
 * product is the exact N+1 this data layer exists to prevent, and on a business
 * with many trade lists it is a request per list. So the server answers
 * per-product in one call (`/products/:id/price-list-entries`, pricing-service
 * `listEntriesForProduct`), joining entries up to their product.
 *
 * Read-only on this tab — entries are authored on the price-list surface, not
 * here — so this hook has no paired mutation. It still nests under the product's
 * facet namespace, so a coarse `invalidateProduct(id)` refreshes it like any
 * other facet.
 */
export function useProductPriceListEntries(productId: string) {
  return useQuery({
    queryKey: productKeys.facet(productId, 'price-list-entries'),
    queryFn: () =>
      api.get<ProductPriceListEntry[]>(`/v1/commerce/products/${productId}/price-list-entries`),
    enabled: productId !== 'new',
  });
}

/** Every pricing rule this business has written. Tenant-wide and short — the
 *  Pricing tab reads it only to name the rule a variant is bound to and to offer
 *  the list when binding one. */
export function useMarkupRules() {
  return useQuery({
    queryKey: productKeys.markupRules(),
    queryFn: () => api.get<MarkupRule[]>('/v1/markup-rules'),
    staleTime: 5 * 60_000,
  });
}

/**
 * Connected dropship suppliers, so a sourced variant can say WHO prices it
 * rather than showing a bare id.
 *
 * Fails SOFT, on purpose. This endpoint is gated on the dropship module AND on
 * the `admin` role, so an editor at a business with no dropship gets a 404 or a
 * 403 — neither of which means anything is wrong. The Pricing tab degrades to
 * "priced by your supplier" instead of showing an error for a panel that is not
 * the point of the screen. `retry: false` so a missing module is not asked for
 * three times.
 */
export function useDropshipSuppliers() {
  return useQuery({
    queryKey: productKeys.suppliers(),
    queryFn: () =>
      api
        .list<DropshipSupplier>('/v1/dropship/suppliers', { take: 250 })
        .then((page) => page.items)
        .catch(() => [] as DropshipSupplier[]),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** Long-lived: these are suggestion lists, not live state, and re-fetching them
 *  per keystroke of a lookup would be absurd. */
export function useProductFacets() {
  return useQuery({
    queryKey: productKeys.facets(),
    queryFn: () => api.get<ProductFacets>('/v1/commerce/products/facets'),
    staleTime: 5 * 60_000,
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

/**
 * The ONE way anything in this cluster says "that changed".
 *
 * Call it with the facet you wrote and it refreshes that facet, anything
 * derived from it, the product record, and the lists — because a price, a
 * status or a variant count all show in more than one place. Panes must not
 * hand-roll `invalidateQueries` for product data: the derived-facet coupling is
 * exactly the part that gets forgotten.
 */
export function useInvalidateProduct() {
  const queryClient = useQueryClient();

  return (productId?: string, facet?: ProductFacetKey) => {
    // A list row shows title, status, price range and variant count, so almost
    // any write moves it.
    void queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    // "How many products searching cannot find" is derived from the catalog too,
    // just through another service — so a catalog write moves it exactly the way
    // it moves a list row. Without this, deleting nine products left the notice
    // above the list saying "Searching your shop won't find 16 of your products"
    // over a pane reading `Showing 1-7 of 7`, and the pane's own Refresh did not
    // settle it because that refetches the products query alone (issue 325).
    void queryClient.invalidateQueries({ queryKey: ['search', 'status'] });
    if (!productId) return;
    void queryClient.invalidateQueries({ queryKey: productKeys.detail(productId) });
    if (!facet) return;
    for (const derived of DERIVED_FACETS[facet] ?? []) {
      void queryClient.invalidateQueries({ queryKey: productKeys.facet(productId, derived) });
    }
  };
}

/* ── Mutations: the product ─────────────────────────────────────────────── */

/** What create sends. A price is required even though the product row has no
 *  price column, because the first variant is created with it — a product nobody
 *  can buy is not a product anyone meant to make. */
export interface NewProduct {
  title: string;
  handle?: string;
  status: ProductStatus;
  priceCents: number;
  sku: string;
}

/**
 * Raised when the product was created but its first variant was not.
 *
 * A half-created product is a real outcome, not a hypothetical: the two are
 * separate writes because `POST /products` rejects an inline `variants` array.
 * The id travels with the error so the caller can land on the product that DOES
 * exist rather than telling someone nothing happened and letting them make a
 * second one.
 */
export class VariantAfterCreateError extends Error {
  constructor(
    readonly productId: string,
    /** The failure the price call actually returned — carried so the caller can
     *  show the server's own sentence rather than this class's summary. Named
     *  `reason` rather than `cause`, which is a member of Error itself. */
    readonly reason: unknown
  ) {
    super('The product was added, but its price could not be saved.');
    this.name = 'VariantAfterCreateError';
  }
}

export function useCreateProduct() {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: async (input: NewProduct) => {
      const created = await api.post<{ id: string; handle: string }>('/v1/commerce/products', {
        title: input.title,
        ...(input.handle ? { handle: input.handle } : {}),
        status: input.status,
      });
      try {
        await api.post(`/v1/commerce/products/${created.id}/variants`, {
          sku: input.sku,
          priceCents: input.priceCents,
          isDefault: true,
        });
      } catch (error) {
        throw new VariantAfterCreateError(created.id, error);
      }
      return created;
    },
    onSuccess: (created) => {
      invalidate(created.id, 'variants');
    },
    onError: (error) => {
      // A half-created product still changed the catalog, so the list must not
      // keep showing the world as it was before.
      if (error instanceof VariantAfterCreateError) invalidate(error.productId, 'variants');
    },
  });
}

/** Everything the detail pane's tabs write to the product record itself.
 *  Partial: an omitted field is left alone by the server, and `null` clears one. */
export interface ProductPatch {
  title?: string;
  handle?: string;
  description?: string | null;
  productType?: string | null;
  /** The typed product-type link (docs/143). `null` clears the type AND wipes the
   *  attribute bag server-side; a key sets/keeps it and re-validates `attributes`. */
  productTypeKey?: string | null;
  /** The typed attribute bag, validated against the type's schema (422 on
   *  mismatch). Only meaningful when a `productTypeKey` is set. */
  attributes?: Record<string, unknown>;
  vendor?: string | null;
  tags?: string[];
  taxClass?: string | null;
  originCountry?: string | null;
  hsCode?: string | null;
  requiresShipping?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  ogImageId?: string | null;
  propertyIds?: string[];
  categoryIds?: string[];
  collectionIds?: string[];
  /** null clears it — the product goes back to shipping the standard way. */
  shippingProfileId?: string | null;
  orderAheadDays?: number | null;
  deposit?: ProductDeposit;
  dailyLimit?: number | null;
}

export function useUpdateProduct(id: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (patch: ProductPatch) => api.patch<Product>(`/v1/commerce/products/${id}`, patch),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

/** Put it on sale, or take it off sale. Two endpoints rather than a status PATCH
 *  because publishing also refreshes the search + sitemap snapshots server-side. */
export function usePublishProduct(id: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (published: boolean) =>
      api.post(`/v1/commerce/products/${id}/${published ? 'publish' : 'unpublish'}`),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

/** Retire it without losing it. Archived products keep their order history and
 *  can be brought back. */
export function useArchiveProduct(id: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (archived: boolean) =>
      api.post(`/v1/commerce/products/${id}/${archived ? 'archive' : 'restore'}`),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function useDeleteProduct(id: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: () => api.delete(`/v1/commerce/products/${id}`),
    onSuccess: () => {
      invalidate();
    },
  });
}

/* ── Mutations: variants ────────────────────────────────────────────────── */

export interface NewVariant {
  sku: string;
  priceCents: number;
  compareAtPriceCents?: number | null;
  costCents?: number | null;
  /** Where in the lattice this variant sits — one option-value id per axis.
   *  Required on a product WITH options; the server rejects a set that does not
   *  span every axis exactly once. Omit only on an option-less product. */
  optionValueIds?: string[];
  isDefault?: boolean;
}

export function useCreateVariant(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: NewVariant) =>
      api.post<{ id: string; sku: string }>(`/v1/commerce/products/${productId}/variants`, {
        sku: input.sku,
        priceCents: input.priceCents,
        ...(input.compareAtPriceCents != null
          ? { compareAtPriceCents: input.compareAtPriceCents }
          : {}),
        ...(input.costCents != null ? { costCents: input.costCents } : {}),
        ...(input.optionValueIds ? { optionValueIds: input.optionValueIds } : {}),
        ...(input.isDefault ? { isDefault: true } : {}),
      }),
    onSuccess: () => {
      invalidate(productId, 'variants');
    },
  });
}

/** Everything on a variant except its code, which has its own endpoint. */
export interface VariantPatch {
  title?: string | null;
  barcode?: string | null;
  priceCents?: number;
  compareAtPriceCents?: number | null;
  costCents?: number | null;
  weight?: number | null;
  /** All three or none — the server rejects a partial set. `null` clears them.
   *  There is no way to remove ONE measurement and keep the others. */
  dimensions?: { lengthMm: number; widthMm: number; heightMm: number } | null;
  inventoryPolicy?: string;
  requiresShipping?: boolean;
  fulfillmentType?: string | null;
  dropshipSourceId?: string | null;
  position?: number;
}

/**
 * Save one variant.
 *
 * The code (SKU) has its OWN endpoint, because it is unique across the whole
 * business and a clash has to come back as a conflict naming the offending code
 * rather than as a silent no-op. So a variant whose code changed is two calls,
 * and the rename goes FIRST: if it clashes, nothing else has been written and
 * the operator sees the real problem instead of a half-saved row.
 */
export function useUpdateVariant(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: async (input: { id: string; sku?: string; patch: VariantPatch }) => {
      if (input.sku) {
        await api.post(`/v1/commerce/variants/${input.id}/rename-sku`, { sku: input.sku });
      }
      await api.patch(`/v1/commerce/variants/${input.id}`, input.patch);
    },
    onSuccess: () => {
      invalidate(productId, 'variants');
    },
  });
}

/** Retire one variant. Archived, never deleted — a variant is referenced by every
 *  order that ever contained it. */
export function useArchiveVariant(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (variantId: string) => api.post(`/v1/commerce/variants/${variantId}/archive`),
    onSuccess: () => {
      invalidate(productId, 'variants');
    },
  });
}

export function useSetDefaultVariant(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (variantId: string) => api.post(`/v1/commerce/variants/${variantId}/default`),
    onSuccess: () => {
      invalidate(productId, 'variants');
    },
  });
}

/** Bring a retired variant back. Pairs with `useArchiveVariant` — read the
 *  archived rows with `useProductVariants(id, true)`. */
export function useRestoreVariant(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (variantId: string) => api.post(`/v1/commerce/variants/${variantId}/restore`),
    onSuccess: () => {
      invalidate(productId, 'variants');
    },
  });
}

/* ── Mutations: the option lattice ──────────────────────────────────────── */

export interface OptionValueInput {
  value: string;
  swatchHex?: string;
  swatchImageId?: string;
  position: number;
}

export interface OptionInput {
  name: string;
  displayType: OptionDisplayType;
  position: number;
  values: OptionValueInput[];
}

/**
 * Replaces the product's ENTIRE option lattice in one transaction.
 *
 * There is no "add one value" endpoint — the server drops the existing options,
 * values, and the variant-to-value assignments that referenced them, then
 * inserts the new set. Variant ROWS survive, but they come out unbound and must
 * be re-placed with `useAssignVariantOptions`.
 *
 * That blast radius is why Options is its own tab and why this is the one write
 * in this file that must never be issued without a confirm naming what is lost.
 */
export function useSetProductOptions(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (options: OptionInput[]) =>
      api.post(`/v1/commerce/products/${productId}/variants/options`, { options }),
    onSuccess: () => {
      invalidate(productId, 'options');
    },
  });
}

/**
 * One coordinate on one axis, named the way a PERSON names it rather than by id.
 *
 * The lattice save has to describe where a variant lands BEFORE the values it
 * lands on exist — the server drops and re-inserts every value, minting new ids
 * in the same request that the plan is sent in. Names are the only handle that
 * survives that, and they are a safe one: the server enforces unique option
 * names per product and unique value texts per option, case-insensitively.
 */
export interface LatticeCoordinate {
  /** The option's name, e.g. `Color`. */
  option: string;
  /** The value's text, e.g. `Racing green`. */
  value: string;
}

/**
 * A complete restructuring of how a product is sold, as ONE reviewable object.
 *
 * The point of planning it up front is that the caller can show the operator
 * precisely what will happen — how many versions survive, which lose their
 * place, how many new combinations appear — and put THAT in the confirm, rather
 * than firing a destructive write and describing the wreckage afterwards.
 */
export interface LatticePlan {
  /** The axes as they should be after the save. Empty removes them all. */
  options: OptionInput[];
  /** Variants that keep a place in the new grid, and where. */
  place: { variantId: string; coordinate: LatticeCoordinate[] }[];
  /** Variants whose place no longer exists. Retired, never deleted — every order
   *  that ever contained one still points at it. */
  retire: string[];
}

/**
 * Raised when the axes were rewritten but some versions could not be put back.
 *
 * This is a real outcome, not a hypothetical: replacing the lattice and
 * re-placing the variants on it are separate writes, and only the first is a
 * transaction. If a rebind fails the product is left with unbound variants —
 * genuinely broken — so the caller must say which ones by name instead of a
 * generic failure that implies nothing happened.
 */
export class LatticeRebindError extends Error {
  constructor(
    /** The ids that are now unbound, so the caller can name their codes. */
    readonly variantIds: string[],
    readonly reason: unknown
  ) {
    super('The choices were saved, but some versions could not be put back on the grid.');
    this.name = 'LatticeRebindError';
  }
}

/**
 * Where a retired version used to sit, when its option-value ids are gone.
 *
 * Removing a choice deletes its values, and the assignments that recorded each
 * variant's position cascade with them — so a version retired that way has no
 * coordinate left to match on. The server writes the coordinate down as text
 * before that happens and puts it back when the lattice can hold it again; this
 * reads the same record, so the summary can say "these come back" instead of
 * "these have no price". Written by lattice-memory.ts in @wizeworks/commerce.
 */
export function lastCoordinate(variant: Variant): LatticeCoordinate[] | null {
  const held = variant.metadata.latticeCoordinate;
  if (!Array.isArray(held) || held.length === 0) return null;
  const points: LatticeCoordinate[] = [];
  for (const entry of held) {
    if (typeof entry !== 'object' || entry === null) return null;
    const point = entry as Record<string, unknown>;
    if (typeof point.option !== 'string' || typeof point.value !== 'string') return null;
    points.push({ option: point.option, value: point.value });
  }
  return points;
}

function coordinateKey(option: string, value: string): string {
  // NUL as the separator so an option literally named "Size|Color" cannot
  // collide with a two-part key.
  return `${option.trim().toLowerCase()}\u0000${value.trim().toLowerCase()}`;
}

/**
 * Rewrites how a product is sold, and puts its existing versions back.
 *
 * Prefer this over `useSetProductOptions` for anything the operator drives.
 * That hook is the raw endpoint: it replaces the lattice and leaves every
 * variant UNBOUND, which on a product with options is a corrupt state the UI
 * has no way to show. This one performs the whole act —
 *
 *   1. replace the axes (one server transaction), taking back the new value ids
 *   2. re-place every surviving version on its new coordinate
 *   3. retire the versions whose coordinate no longer exists
 *
 * — so the product is never left half-restructured by a successful call.
 *
 * Step 2 is why the route returns the inserted options rather than
 * `{ updated: true }`: without the new ids the client would have to re-read the
 * lattice and match by name, which is the server's own answer guessed at.
 */
export function useSaveProductLattice(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: async (plan: LatticePlan) => {
      const created = await api.post<ProductOption[]>(
        `/v1/commerce/products/${productId}/variants/options`,
        { options: plan.options }
      );

      const valueIds = new Map<string, string>();
      for (const option of created) {
        for (const value of option.values) {
          valueIds.set(coordinateKey(option.name, value.value), value.id);
        }
      }

      const unbound: string[] = [];
      let firstFailure: unknown = null;

      await Promise.all(
        plan.place.map(async (placement) => {
          const ids = placement.coordinate.map((point) =>
            valueIds.get(coordinateKey(point.option, point.value))
          );
          // A coordinate the server did not mint means the plan was computed
          // against a lattice that has since moved. Better to leave the variant
          // unbound and SAY so than to place it somewhere nobody asked for.
          if (ids.some((id) => id === undefined)) {
            unbound.push(placement.variantId);
            return;
          }
          try {
            await api.post('/v1/commerce/variants/assign-options', {
              variantId: placement.variantId,
              optionValueIds: ids,
            });
          } catch (error) {
            unbound.push(placement.variantId);
            firstFailure ??= error;
          }
        })
      );

      // Retiring runs even when a rebind failed: those versions have no place in
      // the new grid either way, and leaving them live would show sellable rows
      // sitting on choices that no longer exist.
      await Promise.all(
        plan.retire.map((variantId) =>
          api.post(`/v1/commerce/variants/${variantId}/archive`).catch(() => undefined)
        )
      );

      if (unbound.length > 0) throw new LatticeRebindError(unbound, firstFailure);
      return created;
    },
    onSuccess: () => {
      invalidate(productId, 'options');
    },
    onError: () => {
      // The axes DID change even on the failure path, so the tab must not go on
      // rendering the world as it was before.
      invalidate(productId, 'options');
    },
  });
}

/** Places one variant at a point in the lattice. */
export function useAssignVariantOptions(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: { variantId: string; optionValueIds: string[] }) =>
      api.post('/v1/commerce/variants/assign-options', input),
    onSuccess: () => {
      invalidate(productId, 'variants');
    },
  });
}

/* ── Mutations: media ───────────────────────────────────────────────────── */

/**
 * Puts a file in the media library and returns its asset id.
 *
 * Two phases, and the reason is on the server: `POST /v1/media/uploads` reserves
 * the row and budgets the tenant's storage allowance BEFORE any bytes move, then
 * hands back a URL to PUT them to. `POST /uploads/:id/complete` confirms.
 *
 * The bytes go by plain `fetch`, NOT through `api` — the upload URL is
 * pre-authorised (a GCS signed URL in production, a dev-only receiver locally)
 * and attaching a bearer token to a signed URL invalidates its signature. The
 * dev URL comes back RELATIVE, because api-rest assumes the caller proxies it;
 * the workbench does not, so it is resolved against the API origin the token
 * route already told us about.
 *
 * Returns the asset id only. Binding it to a product is a separate call —
 * `useAddProductImage` — because the same file can be attached to several
 * products, and half of an upload-and-bind is a stranded file, not a broken
 * product.
 */
export function useUploadMedia() {
  return useMutation({
    mutationFn: async (file: File) => {
      const created = await api.post<{
        asset: { id: string };
        upload: { url: string; method: string; headers: Record<string, string> };
      }>('/v1/media/uploads', {
        filename: file.name,
        mime_type: file.type,
        byte_size: file.size,
        // Everything uploaded here is a product image — files it into the picker's
        // "Product" auto-group (docs/49).
        source: 'product',
      });

      const { apiUrl } = await getTokenState();
      const target = created.upload.url.startsWith('/')
        ? `${apiUrl.replace(/\/$/, '')}${created.upload.url}`
        : created.upload.url;

      const response = await fetch(target, {
        method: created.upload.method,
        headers: created.upload.headers,
        body: file,
      });
      if (!response.ok) {
        throw new Error(`The file could not be uploaded (${String(response.status)}).`);
      }

      await api.post(`/v1/media/uploads/${created.asset.id}/complete`);
      return created.asset.id;
    },
  });
}

export interface NewProductImage {
  mediaAssetId: string;
  /** The version this photo is OF, or omitted for one shown for every version. */
  variantId?: string | null;
  /** Where it sits in the gallery. */
  position: number;
  alt?: string | null;
  /** Show it only when the shopper's choices include all of these. */
  optionValueIds?: string[];
}

export function useAddProductImage(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: NewProductImage) =>
      api.post<{ id: string }>('/v1/commerce/variants/images', {
        productId,
        ...(input.variantId ? { variantId: input.variantId } : {}),
        mediaAssetId: input.mediaAssetId,
        position: input.position,
        ...(input.alt ? { alt: input.alt } : {}),
        ...(input.optionValueIds?.length ? { optionValueIds: input.optionValueIds } : {}),
      }),
    onSuccess: () => {
      invalidate(productId, 'media');
    },
  });
}

/**
 * Says WHEN a photo is shown: on one version, or when a particular set of
 * choices is picked.
 *
 * This is the write behind `VariantImageOptionValue`, which had schema, service
 * and a live endpoint but no interface anywhere until the Media tab. The
 * storefront shows an image whose pinned set is a SUBSET of what the shopper has
 * chosen — so pinning to `Color: Red` alone shows on every red version, while
 * pinning to `Color: Red` AND `Size: L` shows only once both are picked.
 *
 * `variantId` and `optionValueIds` are authoritative — omitting one CLEARS it,
 * which is why the tab always sends the complete intended binding rather than a
 * delta. `alt` is the exception and is patch-style: omit to leave it, pass null
 * to clear it. (It was write-once at upload time until this tab needed it.)
 */
export function useSetImageBindings(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: {
      variantImageId: string;
      variantId: string | null;
      optionValueIds: string[];
      alt?: string | null;
    }) => api.put('/v1/commerce/variant-image-bindings', input),
    onSuccess: () => {
      invalidate(productId, 'media');
    },
  });
}

/** Sets the gallery order. Takes the WHOLE ordered list, so positions come out
 *  dense and unambiguous — see the endpoint's own note. */
export function useReorderProductImages(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (imageIds: string[]) =>
      api.put(`/v1/commerce/products/${productId}/image-order`, { imageIds }),
    onSuccess: () => {
      invalidate(productId, 'media');
    },
  });
}

/** Makes one photo the product's main one — the one lists, cards and search
 *  results show. The server clears the previous hero in the same transaction. */
export function useSetPrimaryImage(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (imageId: string) => api.post(`/v1/commerce/variant-images/${imageId}/primary`),
    onSuccess: () => {
      invalidate(productId, 'media');
    },
  });
}

/** Takes a photo off this product. The FILE stays in the media library — this
 *  removes the binding, not the upload. */
export function useRemoveProductImage(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (imageId: string) => api.delete(`/v1/commerce/variant-images/${imageId}`),
    onSuccess: () => {
      invalidate(productId, 'media');
    },
  });
}

/* ── Mutations: pricing ─────────────────────────────────────────────────── */
//
// NOTE FOR ANYONE ADDING TO THIS SECTION: per-variant price, compare-at and cost
// are written by `useUpdateVariant` above, which the Variants tab already owns.
// The Pricing tab calls the SAME mutation rather than declaring a second path to
// the same three columns — two mutations on one field is how a value saved in
// one pane reappears as the old one in the pane docked beside it.

/** Prices this variant by a rule from now on. `priceCents` becomes DERIVED —
 *  the server recomputes it immediately and again whenever the cost moves. */
export function useBindVariantMarkup(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: { variantId: string; ruleId: string }) =>
      api.put(`/v1/commerce/variants/${input.variantId}/markup`, { ruleId: input.ruleId }),
    onSuccess: () => {
      invalidate(productId, 'variants');
    },
  });
}

/** Detaches a variant from its rule. The price it has now is KEPT and becomes a
 *  typed one — unbinding never resets anything to zero. */
export function useUnbindVariantMarkup(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (variantId: string) => api.delete(`/v1/commerce/variants/${variantId}/markup`),
    onSuccess: () => {
      invalidate(productId, 'variants');
    },
  });
}

export function useCreateBulkTier(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: { variantId: string; minQuantity: number; unitPriceCents: number }) =>
      api.post<{ id: string }>('/v1/commerce/bulk-tiers', input),
    onSuccess: () => {
      invalidate(productId, 'bulk-tiers');
    },
  });
}

/** There is no update endpoint for a tier — the server only creates and deletes
 *  them. Changing one is therefore delete-then-create, which the Pricing tab does
 *  explicitly rather than pretending an edit happened. */
export function useDeleteBulkTier(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (tierId: string) => api.delete(`/v1/commerce/bulk-tiers/${tierId}`),
    onSuccess: () => {
      invalidate(productId, 'bulk-tiers');
    },
  });
}

/* ── Errors ─────────────────────────────────────────────────────────────── */

/**
 * The server's own sentence for a 4xx, which is worth showing verbatim: these
 * routes explain the actual problem ("SKU \"ABC-1\" already exists", "Handle is
 * already taken") far better than anything this side could infer from a status
 * code. A 5xx carries no such sentence, so it falls back to the caller's wording.
 */
export function productErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof VariantAfterCreateError) {
    return productErrorMessage(error.reason, fallback);
  }
  return apiErrorMessage(error, fallback);
}

/* ── Saying what a state means ──────────────────────────────────────────── */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * Is this on sale? In the words an owner would use.
 *
 * "Active" and "draft" are the stored words, and neither says what is actually
 * true of the thing: whether a shopper can find it and buy it today.
 */
export function productState(product: {
  status: ProductStatus;
  variantCount?: number;
  priceMinCents?: number | null;
}): { label: string; tone: Tone; detail: string } {
  if (product.status === 'archived') {
    return {
      label: 'Retired',
      tone: 'neutral',
      detail:
        'This product is off your website and cannot be bought. Past orders containing it are unaffected, and you can put it back on sale at any time.',
    };
  }
  if (product.status === 'active') {
    // On sale but priceless is a real state the platform allows, and it is the
    // one worth shouting about: the product is live and nobody can buy it.
    if (product.variantCount === 0 || product.priceMinCents == null) {
      return {
        label: 'No price set',
        tone: 'warning',
        detail:
          'This product is meant to be on sale, but it has no price, so nobody can buy it. Set one on the Variants tab to fix that.',
      };
    }
    return {
      label: 'On sale',
      tone: 'success',
      detail: 'Shoppers can find this product on your website and buy it.',
    };
  }
  return {
    label: 'Not on sale',
    tone: 'info',
    detail:
      'This is saved but hidden — nobody can see it on your website yet. Put it on sale when you are ready.',
  };
}

/* ── Formatting ─────────────────────────────────────────────────────────── */

export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

/** What a product costs, in one phrase. A product whose variants differ in price
 *  has a RANGE, and collapsing it to the lowest number tells a half-truth on the
 *  one screen where the number matters. */
export function priceLabel(product: {
  priceMinCents: number | null;
  priceMaxCents: number | null;
}): string {
  const { priceMinCents: min, priceMaxCents: max } = product;
  if (min == null) return 'No price';
  if (max == null || max === min) return formatCents(min);
  return `${formatCents(min)} – ${formatCents(max)}`;
}

/** A handle is the part of a web address that identifies this product, so it is
 *  lowercase, digits and hyphens — matching what api-rest derives from a title,
 *  ACCENTS AND ALL. This used to drop its own copy of the rule in here and turn
 *  "gruyère" into "gruy-re" (issue #013); the shared helper folds instead. */
export function slugifyHandle(value: string): string {
  return slugify(value, 127);
}

/**
 * A first product code, derived from the title, so nobody has to invent one to
 * get started. Stays fully editable — a business with its own coding scheme
 * types theirs over the top.
 *
 * ── WHY IT USES THE WHOLE NAME (issue 176) ─────────────────────────────────
 *
 * This cut the name at 20 characters. The code column is `varchar(127)` and the
 * `Sku` schema allows 127, so the suggestion was being trimmed to a sixth of the
 * room it had — and a shop's distinguishing word is almost always past character
 * 20, because it comes last:
 *
 *   Throwaway test scarf A  ─┐
 *                            ├─→  THROWAWAY-TEST-SCARF-1   (identical)
 *   Throwaway test scarf B  ─┘
 *
 * Two products, one code, on a field whose own description says it has to be
 * different from every other code. Names are the one thing a shop already keeps
 * distinct, so deriving from the WHOLE name inherits that. `SKU_STEM_MAX` leaves
 * room for the `-1`.
 *
 * This makes a collision rare rather than impossible — two products can still
 * share a name. `useSkuOwner` below is what catches the rest, before the save.
 */
const SKU_STEM_MAX = 125;

export function suggestSku(title: string): string {
  const base = slugifyUpper(title, SKU_STEM_MAX);
  return base === '' ? '' : `${base}-1`;
}

/** Who already holds a product code. */
export interface SkuOwner {
  variantId: string;
  productId: string;
  productTitle: string;
  /** Held by a retired product or version. Still taken, but the person cannot
   *  see the thing holding it, so the sentence they need is a different one. */
  retired: boolean;
}

export interface SkuCheck {
  /** Null when the code is free. */
  owner: SkuOwner | null;
  /** A code that IS free — the one asked about when nobody holds it, otherwise
   *  the same stem with the next unused number. */
  free: string;
}

/**
 * Is this product code already in use, and what is the nearest one that is not?
 *
 * Asked as the name is typed, so the Add form can settle on a code that will
 * actually save. Without it a refused code creates the product WITHOUT its
 * price, and the message that follows blames the price (issue 176).
 *
 * Never throws into the form: if the check itself cannot run, the data stays
 * undefined and the form does not claim to know either way. Silence is the
 * honest answer to a question nobody answered.
 */
export function useSkuCheck(sku: string) {
  const trimmed = sku.trim();
  return useQuery({
    queryKey: [...productKeys.all, 'sku-check', trimmed],
    queryFn: () =>
      api.get<SkuCheck>(`/v1/commerce/variants/sku-owner?sku=${encodeURIComponent(trimmed)}`),
    enabled: trimmed !== '',
    // A code's owner does not change while somebody fills in a form, and the
    // same stem is re-asked on every keystroke that does not alter it.
    staleTime: 30_000,
    retry: false,
  });
}

/** Did this write fail because the product code was taken? Read off the wire
 *  fields (`CONFLICT` + `field: 'sku'`) rather than by sniffing the message,
 *  which is the server's English and not a contract. */
export function isSkuConflict(error: unknown): boolean {
  const real = error instanceof VariantAfterCreateError ? error.reason : error;
  if (!(real instanceof ApiError) || real.code !== 'CONFLICT') return false;
  const details = real.details;
  return (
    typeof details === 'object' &&
    details !== null &&
    (details as { field?: unknown }).field === 'sku'
  );
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/* ══════════════════════════════════════════════════════════════════════════
   STOCK · FITMENT · CONFIGURATOR — the three dockable product facet panes.

   Sub-keys under a facet are spelled `[...productKeys.facet(id, f), part]`
   rather than added to `productKeys`, so they still nest under `detail(id)` and
   a coarse invalidate still reaches them, without another hand touching the
   shared key object.
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Stock ──────────────────────────────────────────────────────────────── */

/**
 * Every place this business keeps stock.
 *
 * Long-lived: warehouses are set up once and then referenced constantly. A
 * product-scoped pane needs the full list, not just the ones with a level row,
 * because "this product is not stocked at the Portland store" is a real answer
 * and it can only be given by knowing Portland exists.
 */
export function useStockLocations() {
  return useQuery({
    queryKey: ['inventory', 'locations'] as const,
    queryFn: () => api.list<StockLocation>('/v1/inventory/locations', { take: 250 }),
    staleTime: 5 * 60_000,
  });
}

/** Every hold against this product's stock, all variants, ONE request. */
export function useProductReservations(productId: string) {
  return useQuery({
    queryKey: [...productKeys.facet(productId, 'inventory'), 'reservations'] as const,
    queryFn: () =>
      api.list<StockReservation>('/v1/inventory/reservations', {
        product_id: productId,
        status: 'active',
        take: 100,
      }),
    enabled: productId !== 'new',
  });
}

/**
 * What has happened to this product's stock lately — every variant, ONE request.
 *
 * A per-variant read would be both an N+1 and WRONG: each response would be the
 * newest 50 movements of its own variant, so merging them client-side produces
 * a list that is not the newest 50 of the product.
 */
export function useProductMovements(productId: string) {
  return useQuery({
    queryKey: [...productKeys.facet(productId, 'inventory'), 'movements'] as const,
    queryFn: () =>
      api.list<StockMovement>('/v1/inventory/movements', { product_id: productId, take: 50 }),
    enabled: productId !== 'new',
  });
}

/**
 * Correct the counted quantity of one variant at one place.
 *
 * Sends an ABSOLUTE `onHand` rather than a delta, because that is what the
 * person is doing: they counted the shelf and it says nine. Making them work out
 * the difference from a number they already believe is wrong is how a correction
 * becomes a second error. The server reconciles it to a delta under a row lock,
 * so a sale landing mid-count cannot be overwritten.
 */
export function useSetStockCount(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: {
      variantId: string;
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
    onSuccess: () => {
      invalidate(productId, 'inventory');
    },
  });
}

/** When to reorder this variant at this place, how many to get, and how long it
 *  takes to arrive. */
export function useSetReorderPolicy(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: {
      variantId: string;
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
    onSuccess: () => {
      invalidate(productId, 'inventory');
    },
  });
}

/* ── Fitment ────────────────────────────────────────────────────────────── */

/**
 * One axis of a fitment domain.
 *
 * `level` axes are the branching ones and form the tree you drill down — Make,
 * then Model, then Engine. `range` axes are numeric windows recorded per rule
 * rather than picked from a tree — "1999 to 2007", "up to 12,000 lb".
 */
export interface FitmentDimension {
  key: string;
  label: string;
  kind: 'level' | 'range';
  /** A hint for the range widget: `year`, `lb`, `mm`. */
  unit?: string;
}

/** A kind of thing products can fit — "Vehicles", "Printers", "Tractors". */
export interface FitmentDomain {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  iconKey: string | null;
  dimensions: FitmentDimension[];
  position: number;
  /** How many top-level entries it has, e.g. "4 makes". */
  rootCount: number;
}

/** One value in a domain's tree. `childCount` is what drives the drill-down
 *  affordance — zero means this is as deep as it goes. */
export interface FitmentNode {
  id: string;
  domainId: string;
  parentId: string | null;
  dimensionKey: string;
  name: string;
  slug: string;
  depth: number;
  position: number;
  childCount: number;
}

export interface ProductFitmentRange {
  dimensionKey: string;
  min: number | null;
  max: number | null;
}

/** One "this product fits that" rule. */
export interface ProductFitment {
  id: string;
  productId: string;
  domainId: string;
  domainSlug: string;
  /** Null means the WHOLE domain — "fits every vehicle". */
  nodeId: string | null;
  nodeName: string | null;
  /** Ancestors including itself, root first: ["Ford","F-250","6.7L"]. */
  nodePath: string[];
  ranges: ProductFitmentRange[];
  notes: string | null;
}

/** The kinds of thing this business records compatibility against. Long-lived —
 *  a domain is installed once and then used for years. */
export function useFitmentDomains() {
  return useQuery({
    queryKey: ['commerce', 'fitment', 'domains'] as const,
    queryFn: () => api.get<FitmentDomain[]>('/v1/commerce/fitment/domains'),
    staleTime: 5 * 60_000,
  });
}

/**
 * One level of a domain's tree — the children of `parentId`, or the top level
 * when it is null.
 *
 * Deliberately per-level rather than "the whole tree": a real vehicle dictionary
 * is tens of thousands of nodes, and the operator only ever looks at one branch.
 * Each level is its own long-lived cache entry, so walking back up a drill-down
 * is instant and re-walking a branch costs nothing.
 */
export function useFitmentNodes(domainId: string | null, parentId: string | null) {
  return useQuery({
    queryKey: ['commerce', 'fitment', 'nodes', domainId ?? '', parentId ?? 'root'] as const,
    queryFn: () =>
      api.get<FitmentNode[]>(`/v1/commerce/fitment/domains/${domainId ?? ''}/nodes`, {
        ...(parentId ? { parentId } : {}),
      }),
    enabled: domainId !== null,
    staleTime: 5 * 60_000,
  });
}

/** Everything this product is recorded as fitting. */
export function useProductFitment(productId: string) {
  return useQuery({
    queryKey: productKeys.facet(productId, 'fitment'),
    queryFn: () => api.get<ProductFitment[]>(`/v1/commerce/products/${productId}/fitment`),
    enabled: productId !== 'new',
  });
}

/** What one rule looks like on the way IN. */
export interface ProductFitmentInput {
  domainId: string;
  nodeId: string | null;
  ranges: ProductFitmentRange[];
  notes?: string | null;
}

/**
 * Replaces this product's ENTIRE fitment list in one transaction.
 *
 * There is no add-one/remove-one endpoint: `PUT …/fitment` wipes and rewrites
 * atomically, so the catalog never sees a half-written compatibility list. The
 * consequence for the pane is that it holds the whole list as a draft and saves
 * it as a whole — which is also why it has a Save button rather than saving each
 * row as it is added.
 */
export function useSaveProductFitment(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (fitments: ProductFitmentInput[]) =>
      api.put(`/v1/commerce/products/${productId}/fitment`, {
        fitments: fitments.map((f) => ({
          domainId: f.domainId,
          nodeId: f.nodeId,
          ranges: f.ranges,
          ...(f.notes ? { notes: f.notes } : {}),
        })),
      }),
    onSuccess: () => {
      invalidate(productId, 'fitment');
    },
  });
}

/**
 * Take ONE rule off a product.
 *
 * A rule is a discrete, independently-meaningful thing, so it has its own
 * endpoint and its own removal rather than being a subtraction from a list
 * rewritten wholesale. That is also what lets the confirm name the exact thing
 * that stops matching.
 */
export function useDeleteProductFitment(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (fitmentId: string) => api.delete(`/v1/commerce/fitment/${fitmentId}`),
    onSuccess: () => {
      invalidate(productId, 'fitment');
    },
  });
}

/* ── Configurator ───────────────────────────────────────────────────────── */

/** How a shopper is asked one question. */
export type ConfiguratorOptionType =
  | 'single_choice'
  | 'multi_choice'
  | 'toggle'
  | 'quantity'
  | 'text'
  | 'color_swatch'
  | 'image_picker';

/** One answer someone can give. */
export interface ConfiguratorChoice {
  key: string;
  label: string;
  /** Choosing this sells a different version of the product instead. */
  variantId?: string;
  addOnVariantId?: string;
  /** What choosing this adds to (or takes off) the price. */
  priceDeltaCents?: number;
  swatchHex?: string;
  position: number;
}

/** One question in the build. */
export interface ConfiguratorOption {
  key: string;
  label: string;
  helpText?: string;
  type: ConfiguratorOptionType;
  required: boolean;
  minSelections?: number;
  maxSelections?: number;
  defaultChoiceKeys: string[];
  groupHeader?: string;
  position: number;
  choices: ConfiguratorChoice[];
}

export interface ConfiguratorCondition {
  optionKey: string;
  op: 'in' | 'not_in' | 'gt' | 'lt' | 'eq';
  value: string | number | string[];
}

export type ConfiguratorAction =
  | { kind: 'require'; optionKey: string }
  | { kind: 'hide'; optionKey: string }
  | { kind: 'show_only_choices'; optionKey: string; choiceKeys: string[] }
  | { kind: 'price_adjust'; deltaCents: number; label?: string }
  | { kind: 'add_addon'; variantId: string; quantity: number }
  | { kind: 'error'; message: string };

/** "When they pick this, do that." */
export interface ConfiguratorRule {
  name: string;
  match: 'all' | 'any';
  conditions: ConfiguratorCondition[];
  actions: ConfiguratorAction[];
  priority: number;
}

export interface ConfiguratorAddOn {
  variantId: string;
  variantSku: string | null;
  productTitle: string | null;
  defaultIncluded: boolean;
  priceOverrideCents?: number;
}

export interface ConfiguratorTemplateRow {
  id: string;
  productId: string;
  productTitle: string;
  name: string;
  description: string | null;
  /** `draft` | `active` | `archived`. */
  status: string;
  optionCount: number;
  ruleCount: number;
  addOnCount: number;
  updatedAt: string;
}

export interface ConfiguratorTemplate extends ConfiguratorTemplateRow {
  layout: { steps?: { key: string; label: string; optionKeys: string[] }[] } | null;
  options: ConfiguratorOption[];
  rules: ConfiguratorRule[];
  addOns: ConfiguratorAddOn[];
}

/** One component of a bundle. */
export interface BundleComponent {
  id: string;
  variantId: string;
  variantSku: string;
  productTitle: string;
  defaultQuantity: number;
  isRequired: boolean;
  isSwappable: boolean;
  swappableProductId: string | null;
  position: number;
}

export interface Bundle {
  id: string;
  bundleProductId: string;
  bundleProductTitle: string;
  /** `sum_of_components` | `fixed` | `percent_off_sum`. */
  pricingMode: string;
  fixedPriceCents: number | null;
  percentOffSum: number | null;
  /** `decrement_components` | `decrement_bundle_sku`. */
  inventoryMode: string;
  componentCount: number;
  updatedAt: string;
}

export interface BundleDetail extends Bundle {
  components: BundleComponent[];
}

/** The builds set up on this product. */
export function useProductTemplates(productId: string) {
  return useQuery({
    queryKey: productKeys.facet(productId, 'configurator'),
    queryFn: () =>
      api.get<ConfiguratorTemplateRow[]>(
        `/v1/commerce/products/${productId}/configurator-templates`
      ),
    enabled: productId !== 'new',
  });
}

/** One build in full — its questions, its rules, its extras. Keyed on the
 *  template rather than the product, so two panes looking at the same build
 *  share one fetch. */
export function useConfiguratorTemplate(templateId: string | null) {
  return useQuery({
    queryKey: ['commerce', 'configurator-templates', templateId ?? ''] as const,
    queryFn: () =>
      api.get<ConfiguratorTemplate>(`/v1/commerce/configurator-templates/${templateId ?? ''}`),
    enabled: templateId !== null,
  });
}

/**
 * Is this product sold as a set of other products?
 *
 * One exact request on the wrapper product's id — never a page of every bundle
 * filtered in the browser, which would silently miss any bundle past the first
 * page.
 */
export function useProductBundles(productId: string) {
  return useQuery({
    queryKey: [...productKeys.facet(productId, 'configurator'), 'bundles'] as const,
    queryFn: () => api.list<Bundle>('/v1/commerce/bundles', { product_id: productId, take: 50 }),
    enabled: productId !== 'new',
  });
}

export function useBundleDetail(bundleId: string | null) {
  return useQuery({
    queryKey: ['commerce', 'bundles', bundleId ?? ''] as const,
    queryFn: () => api.get<BundleDetail>(`/v1/commerce/bundles/${bundleId ?? ''}`),
    enabled: bundleId !== null,
  });
}

/** What a template write sends. Options are replaced wholesale — the server has
 *  no add-one-question endpoint. */
export interface ConfiguratorTemplatePatch {
  name?: string;
  description?: string | null;
  status?: 'draft' | 'active' | 'archived';
  options?: ConfiguratorOption[];
  rules?: ConfiguratorRule[];
}

export function useCreateConfiguratorTemplate(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: { name: string; options: ConfiguratorOption[] }) =>
      api.post<{ id: string }>('/v1/commerce/configurator-templates', {
        productId,
        name: input.name,
        options: input.options,
      }),
    onSuccess: () => {
      invalidate(productId, 'configurator');
    },
  });
}

export function useUpdateConfiguratorTemplate(productId: string, templateId: string) {
  const invalidate = useInvalidateProduct();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ConfiguratorTemplatePatch) =>
      api.patch(`/v1/commerce/configurator-templates/${templateId}`, patch),
    onSuccess: () => {
      // The template's own key is not under `detail(productId)` — it is keyed on
      // the template so two panes share it — so the coarse product invalidate
      // does not reach it and it has to be named.
      void queryClient.invalidateQueries({
        queryKey: ['commerce', 'configurator-templates', templateId],
      });
      invalidate(productId, 'configurator');
    },
  });
}

export function useDeleteConfiguratorTemplate(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (templateId: string) =>
      api.delete(`/v1/commerce/configurator-templates/${templateId}`),
    onSuccess: () => {
      invalidate(productId, 'configurator');
    },
  });
}

/** What the storefront would hand back for a set of choices. */
export interface ConfiguratorPreview {
  templateId: string;
  resolvedVariantId: string | null;
  resolvedSku: string;
  addOnLines: { variantId: string; quantity: number; unitPriceCents: number; label?: string }[];
  basePriceCents: number;
  totalAdjustmentCents: number;
  /** Rules that refused this combination, in the wording the shopper would see. */
  errors: string[];
}

/**
 * Run a set of choices through the rules exactly as a shopper would.
 *
 * A mutation rather than a query even though it writes nothing: it is fired by a
 * person pressing a button on a combination they just assembled, not read on
 * mount, and caching one arbitrary combination would be pointless.
 */
export function useConfiguratorPreview() {
  return useMutation({
    mutationFn: (input: {
      templateId: string;
      selections: Record<string, string | string[] | number | boolean>;
    }) => api.post<ConfiguratorPreview>('/v1/commerce/configurator/preview', input),
  });
}

/* ── Trade pricing (B2B) ────────────────────────────────────────────────── */

/** A rule that lowers what a trade customer pays. Four kinds resolve in a
 *  waterfall server-side (account override → contract price → tier override →
 *  the tier's blanket discount), which is why they are read together. */
export interface TradePricingTier {
  id: string;
  name: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  /** `all` means this tier's blanket discount already applies to this product
   *  without anyone listing it — the difference between "nothing set up" and
   *  "trade customers already pay less here". */
  productScope: string;
  minOrderCents: number;
  accountCount: number;
}

export interface TradeTierOverride {
  id: string;
  tierId: string;
  tierName: string;
  /** A soft-deleted tier keeps its overrides but resolves to list price. */
  tierDeleted: boolean;
  variantId: string | null;
  priceCents: number | null;
  discountPercentage: number | null;
  notes: string | null;
}

export interface TradeAccountOverride {
  id: string;
  accountId: string;
  accountName: string;
  accountStatus: string;
  variantId: string | null;
  priceCents: number | null;
  discountPercentage: number | null;
  minOrderQty: number | null;
  maxOrderQty: number | null;
  notes: string | null;
}

/** A price agreed with one business for a fixed period. Beats a tier, loses to
 *  an account override. */
export interface TradeContractPrice {
  id: string;
  accountId: string;
  accountName: string;
  variantId: string;
  priceCents: number;
  validFrom: string;
  validTo: string | null;
  /** Decided server-side — a browser clock a day out must not be the thing that
   *  declares an agreement expired. */
  active: boolean;
  notes: string | null;
}

export interface TradePricingVariant {
  id: string;
  sku: string;
  title: string | null;
  priceCents: number;
  costCents: number | null;
  currency: string;
}

export interface TradePricing {
  variants: TradePricingVariant[];
  tiers: TradePricingTier[];
  tierOverrides: TradeTierOverride[];
  accountOverrides: TradeAccountOverride[];
  contractPrices: TradeContractPrice[];
}

/**
 * Every trade-pricing rule touching this product, in ONE request.
 *
 * The four resources are addressable only by what they hang off (overrides by
 * tier, overrides by account, contracts by account), so the product-side
 * question would otherwise cost a request per tier PLUS a request per account.
 * `/v1/b2b/product-pricing` was added for exactly this — see the batching rule
 * at the top of this file.
 */
export function useTradePricing(productId: string) {
  return useQuery({
    queryKey: productKeys.facet(productId, 'b2b-pricing'),
    queryFn: () => api.get<TradePricing>('/v1/b2b/product-pricing', { product_id: productId }),
    enabled: productId !== 'new',
  });
}

/** Add a fixed price or a percentage off for one tier on one variant. */
export function useAddTierOverride(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: {
      tierId: string;
      variantId: string;
      priceCents?: number;
      discountPercentage?: number;
      notes?: string;
    }) =>
      api.post(`/v1/b2b/pricing-tiers/${input.tierId}/overrides`, {
        variantId: input.variantId,
        // The server enforces EXACTLY one of these two, so an undefined key
        // must be absent rather than present-and-undefined.
        ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
        ...(input.discountPercentage !== undefined
          ? { discountPercentage: input.discountPercentage }
          : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      }),
    onSuccess: () => {
      invalidate(productId, 'b2b-pricing');
    },
  });
}

export function useRemoveTierOverride(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: { tierId: string; overrideId: string }) =>
      api.delete(`/v1/b2b/pricing-tiers/${input.tierId}/overrides/${input.overrideId}`),
    onSuccess: () => {
      invalidate(productId, 'b2b-pricing');
    },
  });
}

export function useRemoveAccountOverride(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: { accountId: string; overrideId: string }) =>
      api.delete(`/v1/b2b/accounts/${input.accountId}/overrides/${input.overrideId}`),
    onSuccess: () => {
      invalidate(productId, 'b2b-pricing');
    },
  });
}

export function useRemoveContractPrice(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/commerce/contract-prices/${id}`),
    onSuccess: () => {
      invalidate(productId, 'b2b-pricing');
    },
  });
}

/**
 * What a rule works out to on a given list price, in cash.
 *
 * A "15% off" row beside a "$42.00" row cannot be compared by eye, and the
 * comparison is the entire reason someone opens this panel. Null when the rule
 * carries neither number, which the stored shape permits.
 */
export function tradeRulePriceCents(
  rule: { priceCents: number | null; discountPercentage: number | null },
  listCents: number
): number | null {
  if (rule.priceCents !== null) return rule.priceCents;
  if (rule.discountPercentage !== null) {
    return Math.round(listCents * (1 - rule.discountPercentage / 100));
  }
  return null;
}

/* ── Reviews & questions ────────────────────────────────────────────────── */

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'flagged';

export interface ProductReview {
  id: string;
  productId: string;
  variantId: string | null;
  customerId: string | null;
  orderId: string | null;
  rating: number;
  title: string;
  body: string;
  displayName: string | null;
  status: ReviewStatus;
  /** The reviewer actually bought it — the most useful thing on the row. */
  verifiedPurchase: boolean;
  helpfulCount: number;
  unhelpfulCount: number;
  response: string | null;
  respondedAt: string | null;
  mediaAssetIds: string[];
  createdAt: string;
}

export interface ProductQuestionAnswer {
  id: string;
  questionId: string;
  body: string;
  /** Written by the business rather than another shopper. */
  isOfficial: boolean;
  authorCustomerId: string | null;
  authorUserId: string | null;
  helpfulCount: number;
  createdAt: string;
}

export interface ProductQuestion {
  id: string;
  productId: string;
  customerId: string | null;
  displayName: string | null;
  body: string;
  status: string;
  helpfulCount: number;
  createdAt: string;
  answers: ProductQuestionAnswer[];
}

export interface ProductReviewPage {
  items: ProductReview[];
  total: number;
  /** The mean of APPROVED reviews only — what the storefront shows. */
  averageRating: number;
}

/** Every review on this product, including the ones awaiting moderation. */
export function useProductReviews(productId: string) {
  return useQuery({
    queryKey: productKeys.facetPart(productId, 'reviews', 'reviews'),
    queryFn: () =>
      api.get<ProductReviewPage>(`/v1/commerce/products/${productId}/reviews`, {
        take: 100,
      }),
    enabled: productId !== 'new',
  });
}

/** Questions asked on this product's page, each with its answers. */
export function useProductQuestions(productId: string) {
  return useQuery({
    queryKey: productKeys.facetPart(productId, 'reviews', 'questions'),
    queryFn: () =>
      api.get<ProductQuestion[]>(`/v1/commerce/products/${productId}/questions`, { take: 100 }),
    enabled: productId !== 'new',
  });
}

export function useModerateReview(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: { id: string; status: 'approved' | 'rejected' | 'flagged' }) =>
      api.post(`/v1/commerce/reviews/${input.id}/moderate`, { status: input.status }),
    // Publishing or hiding a review moves the product's own averageRating and
    // reviewCount, so the coarse product invalidate is doing real work here.
    onSuccess: () => {
      invalidate(productId, 'reviews');
    },
  });
}

export function useRespondToReview(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: { id: string; response: string }) =>
      api.post(`/v1/commerce/reviews/${input.id}/respond`, { response: input.response }),
    onSuccess: () => {
      invalidate(productId, 'reviews');
    },
  });
}

export function useDeleteReview(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/commerce/reviews/${id}`),
    onSuccess: () => {
      invalidate(productId, 'reviews');
    },
  });
}

export function useModerateQuestion(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: { id: string; status: 'published' | 'rejected' }) =>
      api.post(`/v1/commerce/questions/${input.id}/moderate`, { status: input.status }),
    onSuccess: () => {
      invalidate(productId, 'reviews');
    },
  });
}

export function useAnswerQuestion(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: { id: string; body: string }) =>
      api.post(`/v1/commerce/questions/${input.id}/answer`, {
        body: input.body,
        // An answer written here is the BUSINESS speaking, which is what earns
        // it the official badge on the storefront.
        isOfficial: true,
      }),
    onSuccess: () => {
      invalidate(productId, 'reviews');
    },
  });
}

/** How a review's state reads to someone who does not know the stored words. */
export function reviewState(status: string): { label: string; tone: Tone } {
  switch (status) {
    case 'approved':
      return { label: 'Published', tone: 'success' };
    case 'pending':
      return { label: 'Waiting for you', tone: 'warning' };
    case 'flagged':
      return { label: 'Reported', tone: 'danger' };
    case 'rejected':
      return { label: 'Hidden', tone: 'neutral' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

export function questionState(status: string): { label: string; tone: Tone } {
  switch (status) {
    case 'published':
      return { label: 'Published', tone: 'success' };
    case 'pending':
      return { label: 'Waiting for you', tone: 'warning' };
    case 'rejected':
      return { label: 'Hidden', tone: 'neutral' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

/* ── Where it sells (channels + sparx.market) ───────────────────────────── */

/** One variant listed on one outside shop. Variant-grain, because that is what
 *  an external listing actually maps to. */
export interface ChannelListing {
  id: string;
  channel: string;
  /** The shop's real name — never render the stored slug at a person. */
  channelName: string;
  connectionId: string;
  connectionStatus: string;
  shopName: string | null;
  variantId: string;
  variantSku: string;
  variantTitle: string | null;
  externalProductId: string | null;
  externalVariantId: string | null;
  externalSku: string | null;
  syncEnabled: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
}

export function useChannelListings(productId: string) {
  return useQuery({
    queryKey: productKeys.facet(productId, 'channels'),
    queryFn: () => api.get<ChannelListing[]>('/v1/channels/mappings', { product_id: productId }),
    enabled: productId !== 'new',
  });
}

/** Pause or resume pushing price + stock to one outside listing. */
export function useSetListingSync(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: { id: string; syncEnabled: boolean }) =>
      api.patch(`/v1/channels/mappings/${input.id}`, { syncEnabled: input.syncEnabled }),
    onSuccess: () => {
      invalidate(productId, 'channels');
    },
  });
}

/** Forget the link between this variant and an outside listing. Does NOT take
 *  the listing down on the other shop — the copy at the call site must say so. */
export function useUnlinkListing(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/channels/mappings/${id}`),
    onSuccess: () => {
      invalidate(productId, 'channels');
    },
  });
}

/** The sparx.market opt-in. It lives on the PRODUCT record, so writing it
 *  refreshes the product rather than a facet of its own. */
export function useSetMarketListing(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: { listed: boolean; category?: string }) =>
      api.put(`/v1/market/products/${productId}`, {
        listed: input.listed,
        ...(input.category ? { category: input.category } : {}),
      }),
    onSuccess: () => {
      invalidate(productId);
    },
  });
}

/* ── Dropshipping ───────────────────────────────────────────────────────── */

export interface DropshipLink {
  id: string;
  status: string;
  supplierSku: string;
  createdAt: string;
  supplier: {
    id: string;
    name: string;
    type: string;
    status: string;
    /** The connection was removed but the link survived — this product is
     *  orphaned, and saying so is the whole reason the flag is carried. */
    disconnected: boolean;
    lastSyncAt: string | null;
  };
  source: {
    id: string;
    supplierProductId: string;
    title: string;
    costPriceCents: number;
    msrpCents: number | null;
    variantCount: number;
    importedAt: string;
    updatedAt: string;
  };
}

export interface ProductDropshipVariant {
  id: string;
  sku: string;
  title: string | null;
  priceCents: number;
  costCents: number | null;
  currency: string;
  /** Sourcing is variant-grain even though the LINK is product-grain. */
  dropshipSourceId: string | null;
}

export interface ProductDropship {
  /** Stamped on the product by the importer. Can disagree with `links` when a
   *  link was removed by hand, which is exactly why both are reported. */
  stampedSupplierId: string | null;
  links: DropshipLink[];
  variants: ProductDropshipVariant[];
}

export function useProductDropship(productId: string) {
  return useQuery({
    queryKey: productKeys.facet(productId, 'dropship'),
    queryFn: () =>
      api.get<ProductDropship>('/v1/dropship/product-links', { product_id: productId }),
    enabled: productId !== 'new',
  });
}

/**
 * Pull this product's details and cost from the supplier again.
 *
 * Keyed on the SUPPLIER's catalog id rather than ours, because that is the
 * direction the import actually runs.
 */
export function useReimportFromSupplier(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: { supplierId: string; sourceId: string }) =>
      api.post(`/v1/dropship/suppliers/${input.supplierId}/catalog/${input.sourceId}/reimport`, {}),
    onSuccess: () => {
      // A reimport rewrites the title, description, images and prices, so it
      // moves far more than the dropship facet alone.
      invalidate(productId, 'dropship');
      invalidate(productId, 'variants');
    },
  });
}

/* ── Subscriptions ──────────────────────────────────────────────────────── */

export interface ProductSubscriber {
  id: string;
  customerId: string;
  customerName: string | null;
  status: string;
  nextOccurrenceAt: string | null;
  itemCount: number;
  /** THIS product's share of the subscription's monthly value, not the whole
   *  subscription's — a $200/mo box holding one $5 item counts $5 here. */
  monthlyRecurringRevenueCents: number;
  currency: string;
  providerSlug: string;
  lines: { variantId: string; variantSku: string | null; quantity: number }[];
}

export interface ProductSubscriptions {
  counts: { active: number; paused: number; cancelled: number; pastDue: number };
  monthlyRecurringRevenueCents: number;
  currency: string | null;
  unitsPerMonth: number;
  subscriptions: ProductSubscriber[];
  /** `subscription` means this product is SET UP to be sold on a repeating
   *  schedule. Carried so "set up, but nobody has subscribed yet" is
   *  distinguishable from "not a repeat product at all" — the common case. */
  fulfillmentType: string;
}

export function useProductSubscriptions(productId: string) {
  return useQuery({
    queryKey: productKeys.facet(productId, 'subscriptions'),
    queryFn: () =>
      api.get<ProductSubscriptions>(`/v1/commerce/products/${productId}/subscriptions`),
    enabled: productId !== 'new',
  });
}

export function subscriptionState(status: string): { label: string; tone: Tone } {
  switch (status) {
    case 'active':
      return { label: 'Running', tone: 'success' };
    case 'trialing':
      return { label: 'On trial', tone: 'info' };
    case 'paused':
      return { label: 'Paused', tone: 'warning' };
    case 'past_due':
      return { label: 'Payment failed', tone: 'danger' };
    case 'cancelled':
      return { label: 'Stopped', tone: 'neutral' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

/* ── Translations ───────────────────────────────────────────────────────── */

export interface ProductTranslation {
  id: string;
  productId: string;
  locale: string;
  title: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useProductTranslations(productId: string) {
  return useQuery({
    queryKey: productKeys.facet(productId, 'translations'),
    queryFn: () => api.get<ProductTranslation[]>(`/v1/commerce/products/${productId}/translations`),
    enabled: productId !== 'new',
  });
}

/**
 * Save one language's copy.
 *
 * PUT, and the payload is the WHOLE row for that locale: an omitted optional
 * field is stored as NULL rather than left at its previous value. That is what
 * makes "clear the Spanish search description" expressible without a second
 * verb — so this always sends all four fields, and a caller must never hand it
 * a partial.
 */
export function useSaveTranslation(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (input: {
      locale: string;
      title: string;
      description: string | null;
      seoTitle: string | null;
      seoDescription: string | null;
    }) =>
      api.put<ProductTranslation>(
        `/v1/commerce/products/${productId}/translations/${encodeURIComponent(input.locale)}`,
        {
          title: input.title,
          description: input.description,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
        }
      ),
    onSuccess: () => {
      invalidate(productId, 'translations');
    },
  });
}

export function useDeleteTranslation(productId: string) {
  const invalidate = useInvalidateProduct();
  return useMutation({
    mutationFn: (locale: string) =>
      api.delete(`/v1/commerce/products/${productId}/translations/${encodeURIComponent(locale)}`),
    onSuccess: () => {
      invalidate(productId, 'translations');
    },
  });
}

/**
 * Canonicalize a language tag the way the server does — language lowercase,
 * script Titlecase, region UPPERCASE.
 *
 * Done here as well as there so the pane can key its draft rows on the SAME
 * string the server will store. Without it, typing `en-us` creates a draft row
 * under `en-us`, which comes back from the save as `en-US` — and the pane shows
 * the language twice with the operator's edit apparently lost.
 */
export function canonicalLocale(raw: string): string {
  const parts = raw.trim().replace(/_/g, '-').split('-').filter(Boolean);
  return parts
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      // A four-letter subtag is a SCRIPT (Hans, Cyrl) and is Titlecase; two or
      // three characters in a later position is a REGION and is uppercase.
      if (part.length === 4) return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      if (part.length === 2 || part.length === 3) return part.toUpperCase();
      return part.toLowerCase();
    })
    .join('-');
}

/** A language tag in the reader's own language ("Spanish (Mexico)"), falling
 *  back to the tag itself when the browser has no name for it. */
export function localeName(locale: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

/** Would the server accept this tag? Mirrors the BCP-47 shape the Locale schema
 *  enforces, so the pane can refuse it before spending a round trip. */
export function isValidLocale(raw: string): boolean {
  return /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/.test(canonicalLocale(raw));
}

/* ══════════════════════════════════════════════════════════════════════════
   FILING — the categories and collections a product belongs to.

   Both are tenant-wide lists, not facets of a product, so they are keyed
   OUTSIDE `productKeys.detail(id)` and shared by every pane that shows them.
   The keys nest under the prefixes the Categories and Collections list
   surfaces already use (`['commerce','categories']` /
   `['commerce','collections']`), so renaming a collection in that list
   refreshes the picker here without either side naming the other.

   MEMBERSHIP itself lives on the product record — `categoryIds` and
   `collectionMemberships` — and is written through `useUpdateProduct`. There
   is deliberately no second mutation for it: `POST …/set-product-categories`
   and `POST …/set-product-collections` write the same two join tables that
   `PATCH /products/:id` does, and two paths to one field is how a value saved
   in one pane reappears as the old one in the pane docked beside it.
   ══════════════════════════════════════════════════════════════════════════ */

/** One category as the server nests it. The tree can be deep; this app never
 *  renders it as a tree (see `flattenCategories`). */
export interface CategoryNode {
  id: string;
  name: string;
  handle: string;
  parentId: string | null;
  /** Dot-joined handles, root first — the server's materialized path. */
  path: string;
  depth: number;
  featured: boolean;
  /** Products a SHOPPER finds under this heading on the site being worked in —
   *  the same number that site's own category page prints. */
  productCount: number;
  /** Products filed here that no shopper can see: archived, drafted, or kept for
   *  one of the business's other sites. Zero for most categories; when it is not
   *  zero the screen has to say so, or a truthful "0" reads as "my products have
   *  disappeared" (issue 382). */
  hiddenProductCount: number;
  children: CategoryNode[];
}

/** A category flattened into something pickable: its own name plus the names of
 *  everything above it, so "Cookware" is legible as
 *  "Outdoor › Camping › Cookware" without drawing a tree. */
export interface CategoryChoice {
  id: string;
  name: string;
  /** Ancestor names, root first, INCLUDING this one. */
  trail: string[];
  /** What a shopper finds here — see {@link CategoryNode.productCount}. */
  productCount: number;
  /** Filed here but not shown — see {@link CategoryNode.hiddenProductCount}. */
  hiddenProductCount: number;
  /** Whether the category is flagged featured. Carried through so the category
   *  LIST can badge it; the parent picker simply ignores it. */
  featured: boolean;
}

/**
 * The whole category tree.
 *
 * One request for the lot, and long-lived: a category tree is set up once and
 * then referenced constantly, and the alternative — a request per level as the
 * operator drills — is the N+1 this file exists to prevent. The endpoint hands
 * back the full nested tree when given no filter, so searching happens in the
 * browser over a list already in hand rather than as a round trip per keystroke.
 */
export function useCategoryTree() {
  return useQuery({
    queryKey: ['commerce', 'categories', 'tree'] as const,
    queryFn: () => api.get<CategoryNode[]>('/v1/commerce/categories'),
    staleTime: 5 * 60_000,
  });
}

/** Depth-first, parents before children, so the flat list still reads in tree
 *  order. Tolerates an orphan (the server surfaces one as a root). */
export function flattenCategories(nodes: CategoryNode[] | undefined): CategoryChoice[] {
  const out: CategoryChoice[] = [];
  const walk = (list: CategoryNode[], trail: string[]) => {
    for (const node of list) {
      const here = [...trail, node.name];
      out.push({
        id: node.id,
        name: node.name,
        trail: here,
        productCount: node.productCount,
        hiddenProductCount: node.hiddenProductCount,
        featured: node.featured,
      });
      walk(node.children, here);
    }
  };
  walk(nodes ?? [], []);
  return out;
}

/** How a collection decides what is in it. `manual` is a hand-picked list;
 *  `rules` fills itself from conditions the business wrote. */
export type CollectionKind = 'manual' | 'rules';

export interface CollectionChoice {
  id: string;
  name: string;
  handle: string;
  type: CollectionKind;
  productCount: number;
}

/**
 * Every collection this business has.
 *
 * `take: 250` is the endpoint's ceiling. A business past that has outgrown a
 * picker and wants a searching one — but paging a picker whose whole job is
 * "which of these is this product in" would hide the answer on page two, so the
 * honest failure is a full list or nothing.
 */
export function useCollections() {
  return useQuery({
    queryKey: ['commerce', 'collections', 'all'] as const,
    queryFn: () =>
      api
        .list<CollectionChoice>('/v1/commerce/collections', { take: 250 })
        .then((page) => page.items),
    staleTime: 5 * 60_000,
  });
}

/**
 * Split a product's collection memberships into the two that behave differently.
 *
 * `chosen` is what a person put there and may take away. `automatic` is what a
 * collection's rule matched, which the indexer owns: removing it from the
 * product side would delete nothing (there is no manual row to delete) and the
 * next reprojection would put it straight back. So the editor never offers to.
 *
 * `unknown` is a membership whose collection is not in the picker list —
 * soft-deleted, or past the 250 the list returns. Kept rather than dropped,
 * because silently forgetting a membership on save is exactly the kind of loss
 * a person would never see happen.
 */
export function splitMemberships(
  memberships: { collectionId: string; addedBy: 'manual' | 'rule' }[],
  collections: CollectionChoice[] | undefined
): { chosen: CollectionChoice[]; automatic: CollectionChoice[]; unknownIds: string[] } {
  const byId = new Map((collections ?? []).map((c) => [c.id, c]));
  const chosen: CollectionChoice[] = [];
  const automatic: CollectionChoice[] = [];
  const unknownIds: string[] = [];
  for (const membership of memberships) {
    const collection = byId.get(membership.collectionId);
    if (!collection) {
      unknownIds.push(membership.collectionId);
      continue;
    }
    (membership.addedBy === 'rule' ? automatic : chosen).push(collection);
  }
  const byName = (a: CollectionChoice, b: CollectionChoice) => a.name.localeCompare(b.name);
  chosen.sort(byName);
  automatic.sort(byName);
  return { chosen, automatic, unknownIds };
}

/* ── Are these products findable? ───────────────────────────────────────── */

/**
 * How many of this business's records are in the search index.
 *
 * The public shop does not read the products table \u2014 it reads the search index,
 * and when that index is empty it renders "No products found. Try adjusting your
 * filters or search." A shop with nine products on sale and an empty index tells
 * every visitor there is nothing to buy, tells the owner nothing at all, and looks
 * from the console exactly like a shop that is working.
 *
 * That is the gap this closes. It is not a diagnostic: it is the only place the
 * owner can learn their shop is invisible.
 */
export interface SearchCollectionStat {
  collection: string;
  documents: number;
}

export interface SearchStatus {
  collections: SearchCollectionStat[];
  /** Products on sale that searching cannot find. `null` means the check could
   *  not run — say nothing, never render it as none. */
  productsMissing: number | null;
}

export function useSearchStatus() {
  return useQuery({
    queryKey: ['search', 'status'],
    queryFn: () => api.get<SearchStatus>('/v1/search/status'),
    // A search-side hiccup must never take the products list down with it.
    retry: false,
    staleTime: 60_000,
  });
}

/** How many of her products are on sale but cannot be found by searching, or
 *  null when nothing measured it. Distinct from a document COUNT: twelve
 *  documents look exactly like sixteen until something knows there should be
 *  sixteen, which is why the count alone left four of Devi's products silently
 *  unfindable (issue 318). */
export function unfindableProductCount(data: SearchStatus | undefined): number | null {
  return data?.productsMissing ?? null;
}

/** How many PRODUCT documents this business has in search, or null when the
 *  answer could not be fetched \u2014 which is not the same as zero and must not
 *  render as one. */
export function indexedProductCount(
  data: { collections: SearchCollectionStat[] } | undefined
): number | null {
  if (!data) return null;
  const row = data.collections.find((c) => c.collection.includes('product'));
  return row ? row.documents : null;
}

/** Rebuild this business's search index from its real records. The work happens
 *  on a worker, so this returns as soon as the request is accepted \u2014 the copy
 *  has to say "started", never "done". */
export function useReindexSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ runId: string }>('/v1/search/reindex'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['search', 'status'] });
    },
  });
}

/**
 * Can this shop actually take a customer's money?
 *
 * Separate from every other reason a sale can fail, because it is the only one
 * that lets a customer get all the way to the last step first. A shopper picks
 * out their order, types their address, chooses how to collect it, and only then
 * is told the shop cannot be paid. Nothing before that moment hints at it, on
 * either side of the screen.
 *
 * Returns `null` while unknown — loading, or the request failed. Absence is not
 * "no gateway", and rendering a warning off a failed request would tell a
 * business their shop is broken because our own call timed out.
 */
export function usePaymentsReady(): boolean | null {
  const config = usePaymentConfig();
  if (!config.data) return null;
  return config.data.isActive;
}
