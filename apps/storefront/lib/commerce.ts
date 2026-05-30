// Storefront commerce reads. Thin client over api-rest's
// /v1/public/commerce/* surface, mirroring lib/content.ts in shape so
// the rendering layer can treat both content + commerce reads the same
// way.

const BASE_URL = process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: { page?: number; per_page?: number; total?: number; total_pages?: number };
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; request_id?: string };
}

async function publicGet<T>(
  path: string,
  query: Record<string, string | number | undefined>,
  tags: string[]
): Promise<{ data: T; meta?: SuccessEnvelope<T>['meta'] }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const res = await fetch(`${BASE_URL}${path}?${params.toString()}`, {
    next: { revalidate: 60, tags: ['sparx-storefront', ...tags] },
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
  inStock: boolean;
  averageRating: number | null;
  reviewCount: number;
  primaryImageId: string | null;
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
  isDefault: boolean;
  inventoryPolicy: string;
  optionValueIds: string[];
  /** Summed available across every warehouse. */
  available: number;
  /** True when stock is available OR the variant accepts back-orders. */
  inStock: boolean;
}

export interface PublicProductImage {
  id: string;
  mediaAssetId: string;
  variantId: string | null;
  alt: string | null;
  position: number;
  optionValueIds: string[];
}

export interface PublicProductFitment {
  id: string;
  make: string;
  model: string | null;
  engine: string | null;
  yearMin: number | null;
  yearMax: number | null;
  notes: string | null;
}

export interface PublicProduct extends PublicProductListItem {
  fulfillmentType: string;
  weightGrams: number | null;
  dimensions: { lengthMm: number | null; widthMm: number | null; heightMm: number | null } | null;
  options: PublicProductOption[];
  variants: PublicProductVariant[];
  images: PublicProductImage[];
  fitments: PublicProductFitment[];
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
}

export interface PublicFitmentDomain {
  id: string;
  slug: string;
  displayName: string;
  description: string | null;
  iconKey: string | null;
  labels: { l1: string; l2?: string; l3?: string; range?: string };
  rangeUnit: string | null;
  isGlobal: boolean;
}

export interface PublicFitmentCategory {
  id: string;
  name: string;
  slug: string;
  iconMediaId: string | null;
  isGlobal: boolean;
}

/** Back-compat alias — storefront callers used `PublicVehicleMake` when
 *  fitment was vehicle-only. The shape is now a generic fitment category
 *  with `name`/`slug`/`isGlobal`. New code should use
 *  PublicFitmentCategory directly. */
export type PublicVehicleMake = PublicFitmentCategory;

// ─── Calls ─────────────────────────────────────────────────────────────

export async function listCollections(tenantSlug: string): Promise<PublicCollection[]> {
  const { data } = await publicGet<PublicCollection[]>(
    '/v1/public/commerce/collections',
    { tenant: tenantSlug },
    [`commerce:${tenantSlug}:collections`]
  );
  return data;
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
    if ((err as { code?: string }).code === 'NOT_FOUND') return null;
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
  | 'relevance'
  | 'price-asc'
  | 'price-desc'
  | 'title-asc'
  | 'title-desc'
  | 'newest';

export interface ProductListFilters {
  q?: string;
  vendor?: string;
  productType?: string;
  tag?: string;
  fitmentMake?: string;
  fitmentYear?: number;
  minPriceCents?: number;
  maxPriceCents?: number;
  inStock?: boolean;
  sort?: ProductSort;
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
    fitmentMake: filters.fitmentMake,
    fitmentYear: filters.fitmentYear,
    minPriceCents: filters.minPriceCents,
    maxPriceCents: filters.maxPriceCents,
    inStock: filters.inStock === undefined ? undefined : String(filters.inStock),
    sort: filters.sort,
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

export async function getProduct(
  tenantSlug: string,
  handle: string
): Promise<PublicProduct | null> {
  try {
    const { data } = await publicGet<PublicProduct>(
      `/v1/public/commerce/products/${encodeURIComponent(handle)}`,
      { tenant: tenantSlug },
      [`commerce:${tenantSlug}:product:${handle}`]
    );
    return data;
  } catch (err) {
    if ((err as { code?: string }).code === 'NOT_FOUND') return null;
    throw err;
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

export async function listFitmentCategories(
  tenantSlug: string,
  domainId: string
): Promise<PublicFitmentCategory[]> {
  const { data } = await publicGet<PublicFitmentCategory[]>(
    `/v1/public/commerce/fitment/domains/${encodeURIComponent(domainId)}/categories`,
    { tenant: tenantSlug },
    [`commerce:${tenantSlug}:fitment:categories:${domainId}`]
  );
  return data;
}

/** Back-compat — keep callers that loaded "vehicle makes" working by
 *  returning the categories of the global Vehicle domain. New code
 *  should compose listFitmentDomains + listFitmentCategories so it's
 *  not hardcoded to the vehicle vertical. */
export async function listVehicleMakes(tenantSlug: string): Promise<PublicVehicleMake[]> {
  const domains = await listFitmentDomains(tenantSlug);
  const vehicle = domains.find((d) => d.slug === 'vehicle');
  if (!vehicle) return [];
  return listFitmentCategories(tenantSlug, vehicle.id);
}
