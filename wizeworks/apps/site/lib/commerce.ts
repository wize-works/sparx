// Storefront commerce reads. Thin client over api-rest's
// /v1/public/commerce/* surface, mirroring lib/content.ts in shape so
// the rendering layer can treat both content + commerce reads the same
// way.

import { cookies } from 'next/headers';

import { resolveReaderLocale } from './locale';
import { resolveActivePropertySlug } from './site-context';

const BASE_URL = process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';

// Better Auth's customer-session cookie carries a `__Secure-` prefix in
// production — matched by substring so both forms hit. Checked BEFORE the
// no-op cache path so a signed-out visitor's product reads stay exactly as
// cheap/cacheable as before this existed.
const CUSTOMER_SESSION_COOKIE = 'sparx_customer_session';

/** The raw Cookie header to forward to api-rest, only when a customer session
 *  cookie is present — undefined (the common, fully-cached path) otherwise.
 *  Reading it opts THIS request into dynamic rendering (Next.js's `cookies()`
 *  contract), which is the real, accepted cost of viewer-driven pricing:
 *  product reads for a signed-in shopper skip the shared 60s cache so one
 *  customer's contract price can never leak into another's cached response. */
async function forwardedSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  const hasSession = store.getAll().some((c) => c.name.includes(CUSTOMER_SESSION_COOKIE));
  return hasSession ? store.toString() : undefined;
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    per_page?: number;
    total?: number;
    total_pages?: number;
    // Search responses carry Typesense facet counts here.
    facets?: Record<string, { value: string; count: number }[]>;
  };
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; request_id?: string };
}

async function publicGet<T>(
  path: string,
  query: Record<string, string | number | string[] | undefined>,
  tags: string[],
  // A draft-preview token (`?sparxPreview=` on the PDP). When present we forward
  // it as `Authorization: Preview <jwt>` and skip the cache — a preview must
  // always reflect the live draft, never a 60s-stale published snapshot.
  previewToken?: string
): Promise<{ data: T; meta?: SuccessEnvelope<T>['meta'] }> {
  const params = new URLSearchParams();
  // Model B (docs/49 §3): scope every public commerce read to the active site —
  // injected once here. Null for the primary site (api-rest defaults), so
  // single-site storefronts are unchanged. An explicit query `property` wins.
  const propertySlug = await resolveActivePropertySlug();
  if (propertySlug && query.property === undefined) params.set('property', propertySlug);
  // The reader's language, injected in ONE place for the same reason `property`
  // is: every catalogue read has to carry it or the shop is half translated, and
  // 30 call sites each remembering is 30 chances to forget. It rides in the URL,
  // which is also the fetch cache key — so Spanish and English are separate
  // cached entries for free, and a reader never gets served the other one.
  const locale = await resolveReaderLocale();
  if (locale && query.locale === undefined) params.set('locale', locale);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue;
    // Array values become repeated params (?options=a&options=b) — the storefront's
    // multi-select facets (option axes) send several under one key.
    if (Array.isArray(value)) {
      for (const v of value) if (v !== '') params.append(key, String(v));
    } else {
      params.set(key, String(value));
    }
  }
  // Coarse per-tenant tag (`commerce:<slug>`) alongside the granular ones so a
  // single revalidateTag('commerce:<slug>') purge clears all of a tenant's
  // commerce reads (revalidateTag is exact-match, not prefix). See app/api/revalidate.
  const coarse = query.tenant ? [`commerce:${String(query.tenant)}`] : [];
  const sessionCookie = previewToken ? undefined : await forwardedSessionCookie();
  const res = await fetch(`${BASE_URL}${path}?${params.toString()}`, {
    ...(previewToken
      ? { cache: 'no-store', headers: { Authorization: `Preview ${previewToken}` } }
      : sessionCookie
        ? { cache: 'no-store', headers: { Cookie: sessionCookie } }
        : { next: { revalidate: 60, tags: ['sparx-storefront', ...coarse, ...tags] } }),
  });
  const json = (await res.json()) as SuccessEnvelope<T> | ErrorEnvelope;
  if (!res.ok || 'error' in json) {
    const code = 'error' in json ? json.error.code : 'UNKNOWN';
    const message = 'error' in json ? json.error.message : `HTTP ${res.status}`;
    throw Object.assign(new Error(`api-rest ${path}: ${code}: ${message}`), { code });
  }
  return { data: json.data, meta: json.meta };
}

// ─── Types ─────────────────────────────────────────────────────────────

export interface PublicCollection {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  heroMediaId: string | null;
  featured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId?: string | null;
}

