// Public read endpoints for storefronts. No auth — results are
// restricted to active (non-archived, non-deleted) products and
// rules-driven memberships. Tenant resolution by slug.
//
//   GET /v1/public/commerce/collections                  ?tenant=<slug>
//   GET /v1/public/commerce/collections/:handle          ?tenant=<slug>
//   GET /v1/public/commerce/collections/:handle/products ?tenant=<slug>[&page=&perPage=]
//   GET /v1/public/commerce/products                     ?tenant=<slug>[&page=&perPage=&q=]
//   GET /v1/public/commerce/products/:handle             ?tenant=<slug>
//   GET /v1/public/commerce/categories                   ?tenant=<slug>
//   GET /v1/public/commerce/categories/:handle           ?tenant=<slug>
//   GET /v1/public/commerce/categories/:handle/products  ?tenant=<slug>[&page=&perPage=]
//   GET /v1/public/commerce/option-axes                  ?tenant=<slug>[&property=<slug>]
//   GET /v1/public/commerce/fitment/domains              ?tenant=<slug>
//   GET /v1/public/commerce/fitment/domains/:domainId/nodes ?tenant=<slug>[&parentId=<uuid>]
//
// Tenant resolution is identical to the CMS public surface
// (tenants table is the only non-RLS row, safe to look up by slug).
// All other reads run inside withTenant() so RLS scopes them.

import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { queryBool } from '@wizeworks/api-core/query';

import type { FastifyRequest } from 'fastify';

import { ok, paged } from '@wizeworks/api-core/envelope';
import { notFound } from '@wizeworks/api-core/errors';
import { prisma, withTenant } from '@wizeworks/db';
import { isModuleEnabled } from '@wizeworks/auth';
import { computeAvailability } from '@wizeworks/inventory';
import { preorderState } from '@wizeworks/commerce-schemas';
import {
  depositFromColumns,
  madeToOrderService,
  pricingService,
  productTypeService,
  projectProductAttributes,
  readyOnDate,
  remainingToday,
} from '@wizeworks/commerce';
import type { ProductTypeSchema as ProductTypeSchemaT } from '@wizeworks/commerce-schemas';
import { searchProducts } from '@wizeworks/search';
import {
  resolvePublicPropertyId,
  productSiteVisibilityWhere,
  collectionSiteVisibilityWhere,
  categorySiteVisibilityWhere,
} from '../../../lib/property.js';
import { mergeOptionAxes } from '../../../lib/option-axes.js';
import { tryVerifyProductPreview } from '../../../lib/preview.js';
import { requireTenantIdBySlug } from '../../../lib/tenant-slug.js';
import { optionalCustomer } from '../../../lib/customer-session.js';
import { applyTranslation, LocaleParam, translationSelect } from './product-locale.js';

// `property` (a stable site slug) scopes catalog reads to one web PROPERTY
// (docs/49 Model B). The storefront passes it for non-primary sites; omitted →
// the tenant's primary site. Resolved on EVERY read so the primary shows only
// global + primary-scoped products, never another site's exclusive items.
const TenantQuery = z.object({
  tenant: z.string().min(1).max(63),
  property: z.string().min(1).max(63).optional(),
  // The language the reader asked for. Absent means the shop's own words, which
  // is what every request sent before translations were ever read back.
  locale: LocaleParam,
});

const PagingQuery = z.object({
  tenant: z.string().min(1).max(63),
  property: z.string().min(1).max(63).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(24),
  locale: LocaleParam,
});

const ProductListQuery = PagingQuery.extend({
  q: z.string().optional(),
  vendor: z.string().optional(),
  productType: z.string().optional(),
  tag: z.string().optional(),
  fitmentMake: z.string().optional(),
  fitmentYear: z.coerce.number().int().optional(),
  inStock: queryBool.optional(),
  minPriceCents: z.coerce.number().int().min(0).optional(),
  maxPriceCents: z.coerce.number().int().min(0).optional(),
  // Scope the whole listing to ONE collection (flat membership) or ONE category
  // (browse-node rollup: self + descendants). This is what lets the collection and
  // category detail pages reuse the PLP's facets/sort/pagination instead of a bare
  // grid — the scope is resolved to ids inside the tenant transaction below.
  collection: z.string().optional(),
  category: z.string().optional(),
  sort: z
    .enum(['relevance', 'price-asc', 'price-desc', 'title-asc', 'title-desc', 'newest'])
    .default('relevance'),
});

// The PLP sort vocabulary → a Prisma orderBy. Mirrors `SEARCH_SORT_BY` (the Typesense
// side) so the Postgres listing and the search index sort identically. `relevance` is
// the catalog default: in-stock first, then most-recently-updated.
const PLP_ORDER_BY: Record<string, Prisma.ProductOrderByWithRelationInput[]> = {
  relevance: [{ inStock: 'desc' }, { updatedAt: 'desc' }],
  'price-asc': [{ priceMinCents: 'asc' }],
  'price-desc': [{ priceMaxCents: 'desc' }],
  'title-asc': [{ title: 'asc' }],
  'title-desc': [{ title: 'desc' }],
  newest: [{ createdAt: 'desc' }],
};

// Typesense-backed storefront search. Typo-tolerant, faceted, fast. Typesense
// owns ranking/filtering/faceting; Postgres still owns the canonical display
// row (ratings, inventory, image) so cards render identically to the PLP — we
// hydrate the hit ids in Typesense's relevance order. `sort` mirrors the PLP's
// ProductSort vocabulary.
const SearchQuery = PagingQuery.extend({
  q: z.string().optional(),
  vendor: z.string().optional(),
  productType: z.string().optional(),
  tag: z.string().optional(),
  inStock: queryBool.optional(),
  minPriceCents: z.coerce.number().int().min(0).optional(),
  maxPriceCents: z.coerce.number().int().min(0).optional(),
  fitmentMakes: z.string().optional(),
  fitmentModels: z.string().optional(),
  fitmentEngines: z.string().optional(),
  fitmentYear: z.coerce.number().int().optional(),
  // Scope the faceted search to ONE collection/category (browse-as-search): the handle is
  // resolved to an id and filtered on the indexed collection_ids/category_ids, so a
  // collection/category page IS a Typesense search with a scope — same facets + counts.
  collection: z.string().optional(),
  category: z.string().optional(),
  // Product-option facet selections as "Name:Value" tokens (repeatable param, e.g.
  // ?options=Color:Black&options=Size:M). AND-ed across selections.
  options: z.union([z.string(), z.array(z.string())]).optional(),
  sort: z
    .enum(['relevance', 'price-asc', 'price-desc', 'title-asc', 'title-desc', 'newest'])
    .default('relevance'),
});

/** Normalize a repeatable query param (single value, array, or absent) to a string list. */
function toList(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean);
}

const SEARCH_SORT_BY: Record<string, string | undefined> = {
  relevance: undefined, // Typesense default: _text_match,best_seller_rank,updated_at
  'price-asc': 'price_min_cents:asc',
  'price-desc': 'price_max_cents:desc',
  'title-asc': 'title:asc',
  'title-desc': 'title:desc',
  newest: 'updated_at:desc',
};

function splitCsv(value?: string): string[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

const HandleParams = z.object({ handle: z.string().min(1).max(255) });

// Batched own-record fetch by id (docs/98 Pillar 7 record-display): a node PINNED to
// a collection/category resolves ITS fields. Mirrors `products/full`'s id contract.
const IdsQuery = z.object({
  tenant: z.string().min(1).max(63),
  ids: z.string().optional(),
  locale: LocaleParam,
});

/** Parse a `?ids=a,b,c` list into valid uuids (deduped order kept, capped at 48). */
function parseIdList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => z.string().uuid().safeParse(s).success)
    .slice(0, 48);
}

