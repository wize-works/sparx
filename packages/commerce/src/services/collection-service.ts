// collectionService — manual product lists and rules-driven smart
// collections. Rule evaluation runs through the commerce-indexer worker
// on a debounce; the storefront reads from the materialized
// CollectionProduct table so reads are one indexed query, not a rule
// re-evaluation.
//
// Every write follows the locked pattern:
//   1. Zod-validate input
//   2. withTenant() transaction with RLS context
//   3. writeAuditLog inside the same transaction
//   4. publishCommerceEvent AFTER commit

import {
  CreateCollectionInput,
  SetCollectionProductsInput,
  UpdateCollectionInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma, ProductCollection } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

// ─── Public shapes ────────────────────────────────────────────────────

export interface CollectionSummary {
  id: string;
  name: string;
  handle: string;
  type: 'manual' | 'rules';
  productCount: number;
  featured: boolean;
  updatedAt: string;
}

export interface CollectionDetail extends CollectionSummary {
  description: string | null;
  heroMediaId: string | null;
  ruleSet: Record<string, unknown> | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
  productIds: string[];
  createdAt: string;
}

export interface ListCollectionsFilter {
  type?: 'manual' | 'rules';
  featured?: boolean;
  q?: string;
  take?: number;
  skip?: number;
}

// ─── Reads ────────────────────────────────────────────────────────────

export async function list(
  ctx: ServiceContext,
  filter: ListCollectionsFilter = {}
): Promise<{ items: CollectionSummary[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const where: Prisma.ProductCollectionWhereInput = {
      deletedAt: null,
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.featured !== undefined ? { featured: filter.featured } : {}),
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: 'insensitive' } },
              { handle: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      tx.productCollection.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: Math.min(filter.take ?? 50, 250),
        skip: filter.skip ?? 0,
        include: { _count: { select: { products: true } } },
      }),
      tx.productCollection.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        handle: r.handle,
        type: r.type as 'manual' | 'rules',
        productCount: r._count.products,
        featured: r.featured,
        updatedAt: r.updatedAt.toISOString(),
      })),
      total,
    };
  });
}

export async function get(ctx: ServiceContext, collectionId: string): Promise<CollectionDetail> {
  const row = await withTenant(ctx, (tx) =>
    tx.productCollection.findFirst({
      where: { id: collectionId, deletedAt: null },
      include: {
        products: { select: { productId: true } },
        _count: { select: { products: true } },
      },
    })
  );
  if (!row) throw new CommerceNotFoundError('Collection', collectionId);
  return toDetail(row);
}

export async function getByHandle(ctx: ServiceContext, handle: string): Promise<CollectionDetail> {
  const row = await withTenant(ctx, (tx) =>
    tx.productCollection.findFirst({
      where: { handle, deletedAt: null },
      include: {
        products: { select: { productId: true } },
        _count: { select: { products: true } },
      },
    })
  );
  if (!row) throw new CommerceNotFoundError('Collection', handle);
  return toDetail(row);
}

// ─── Writes ───────────────────────────────────────────────────────────

export async function create(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string; handle: string }> {
  const input = CreateCollectionInput.parse(rawInput);

  if (input.type === 'rules' && !input.ruleSet) {
    throw new CommerceValidationError('Rules-driven collections require a ruleSet', [
      { field: 'ruleSet', message: 'Required when type=rules' },
    ]);
  }

  const handleSeed = input.handle ?? slugify(input.name);

  const result = await withTenant(ctx, async (tx) => {
    const handle = await ensureUniqueHandle(tx, ctx.tenantId, handleSeed);

    const created = await tx.productCollection.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        handle,
        description: input.description ?? null,
        type: input.type,
        ruleSet: input.ruleSet ?? {},
        heroMediaId: input.heroMediaId ?? null,
        featured: input.featured,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        ogImageId: input.ogImageId ?? null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.collection.created',
      entityType: 'Collection',
      entityId: created.id,
      diff: { after: serializeCollection(created) },
    });

    return created;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { collectionId: result.id, change: 'collection_created', type: result.type },
  });

  return { id: result.id, handle: result.handle };
}