export interface PublicProductListItem {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  priceMinCents: number | null;
  priceMaxCents: number | null;
  compareAtCents: number | null;
  /** The signed-in viewer's contract price on the default variant — present
   *  only for an active B2B customer whose price differs from retail; null
   *  for every anonymous/retail visitor (the common case). */
  yourPriceCents: number | null;
  inStock: boolean;
  averageRating: number | null;
  reviewCount: number;
  primaryImageId: string | null;
  /** What the owner wrote about that photo, on this product — the console's
   *  "Description for screen readers". Null when she has written none, and the
   *  card then falls back to the product title, exactly as the detail page does. */
  primaryImageAlt: string | null;
  /** Variant an add-to-cart defaults to (explicit default, else lowest position).
   *  Null when the product has no live variant — such a card renders, but its
   *  add-to-cart must never fire. */
  defaultVariantId: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string;
}

export interface PublicProductOptionValue {
  id: string;
  value: string;
  swatchHex: string | null;
  position: number;
}

export interface PublicProductOption {
  id: string;
  name: string;
  displayType: string;
  position: number;
  values: PublicProductOptionValue[];
}

export interface PublicProductVariant {
  id: string;
  sku: string;
  title: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  /** The signed-in viewer's price on THIS variant, resolved through the same
   *  priority chain checkout uses (contract price → price list → bulk tier) —
   *  present only when it differs from `priceCents`; null otherwise. */
  yourPriceCents: number | null;
  isDefault: boolean;
  inventoryPolicy: string;
  optionValueIds: string[];
  /** Summed available across every warehouse. */
  available: number;
  /** True when stock is available OR the variant accepts back-orders. */
  inStock: boolean;
  /** A live preorder offer, when the merchant is running one (docs/146 Phase
   *  9.4). Null for the overwhelming majority of variants. */
  preorder: PublicPreorderOffer | null;
  /** The soonest date anybody waiting on this item has been promised it back
   *  (docs/146 Phase 9.3). Null when nobody has been able to promise anything —
   *  which is common, and is shown as "we will confirm a date" rather than as an
   *  invented one or as silence. */
  expectedBackAt: string | null;
}

export interface PublicPreorderOffer {
  /** The date the customer is told. Null means TO BE CONFIRMED — a factory that
   *  has not committed to a date is ordinary, and filling this field with a
   *  guess turns a placeholder into a promise. */
  availableAt: string | null;
  /** The merchant's own words, shown alongside or instead of the date. */
  availabilityNote: string | null;
  isTakingOrders: boolean;
  /** Null when uncapped — render NOTHING, never a number. */
  remaining: number | null;
  chargeUpFront: boolean;
  blockedBy: string | null;
}

export interface PublicProductImage {
  id: string;
  mediaAssetId: string;
  variantId: string | null;
  alt: string | null;
  position: number;
  optionValueIds: string[];
}

/** One axis of a fitment domain (its shape). `level` dimensions form the node
 *  tree in declared order; `range` dimensions are numeric narrowing axes
 *  (Year/Weight/Shoe size). `unit` is an optional hint for the range widget. */
export interface PublicFitmentDimension {
  key: string;
  label: string;
  kind: 'level' | 'range';
  unit?: string;
}

// One applicability row on a product, in the generalized fitment model.
// `domainLabel` is the merchant-facing noun for this vertical (e.g. "Vehicle",
// "Pet"); `nodeName`/`nodePath` are the deepest level node + its ancestry
// (root → self), or null/[] for a universal (whole-domain) rule; `ranges`
// carry a numeric window per range dimension (year/weight/size span — the unit
// lives on the matching dimension in `dimensions`).
export interface PublicProductFitmentRange {
  dimensionKey: string;
  min: number | null;
  max: number | null;
}

export interface PublicProductFitment {
  id: string;
  domainSlug: string;
  domainLabel: string;
  dimensions: PublicFitmentDimension[];
  nodeName: string | null;
  nodePath: string[];
  ranges: PublicProductFitmentRange[];
  notes: string | null;
}

/** One typed attribute section (docs/143) — the type's field order is preserved,
 *  so a PDP can auto-render these top-to-bottom. `value` is the resolved display
 *  string (scalar, or a joined summary for a repeater); `items` carries the rows
 *  of a repeater/object field for a sub-repeat (empty for scalar fields). */
export interface PublicProductAttributeSection {
  key: string;
  label: string;
  kind: string;
  value: string;
  items: { label: string; value: string }[];
}