/** Re-sort fetched rows to the requested id order (Prisma `in` doesn't preserve it). */
function orderByIds<T extends { id: string }>(ids: string[], rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [r] : [];
  });
}

// The own-record fields a collection / category PIN exposes (id + name + handle +
// description + hero asset id). `heroMediaId` is the raw asset id — the builder's
// record mapper resolves it to a URL, exactly as products return `primaryImageId`.
const RECORD_SELECT = {
  id: true,
  name: true,
  handle: true,
  description: true,
  heroMediaId: true,
} as const;

// Cached in lib/tenant-slug.ts (docs/127 §5).
const resolveTenantBySlug = requireTenantIdBySlug;

/**
 * Product reads are otherwise fully anonymous/cacheable — but a signed-in
 * B2B customer needs to see THEIR price on the same pages every shopper
 * uses (no separate "B2B site"). Resolves the viewer's ACTIVE B2B
 * membership when a customer session cookie is present, else null (the
 * common, still-cacheable case — most visitors are anonymous or retail).
 *
 * Whose price to show is an ENHANCEMENT on a catalog read, so it is not allowed
 * to fail one. Anything that goes wrong in here degrades to "no B2B viewer" —
 * list prices instead of contract prices, which is a far smaller wrong answer
 * than the alternative: the storefront renders a failed listing as "No products
 * found", so a viewer this could not be resolved for was told the shop was empty
 * (issue 253). Same rule as issue 203 — a failure to answer is never an answer
 * of zero.
 */
async function resolveViewerB2bAccountId(
  request: FastifyRequest,
  tenantId: string
): Promise<string | undefined> {
  try {
    const resolved = await optionalCustomer(request, { tenantId });
    if (!resolved) return undefined;
    return await withTenant({ tenantId }, async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: resolved.customerId },
        select: { companyId: true },
      });
      return pricingService.resolveActiveB2bAccountId(tx, resolved.customerId, customer?.companyId);
    });
  } catch (err) {
    request.log.warn({ err }, 'could not resolve viewer for pricing — showing list prices');
    return undefined;
  }
}

/**
 * Card-list "your price" fast path: the DEFAULT variant's contract price
 * only (not the full price-list/bulk-tier waterfall `resolve()` runs for the
 * PDP/cart) — one batched query regardless of page size, so a 24-product grid
 * costs the same as a single product. Anonymous/non-B2B viewers (the common
 * case) skip this entirely and the response is unchanged from today.
 */
async function resolveDefaultVariantContractPrices(
  tenantId: string,
  companyId: string,
  variantIds: string[]
): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();
  const now = new Date();
  const rows = await withTenant({ tenantId }, (tx) =>
    tx.contractPrice.findMany({
      where: {
        companyId,
        variantId: { in: variantIds },
        validFrom: { lte: now },
        OR: [{ validTo: null }, { validTo: { gte: now } }],
      },
      orderBy: { validFrom: 'desc' },
      select: { variantId: true, priceCents: true },
    })
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!map.has(r.variantId)) map.set(r.variantId, r.priceCents); // first hit = most recent
  }
  return map;
}

/** Attaches `yourPriceCents` to a page of `publicProduct()`-mapped cards for the
 *  signed-in viewer — null for every card when there's no B2B viewer or no
 *  matching contract price, which is the common case and costs one extra query. */
async function withYourPrices(
  tenantId: string,
  products: ReturnType<typeof publicProduct>[],
  viewerB2bAccountId: string | undefined
): Promise<(ReturnType<typeof publicProduct> & { yourPriceCents: number | null })[]> {
  if (!viewerB2bAccountId) {
    return products.map((p) => ({ ...p, yourPriceCents: null }));
  }
  const variantIds = products.flatMap((p) => (p.defaultVariantId ? [p.defaultVariantId] : []));
  const contractPrices = await resolveDefaultVariantContractPrices(
    tenantId,
    viewerB2bAccountId,
    variantIds
  );
  return products.map((p) => ({
    ...p,
    yourPriceCents: p.defaultVariantId ? (contractPrices.get(p.defaultVariantId) ?? null) : null,
  }));
}

// Combine a product's per-site rollup buckets ([site] + the null legacy/shared
// bucket) into the one star average + count a storefront shows (docs/131 §4).
// Averages can't be averaged, so this sums the raw rating sums and counts across
// the buckets: sum(sumRating)/sum(reviewCount). `rollups` is present ONLY on the
// site-scoped selects (productSelect(propertyId) / fullProductSelect) — when it is,
// it is AUTHORITATIVE (an empty array means "no reviews on this site", NOT a
// fallback), because recomputeProductRating + the priming backfill keep a rollup
// row for every (product, site) that has any approved review. The tenant-wide
// product.average_rating / review_count columns are the fallback only for the
// non-site-scoped by-ids path, which passes no rollup.
function siteRating(
  rollups: { sumRating: number; reviewCount: number }[] | undefined,
  fallbackAverage: number | null,
  fallbackCount: number
): { averageRating: number | null; reviewCount: number } {
  if (!rollups) return { averageRating: fallbackAverage, reviewCount: fallbackCount };
  const reviewCount = rollups.reduce((sum, r) => sum + r.reviewCount, 0);
  const ratingSum = rollups.reduce((sum, r) => sum + r.sumRating, 0);
  return { averageRating: reviewCount > 0 ? ratingSum / reviewCount : null, reviewCount };
}