export async function update(
  ctx: ServiceContext,
  collectionId: string,
  rawInput: unknown
): Promise<void> {
  const input = UpdateCollectionInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.productCollection.findFirst({
      where: { id: collectionId, deletedAt: null },
    });
    if (!before) throw new CommerceNotFoundError('Collection', collectionId);

    let nextHandle: string | undefined;
    if (input.handle !== undefined && input.handle !== before.handle) {
      nextHandle = await ensureUniqueHandle(tx, ctx.tenantId, input.handle, collectionId);
    }

    // Type flip is a destructive change — rules ↔ manual loses the
    // opposite-mode data. Refuse the flip and route the merchant to
    // delete + recreate, mirroring Shopify's UX.
    if (input.type !== undefined && input.type !== before.type) {
      throw new CommerceValidationError(
        `Cannot change collection type from "${before.type}" to "${input.type}" — delete and recreate instead`
      );
    }

    if (input.type === 'rules' && input.ruleSet === undefined && !before.ruleSet) {
      throw new CommerceValidationError('Rules-driven collections require a ruleSet');
    }

    const updated = await tx.productCollection.update({
      where: { id: collectionId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(nextHandle !== undefined ? { handle: nextHandle } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.ruleSet !== undefined ? { ruleSet: input.ruleSet } : {}),
        ...(input.heroMediaId !== undefined ? { heroMediaId: input.heroMediaId } : {}),
        ...(input.featured !== undefined ? { featured: input.featured } : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
        ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
        ...(input.ogImageId !== undefined ? { ogImageId: input.ogImageId } : {}),
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.collection.updated',
      entityType: 'Collection',
      entityId: updated.id,
      diff: { before: serializeCollection(before), after: serializeCollection(updated) },
    });

    return updated;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { collectionId: result.id, change: 'collection_updated' },
  });
}

export async function setProducts(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = SetCollectionProductsInput.parse(rawInput);

  await withTenant(ctx, async (tx) => {
    const collection = await tx.productCollection.findFirst({
      where: { id: input.collectionId, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!collection) throw new CommerceNotFoundError('Collection', input.collectionId);
    if (collection.type !== 'manual') {
      throw new CommerceConflictError(
        'Cannot set products on a rules-driven collection — edit the ruleSet instead',
        'type'
      );
    }

    if (input.productIds.length > 0) {
      const existing = await tx.product.count({
        where: { id: { in: input.productIds }, deletedAt: null },
      });
      if (existing !== input.productIds.length) {
        throw new CommerceValidationError('One or more productIds are unknown');
      }
    }

    await tx.collectionProduct.deleteMany({ where: { collectionId: input.collectionId } });
    if (input.productIds.length > 0) {
      await tx.collectionProduct.createMany({
        data: input.productIds.map((productId, idx) => ({
          collectionId: input.collectionId,
          productId,
          position: idx,
          addedBy: 'manual',
        })),
      });
    }

    // Bump updatedAt so list views reflect the curation change without a
    // dedicated 'membership_changed' column.
    await tx.productCollection.update({
      where: { id: input.collectionId },
      data: { updatedAt: new Date() },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.collection.products_set',
      entityType: 'Collection',
      entityId: input.collectionId,
      diff: { after: { productCount: input.productIds.length } },
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { collectionId: input.collectionId, change: 'membership_set' },
  });
}

export async function setProductCollections(
  ctx: ServiceContext,
  productId: string,
  collectionIds: string[]
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new CommerceNotFoundError('Product', productId);

    if (collectionIds.length > 0) {
      const manualCount = await tx.productCollection.count({
        where: { id: { in: collectionIds }, type: 'manual', deletedAt: null },
      });
      if (manualCount !== collectionIds.length) {
        throw new CommerceValidationError(
          'Some collectionIds are unknown or rules-driven (can only assign products to manual collections)'
        );
      }
    }

    // Only touch the manual-curation rows — leave rules-driven memberships
    // alone so the indexer worker's projections aren't clobbered.
    await tx.collectionProduct.deleteMany({
      where: { productId, addedBy: 'manual' },
    });
    if (collectionIds.length > 0) {
      await tx.collectionProduct.createMany({
        data: collectionIds.map((collectionId, idx) => ({
          collectionId,
          productId,
          position: idx,
          addedBy: 'manual',
        })),
      });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.product.collections_set',
      entityType: 'Product',
      entityId: productId,
      diff: { after: { collectionIds } },
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { productId, change: 'collections' },
  });
}

export async function remove(ctx: ServiceContext, collectionId: string): Promise<void> {
  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.productCollection.findFirst({
      where: { id: collectionId, deletedAt: null },
    });
    if (!before) throw new CommerceNotFoundError('Collection', collectionId);

    await tx.productCollection.update({
      where: { id: collectionId },
      data: { deletedAt: new Date() },
    });
    await tx.collectionProduct.deleteMany({ where: { collectionId } });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.collection.deleted',
      entityType: 'Collection',
      entityId: collectionId,
      diff: { before: serializeCollection(before), after: { deletedAt: new Date().toISOString() } },
    });

    return before;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { collectionId, change: 'collection_deleted', handle: result.handle },
  });
}