export interface PublicProduct extends PublicProductListItem {
  fulfillmentType: string;
  weightGrams: number | null;
  dimensions: { lengthMm: number | null; widthMm: number | null; heightMm: number | null } | null;
  options: PublicProductOption[];
  variants: PublicProductVariant[];
  images: PublicProductImage[];
  fitments: PublicProductFitment[];
  /** The product's typed product-type key (docs/143), or null when untyped. */
  productTypeKey: string | null;
  /** Resolved display value per attribute field — for INDIVIDUAL binding
   *  (`commerce.product.attributes.fabric`). Empty for an untyped product. */
  attributes: Record<string, string>;
  /** Ordered attribute sections — for the AUTO-RENDER repeat on the PDP. */
  attributeSections: PublicProductAttributeSection[];
  /** In stock but at/below reorder point — the honest low-stock signal that
   *  replaced fabricated scarcity. */
  lowStock: boolean;
  /** Made to order (issue 026) — everything a buyer has to be told BEFORE they
   *  commit, when the thing has to be made before it can be handed over. */
  madeToOrder: PublicMadeToOrder;
}

/** How much of the price is taken at checkout. Three shapes; `none` is what
 *  every ordinary product carries. */
export type PublicDeposit =
  { type: 'none' } | { type: 'amount'; amountCents: number } | { type: 'percent'; percent: number };

export interface PublicMadeToOrder {
  /** Days of notice the shop needs. Null = none, and the buy box says nothing. */
  orderAheadDays: number | null;
  deposit: PublicDeposit;
  dailyLimit: number | null;
  /** The earliest DAY an order placed now could be collected, `YYYY-MM-DD` in
   *  the SHOP's zone. Null when no notice is needed. */
  readyOn: string | null;
  /** How many today's allowance still has room for. Null means either no
   *  allowance or nobody counted — either way, render NOTHING rather than a
   *  number that was not measured. */
  remainingToday: number | null;
}

export interface PublicCategoryNode {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  parentId: string | null;
  path: string;
  position: number;
  featured: boolean;
  iconMediaId: string | null;
  heroMediaId: string | null;
  /**
   * Whether this category, or anything under it, holds a product a shopper can buy
   * here — the same subtree rollup the category page itself lists by.
   *
   * The index used to show every root category regardless. Juniper Row's showed six,
   * of which five were empty: the only products ever filed in them were the
   * blueprint's samples and she had deleted those, so a card reading "Everyday goods
   * — the whole shop in one place" led to a page saying nothing was there (issue
   * 275). Optional, so an older api-rest that omits it behaves exactly as before.
   */
  hasProducts?: boolean;
}

/** A category's OWN detail record (browse-node page). Extends the tree node with
 *  the SEO/OG fields the detail route's metadata reads. */
export interface PublicCategory extends PublicCategoryNode {
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
}

/** One product-option axis and the order the shop put its values in. Merged across
 *  the catalog by api-rest — a shop declares Size per product, and the facet panel
 *  shows one Size group for all of them. */
export interface PublicOptionAxis {
  name: string;
  values: string[];
}

export interface PublicFitmentDomain {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  iconKey: string | null;
  /** Ordered dimension list — `level` dims drive the node drill (in order),
   *  `range` dims drive the numeric narrowing widgets. */
  dimensions: PublicFitmentDimension[];
}

/** One node in a domain's `level` tree (a Make, a Model, an Engine — or a
 *  Species, a Breed). `dimensionKey` names which level it sits at; `childCount`
 *  tells the panel whether a deeper level exists (0 = leaf, end of the drill). */
export interface PublicFitmentNode {
  id: string;
  name: string;
  slug: string;
  dimensionKey: string;
  depth: number;
  position: number;
  childCount: number;
}

// ─── Calls ─────────────────────────────────────────────────────────────

export async function listCollections(tenantSlug: string): Promise<PublicCollection[]> {
  const { data } = await publicGet<PublicCollection[]>(
    '/v1/public/commerce/collections',
    { tenant: tenantSlug },
    [`commerce:${tenantSlug}:collections`]
  );
  return data;
}

/**
 * Did an api-rest read fail because the thing is NOT THERE, or because we could not ASK?
 *
 * The two look identical at a `catch` and mean opposite things to a shopper. "This
 * collection was deleted" is a fact about the shop and renders as empty; "api-rest is
 * unreachable" is a fact about us and must never render as a shop with nothing in it
 * (issue 324). `publicGet` throws with the envelope's `code`, so a 404 from `notFound()`
 * arrives as `NOT_FOUND` and a dead socket arrives as a bare fetch `TypeError` with no
 * code at all — which is exactly the distinction, and why the default here is "could not
 * ask" rather than "nothing found".
 */
export function isNotFound(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'NOT_FOUND';
}

