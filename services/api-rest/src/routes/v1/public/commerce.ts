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
//   GET /v1/public/commerce/fitment/makes                ?tenant=<slug>
//
// Tenant resolution is identical to the CMS public surface
// (tenants table is the only non-RLS row, safe to look up by slug).
// All other reads run inside withTenant() so RLS scopes them.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { ok, paged } from '@sparx/api-core/envelope';
import { notFound } from '@sparx/api-core/errors';
import { prisma, withTenant } from '@sparx/db';

const TenantQuery = z.object({ tenant: z.string().min(1).max(63) });

const PagingQuery = z.object({
  tenant: z.string().min(1).max(63),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(24),
});

const ProductListQuery = PagingQuery.extend({
  q: z.string().optional(),
  vendor: z.string().optional(),
  productType: z.string().optional(),
  tag: z.string().optional(),
  fitmentMake: z.string().optional(),
  fitmentYear: z.coerce.number().int().optional(),
});

const HandleParams = z.object({ handle: z.string().min(1).max(255) });

async function resolveTenantBySlug(slug: string): Promise<string> {
  const t = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!t) throw notFound('Tenant', slug);
  return t.id;
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
}) {
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
    averageRating: row.averageRating,
    reviewCount: row.reviewCount,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const publicCommerceRoutes: FastifyPluginAsync = (app) => {
  // ─── Collections ───────────────────────────────────────────────────

  app.get('/v1/public/commerce/collections', async (request) => {
    const q = TenantQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const rows = await withTenant({ tenantId }, (tx) =>
      tx.productCollection.findMany({
        where: { deletedAt: null },
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

  app.get('/v1/public/commerce/collections/:handle', async (request) => {
    const { handle } = HandleParams.parse(request.params);
    const q = TenantQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const row = await withTenant({ tenantId }, (tx) =>
      tx.productCollection.findFirst({
        where: { handle, deletedAt: null },
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
    const result = await withTenant({ tenantId }, async (tx) => {
      const collection = await tx.productCollection.findFirst({
        where: { handle, deletedAt: null },
        select: { id: true },
      });
      if (!collection) return null;
      const [rows, total] = await Promise.all([
        tx.product.findMany({
          where: {
            collectionLinks: { some: { collectionId: collection.id } },
            status: 'active',
            deletedAt: null,
          },
          orderBy: { updatedAt: 'desc' },
          take: q.perPage,
          skip: (q.page - 1) * q.perPage,
          select: productSelect(),
        }),
        tx.product.count({
          where: {
            collectionLinks: { some: { collectionId: collection.id } },
            status: 'active',
            deletedAt: null,
          },
        }),
      ]);
      return { rows, total };
    });
    if (!result) throw notFound('Collection', handle);
    return paged(result.rows.map(publicProduct), {
      page: q.page,
      per_page: q.perPage,
      total: result.total,
    });
  });

  // ─── Products ──────────────────────────────────────────────────────

  app.get('/v1/public/commerce/products', async (request) => {
    const q = ProductListQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const where = {
      status: 'active' as const,
      deletedAt: null,
      ...(q.vendor ? { vendor: q.vendor } : {}),
      ...(q.productType ? { productType: q.productType } : {}),
      ...(q.tag ? { tags: { has: q.tag } } : {}),
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
                ...(q.fitmentMake ? { category: { name: q.fitmentMake } } : {}),
                ...(q.fitmentYear
                  ? {
                      rangeMin: { lte: q.fitmentYear },
                      OR: [{ rangeMax: { gte: q.fitmentYear } }, { rangeMax: null }],
                    }
                  : {}),
              },
            },
          }
        : {}),
    };
    const result = await withTenant({ tenantId }, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.product.findMany({
          where,
          orderBy: [{ inStock: 'desc' }, { updatedAt: 'desc' }],
          take: q.perPage,
          skip: (q.page - 1) * q.perPage,
          select: productSelect(),
        }),
        tx.product.count({ where }),
      ]);
      return { rows, total };
    });
    return paged(result.rows.map(publicProduct), {
      page: q.page,
      per_page: q.perPage,
      total: result.total,
    });
  });

  app.get('/v1/public/commerce/products/:handle', async (request) => {
    const { handle } = HandleParams.parse(request.params);
    const q = TenantQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const result = await withTenant({ tenantId }, async (tx) => {
      const product = await tx.product.findFirst({
        where: { handle, status: 'active', deletedAt: null },
        select: {
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
          fulfillmentType: true,
          weightGrams: true,
          lengthMm: true,
          widthMm: true,
          heightMm: true,
          options: {
            orderBy: { position: 'asc' },
            select: {
              id: true,
              name: true,
              displayType: true,
              position: true,
              values: {
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  value: true,
                  swatchHex: true,
                  position: true,
                },
              },
            },
          },
          variants: {
            where: { deletedAt: null },
            orderBy: { isDefault: 'desc' },
            select: {
              id: true,
              sku: true,
              title: true,
              priceCents: true,
              compareAtPriceCents: true,
              isDefault: true,
              inventoryPolicy: true,
              optionAssignments: { select: { optionValueId: true } },
              inventoryLevels: { select: { onHand: true, allocated: true } },
            },
          },
          images: {
            orderBy: { position: 'asc' },
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
              rangeMin: true,
              rangeMax: true,
              notes: true,
              domain: { select: { slug: true, displayName: true, rangeUnit: true } },
              category: { select: { name: true } },
              item: { select: { name: true } },
              variant: { select: { name: true } },
            },
          },
        },
      });
      return product;
    });
    if (!result) throw notFound('Product', handle);
    return ok({
      ...publicProduct(result),
      fulfillmentType: result.fulfillmentType,
      weightGrams: result.weightGrams,
      dimensions:
        result.lengthMm || result.widthMm || result.heightMm
          ? { lengthMm: result.lengthMm, widthMm: result.widthMm, heightMm: result.heightMm }
          : null,
      options: result.options,
      variants: result.variants.map((v) => {
        // Sum available across every warehouse the variant lives in.
        // The cart engine picks the actual warehouse at reserve time;
        // here we just want a single number the PDP can render.
        const available = v.inventoryLevels.reduce(
          (acc, l) => acc + Math.max(0, l.onHand - l.allocated),
          0
        );
        return {
          id: v.id,
          sku: v.sku,
          title: v.title,
          priceCents: v.priceCents,
          compareAtPriceCents: v.compareAtPriceCents,
          isDefault: v.isDefault,
          inventoryPolicy: v.inventoryPolicy,
          optionValueIds: v.optionAssignments.map((ov) => ov.optionValueId),
          available,
          inStock: available > 0 || v.inventoryPolicy !== 'deny',
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
        rangeUnit: f.domain.rangeUnit,
        category: f.category.name,
        item: f.item?.name ?? null,
        variant: f.variant?.name ?? null,
        rangeMin: f.rangeMin === null ? null : Number(f.rangeMin),
        rangeMax: f.rangeMax === null ? null : Number(f.rangeMax),
        notes: f.notes,
      })),
    });
  });

  // ─── Categories ────────────────────────────────────────────────────

  app.get('/v1/public/commerce/categories', async (request) => {
    const q = TenantQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const rows = await withTenant({ tenantId }, (tx) =>
      tx.productCategory.findMany({
        where: { deletedAt: null },
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
      })
    );
    return ok(rows);
  });

  // ─── Fitment ───────────────────────────────────────────────────────
  //
  // Surfaces the fitment domains the tenant has access to (global + own)
  // plus L1 categories per domain. Drives the storefront narrowing
  // filter — vehicle Year/Make/Model/Engine for an auto shop, Pet
  // Species/Breed for a pet store, Device Brand/Model for a phone case
  // shop. L2/L3 are lazy-loaded as the customer drills down.

  app.get('/v1/public/commerce/fitment/domains', async (request) => {
    const q = TenantQuery.parse(request.query);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const rows = await prisma.fitmentDomain.findMany({
      where: { OR: [{ tenantId: null }, { tenantId }], deletedAt: null },
      orderBy: [{ position: 'asc' }, { displayName: 'asc' }],
      select: {
        id: true,
        slug: true,
        displayName: true,
        description: true,
        iconKey: true,
        labels: true,
        rangeUnit: true,
        tenantId: true,
      },
    });
    return ok(
      rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        displayName: r.displayName,
        description: r.description,
        iconKey: r.iconKey,
        labels: r.labels,
        rangeUnit: r.rangeUnit,
        isGlobal: r.tenantId === null,
      }))
    );
  });

  app.get('/v1/public/commerce/fitment/domains/:domainId/categories', async (request) => {
    const q = TenantQuery.parse(request.query);
    const { domainId } = z.object({ domainId: z.string().uuid() }).parse(request.params);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const rows = await prisma.fitmentCategory.findMany({
      where: {
        domainId,
        OR: [{ tenantId: null }, { tenantId }],
        deletedAt: null,
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, iconMediaId: true, tenantId: true },
    });
    return ok(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        iconMediaId: r.iconMediaId,
        isGlobal: r.tenantId === null,
      }))
    );
  });

  app.get('/v1/public/commerce/fitment/categories/:categoryId/items', async (request) => {
    const q = TenantQuery.parse(request.query);
    const { categoryId } = z.object({ categoryId: z.string().uuid() }).parse(request.params);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const rows = await prisma.fitmentItem.findMany({
      where: {
        categoryId,
        OR: [{ tenantId: null }, { tenantId }],
        deletedAt: null,
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, tenantId: true },
    });
    return ok(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        isGlobal: r.tenantId === null,
      }))
    );
  });

  app.get('/v1/public/commerce/fitment/items/:itemId/variants', async (request) => {
    const q = TenantQuery.parse(request.query);
    const { itemId } = z.object({ itemId: z.string().uuid() }).parse(request.params);
    const tenantId = await resolveTenantBySlug(q.tenant);
    const rows = await prisma.fitmentVariant.findMany({
      where: {
        itemId,
        OR: [{ tenantId: null }, { tenantId }],
        deletedAt: null,
      },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, attributes: true, tenantId: true },
    });
    return ok(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        attributes: r.attributes,
        isGlobal: r.tenantId === null,
      }))
    );
  });

  return Promise.resolve();
};

function productSelect() {
  return {
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
  };
}

export default publicCommerceRoutes;