function publicProduct(row: {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  priceMinCents: number | null;
  priceMaxCents: number | null;
  inStock: boolean;
  averageRating: number | null;
  reviewCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: Date;
  images?: { mediaAssetId: string; alt: string | null }[];
  variants?: { id: string }[];
  reviewRollups?: { sumRating: number; reviewCount: number }[];
}) {
  const rating = siteRating(row.reviewRollups, row.averageRating, row.reviewCount);
  return {
    id: row.id,
    title: row.title,
    handle: row.handle,
    description: row.description,
    vendor: row.vendor,
    productType: row.productType,
    tags: row.tags,
    priceMinCents: row.priceMinCents,
    priceMaxCents: row.priceMaxCents,
    inStock: row.inStock,
    averageRating: rating.averageRating,
    reviewCount: rating.reviewCount,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    // Hero thumbnail asset id (primary, else first product-level by position —
    // see productSelect). The storefront resolves it via /v1/public/media/<id>.
    primaryImageId: row.images?.[0]?.mediaAssetId ?? null,
    // What the owner wrote about THIS photo on THIS product, for a card to
    // announce instead of repeating the title beside it. Deliberately not
    // falling back to the media asset's own `altText`: that describes the FILE,
    // which may be attached to several products, and a shop where one leather
    // photo serves a belt and a tote would announce the belt as a tote bag.
    // Null here means the card keeps the product name, as the detail page does.
    primaryImageAlt: row.images?.[0]?.alt ?? null,
    // The variant an add-to-cart lands on when the shopper picks no options:
    // the explicit default, else lowest position (see productSelect). A builder
    // buy box binds this so its <form> submits a real cart line (docs/118).
    // Null only for a product with no live variants — such a card can render,
    // but its add-to-cart must not fire.
    defaultVariantId: row.variants?.[0]?.id ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const publicCommerceRoutes: FastifyPluginAsync = (app) => {
  // ─── Collections ───────────────────────────────────────────────────

  app.get('/v1/public/commerce/collections', async (request) => {
    const q = TenantQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    // Model B: the collection index is scoped to the active site, so a collection
    // pinned to specific sites never shows on the others (empty pins = all sites).
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    const rows = await withTenant({ tenantId }, (tx) =>
      tx.productCollection.findMany({
        where: { deletedAt: null, ...collectionSiteVisibilityWhere(propertyId) },
        orderBy: [{ featured: 'desc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          name: true,
          handle: true,
          description: true,
          heroMediaId: true,
          featured: true,
          seoTitle: true,
          seoDescription: true,
        },
      })
    );
    return ok(rows);
  });

  // Record-display pins (docs/98 Pillar 7): a node pinned to a collection renders
  // the collection's OWN fields (name, description, hero), distinct from listing its
  // products. Batched by id, order preserved — the analogue of products/full. Static
  // segment, so it never shadows (or is shadowed by) `/collections/:handle`.
  app.get('/v1/public/commerce/collections/full', async (request) => {
    const q = IdsQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const ids = parseIdList(q.ids);
    if (ids.length === 0) return ok([]);
    const rows = await withTenant({ tenantId }, (tx) =>
      tx.productCollection.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: RECORD_SELECT,
      })
    );
    return ok(orderByIds(ids, rows));
  });

  app.get('/v1/public/commerce/collections/:handle', async (request) => {
    const { handle } = HandleParams.parse(request.params);
    const q = TenantQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    // A collection hidden on the active site 404s here too, so a stale/shared link
    // can't reach a site-scoped collection's detail page.
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    const row = await withTenant({ tenantId }, (tx) =>
      tx.productCollection.findFirst({
        where: { handle, deletedAt: null, ...collectionSiteVisibilityWhere(propertyId) },
        select: {
          id: true,
          name: true,
          handle: true,
          description: true,
          heroMediaId: true,
          featured: true,
          seoTitle: true,
          seoDescription: true,
          ogImageId: true,
        },
      })
    );
    if (!row) throw notFound('Collection', handle);
    return ok(row);
  });

  app.get('/v1/public/commerce/collections/:handle/products', async (request) => {
    const { handle } = HandleParams.parse(request.params);
    const q = PagingQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    const result = await withTenant({ tenantId }, async (tx) => {
      const collection = await tx.productCollection.findFirst({
        // A collection hidden on the active site yields no product list (404),
        // matching its detail endpoint.
        where: { handle, deletedAt: null, ...collectionSiteVisibilityWhere(propertyId) },
        select: { id: true },
      });
      if (!collection) return null;
      // Model B: products in the collection AND visible on the active site.
      const where = {
        collectionLinks: { some: { collectionId: collection.id } },
        status: 'active' as const,
        deletedAt: null,
        ...productSiteVisibilityWhere(propertyId),
      };
      const [rows, total] = await Promise.all([
        tx.product.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          take: q.perPage,
          skip: (q.page - 1) * q.perPage,
          select: productSelect(propertyId, q.locale),
        }),
        tx.product.count({ where }),
      ]);
      return { rows, total };
    });
    if (!result) throw notFound('Collection', handle);
    const viewerB2bAccountId = await resolveViewerB2bAccountId(request, tenantId);
    return paged(
      await withYourPrices(
        tenantId,
        result.rows.map((r) => publicProduct(applyTranslation(r, q.locale))),
        viewerB2bAccountId
      ),
      {
        page: q.page,
        per_page: q.perPage,
        total: result.total,
      }
    );
  });

  // ─── Products ──────────────────────────────────────────────────────

  app.get('/v1/public/commerce/products', async (request) => {
    const q = ProductListQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    const result = await withTenant({ tenantId }, async (tx) => {
      // Optional scope: narrow the whole listing to a collection (flat membership) or a
      // category (browse-node rollup — self + descendants off the materialized dot-path,
      // exactly like /categories/:handle/products). Resolved here, inside the tenant tx,
      // because both lookups are RLS-scoped. A scope handle that doesn't resolve (or is
      // hidden on this site) returns null → 404, matching the dedicated detail endpoints.
      let scopeWhere: Prisma.ProductWhereInput = {};
      if (q.collection) {
        const collection = await tx.productCollection.findFirst({
          where: {
            handle: q.collection,
            deletedAt: null,
            ...collectionSiteVisibilityWhere(propertyId),
          },
          select: { id: true },
        });
        if (!collection) return null;
        scopeWhere = { collectionLinks: { some: { collectionId: collection.id } } };
      } else if (q.category) {
        const category = await tx.productCategory.findFirst({
          where: {
            handle: q.category,
            deletedAt: null,
            ...categorySiteVisibilityWhere(propertyId),
          },
          select: { id: true, path: true },
        });
        if (!category) return null;
        const descendants = await tx.productCategory.findMany({
          where: { path: { startsWith: `${category.path}.` }, deletedAt: null },
          select: { id: true },
        });
        const categoryIds = [category.id, ...descendants.map((d) => d.id)];
        scopeWhere = { categoryLinks: { some: { categoryId: { in: categoryIds } } } };
      }

      const where: Prisma.ProductWhereInput = {
        status: 'active' as const,
        deletedAt: null,
        // Model B: only products visible on the active site (global or scoped here).
        ...productSiteVisibilityWhere(propertyId),
        ...scopeWhere,
        ...(q.vendor ? { vendor: q.vendor } : {}),
        ...(q.productType ? { productType: q.productType } : {}),
        ...(q.tag ? { tags: { has: q.tag } } : {}),
        ...(q.inStock === true ? { inStock: true } : {}),
        // Price window (cents). Matches the Typesense search semantics: a product's
        // from-price is at/above the min and its to-price at/below the max.
        ...(q.minPriceCents !== undefined ? { priceMinCents: { gte: q.minPriceCents } } : {}),
        ...(q.maxPriceCents !== undefined ? { priceMaxCents: { lte: q.maxPriceCents } } : {}),
        ...(q.q
          ? {
              OR: [
                { title: { contains: q.q, mode: 'insensitive' as const } },
                { description: { contains: q.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
        ...(q.fitmentMake || q.fitmentYear
          ? {
              fitments: {
                some: {
                  // Descendant-by-name: "Ford" matches a product attached at the
                  // Ford node OR any model/engine under it (node.pathNames).
                  ...(q.fitmentMake ? { node: { pathNames: { has: q.fitmentMake } } } : {}),
                  // Numeric narrowing against the rule's range windows.
                  ...(q.fitmentYear
                    ? {
                        ranges: {
                          some: {
                            AND: [
                              { OR: [{ min: { lte: q.fitmentYear } }, { min: null }] },
                              { OR: [{ max: { gte: q.fitmentYear } }, { max: null }] },
                            ],
                          },
                        },
                      }
                    : {}),
                },
              },
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        tx.product.findMany({
          where,
          orderBy: PLP_ORDER_BY[q.sort] ?? PLP_ORDER_BY.relevance,
          take: q.perPage,
          skip: (q.page - 1) * q.perPage,
          select: productSelect(propertyId, q.locale),
        }),
        tx.product.count({ where }),
      ]);
      return { rows, total };
    });
    // A scope handle that didn't resolve — surface it as a 404 like the detail routes.
    if (!result) throw notFound('Collection or category', q.collection ?? q.category ?? '');
    const viewerB2bAccountId = await resolveViewerB2bAccountId(request, tenantId);
    return paged(
      await withYourPrices(
        tenantId,
        result.rows.map((r) => publicProduct(applyTranslation(r, q.locale))),
        viewerB2bAccountId
      ),
      {
        page: q.page,
        per_page: q.perPage,
        total: result.total,
      }
    );
  });

  // ─── Search (Typesense) ────────────────────────────────────────────
  //
  // Typo-tolerant faceted search. Typesense ranks + filters + facets; we
  // hydrate the resulting product ids from Postgres (same select + mapper as
  // the PLP) so the card shape is identical and ratings/inventory stay out of
  // the index. Facet counts ride in `meta.facets` for the storefront sidebar.
  app.get('/v1/public/commerce/search', async (request) => {
    const q = SearchQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);

    // Browse-as-search scope: resolve a collection/category handle to its id so the
    // Typesense query filters on the indexed collection_ids/category_ids — a collection or
    // category page IS this search with a scope, so it gets the same facets + counts. A
    // handle that doesn't resolve (or is hidden on this site) 404s, like the detail routes.
    let scopeFilter: string | null = null;
    if (q.collection || q.category) {
      const resolved = await withTenant({ tenantId }, async (tx) => {
        if (q.collection) {
          const c = await tx.productCollection.findFirst({
            where: {
              handle: q.collection,
              deletedAt: null,
              ...collectionSiteVisibilityWhere(propertyId),
            },
            select: { id: true },
          });
          return c ? `collection_ids:=[\`${c.id}\`]` : undefined;
        }
        const cat = await tx.productCategory.findFirst({
          where: {
            handle: q.category,
            deletedAt: null,
            ...categorySiteVisibilityWhere(propertyId),
          },
          select: { id: true, path: true },
        });
        if (!cat) return undefined;
        // Browse-node rollup: self + descendants off the materialized dot-path, matching
        // the Postgres listing's category scope.
        const descendants = await tx.productCategory.findMany({
          where: { path: { startsWith: `${cat.path}.` }, deletedAt: null },
          select: { id: true },
        });
        const ids = [cat.id, ...descendants.map((d) => d.id)];
        return `category_ids:=[${ids.map((id) => `\`${id}\``).join(',')}]`;
      });
      if (!resolved) throw notFound('Collection or category', q.collection ?? q.category ?? '');
      scopeFilter = resolved;
    }

    // Product-option facet selections → one AND-ed clause per token, so "Color:Black" and
    // "Size:M" both have to be offered by the product (across groups it's an AND).
    const optionFilters = toList(q.options).map((t) => `option_facets:=[\`${t}\`]`);

    // Build the price filter in Typesense grammar (cents, matching the index).
    const priceParts: string[] = [];
    if (q.minPriceCents !== undefined) priceParts.push(`price_min_cents:>=${q.minPriceCents}`);
    if (q.maxPriceCents !== undefined) priceParts.push(`price_max_cents:<=${q.maxPriceCents}`);
    const filterExtras = [
      scopeFilter,
      q.vendor ? `vendor:=\`${q.vendor}\`` : null,
      q.productType ? `product_type:=\`${q.productType}\`` : null,
      q.tag ? `tags:=\`${q.tag}\`` : null,
      q.inStock === true ? 'in_stock:=true' : null,
      ...optionFilters,
      ...priceParts,
    ].filter((p): p is string => p !== null);

    const result = await searchProducts({
      tenantId,
      // Model B (docs/49 §3): scope the Typesense query to the active site so the
      // `found` count + facets are site-correct, not just the hydrated rows.
      propertyId,
      q: q.q,
      page: q.page,
      perPage: q.perPage,
      sortBy: SEARCH_SORT_BY[q.sort],
      filterBy: filterExtras.length > 0 ? filterExtras.join(' && ') : undefined,
      fitmentMakes: splitCsv(q.fitmentMakes),
      fitmentModels: splitCsv(q.fitmentModels),
      fitmentEngines: splitCsv(q.fitmentEngines),
      fitmentYear: q.fitmentYear,
    });

    // Hydrate the canonical display rows in Typesense's relevance order.
    const ids = result.hits.map((h) => h.document.product_id);
    let ordered: ReturnType<typeof publicProduct>[] = [];
    if (ids.length > 0) {
      const rows = await withTenant({ tenantId }, (tx) =>
        tx.product.findMany({
          // Model B: Typesense now scopes by `property_ids` (so `found` is
          // site-correct), but we keep this PG visibility filter as a
          // belt-and-suspenders for the rolling-reindex window where a freshly
          // re-scoped product hasn't been re-projected yet.
          where: {
            id: { in: ids },
            status: 'active',
            deletedAt: null,
            ...productSiteVisibilityWhere(propertyId),
          },
          select: productSelect(propertyId, q.locale),
        })
      );
      const byId = new Map(rows.map((r) => [r.id, r]));
      ordered = ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [publicProduct(applyTranslation(row, q.locale))] : [];
      });
    }

    const viewerB2bAccountId = await resolveViewerB2bAccountId(request, tenantId);
    return paged(await withYourPrices(tenantId, ordered, viewerB2bAccountId), {
      page: result.page,
      per_page: result.perPage,
      total: result.found,
      // Facet counts for the storefront sidebar. Shape: { field: [{value,count}] }.
      facets: Object.fromEntries(
        result.facetCounts.map((f) => [
          f.fieldName,
          f.counts.map((c) => ({ value: c.value, count: c.count })),
        ])
      ),
    });
  });

  // Bulk hydrate a set of products by id, preserving the requested order.
  // Drives hand-picked Site Builder sections (featured-products manual source)
  // and is the building block for cart/wishlist hydration. Only active,
  // non-deleted products are returned; unknown ids are silently dropped.
  app.get('/v1/public/commerce/products/by-ids', async (request) => {
    const q = z
      .object({
        tenant: z.string().min(1).max(63),
        ids: z.string().min(1),
        locale: LocaleParam,
      })
      .parse(request.query);
    const ids = q.ids
      .split(',')
      .map((s) => s.trim())
      .filter((s) => z.string().uuid().safeParse(s).success)
      .slice(0, 100);
    if (ids.length === 0) return ok([]);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const rows = await withTenant({ tenantId }, (tx) =>
      tx.product.findMany({
        where: { id: { in: ids }, status: 'active', deletedAt: null },
        select: productSelect(undefined, q.locale),
      })
    );
    // Preserve caller-requested order (Prisma's `in` does not guarantee it).
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [publicProduct(applyTranslation(row, q.locale))] : [];
    });
    return ok(ordered);
  });

  // FULL products for the Builder data spine (docs/98 Pillar 7). Returns the same
  // PDP payload (options + variants + images) so a pinned product card / collection
  // grid renders a working buy-box. Sourced by EITHER an id list (an entity pin —
  // order preserved), a collection id, a category id, or — with none — the whole
  // catalog (the `all` source), capped by `limit`. Active + site-visible only, so a
  // pinned-but-unpublished product simply doesn't render.
  app.get('/v1/public/commerce/products/full', async (request) => {
    const q = z
      .object({
        tenant: z.string().min(1).max(63),
        property: z.string().min(1).max(63).optional(),
        ids: z.string().optional(),
        collection: z.string().uuid().optional(),
        category: z.string().uuid().optional(),
        limit: z.coerce.number().int().min(1).max(48).default(24),
        // A bound repeater's author-chosen order and tag filter (docs/builder-audit
        // slice 23). Both are applied in the QUERY rather than over the fetched page,
        // because sorting or filtering after `take` picks from the first 24 rows
        // instead of from the catalog — a different list, and a quietly wrong one.
        sort: z.enum(['newest', 'price-asc', 'price-desc', 'title-asc', 'title-desc']).optional(),
        tag: z.string().max(64).optional(),
        locale: LocaleParam,
      })
      .parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    const ids = q.ids
      ? q.ids
          .split(',')
          .map((s) => s.trim())
          .filter((s) => z.string().uuid().safeParse(s).success)
          .slice(0, 48)
      : null;
    if (ids?.length === 0) return ok([]);

    const where: Prisma.ProductWhereInput = {
      status: 'active',
      deletedAt: null,
      ...productSiteVisibilityWhere(propertyId),
      ...(ids ? { id: { in: ids } } : {}),
      ...(q.collection ? { collectionLinks: { some: { collectionId: q.collection } } } : {}),
      ...(q.category ? { categoryLinks: { some: { categoryId: q.category } } } : {}),
      ...(q.tag ? { tags: { has: q.tag } } : {}),
    };
    // The default keeps in-stock products first, which is the right merchandising
    // answer when nobody has asked for anything else. An EXPLICIT sort is what the
    // author asked for and is honoured literally — silently keeping the in-stock
    // preference in front of "price, low to high" would produce an order that is not
    // the one they picked and that they cannot correct.
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      q.sort === 'newest'
        ? [{ createdAt: 'desc' }]
        : q.sort === 'price-asc'
          ? [{ priceMinCents: 'asc' }]
          : q.sort === 'price-desc'
            ? [{ priceMinCents: 'desc' }]
            : q.sort === 'title-asc'
              ? [{ title: 'asc' }]
              : q.sort === 'title-desc'
                ? [{ title: 'desc' }]
                : [{ inStock: 'desc' }, { updatedAt: 'desc' }];
    const [rows, inventoryActive] = await Promise.all([
      withTenant({ tenantId }, (tx) =>
        tx.product.findMany({
          where,
          orderBy,
          // An id pin returns every requested product; a source is capped.
          take: ids ? undefined : q.limit,
          select: fullProductSelect(propertyId, q.locale),
        })
      ),
      isModuleEnabled(tenantId, 'inventory'),
    ]);
    // Batch-resolve every distinct product type in one query so each looped/pinned
    // product projects its typed attributes (docs/143) without N round-trips.
    const schemasByKey = await productTypeService.resolveSchemasByKey(
      tenantId,
      rows.map((r) => r.productTypeKey).filter((k): k is string => !!k)
    );
    let list = rows.map((r) =>
      mapFullProduct(applyTranslation(r, q.locale), inventoryActive, undefined, schemasByKey)
    );
    // Preserve the requested id order (Prisma's `in` does not guarantee it).
    if (ids) {
      const byId = new Map(list.map((p) => [p.id, p]));
      list = ids.flatMap((id) => {
        const p = byId.get(id);
        return p ? [p] : [];
      });
    }
    return ok(list);
  });

  app.get('/v1/public/commerce/products/:handle', async (request) => {
    const { handle } = HandleParams.parse(request.params);
    const q = TenantQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    // A valid product-preview token (editor minted, 15-min TTL) relaxes the
    // published-only + site-visibility filter so a DRAFT can be previewed. The
    // token is scoped to one product by `sub`, asserted against the match below
    // so it can't be replayed against a different product via the handle.
    const previewProductId = tryVerifyProductPreview(app, request, tenantId);
    const [result, inventoryActive, viewerB2bAccountId] = await Promise.all([
      withTenant({ tenantId }, (tx) =>
        tx.product.findFirst({
          // Model B: a product not visible on the active site 404s by URL too.
          where: {
            handle,
            deletedAt: null,
            ...(previewProductId
              ? {}
              : { status: 'active', ...productSiteVisibilityWhere(propertyId) }),
          },
          select: fullProductSelect(propertyId, q.locale),
        })
      ),
      isModuleEnabled(tenantId, 'inventory'),
      resolveViewerB2bAccountId(request, tenantId),
    ]);
    if (!result) throw notFound('Product', handle);
    // Token is bound to one product — reject a handle that resolves elsewhere.
    if (previewProductId && previewProductId !== result.id) throw notFound('Product', handle);

    // "Your price" — resolved through the SAME priority chain (contract price →
    // price list → bulk tier) the cart already uses, so the number shown here is
    // exactly what checkout will charge, not a separate estimate. Anonymous and
    // non-B2B viewers never hit this branch — they get the flat retail price
    // exactly as before, so the response stays cacheable in that common case.
    let yourPrices: Map<string, number> | undefined;
    if (viewerB2bAccountId) {
      const priced = await Promise.all(
        result.variants.map((v) =>
          pricingService.resolve(
            { tenantId },
            {
              variantId: v.id,
              quantity: 1,
              channel: 'storefront',
              currency: v.currency,
              companyId: viewerB2bAccountId,
              customerSegmentIds: [],
              // The active site (docs/131 §4) so the PDP "your price" only applies
              // this site's price lists, not a sibling business's.
              propertyId,
            }
          )
        )
      );
      yourPrices = new Map(
        result.variants
          .map((v, i) => [v.id, priced[i]!.unitPriceCents] as const)
          .filter(([, cents], i) => cents !== result.variants[i]!.priceCents)
      );
    }
    // Resolve the product's type schema (docs/143) so mapFullProduct can project
    // its attribute bag into the labeled sections the PDP renders.
    const schemasByKey = await productTypeService.resolveSchemasByKey(
      tenantId,
      result.productTypeKey ? [result.productTypeKey] : []
    );

    // Made to order (issue 026) — the two answers that are facts about TODAY
    // rather than settings on the row, so they are resolved here at read time.
    // A product with neither rule costs no query at all.
    const madeToOrder =
      result.orderAheadDays !== null || result.dailyLimit !== null
        ? await withTenant({ tenantId }, async (tx) => {
            const zone = await madeToOrderService.businessZone(tx);
            const sold =
              result.dailyLimit !== null
                ? await madeToOrderService.soldToday(tx, [result.id], new Date(), zone)
                : null;
            return {
              readyOn: readyOnDate(new Date(), result.orderAheadDays, zone),
              remainingToday:
                sold === null ? null : remainingToday(result.dailyLimit, sold.get(result.id) ?? 0),
            };
          })
        : undefined;

    return ok(
      mapFullProduct(
        applyTranslation(result, q.locale),
        inventoryActive,
        yourPrices,
        schemasByKey,
        madeToOrder
      )
    );
  });

  // ─── Categories ────────────────────────────────────────────────────

  app.get('/v1/public/commerce/categories', async (request) => {
    const q = TenantQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    // Model B: the category index is scoped to the active site.
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    const { rows, held } = await withTenant({ tenantId }, async (tx) => {
      const [rows, counts] = await Promise.all([
        tx.productCategory.findMany({
          where: { deletedAt: null, ...categorySiteVisibilityWhere(propertyId) },
          orderBy: [{ path: 'asc' }, { position: 'asc' }],
          select: {
            id: true,
            name: true,
            handle: true,
            description: true,
            parentId: true,
            path: true,
            position: true,
            featured: true,
            iconMediaId: true,
            heroMediaId: true,
          },
        }),
        // WHICH categories hold anything a shopper can buy on this site. Grouped
        // rather than listed: the caller needs a yes/no, and a `groupBy` is one row
        // per category however big the catalog is.
        tx.categoryProduct.groupBy({
          by: ['categoryId'],
          where: {
            product: {
              status: 'active',
              deletedAt: null,
              ...productSiteVisibilityWhere(propertyId),
            },
          },
          _count: { productId: true },
        }),
      ]);
      return { rows, held: new Set(counts.map((c) => c.categoryId)) };
    });

    // Rolled up the SAME way the category page rolls its products up — a category
    // shows its own and every descendant's, by `path` prefix — so the index can never
    // hide a category whose page has something on it.
    const heldPaths = rows.filter((r) => held.has(r.id)).map((r) => r.path);
    const withProducts = rows.map((r) => ({
      ...r,
      hasProducts: heldPaths.some((p) => p === r.path || p.startsWith(`${r.path}.`)),
    }));
    return ok(withProducts);
  });

  // Record-display pins (docs/98 Pillar 7): a node pinned to a category renders the
  // category's OWN fields (a category banner), distinct from listing its products.
  app.get('/v1/public/commerce/categories/full', async (request) => {
    const q = IdsQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const ids = parseIdList(q.ids);
    if (ids.length === 0) return ok([]);
    const rows = await withTenant({ tenantId }, (tx) =>
      tx.productCategory.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: RECORD_SELECT,
      })
    );
    return ok(orderByIds(ids, rows));
  });

  // A category's OWN record (name, description, hero, seo/og) — the storefront
  // browse-node detail page (/category/:handle). Static `/categories/full` above
  // is registered first, so this param route never shadows it.
  app.get('/v1/public/commerce/categories/:handle', async (request) => {
    const { handle } = HandleParams.parse(request.params);
    const q = TenantQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    // A category hidden on the active site 404s here too.
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    const row = await withTenant({ tenantId }, (tx) =>
      tx.productCategory.findFirst({
        where: { handle, deletedAt: null, ...categorySiteVisibilityWhere(propertyId) },
        select: {
          id: true,
          name: true,
          handle: true,
          description: true,
          parentId: true,
          path: true,
          position: true,
          featured: true,
          iconMediaId: true,
          heroMediaId: true,
          seoTitle: true,
          seoDescription: true,
          ogImageId: true,
        },
      })
    );
    if (!row) throw notFound('Category', handle);
    return ok(row);
  });

  // Products in a category — BROWSE-NODE ROLLUP. Unlike a collection (a flat
  // membership), a category is a tree node, so its page shows everything under it:
  // products linked to the category itself OR any descendant. Descendants resolve
  // off the materialized dot-path (`path` = self, `<path>.%` = the subtree), and
  // Model B site-visibility still scopes the result to the active site.
  app.get('/v1/public/commerce/categories/:handle/products', async (request) => {
    const { handle } = HandleParams.parse(request.params);
    const q = PagingQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    const result = await withTenant({ tenantId }, async (tx) => {
      const category = await tx.productCategory.findFirst({
        // A category hidden on the active site yields no rollup (its node 404s),
        // matching its detail endpoint — not just an empty product list.
        where: { handle, deletedAt: null, ...categorySiteVisibilityWhere(propertyId) },
        select: { id: true, path: true },
      });
      if (!category) return null;
      const descendants = await tx.productCategory.findMany({
        where: { path: { startsWith: `${category.path}.` }, deletedAt: null },
        select: { id: true },
      });
      const categoryIds = [category.id, ...descendants.map((d) => d.id)];
      // `some` matches a product once even if it links to several of these
      // categories, so no de-dup is needed.
      const where = {
        categoryLinks: { some: { categoryId: { in: categoryIds } } },
        status: 'active' as const,
        deletedAt: null,
        ...productSiteVisibilityWhere(propertyId),
      };
      const [rows, total] = await Promise.all([
        tx.product.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          take: q.perPage,
          skip: (q.page - 1) * q.perPage,
          select: productSelect(propertyId, q.locale),
        }),
        tx.product.count({ where }),
      ]);
      return { rows, total };
    });
    if (!result) throw notFound('Category', handle);
    const viewerB2bAccountId = await resolveViewerB2bAccountId(request, tenantId);
    return paged(
      await withYourPrices(
        tenantId,
        result.rows.map((r) => publicProduct(applyTranslation(r, q.locale))),
        viewerB2bAccountId
      ),
      {
        page: q.page,
        per_page: q.perPage,
        total: result.total,
      }
    );
  });

  // ─── Option axes ───────────────────────────────────────────────────
  //
  // The ORDER a shop declared its product options in — "Size runs XS, S, M, L, XL",
  // "Roast runs Light, Medium, Dark".
  //
  // The storefront's facet panel builds its option groups from the search index's
  // `option_facets` counts, which arrive as flat `Name:Value` tokens ordered by
  // DESCENDING COUNT. On a shop where every garment comes in every size the counts
  // tie, so what a shopper got was arbitrary: Small, Medium, Large, Extra Small
  // (piggles/docs/personas/issues/342). The order exists — it is on the option and
  // the value rows, and the owner typed it — and the index simply does not carry it.
  //
  // Read here rather than added to the index, deliberately. `option_facets` is the
  // FILTER contract (`option_facets:=[…]`) and must not change shape, a second facet
  // field means a Typesense schema change plus a full reindex before a single shop
  // sees its own order, and the counts only ever describe the CURRENT result page —
  // whereas a shopper narrowing to one product should still see the whole ladder in
  // the right order. Postgres already holds the answer for the whole catalog.
  //
  // Scoped to the SITE, for the same reason the fitment index below is: a donut shop
  // sharing a tenant with an apparel shop must not be handed the apparel shop's size
  // ladder.
  app.get('/v1/public/commerce/option-axes', async (request) => {
    const q = TenantQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    const rows = await withTenant({ tenantId }, (tx) =>
      tx.productOption.findMany({
        where: {
          product: {
            status: 'active',
            deletedAt: null,
            ...productSiteVisibilityWhere(propertyId),
          },
        },
        select: {
          // The product id groups the AXIS order: "Size before Color" is a statement
          // one product makes about its own two axes, and merging them needs to know
          // which axes were declared together.
          productId: true,
          name: true,
          position: true,
          values: { select: { value: true, position: true } },
        },
      })
    );
    return ok(mergeOptionAxes(rows));
  });

  // ─── Fitment ───────────────────────────────────────────────────────
  //
  // Surfaces the fitment domains the tenant has installed plus a generic
  // node drill down the domain's `level` dimensions. Drives the storefront
  // narrowing filter — Make → Model → Engine (narrowed by Year) for an auto
  // shop, Species → Breed (narrowed by Weight) for a pet store, Brand → Model
  // for a phone-case shop. Each level's children are lazy-loaded as the
  // customer drills, so the panel stays generic over the domain's shape.

  app.get('/v1/public/commerce/fitment/domains', async (request) => {
    const q = TenantQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    // Model B / docs/131: the fitment DOMAIN is a tenant-wide vocabulary (a shared
    // library, like Taxonomy — it takes no property_id), but the storefront
    // narrowing filter must only offer domains this SITE's catalog actually uses.
    // Otherwise a donut site under the same tenant as a machine shop would render a
    // "Vehicles" filter — a cross-business exposure. So the index is scoped to
    // domains with at least one fitment on a product VISIBLE on the active site
    // (the same empty-means-all visibility rule products use). Single-site tenants
    // are unaffected: their products are visible everywhere, so every used domain
    // still shows. Runs inside withTenant so the nested product filter is RLS-scoped.
    const propertyId = await resolvePublicPropertyId(tenantId, q.property);
    const rows = await withTenant({ tenantId }, (tx) =>
      tx.fitmentDomain.findMany({
        where: {
          deletedAt: null,
          fitments: {
            some: {
              product: {
                status: 'active',
                deletedAt: null,
                ...productSiteVisibilityWhere(propertyId),
              },
            },
          },
        },
        orderBy: [{ position: 'asc' }, { displayName: 'asc' }],
        select: {
          id: true,
          slug: true,
          displayName: true,
          description: true,
          iconKey: true,
          dimensions: true,
        },
      })
    );
    return ok(
      rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        displayName: r.displayName,
        description: r.description,
        iconKey: r.iconKey,
        // Ordered FitmentDimension[]: { key, label, kind: 'level'|'range', unit? }.
        // `level` dims form the drill tree (in order); `range` dims are the
        // numeric narrowing widgets (Year/Weight/…).
        dimensions: r.dimensions,
      }))
    );
  });

  // Generic node drill. Absent `?parentId=` → the domain's top-level nodes
  // (parentId: null); a uuid → that node's children. One endpoint walks the
  // whole `level` tree regardless of depth, so the storefront facet is fully
  // generic over `dimensions`. `childCount` lets the panel know whether the
  // next level exists (a leaf = end of the drill).
  app.get('/v1/public/commerce/fitment/domains/:domainId/nodes', async (request) => {
    const q = z
      .object({ tenant: z.string().min(1).max(63), parentId: z.guid().optional() })
      .parse(request.query);
    const { domainId } = z.object({ domainId: z.guid() }).parse(request.params);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const rows = await prisma.fitmentNode.findMany({
      where: { domainId, tenantId, parentId: q.parentId ?? null, deletedAt: null },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        dimensionKey: true,
        depth: true,
        position: true,
        _count: { select: { children: { where: { deletedAt: null } } } },
      },
    });
    return ok(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        dimensionKey: r.dimensionKey,
        depth: r.depth,
        position: r.position,
        childCount: r._count.children,
      }))
    );
  });

  return Promise.resolve();
};