/** Thrown when no source could answer a listing. Not zero results — no answer. Callers
 *  let it reach the page so `app/error.tsx` says the page did not load, which is what
 *  the product page already does in the same outage. */
export class CatalogUnavailableError extends Error {
  constructor() {
    super('api-rest: the catalog could not be read');
    this.name = 'CatalogUnavailableError';
  }
}

export async function getCollection(
  tenantSlug: string,
  handle: string
): Promise<PublicCollection | null> {
  try {
    const { data } = await publicGet<PublicCollection>(
      `/v1/public/commerce/collections/${encodeURIComponent(handle)}`,
      { tenant: tenantSlug },
      [`commerce:${tenantSlug}:collection:${handle}`]
    );
    return data;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function listCollectionProducts(
  tenantSlug: string,
  handle: string,
  page = 1,
  perPage = 24
): Promise<{ items: PublicProductListItem[]; total: number; page: number; perPage: number }> {
  const { data, meta } = await publicGet<PublicProductListItem[]>(
    `/v1/public/commerce/collections/${encodeURIComponent(handle)}/products`,
    { tenant: tenantSlug, page, perPage },
    [`commerce:${tenantSlug}:collection:${handle}:products`]
  );
  return {
    items: data,
    total: meta?.total ?? data.length,
    page: meta?.page ?? page,
    perPage: meta?.per_page ?? perPage,
  };
}

export type ProductSort =
  'relevance' | 'price-asc' | 'price-desc' | 'title-asc' | 'title-desc' | 'newest';

export interface ProductListFilters {
  q?: string;
  vendor?: string;
  productType?: string;
  tag?: string;
  /** Generalized fitment filter: the NAME of any selected `level` node (a Make,
   *  Model, Engine — or a Species, Breed). The API matches it against the
   *  node's ancestry (`node.pathNames has <name>`), so picking any level narrows
   *  to that subtree. Sent on the wire as `fitmentMake` (the API param name). */
  fitmentNodeName?: string;
  /** Optional numeric narrowing against a `range` dimension (year / weight /
   *  size — the unit is implied by the active domain). Sent as `fitmentYear`. */
  fitmentRangeValue?: number;
  minPriceCents?: number;
  maxPriceCents?: number;
  inStock?: boolean;
  sort?: ProductSort;
  /** Scope the listing to ONE collection by handle (flat membership). Backs the
   *  collection detail page's faceted grid. */
  collection?: string;
  /** Scope the listing to ONE category by handle — a browse-node rollup (self +
   *  descendants). Backs the category detail page's faceted grid. */
  category?: string;
  page?: number;
  perPage?: number;
}

export async function listProducts(
  tenantSlug: string,
  filters: ProductListFilters = {}
): Promise<{ items: PublicProductListItem[]; total: number; page: number; perPage: number }> {
  const query: Record<string, string | number | undefined> = {
    tenant: tenantSlug,
    q: filters.q,
    vendor: filters.vendor,
    productType: filters.productType,
    tag: filters.tag,
    // The listing filter reads `fitmentMake` (a node name, matched against
    // node.pathNames) + `fitmentYear` (a numeric range value). Generic over the
    // domain — the names are historical, the behaviour is name + numeric.
    fitmentMake: filters.fitmentNodeName,
    fitmentYear: filters.fitmentRangeValue,
    minPriceCents: filters.minPriceCents,
    maxPriceCents: filters.maxPriceCents,
    inStock: filters.inStock === undefined ? undefined : String(filters.inStock),
    sort: filters.sort,
    collection: filters.collection,
    category: filters.category,
    page: filters.page,
    perPage: filters.perPage,
  };
  const { data, meta } = await publicGet<PublicProductListItem[]>(
    '/v1/public/commerce/products',
    query,
    [`commerce:${tenantSlug}:products`]
  );
  return {
    items: data,
    total: meta?.total ?? data.length,
    page: meta?.page ?? filters.page ?? 1,
    perPage: meta?.per_page ?? filters.perPage ?? 24,
  };
}

// ─── Typesense search ───────────────────────────────────────────────────

export interface SearchFacetValue {
  value: string;
  count: number;
}

/** Facet counts keyed by Typesense field name (vendor, product_type, tags,
 *  fitment_makes, …). Drives the search-page filter sidebar. */
export type SearchFacets = Record<string, SearchFacetValue[]>;

export interface ProductSearchFilters {
  q?: string;
  vendor?: string;
  productType?: string;
  tag?: string;
  inStock?: boolean;
  minPriceCents?: number;
  maxPriceCents?: number;
  fitmentMakes?: string;
  fitmentModels?: string;
  fitmentEngines?: string;
  fitmentYear?: number;
  /** Scope the faceted search to ONE collection / category by handle (browse-as-search). */
  collection?: string;
  category?: string;
  /** Product-option facet selections as "Name:Value" tokens (e.g. ["Color:Black","Size:M"]). */
  options?: string[];
  sort?: ProductSort;
  page?: number;
  perPage?: number;
}

export interface ProductSearchResult {
  items: PublicProductListItem[];
  total: number;
  page: number;
  perPage: number;
  facets: SearchFacets;
}

/** Typo-tolerant faceted product search (Typesense, via api-rest). Returns the
 *  same PublicProductListItem cards as the PLP plus facet counts for the
 *  filter sidebar. */
export async function searchProducts(
  tenantSlug: string,
  filters: ProductSearchFilters = {}
): Promise<ProductSearchResult> {
  const query: Record<string, string | number | string[] | undefined> = {
    tenant: tenantSlug,
    q: filters.q,
    vendor: filters.vendor,
    productType: filters.productType,
    tag: filters.tag,
    inStock: filters.inStock === undefined ? undefined : String(filters.inStock),
    minPriceCents: filters.minPriceCents,
    maxPriceCents: filters.maxPriceCents,
    fitmentMakes: filters.fitmentMakes,
    fitmentModels: filters.fitmentModels,
    fitmentEngines: filters.fitmentEngines,
    fitmentYear: filters.fitmentYear,
    collection: filters.collection,
    category: filters.category,
    options: filters.options,
    sort: filters.sort,
    page: filters.page,
    perPage: filters.perPage,
  };
  const askIndex = async (): Promise<ProductSearchResult | null> => {
    try {
      const { data, meta } = await publicGet<PublicProductListItem[]>(
        '/v1/public/commerce/search',
        query,
        [`commerce:${tenantSlug}:search`]
      );
      return {
        items: data,
        total: meta?.total ?? data.length,
        page: meta?.page ?? filters.page ?? 1,
        perPage: meta?.per_page ?? filters.perPage ?? 24,
        facets: meta?.facets ?? {},
      };
    } catch {
      // Typesense unreachable. Not an answer, and specifically not an answer of zero.
      return null;
    }
  };

  if (browsing(filters)) {
    // The catalog decides the SET (issue 209). Concurrent, so a browse page costs
    // the same wall-clock as it did when the index decided alone.
    const [indexed, listed] = await Promise.all([askIndex(), catalogFallback(tenantSlug, filters)]);
    if (listed) {
      return {
        ...listed,
        // The counts come from the index, so they are only true when the index holds
        // the same catalog. A sidebar reading "Size S: 2" over a shop of seven is a
        // wrong measurement, and empty is the honest version of it.
        facets: indexed?.total === listed.total ? indexed.facets : {},
      };
    }
    // Neither source answered. NOT a shop with nothing in it — see below.
    if (!indexed) throw new CatalogUnavailableError();
    return indexed;
  }

  const indexed = await askIndex();
  // A zero-hit listing is the other half of issue 203: the index answered, it just
  // holds nothing for this tenant yet. Ask the database before telling a shopper the
  // shop is empty — when it really is, the fallback returns nothing either.
  if (!indexed || indexed.items.length === 0) {
    const listed = await catalogFallback(tenantSlug, filters);
    // BOTH said "I could not answer", and the listing has no third source to try. It
    // used to fabricate a zero here, which is how Juniper Row's shop came to read
    // "0 products · Nothing in the shop yet" over 16 published garments while a product
    // page on the same site correctly said it had failed to load (issue 324).
    //
    // The zero is the dangerous shape precisely because it renders as a finished page:
    // her heading, her copy, her footer, `200 OK`, and one sentence telling every
    // visitor that this business has nothing to sell. Throwing hands the page to
    // `app/error.tsx`, which says what happened and offers the retry.
    if (!listed) throw new CatalogUnavailableError();
    return listed;
  }
  return indexed;
}

/**
 * A listing with nothing TYPED into it is a browse — /shop, a collection page, a
 * category page. All three ask "show me everything", which Postgres answers exactly
 * and the index only copies; a copy that is behind renders as a smaller shop rather
 * than as a fault (issue 209). Words in the box are the index's actual job, so those
 * still go to it, and so do the filters the catalog cannot express.
 */
function browsing(filters: ProductSearchFilters): boolean {
  if (filters.q?.trim()) return false;
  if (filters.options && filters.options.length > 0) return false;
  if (filters.fitmentModels) return false;
  if (filters.fitmentEngines) return false;
  return true;
}

// There was an `EMPTY_LISTING(filters)` here — a hand-built `{ items: [], total: 0 }`
// returned when no source could answer. It is gone rather than unused: the only way to
// reach a zero on this path is now for a source to have actually said zero, which is
// the whole of issue 324. Keeping the constructor around is keeping the loaded gun.

/**
 * The catalog itself. What a business sells, from Postgres.
 *
 * NOTHING FOUND IS NOT THE SAME AS NOTHING TO FIND. An empty index — Typesense down, or
 * a catalog that has not finished indexing — rendered as "No products found", which tells
 * a shopper this business sells nothing (issue 203). A PARTLY filled one rendered as a
 * smaller shop, which is worse, because it looks finished (issue 209).
 *
 * `/v1/public/commerce/products` carries the same sort vocabulary, the same price window
 * and the same card shape as the index, so a page renders whole from either. It is the
 * authority on a browse listing and the fallback everywhere else. What it cannot do is
 * facets, typo tolerance, and the multi-value selections below — asked for one of those
 * it returns null rather than a WRONG answer.
 */
async function catalogFallback(
  tenantSlug: string,
  filters: ProductSearchFilters
): Promise<ProductSearchResult | null> {
  // NULL means "could not answer", never "nothing to sell". The difference is the
  // whole of issue 203 — a caller that cannot tell them apart prints one as the other.
  if (filters.options?.length || filters.fitmentModels || filters.fitmentEngines) return null;

  try {
    const listed = await listProducts(tenantSlug, {
      q: filters.q,
      vendor: filters.vendor,
      productType: filters.productType,
      tag: filters.tag,
      inStock: filters.inStock,
      minPriceCents: filters.minPriceCents,
      maxPriceCents: filters.maxPriceCents,
      fitmentNodeName: filters.fitmentMakes,
      fitmentRangeValue: filters.fitmentYear,
      collection: filters.collection,
      category: filters.category,
      sort: filters.sort,
      page: filters.page,
      perPage: filters.perPage,
    });
    return { ...listed, facets: {} };
  } catch {
    return null;
  }
}

export interface SiteSearchHit {
  /** 'product' | 'collection' | 'cms_page' | 'cms_entry' */
  type: string;
  title: string;
  subtitle: string | null;
  url: string;
  /** The tenant's own name for a CMS hit's content type — "Blog post", "Page",
   *  "Event". Null for products and collections, whose entity type names them. */
  kind?: string | null;
}

/** Public "search everything" across the storefront (products, collections,
 *  CMS pages) via the universal index. Degrades to an empty list rather than
 *  throwing — it's a supplementary strip beside the product grid, never
 *  load-bearing. */
export async function searchEverything(
  tenantSlug: string,
  q: string,
  perPage = 20
): Promise<SiteSearchHit[]> {
  if (!q.trim()) return [];
  try {
    const { data } = await publicGet<{ results: SiteSearchHit[]; total: number }>(
      '/v1/public/search',
      { tenant: tenantSlug, q, perPage },
      [`commerce:${tenantSlug}:search`]
    );
    return data.results;
  } catch {
    return [];
  }
}

/** Products related to the given one: same product type, self excluded.
 *  Falls back to an empty list rather than throwing — it's a nice-to-have
 *  section, never load-bearing. */
export async function listRelatedProducts(
  tenantSlug: string,
  product: Pick<PublicProduct, 'id' | 'productType'>,
  limit = 4
): Promise<PublicProductListItem[]> {
  if (!product.productType) return [];
  try {
    const { items } = await listProducts(tenantSlug, {
      productType: product.productType,
      perPage: limit + 1,
    });
    return items.filter((p) => p.id !== product.id).slice(0, limit);
  } catch {
    return [];
  }
}

/** Hydrate a hand-picked set of products by id, in the requested order.
 *  Backs Site Builder's manual featured-products source. Unknown/inactive ids
 *  are dropped by the API. Returns [] (never throws) so a section degrades to
 *  empty rather than erroring the whole page. */
export async function getProductsByIds(
  tenantSlug: string,
  ids: string[]
): Promise<PublicProductListItem[]> {
  if (ids.length === 0) return [];
  try {
    const { data } = await publicGet<PublicProductListItem[]>(
      '/v1/public/commerce/products/by-ids',
      { tenant: tenantSlug, ids: ids.join(',') },
      [`commerce:${tenantSlug}:products`]
    );
    return data;
  } catch {
    return [];
  }
}

/** Hydrate FULL products (options + variants + images) for the Builder data spine
 *  (docs/98 Pillar 7) — by a hand-picked id list (entity pins, order preserved), a
 *  collection id, a category id, or — with none of those — the whole catalog (the
 *  `all` source), capped by `limit`. Returns [] for a source that is GONE, so a stale
 *  binding degrades to empty; anything else throws (issue 324). */
export async function getProductsFull(
  tenantSlug: string,
  opts: {
    ids?: string[];
    collection?: string;
    category?: string;
    limit?: number;
    /** The author's chosen order for a bound repeater. Omitted = the catalog's own
     *  in-stock-first default. */
    sort?: string;
    /** Narrow to products carrying this tag — the author's one-field filter. */
    tag?: string;
  } = {}
): Promise<PublicProduct[]> {
  if (opts.ids?.length === 0) return [];
  try {
    const { data } = await publicGet<PublicProduct[]>(
      '/v1/public/commerce/products/full',
      {
        tenant: tenantSlug,
        ids: opts.ids && opts.ids.length > 0 ? opts.ids.join(',') : undefined,
        collection: opts.collection,
        category: opts.category,
        limit: opts.limit,
        sort: opts.sort,
        tag: opts.tag,
      },
      [`commerce:${tenantSlug}:products`]
    );
    return data;
  } catch (err) {
    // A gone collection/category is empty, and that is true to say. An unreachable
    // api-rest is not (issue 324) — with no `collection`/`category`/`ids` this call IS
    // the whole catalog, so swallowing it put an empty shop on a builder page for the
    // same reason it put one on a silica page.
    if (isNotFound(err)) return [];
    throw err;
  }
}

/** A collection / category OWN-record (docs/98 Pillar 7 record-display) — its own
 *  fields, NOT its products. `heroMediaId` resolves to an image via `mediaUrl`. */
export interface PublicEntityRecord {
  id: string;
  name: string;
  handle: string;
  description: string | null;
  heroMediaId: string | null;
}

/** Hydrate collection OWN-records by id (record-display pins), order preserved.
 *  Returns [] (never throws) so a builder page degrades to empty. */
export async function getCollectionRecordsFull(
  tenantSlug: string,
  ids: string[]
): Promise<PublicEntityRecord[]> {
  if (ids.length === 0) return [];
  try {
    const { data } = await publicGet<PublicEntityRecord[]>(
      '/v1/public/commerce/collections/full',
      { tenant: tenantSlug, ids: ids.join(',') },
      [`commerce:${tenantSlug}:collections`]
    );
    return data;
  } catch {
    return [];
  }
}

// ─── Categories (browse-node tree + detail) ─────────────────────────────

/** The tenant's full category tree (flat, path-ordered). Drives the /category
 *  index, a detail page's subcategory strip, and its breadcrumb ancestors — the
 *  tree is small enough that one read serves all three. */
export async function listCategories(tenantSlug: string): Promise<PublicCategoryNode[]> {
  const { data } = await publicGet<PublicCategoryNode[]>(
    '/v1/public/commerce/categories',
    { tenant: tenantSlug },
    [`commerce:${tenantSlug}:categories`]
  );
  return data;
}

/** One category's own record by handle, or null when it doesn't exist. */
export async function getCategory(
  tenantSlug: string,
  handle: string
): Promise<PublicCategory | null> {
  try {
    const { data } = await publicGet<PublicCategory>(
      `/v1/public/commerce/categories/${encodeURIComponent(handle)}`,
      { tenant: tenantSlug },
      [`commerce:${tenantSlug}:category:${handle}`]
    );
    return data;
  } catch (err) {
    if ((err as { code?: string }).code === 'NOT_FOUND') return null;
    throw err;
  }
}

/** Paginated products in a category AND its descendants (browse-node rollup).
 *  Mirrors listCollectionProducts, but the API rolls the subtree up so a parent
 *  category page isn't empty when products live on its leaves. */
export async function listCategoryProducts(
  tenantSlug: string,
  handle: string,
  page = 1,
  perPage = 24
): Promise<{ items: PublicProductListItem[]; total: number; page: number; perPage: number }> {
  const { data, meta } = await publicGet<PublicProductListItem[]>(
    `/v1/public/commerce/categories/${encodeURIComponent(handle)}/products`,
    { tenant: tenantSlug, page, perPage },
    [`commerce:${tenantSlug}:category:${handle}:products`]
  );
  return {
    items: data,
    total: meta?.total ?? data.length,
    page: meta?.page ?? page,
    perPage: meta?.per_page ?? perPage,
  };
}

/** Hydrate category OWN-records by id (record-display pins), order preserved. */
export async function getCategoryRecordsFull(
  tenantSlug: string,
  ids: string[]
): Promise<PublicEntityRecord[]> {
  if (ids.length === 0) return [];
  try {
    const { data } = await publicGet<PublicEntityRecord[]>(
      '/v1/public/commerce/categories/full',
      { tenant: tenantSlug, ids: ids.join(',') },
      [`commerce:${tenantSlug}:categories`]
    );
    return data;
  } catch {
    return [];
  }
}

export async function getProduct(
  tenantSlug: string,
  handle: string,
  // When set (the editor opened a `?sparxPreview=` link), the read is authorized
  // to return a DRAFT product and bypasses the cache.
  previewToken?: string
): Promise<PublicProduct | null> {
  try {
    const { data } = await publicGet<PublicProduct>(
      `/v1/public/commerce/products/${encodeURIComponent(handle)}`,
      { tenant: tenantSlug },
      [`commerce:${tenantSlug}:product:${handle}`],
      previewToken
    );
    return data;
  } catch (err) {
    if ((err as { code?: string }).code === 'NOT_FOUND') return null;
    throw err;
  }
}

export interface PublicQuestionAnswer {
  id: string;
  body: string;
  isOfficial: boolean;
  createdAt: string;
}

export interface PublicQuestion {
  id: string;
  displayName: string | null;
  body: string;
  createdAt: string;
  helpfulCount: number;
  answers: PublicQuestionAnswer[];
}

/** Published Q&A for a product (questions + merchant answers). Returns [] on
 *  failure — the PDP Q&A block is supplementary, never load-bearing. */
export interface PublicReview {
  id: string;
  rating: number;
  title: string;
  body: string;
  author: string | null;
  verifiedPurchase: boolean;
  helpfulCount: number;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
}

export interface PublicReviewList {
  summary: { averageRating: number; total: number };
  items: PublicReview[];
}

/** Approved reviews for a product (newest first) + the live rating summary.
 *  Returns an empty list on failure — the PDP reviews block degrades to its
 *  summary/empty state rather than erroring the whole page. */
export async function listProductReviews(
  tenantSlug: string,
  handle: string
): Promise<PublicReviewList> {
  try {
    const { data } = await publicGet<PublicReviewList>(
      `/v1/public/commerce/products/${encodeURIComponent(handle)}/reviews`,
      { tenant: tenantSlug },
      [`commerce:${tenantSlug}:product:${handle}:reviews`]
    );
    return data;
  } catch {
    return { summary: { averageRating: 0, total: 0 }, items: [] };
  }
}

export async function listProductQuestions(
  tenantSlug: string,
  handle: string
): Promise<PublicQuestion[]> {
  try {
    const { data } = await publicGet<PublicQuestion[]>(
      `/v1/public/commerce/products/${encodeURIComponent(handle)}/questions`,
      { tenant: tenantSlug },
      [`commerce:${tenantSlug}:product:${handle}:questions`]
    );
    return data;
  } catch {
    return [];
  }
}

/** The order the shop declared its option axes and values in — Size runs XS, S, M, L,
 *  XL, not whichever order the facet counts came back in.
 *
 *  Fails to an EMPTY list rather than throwing: the panel then falls back to the
 *  count order it used before, which is imperfect and is not a broken page. A filter
 *  in a surprising order is a worse shop; a filter that is missing is a broken one. */
export async function listOptionAxes(tenantSlug: string): Promise<PublicOptionAxis[]> {
  try {
    const { data } = await publicGet<PublicOptionAxis[]>(
      '/v1/public/commerce/option-axes',
      { tenant: tenantSlug },
      [`commerce:${tenantSlug}:option-axes`]
    );
    return data;
  } catch {
    return [];
  }
}

export async function listFitmentDomains(tenantSlug: string): Promise<PublicFitmentDomain[]> {
  const { data } = await publicGet<PublicFitmentDomain[]>(
    '/v1/public/commerce/fitment/domains',
    { tenant: tenantSlug },
    [`commerce:${tenantSlug}:fitment:domains`]
  );
  return data;
}

/** Drill the domain's `level` node tree. Absent `parentId` → the top-level
 *  nodes (first level dimension); a node id → that node's children (the next
 *  level). One call walks any depth, so the storefront facet stays generic
 *  over `dimensions` — no per-vertical endpoints. */
export async function listFitmentNodes(
  tenantSlug: string,
  domainId: string,
  parentId?: string
): Promise<PublicFitmentNode[]> {
  const { data } = await publicGet<PublicFitmentNode[]>(
    `/v1/public/commerce/fitment/domains/${encodeURIComponent(domainId)}/nodes`,
    { tenant: tenantSlug, parentId },
    [`commerce:${tenantSlug}:fitment:nodes:${domainId}:${parentId ?? 'root'}`]
  );
  return data;
}
