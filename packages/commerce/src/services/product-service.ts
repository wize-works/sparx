// productService — read/write API for products + their variant tree.
//
// Phase 1.1 wires the catalog spine: list, get, create, update, archive,
// restore, publish, unpublish, plus bulk status/tag operations.
// Variant + option creation lands in Phase 1.2 (variantService); product
// create accepts options/variants in the schema but currently rejects
// non-empty arrays so partial wiring never produces a half-built product.
//
// Every state change:
//   1. Validates input via @sparx/commerce-schemas
//   2. Runs DB work inside withTenant() (RLS context set per transaction)
//   3. Writes an audit_logs row in the same transaction
//   4. Publishes a Pub/Sub event AFTER commit — never inside

import {
  BulkTagProductsInput,
  BulkUpdateProductStatusInput,
  CreateProductInput,
  type ProductStatus,
  UpdateProductInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma, Product } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

// ─── Reads ────────────────────────────────────────────────────────────

export interface ListProductsFilter {
  status?: ProductStatus;
  categoryId?: string;
  collectionId?: string;
  vendor?: string;
  tag?: string;
  productType?: string;
  q?: string;
  hasFitment?: boolean;
  includeArchived?: boolean;
  includeDeleted?: boolean;
  take?: number;
  skip?: number;
  sortBy?: 'updatedAt' | 'createdAt' | 'title' | 'priceMinCents';
}

export interface ProductListItem {
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

export async function list(
  ctx: ServiceContext,
  filter: ListProductsFilter = {}
): Promise<{ items: ProductListItem[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const status: Prisma.ProductWhereInput['status'] =
      filter.status ?? (filter.includeArchived ? undefined : { not: 'archived' });

    const where: Prisma.ProductWhereInput = {
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(status !== undefined ? { status } : {}),
      ...(filter.vendor ? { vendor: filter.vendor } : {}),
      ...(filter.productType ? { productType: filter.productType } : {}),
      ...(filter.tag ? { tags: { has: filter.tag } } : {}),
      ...(filter.categoryId ? { categoryLinks: { some: { categoryId: filter.categoryId } } } : {}),
      ...(filter.collectionId
        ? { collectionLinks: { some: { collectionId: filter.collectionId } } }
        : {}),
      ...(filter.hasFitment ? { fitments: { some: {} } } : {}),
      ...(filter.q
        ? {
            OR: [
              { title: { contains: filter.q, mode: 'insensitive' } },
              { handle: { contains: filter.q, mode: 'insensitive' } },
              { vendor: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortField = filter.sortBy ?? 'updatedAt';
    const [rows, total] = await Promise.all([
      tx.product.findMany({
        where,
        orderBy: { [sortField]: 'desc' },
        take: Math.min(filter.take ?? 50, 250),
        skip: filter.skip ?? 0,
        select: {
          id: true,
          title: true,
          handle: true,
          status: true,
          vendor: true,
          productType: true,
          tags: true,
          priceMinCents: true,
          priceMaxCents: true,
          updatedAt: true,
          _count: { select: { variants: true } },
        },
      }),
      tx.product.count({ where }),
    ]);

    const items: ProductListItem[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      handle: row.handle,
      status: row.status as ProductStatus,
      vendor: row.vendor,
      productType: row.productType,
      variantCount: row._count.variants,
      priceMinCents: row.priceMinCents,
      priceMaxCents: row.priceMaxCents,
      // Phase 1.2 surfaces the primary image; for now no image join.
      imageUrl: null,
      tags: row.tags,
      updatedAt: row.updatedAt.toISOString(),
    }));

    return { items, total };
  });
}

export interface ProductDetail {
  id: string;
  tenantId: string;
  title: string;
  handle: string;
  description: string | null;
  status: ProductStatus;
  productType: string | null;
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
  metadata: Record<string, unknown>;
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
  optionCount: number;
  categoryIds: string[];
  collectionIds: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export async function get(ctx: ServiceContext, productId: string): Promise<ProductDetail> {
  const product = await withTenant(ctx, (tx) =>
    tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        categoryLinks: { select: { categoryId: true } },
        collectionLinks: { select: { collectionId: true } },
        _count: { select: { variants: true, options: true } },
      },
    })
  );
  if (!product) throw new CommerceNotFoundError('Product', productId);
  return toProductDetail(product);
}

export async function getByHandle(ctx: ServiceContext, handle: string): Promise<ProductDetail> {
  const product = await withTenant(ctx, (tx) =>
    tx.product.findFirst({
      where: { handle, deletedAt: null },
      include: {
        categoryLinks: { select: { categoryId: true } },
        collectionLinks: { select: { collectionId: true } },
        _count: { select: { variants: true, options: true } },
      },
    })
  );
  if (!product) throw new CommerceNotFoundError('Product', handle);
  return toProductDetail(product);
}

// ─── Writes ───────────────────────────────────────────────────────────

export async function create(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string; handle: string }> {
  const input = CreateProductInput.parse(rawInput);

  // Variants + options land in Phase 1.2. Fail fast rather than silently
  // dropping them — a wizard that fed them in would think they saved.
  if (input.options.length > 0 || input.variants.length > 0) {
    throw new CommerceValidationError(
      'Options and variants are managed via variantService — Phase 1.2'
    );
  }

  const handleSeed = input.handle ?? slugify(input.title);

  const result = await withTenant(ctx, async (tx) => {
    const handle = await ensureUniqueHandle(tx, ctx.tenantId, handleSeed);

    const product = await tx.product.create({
      data: {
        tenantId: ctx.tenantId,
        title: input.title,
        handle,
        description: input.description ?? null,
        status: input.status,
        productType: input.productType ?? null,
        vendor: input.vendor ?? null,
        tags: input.tags,
        fulfillmentType: input.fulfillmentType,
        weightGrams: input.weight ?? null,
        lengthMm: input.dimensions?.lengthMm ?? null,
        widthMm: input.dimensions?.widthMm ?? null,
        heightMm: input.dimensions?.heightMm ?? null,
        hazmatClass: input.hazmatClass,
        requiresShipping: input.requiresShipping,
        taxClass: input.taxClass ?? null,
        originCountry: input.originCountry ?? null,
        hsCode: input.hsCode ?? null,
        defaultWarehouseId: input.defaultWarehouseId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        ogImageId: input.ogImageId ?? null,
        publishedAt: input.status === 'active' ? new Date() : null,
      },
    });

    if (input.categoryIds.length > 0) {
      await tx.categoryProduct.createMany({
        data: input.categoryIds.map((categoryId, idx) => ({
          categoryId,
          productId: product.id,
          isPrimary: idx === 0,
          position: idx,
        })),
        skipDuplicates: true,
      });
    }
    if (input.collectionIds.length > 0) {
      await tx.collectionProduct.createMany({
        data: input.collectionIds.map((collectionId, idx) => ({
          collectionId,
          productId: product.id,
          position: idx,
          addedBy: 'manual',
        })),
        skipDuplicates: true,
      });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.product.created',
      entityType: 'Product',
      entityId: product.id,
      diff: { before: null, after: serializeProduct(product) },
    });

    return product;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.created',
    data: { productId: result.id, handle: result.handle, status: result.status },
  });