// The per-site rating rollup fragment (docs/131 §4): the product's [site] + null
// buckets, which `siteRating` combines into the storefront star average. Included
// on every SITE-SCOPED select so a product listed on two businesses shows each its
// own average instead of the tenant-wide blend. Omitted from the non-scoped by-ids
// path, which has no site context and keeps the tenant-wide columns.
function reviewRollupsSelect(propertyId: string) {
  return {
    where: { OR: [{ propertyId }, { propertyId: null }] },
    select: { sumRating: true, reviewCount: true },
  } satisfies Prisma.Product$reviewRollupsArgs;
}

function productSelect(propertyId?: string, locale?: string) {
  return {
    // Candidate translations for the reader's language; `applyTranslation`
    // overlays the best one and drops the rest before anything is returned.
    ...translationSelect(locale),
    id: true,
    title: true,
    handle: true,
    description: true,
    vendor: true,
    productType: true,
    tags: true,
    priceMinCents: true,
    priceMaxCents: true,
    inStock: true,
    averageRating: true,
    reviewCount: true,
    seoTitle: true,
    seoDescription: true,
    updatedAt: true,
    // Hero thumbnail: explicit primary first, else first product-level image by
    // position (mirrors productService.list). Resolved to a URL storefront-side.
    images: {
      where: { variantId: null },
      orderBy: [{ isPrimary: 'desc' as const }, { position: 'asc' as const }],
      take: 1,
      // `alt` travels with the thumbnail. The console's Photos tab calls this
      // field "Description for screen readers" and promises, without
      // qualification, that it is "read aloud to shoppers who cannot see the
      // picture" — and every place most photos are actually seen (a shop grid,
      // a home page rail, search results) reads THIS select, not the detail one
      // below. Fetching only the id is what made that promise true on one page
      // and false on the rest (issue 338).
      select: { mediaAssetId: true, alt: true },
    },
    // The default variant, for `defaultVariantId` (see publicProduct). Explicit
    // default first, then lowest position — `isDefault` alone leaves ties in a
    // nondeterministic order, which would make a buy box add a different variant
    // on different requests.
    variants: {
      where: { deletedAt: null },
      orderBy: [{ isDefault: 'desc' as const }, { position: 'asc' as const }],
      take: 1,
      select: { id: true },
    },
    // Per-site rating (only when the read is scoped to a site).
    ...(propertyId ? { reviewRollups: reviewRollupsSelect(propertyId) } : {}),
  };
}