/**
 * Trigger a re-evaluation of a rules-driven collection's membership.
 * Phase 1.3 is a no-op (the indexer worker hasn't shipped yet); Phase 1.5
 * wires the actual rule resolver. Calling this now publishes a
 * `product.updated` event tagged `collection_reindex_requested` so a
 * subscriber can pick it up once it exists.
 */
export async function reindex(ctx: ServiceContext, collectionId: string): Promise<void> {
  const collection = await withTenant(ctx, (tx) =>
    tx.productCollection.findFirst({
      where: { id: collectionId, deletedAt: null },
      select: { id: true, type: true },
    })
  );
  if (!collection) throw new CommerceNotFoundError('Collection', collectionId);
  if (collection.type !== 'rules') {
    throw new CommerceConflictError(
      'Only rules-driven collections need reindexing — manual lists are already authoritative',
      'type'
    );
  }
  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { collectionId, change: 'collection_reindex_requested' },
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────

type CollectionWithIncludes = ProductCollection & {
  products: { productId: string }[];
  _count: { products: number };
};

function toDetail(c: CollectionWithIncludes): CollectionDetail {
  return {
    id: c.id,
    name: c.name,
    handle: c.handle,
    type: c.type as 'manual' | 'rules',
    productCount: c._count.products,
    featured: c.featured,
    updatedAt: c.updatedAt.toISOString(),
    description: c.description,
    heroMediaId: c.heroMediaId,
    ruleSet: c.ruleSet ? (c.ruleSet as Record<string, unknown>) : null,
    seoTitle: c.seoTitle,
    seoDescription: c.seoDescription,
    ogImageId: c.ogImageId,
    productIds: c.products.map((p) => p.productId),
    createdAt: c.createdAt.toISOString(),
  };
}

function serializeCollection(c: ProductCollection): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    handle: c.handle,
    type: c.type,
    featured: c.featured,
    deletedAt: c.deletedAt?.toISOString() ?? null,
  };
}

async function ensureUniqueHandle(
  tx: Prisma.TransactionClient,
  tenantId: string,
  seed: string,
  excludingCollectionId?: string
): Promise<string> {
  const base = seed.length > 0 ? seed.slice(0, 120) : 'collection';
  for (let suffix = 0; suffix < 50; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const existing = await tx.productCollection.findFirst({
      where: {
        tenantId,
        handle: candidate,
        ...(excludingCollectionId ? { NOT: { id: excludingCollectionId } } : {}),
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