  return { id: result.id, handle: result.handle };
}

export async function update(
  ctx: ServiceContext,
  productId: string,
  rawInput: unknown
): Promise<ProductDetail> {
  const input = UpdateProductInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        categoryLinks: { select: { categoryId: true } },
        collectionLinks: { select: { collectionId: true } },
        _count: { select: { variants: true, options: true } },
      },
    });
    if (!before) throw new CommerceNotFoundError('Product', productId);

    // Handle rename — only re-check uniqueness when actually changing.
    let nextHandle: string | undefined;
    if (input.handle !== undefined && input.handle !== before.handle) {
      nextHandle = await ensureUniqueHandle(tx, ctx.tenantId, input.handle, productId);
    }

    const statusChanging = input.status !== undefined && input.status !== before.status;
    const becomingActive = statusChanging && input.status === 'active';

    const updated = await tx.product.update({
      where: { id: productId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(nextHandle !== undefined ? { handle: nextHandle } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.productType !== undefined ? { productType: input.productType } : {}),
        ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.fulfillmentType !== undefined ? { fulfillmentType: input.fulfillmentType } : {}),
        ...(input.weight !== undefined ? { weightGrams: input.weight } : {}),
        ...(input.dimensions !== undefined
          ? {
              lengthMm: input.dimensions?.lengthMm ?? null,
              widthMm: input.dimensions?.widthMm ?? null,
              heightMm: input.dimensions?.heightMm ?? null,
            }
          : {}),
        ...(input.hazmatClass !== undefined ? { hazmatClass: input.hazmatClass } : {}),
        ...(input.requiresShipping !== undefined
          ? { requiresShipping: input.requiresShipping }
          : {}),
        ...(input.taxClass !== undefined ? { taxClass: input.taxClass } : {}),
        ...(input.originCountry !== undefined ? { originCountry: input.originCountry } : {}),
        ...(input.hsCode !== undefined ? { hsCode: input.hsCode } : {}),
        ...(input.defaultWarehouseId !== undefined
          ? { defaultWarehouseId: input.defaultWarehouseId }
          : {}),
        ...(input.metadata !== undefined
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
        ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
        ...(input.ogImageId !== undefined ? { ogImageId: input.ogImageId } : {}),
        ...(becomingActive && before.publishedAt === null ? { publishedAt: new Date() } : {}),
      },
      include: {
        categoryLinks: { select: { categoryId: true } },
        collectionLinks: { select: { collectionId: true } },
        _count: { select: { variants: true, options: true } },
      },
    });

    if (input.categoryIds !== undefined) {
      await tx.categoryProduct.deleteMany({ where: { productId } });
      if (input.categoryIds.length > 0) {
        await tx.categoryProduct.createMany({
          data: input.categoryIds.map((categoryId, idx) => ({
            categoryId,
            productId,
            isPrimary: idx === 0,
            position: idx,
          })),
        });
      }
    }
    if (input.collectionIds !== undefined) {
      await tx.collectionProduct.deleteMany({
        where: { productId, addedBy: 'manual' },
      });
      if (input.collectionIds.length > 0) {
        await tx.collectionProduct.createMany({
          data: input.collectionIds.map((collectionId, idx) => ({
            collectionId,
            productId,
            position: idx,
            addedBy: 'manual',
          })),
        });
      }
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.product.updated',
      entityType: 'Product',
      entityId: updated.id,
      diff: { before: serializeProduct(before), after: serializeProduct(updated) },
    });

    return updated;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { productId: result.id, handle: result.handle, status: result.status },
  });

  return toProductDetail(result);
}