// The FULL product shape (options + variants + every image + fitments) — the PDP
// payload, shared by GET …/products/:handle and the Builder's …/products/full so a
// pinned/looped product hydrates the same interactive buy-box (docs/98 Pillar 7).
// A function (not a const) so the per-site rating rollup (docs/131 §4) is scoped to
// the active site — the PDP star average must be this business's, not the blend.
function fullProductSelect(propertyId: string, locale?: string) {
  return {
    ...translationSelect(locale),
    id: true,
    title: true,
    handle: true,
    description: true,
    vendor: true,
    productType: true,
    // Typed product type + attribute bag (docs/143) — resolved into `attributes`
    // (keyed) + `attributeSections` (ordered) below, so the PDP binds real
    // per-product detail sections instead of hardcoded copy.
    productTypeKey: true,
    attributes: true,
    tags: true,
    priceMinCents: true,
    priceMaxCents: true,
    inStock: true,
    // Real low-stock signal (docs/143 §6.6) — powers the honest inventory badge
    // that replaced the fabricated "Selling fast" scarcity block.
    lowStock: true,
    averageRating: true,
    reviewCount: true,
    seoTitle: true,
    seoDescription: true,
    updatedAt: true,
    reviewRollups: reviewRollupsSelect(propertyId),
    fulfillmentType: true,
    weightGrams: true,
    lengthMm: true,
    widthMm: true,
    heightMm: true,
    // Made to order (issue 026) — what the buy box has to say before somebody
    // commits: how much notice, how much is due now, and how many are left today.
    orderAheadDays: true,
    depositType: true,
    depositAmountCents: true,
    depositPercent: true,
    dailyLimit: true,
    options: {
      orderBy: { position: 'asc' },
      select: {
        id: true,
        name: true,
        displayType: true,
        position: true,
        values: {
          orderBy: { position: 'asc' },
          select: { id: true, value: true, swatchHex: true, position: true },
        },
      },
    },
    variants: {
      where: { deletedAt: null },
      // Default first, then position — same order as productSelect, so this row's
      // `variants[0]` is the same variant `publicProduct` reports as
      // `defaultVariantId` (mapFullProduct spreads it). `isDefault` alone leaves
      // ties nondeterministic.
      orderBy: [{ isDefault: 'desc' as const }, { position: 'asc' as const }],
      select: {
        id: true,
        sku: true,
        title: true,
        priceCents: true,
        compareAtPriceCents: true,
        currency: true,
        isDefault: true,
        inventoryPolicy: true,
        optionAssignments: { select: { optionValueId: true } },
        inventoryLevels: {
          select: {
            onHand: true,
            allocated: true,
            safetyBuffer: true,
            // Quarantined / damaged / awaiting-repair units are on the
            // shelf and not for sale (docs/146 Phase 9.7).
            unsellableOnHand: true,
          },
        },
        // What a shopper is allowed to be told about stock that is not here yet
        // (docs/146 Phase 9.3/9.4).
        //
        // Two different promises, and the page needs both because they answer
        // different questions. A PREORDER window is an offer with a stated date:
        // "ships in March". An open BACKORDER date is the soonest anybody has
        // been promised this item back — which is a real, useful thing to show
        // on an out-of-stock page, and enormously better than "unavailable".
        //
        // Neither exposes the QUEUE. How many other people are waiting is the
        // tenant's business, not a shopper's, and publishing it would turn every
        // shortage into a scarcity tactic nobody chose to run.
        preorderWindows: {
          where: { status: { in: ['scheduled', 'open'] } },
          take: 1,
          select: {
            status: true,
            startsAt: true,
            endsAt: true,
            availableAt: true,
            availabilityNote: true,
            isCapped: true,
            maxQuantity: true,
            soldQuantity: true,
            chargeUpFront: true,
          },
        },
        backorders: {
          where: { status: { in: ['open', 'partial'] }, promisedAt: { not: null } },
          orderBy: { promisedAt: 'asc' as const },
          take: 1,
          select: { promisedAt: true },
        },
      },
    },
    // The MAIN photo first, then position — the same order the card select above
    // uses, and the same order the console promises: "Your main photo always
    // comes first". Ordering by position alone ignored `isPrimary` outright, so
    // making a photo the main one moved it to the front of the product's Photos
    // tab and left the product PAGE leading with whatever was uploaded earliest
    // (issue 337).
    images: {
      orderBy: [{ isPrimary: 'desc' as const }, { position: 'asc' as const }],
      select: {
        id: true,
        mediaAssetId: true,
        variantId: true,
        alt: true,
        position: true,
        optionValueLinks: { select: { optionValueId: true } },
      },
    },
    fitments: {
      select: {
        id: true,
        notes: true,
        node: { select: { name: true, pathNames: true } },
        ranges: { select: { dimensionKey: true, min: true, max: true } },
        domain: { select: { slug: true, displayName: true, dimensions: true } },
      },
    },
  } satisfies Prisma.ProductSelect;
}

type FullProductRow = Prisma.ProductGetPayload<{
  select: ReturnType<typeof fullProductSelect>;
}>;

/** Map a full product row to the PUBLIC PDP shape (the storefront's PublicProduct).
 *  `inventoryActive` flows through to the availability rule: when the inventory
 *  module is off the variant degrades to untracked (always in stock) — docs/100 §2.4. */
function mapFullProduct(
  result: FullProductRow,
  inventoryActive: boolean,
  yourPrices?: Map<string, number>,
  schemasByKey?: Map<string, ProductTypeSchemaT>,
  /** Made to order (issue 026). `remainingToday` is COUNTED, never assumed —
   *  undefined means nobody counted, which the buy box says nothing about
   *  rather than printing a number it does not have. */
  madeToOrder?: { readyOn: string | null; remainingToday: number | null }
) {
  // Typed attributes (docs/143): resolve the product's type schema (batched by the
  // caller) and project its stored bag into BOTH shapes the PDP binds — the keyed
  // `attributes` for individual field binds and the ordered `attributeSections`
  // for the auto-render repeat. No type / no schema → empty, and the PDP renders
  // no attribute block (fully backward compatible).
  const schema = result.productTypeKey ? schemasByKey?.get(result.productTypeKey) : undefined;
  const projection = schema
    ? projectProductAttributes(schema, (result.attributes ?? {}) as Record<string, unknown>)
    : { attributes: {}, attributeSections: [] };

  return {
    ...publicProduct(result),
    productTypeKey: result.productTypeKey,
    attributes: projection.attributes,
    attributeSections: projection.attributeSections,
    lowStock: result.lowStock,
    fulfillmentType: result.fulfillmentType,
    weightGrams: result.weightGrams,
    dimensions:
      result.lengthMm || result.widthMm || result.heightMm
        ? { lengthMm: result.lengthMm, widthMm: result.widthMm, heightMm: result.heightMm }
        : null,
    // Made to order (issue 026). Null throughout on an ordinary product, and
    // the buy box then draws nothing — which is every product that existed
    // before this. `deposit` is the RULE; what it comes to in money is resolved
    // per line by the cart, because it can be a percentage.
    madeToOrder: {
      orderAheadDays: result.orderAheadDays,
      deposit: depositFromColumns(result),
      dailyLimit: result.dailyLimit,
      readyOn: madeToOrder?.readyOn ?? null,
      remainingToday: madeToOrder?.remainingToday ?? null,
    },
    options: result.options,
    variants: result.variants.map((v) => {
      // Sum available across every warehouse via the shared availability rule; the
      // cart engine picks the real one at reserve time — here we just want one
      // number the buy-box can render. Untracked (module off) → always available.
      const { available, inStock } = computeAvailability(v.inventoryLevels, v.inventoryPolicy, {
        inventoryActive,
      });

      // The preorder offer, resolved through the SAME function the workbench and
      // the checkout guard use, so the date on the product page and the date in
      // the confirmation email cannot come out different.
      const window = v.preorderWindows[0];
      const preorder = window
        ? (() => {
            const state = preorderState(
              {
                status: window.status as never,
                startsAt: window.startsAt,
                endsAt: window.endsAt,
                isCapped: window.isCapped,
                maxQuantity: window.maxQuantity,
                soldQuantity: window.soldQuantity,
              },
              new Date()
            );
            return {
              // Null means nobody has committed to a date. The storefront renders
              // that as "date to be confirmed" — which sells honestly — and never
              // as an estimate dressed up as a commitment.
              availableAt: window.availableAt?.toISOString() ?? null,
              availabilityNote: window.availabilityNote,
              isTakingOrders: state.isTakingOrders,
              // Null when uncapped. There is no honest integer for "no limit",
              // and every value used as one ends up on a page as "999999 left".
              remaining: state.remaining,
              chargeUpFront: window.chargeUpFront,
              blockedBy: state.blockedBy,
            };
          })()
        : null;

      return {
        id: v.id,
        sku: v.sku,
        title: v.title,
        priceCents: v.priceCents,
        compareAtPriceCents: v.compareAtPriceCents,
        // Present only for a signed-in customer whose active B2B membership
        // resolves a different price than the flat retail one above — null for
        // every anonymous/retail viewer (the storefront falls back to priceCents).
        yourPriceCents: yourPrices?.get(v.id) ?? null,
        isDefault: v.isDefault,
        inventoryPolicy: v.inventoryPolicy,
        optionValueIds: v.optionAssignments.map((ov) => ov.optionValueId),
        available: available ?? 0,
        inStock,
        preorder,
        // The soonest date anybody waiting on this item has been promised it
        // back. Null when nobody has been able to promise anything, which is
        // common and is rendered as "we will confirm a date" rather than as
        // silence or an invented one.
        expectedBackAt: v.backorders[0]?.promisedAt?.toISOString() ?? null,
      };
    }),
    images: result.images.map((img) => ({
      id: img.id,
      mediaAssetId: img.mediaAssetId,
      variantId: img.variantId,
      alt: img.alt,
      position: img.position,
      optionValueIds: img.optionValueLinks.map((l) => l.optionValueId),
    })),
    fitments: result.fitments.map((f) => ({
      id: f.id,
      domainSlug: f.domain.slug,
      domainLabel: f.domain.displayName,
      // The domain's ordered dimension list so the PDP can label each range.
      dimensions: f.domain.dimensions,
      // Deepest level node name + its ancestor path (root → self), null/[] for
      // a whole-domain (universal) rule.
      nodeName: f.node?.name ?? null,
      nodePath: f.node?.pathNames ?? [],
      ranges: f.ranges.map((r) => ({
        dimensionKey: r.dimensionKey,
        min: r.min === null ? null : Number(r.min),
        max: r.max === null ? null : Number(r.max),
      })),
      notes: f.notes,
    })),
  };
}

export default publicCommerceRoutes;