export async function archive(ctx: ServiceContext, productId: string): Promise<void> {
  await transitionStatus(ctx, productId, 'archived', 'commerce.product.archived');
}

export async function restore(ctx: ServiceContext, productId: string): Promise<void> {
  await transitionStatus(ctx, productId, 'draft', 'commerce.product.restored');
}

export async function publish(ctx: ServiceContext, productId: string): Promise<void> {
  await transitionStatus(ctx, productId, 'active', 'commerce.product.published');
}

export async function unpublish(ctx: ServiceContext, productId: string): Promise<void> {
  await transitionStatus(ctx, productId, 'draft', 'commerce.product.unpublished');
}

export async function softDelete(ctx: ServiceContext, productId: string): Promise<void> {
  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!before) throw new CommerceNotFoundError('Product', productId);

    const updated = await tx.product.update({
      where: { id: productId },
      data: { deletedAt: new Date(), status: 'archived' },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.product.deleted',
      entityType: 'Product',
      entityId: updated.id,
      diff: { before: serializeProduct(before), after: serializeProduct(updated) },
    });

    return updated;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.deleted',
    data: { productId: result.id, handle: result.handle },
  });
}

// ─── Bulk operations ──────────────────────────────────────────────────

export async function bulkUpdateStatus(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ updated: number }> {
  const input = BulkUpdateProductStatusInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const updateResult = await tx.product.updateMany({
      where: { id: { in: input.productIds }, deletedAt: null },
      data: {
        status: input.status,
        ...(input.status === 'active' ? { publishedAt: new Date() } : {}),
      },
    });
    for (const id of input.productIds) {
      await writeAuditLog({
        tx,
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        actorType: ctx.userId ? 'user' : 'system',
        action: 'commerce.product.status_changed',
        entityType: 'Product',
        entityId: id,
        diff: { after: { status: input.status } },
      });
    }
    return { updated: updateResult.count };
  });

  await Promise.all(
    input.productIds.map((productId) =>
      publishCommerceEvent({
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        topic: 'product.updated',
        data: { productId, change: 'status', status: input.status },
      })
    )
  );

  return result;
}

export async function bulkTag(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ updated: number }> {
  const input = BulkTagProductsInput.parse(rawInput);
  if (input.addTags.length === 0 && input.removeTags.length === 0) {
    return { updated: 0 };
  }

  return withTenant(ctx, async (tx) => {
    const products = await tx.product.findMany({
      where: { id: { in: input.productIds }, deletedAt: null },
      select: { id: true, tags: true },
    });

    let updated = 0;
    for (const product of products) {
      const next = new Set(product.tags);
      input.addTags.forEach((t) => next.add(t));
      input.removeTags.forEach((t) => next.delete(t));
      const nextTags = [...next];
      if (sameTags(product.tags, nextTags)) continue;

      await tx.product.update({ where: { id: product.id }, data: { tags: nextTags } });
      await writeAuditLog({
        tx,
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        actorType: ctx.userId ? 'user' : 'system',
        action: 'commerce.product.tags_updated',
        entityType: 'Product',
        entityId: product.id,
        diff: { before: { tags: product.tags }, after: { tags: nextTags } },
      });
      updated++;
    }

    return { updated };
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────

type ProductWithIncludes = Product & {
  categoryLinks: { categoryId: string }[];
  collectionLinks: { collectionId: string }[];
  _count: { variants: number; options: number };
};

function toProductDetail(p: ProductWithIncludes): ProductDetail {
  return {
    id: p.id,
    tenantId: p.tenantId,
    title: p.title,
    handle: p.handle,
    description: p.description,
    status: p.status as ProductStatus,
    productType: p.productType,
    vendor: p.vendor,
    tags: p.tags,
    fulfillmentType: p.fulfillmentType,
    weightGrams: p.weightGrams,
    lengthMm: p.lengthMm,
    widthMm: p.widthMm,
    heightMm: p.heightMm,
    hazmatClass: p.hazmatClass,
    requiresShipping: p.requiresShipping,
    taxClass: p.taxClass,
    originCountry: p.originCountry,
    hsCode: p.hsCode,
    metadata: (p.metadata ?? {}) as Record<string, unknown>,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    ogImageId: p.ogImageId,
    defaultWarehouseId: p.defaultWarehouseId,
    priceMinCents: p.priceMinCents,
    priceMaxCents: p.priceMaxCents,
    inStock: p.inStock,
    averageRating: p.averageRating,
    reviewCount: p.reviewCount,
    variantCount: p._count.variants,
    optionCount: p._count.options,
    categoryIds: p.categoryLinks.map((c) => c.categoryId),
    collectionIds: p.collectionLinks.map((c) => c.collectionId),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    publishedAt: p.publishedAt?.toISOString() ?? null,
  };
}

async function transitionStatus(
  ctx: ServiceContext,
  productId: string,
  nextStatus: ProductStatus,
  auditAction: string
): Promise<void> {
  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!before) throw new CommerceNotFoundError('Product', productId);
    if (before.status === nextStatus) return before;

    const updated = await tx.product.update({
      where: { id: productId },
      data: {
        status: nextStatus,
        ...(nextStatus === 'active' && before.publishedAt === null
          ? { publishedAt: new Date() }
          : {}),
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: auditAction,
      entityType: 'Product',
      entityId: updated.id,
      diff: {
        before: { status: before.status },
        after: { status: updated.status },
      },
    });

    return updated;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { productId: result.id, change: 'status', status: result.status },
  });
}

async function ensureUniqueHandle(
  tx: Prisma.TransactionClient,
  tenantId: string,
  seed: string,
  excludingProductId?: string
): Promise<string> {
  const base = seed.length > 0 ? seed.slice(0, 120) : 'product';
  for (let suffix = 0; suffix < 50; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const existing = await tx.product.findFirst({
      where: {
        tenantId,
        handle: candidate,
        ...(excludingProductId ? { NOT: { id: excludingProductId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new CommerceConflictError(`Could not generate unique handle for "${seed}"`, 'handle');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((t, i) => t === sb[i]);
}

function serializeProduct(p: Product): Record<string, unknown> {
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    status: p.status,
    productType: p.productType,
    vendor: p.vendor,
    fulfillmentType: p.fulfillmentType,
    hazmatClass: p.hazmatClass,
    requiresShipping: p.requiresShipping,
    tags: p.tags,
    taxClass: p.taxClass,
    originCountry: p.originCountry,
    hsCode: p.hsCode,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    deletedAt: p.deletedAt?.toISOString() ?? null,
  };
}
