// categoryService — nested category tree (materialized-path-backed).
// collectionService is the merchandising sibling.
//
// The `path` column is a materialized dot-separated path of category
// handles ("auto-parts.engine.fuel-injection") — Postgres' ltree
// extension can later read these as ltree without a schema migration.
// Subtree queries use `path LIKE '<prefix>.%'`; ancestor counts are
// derived from the dot count.
//
// Every write follows the locked pattern:
//   1. Zod-validate input
//   2. withTenant() transaction with RLS context
//   3. writeAuditLog inside the same transaction
//   4. publishCommerceEvent AFTER commit

import {
  CreateCategoryInput,
  ReparentCategoryInput,
  UpdateCategoryInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma, ProductCategory } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

// ─── Public shapes ────────────────────────────────────────────────────

export interface CategoryRow {
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
  productCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryTreeNode extends CategoryRow {
  depth: number;
  children: CategoryTreeNode[];
}

// ─── Reads ────────────────────────────────────────────────────────────

export async function tree(ctx: ServiceContext): Promise<CategoryTreeNode[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.productCategory.findMany({
      where: { deletedAt: null },
      orderBy: [{ path: 'asc' }, { position: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
    return buildTree(rows);
  });
}

export async function get(ctx: ServiceContext, categoryId: string): Promise<CategoryRow> {
  const row = await withTenant(ctx, (tx) =>
    tx.productCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
      include: { _count: { select: { products: true } } },
    })
  );
  if (!row) throw new CommerceNotFoundError('Category', categoryId);
  return toCategoryRow(row);
}

export async function getByHandle(ctx: ServiceContext, handle: string): Promise<CategoryRow> {
  const row = await withTenant(ctx, (tx) =>
    tx.productCategory.findFirst({
      where: { handle, deletedAt: null },
      include: { _count: { select: { products: true } } },
    })
  );
  if (!row) throw new CommerceNotFoundError('Category', handle);
  return toCategoryRow(row);
}

// ─── Writes ───────────────────────────────────────────────────────────

export async function create(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string; handle: string }> {
  const input = CreateCategoryInput.parse(rawInput);
  const handleSeed = input.handle ?? slugify(input.name);

  const result = await withTenant(ctx, async (tx) => {
    const handle = await ensureUniqueHandle(tx, ctx.tenantId, handleSeed);

    let parentPath: string | null = null;
    if (input.parentId) {
      const parent = await tx.productCategory.findFirst({
        where: { id: input.parentId, deletedAt: null },
        select: { id: true, path: true },
      });
      if (!parent) throw new CommerceNotFoundError('Category', input.parentId);
      parentPath = parent.path;
    }

    const path = parentPath ? `${parentPath}.${handle}` : handle;

    const created = await tx.productCategory.create({
      data: {
        tenantId: ctx.tenantId,
        parentId: input.parentId ?? null,
        path,
        name: input.name,
        handle,
        description: input.description ?? null,
        position: input.position,
        featured: input.featured,
        iconMediaId: input.iconMediaId ?? null,
        heroMediaId: input.heroMediaId ?? null,
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
      action: 'commerce.category.created',
      entityType: 'Category',
      entityId: created.id,
      diff: { after: serializeCategory(created) },
    });

    return created;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { categoryId: result.id, change: 'category_created', handle: result.handle },
  });

  return { id: result.id, handle: result.handle };
}

export async function update(
  ctx: ServiceContext,
  categoryId: string,
  rawInput: unknown
): Promise<void> {
  const input = UpdateCategoryInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.productCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
    });
    if (!before) throw new CommerceNotFoundError('Category', categoryId);

    // Handle rename — only allowed when the new handle is unique; the
    // ltree path is rewritten so descendant paths re-derive cleanly on
    // the next fetch (subtree update below).
    let nextHandle: string | undefined;
    let pathRewrite: { oldPrefix: string; newPrefix: string } | undefined;
    if (input.handle !== undefined && input.handle !== before.handle) {
      nextHandle = await ensureUniqueHandle(tx, ctx.tenantId, input.handle, categoryId);
      const segments = before.path.split('.');
      segments[segments.length - 1] = nextHandle;
      const newPath = segments.join('.');
      pathRewrite = { oldPrefix: before.path, newPrefix: newPath };
    }

    // Reparenting via UpdateCategoryInput is supported but routes through
    // the same path-rewrite math as `reparent()` below — keep the
    // implementation in one place by delegating.
    if (input.parentId !== undefined && input.parentId !== before.parentId) {
      throw new CommerceValidationError('Use reparent() to move a category to a new parent');
    }

    const updated = await tx.productCategory.update({
      where: { id: categoryId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(nextHandle !== undefined ? { handle: nextHandle, path: pathRewrite!.newPrefix } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.featured !== undefined ? { featured: input.featured } : {}),
        ...(input.iconMediaId !== undefined ? { iconMediaId: input.iconMediaId } : {}),
        ...(input.heroMediaId !== undefined ? { heroMediaId: input.heroMediaId } : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
        ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
        ...(input.ogImageId !== undefined ? { ogImageId: input.ogImageId } : {}),
      },
    });

    if (pathRewrite) {
      await rewriteSubtreePaths(tx, categoryId, pathRewrite.oldPrefix, pathRewrite.newPrefix);
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.category.updated',
      entityType: 'Category',
      entityId: updated.id,
      diff: { before: serializeCategory(before), after: serializeCategory(updated) },
    });

    return updated;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { categoryId: result.id, change: 'category_updated' },
  });
}

export async function reparent(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = ReparentCategoryInput.parse(rawInput);

  await withTenant(ctx, async (tx) => {
    const before = await tx.productCategory.findFirst({
      where: { id: input.categoryId, deletedAt: null },
    });
    if (!before) throw new CommerceNotFoundError('Category', input.categoryId);

    let newParentPath: string | null = null;
    if (input.newParentId) {
      const parent = await tx.productCategory.findFirst({
        where: { id: input.newParentId, deletedAt: null },
        select: { id: true, path: true },
      });
      if (!parent) throw new CommerceNotFoundError('Category', input.newParentId);

      // Cycle guard — refuse to move a category into its own subtree.
      if (parent.path === before.path || parent.path.startsWith(`${before.path}.`)) {
        throw new CommerceValidationError('Cannot move a category into its own subtree');
      }
      newParentPath = parent.path;
    }

    const handleSegment = before.path.split('.').pop()!;
    const newPath = newParentPath ? `${newParentPath}.${handleSegment}` : handleSegment;

    await tx.productCategory.update({
      where: { id: input.categoryId },
      data: {
        parentId: input.newParentId,
        path: newPath,
        position: input.newPosition,
      },
    });

    if (newPath !== before.path) {
      await rewriteSubtreePaths(tx, input.categoryId, before.path, newPath);
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.category.reparented',
      entityType: 'Category',
      entityId: input.categoryId,
      diff: {
        before: { parentId: before.parentId, path: before.path, position: before.position },
        after: { parentId: input.newParentId, path: newPath, position: input.newPosition },
      },
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { categoryId: input.categoryId, change: 'category_reparented' },
  });
}

export async function remove(ctx: ServiceContext, categoryId: string): Promise<void> {
  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.productCategory.findFirst({
      where: { id: categoryId, deletedAt: null },
    });
    if (!before) throw new CommerceNotFoundError('Category', categoryId);

    const descendants = await tx.productCategory.count({
      where: { path: { startsWith: `${before.path}.` }, deletedAt: null },
    });
    if (descendants > 0) {
      throw new CommerceConflictError(
        `Category "${before.name}" has ${descendants} descendant categor${descendants === 1 ? 'y' : 'ies'} — remove or reparent them first`,
        'descendants'
      );
    }

    await tx.productCategory.update({
      where: { id: categoryId },
      data: { deletedAt: new Date() },
    });
    await tx.categoryProduct.deleteMany({ where: { categoryId } });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.category.deleted',
      entityType: 'Category',
      entityId: categoryId,
      diff: { before: serializeCategory(before), after: { deletedAt: new Date().toISOString() } },
    });

    return before;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { categoryId, change: 'category_deleted', handle: result.handle },
  });
}

// ─── Product-membership writes ────────────────────────────────────────

export async function setProductCategories(
  ctx: ServiceContext,
  productId: string,
  categoryIds: string[]
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new CommerceNotFoundError('Product', productId);

    if (categoryIds.length > 0) {
      const found = await tx.productCategory.count({
        where: { id: { in: categoryIds }, deletedAt: null },
      });
      if (found !== categoryIds.length) {
        throw new CommerceValidationError('One or more categoryIds are unknown');
      }
    }

    await tx.categoryProduct.deleteMany({ where: { productId } });
    if (categoryIds.length > 0) {
      await tx.categoryProduct.createMany({
        data: categoryIds.map((categoryId, idx) => ({
          categoryId,
          productId,
          isPrimary: idx === 0,
          position: idx,
        })),
      });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.product.categories_set',
      entityType: 'Product',
      entityId: productId,
      diff: { after: { categoryIds } },
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { productId, change: 'categories' },
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────

type CategoryWithCount = ProductCategory & { _count: { products: number } };

function toCategoryRow(c: CategoryWithCount): CategoryRow {
  return {
    id: c.id,
    name: c.name,
    handle: c.handle,
    description: c.description,
    parentId: c.parentId,
    path: c.path,
    position: c.position,
    featured: c.featured,
    iconMediaId: c.iconMediaId,
    heroMediaId: c.heroMediaId,
    productCount: c._count.products,
    seoTitle: c.seoTitle,
    seoDescription: c.seoDescription,
    ogImageId: c.ogImageId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function buildTree(rows: CategoryWithCount[]): CategoryTreeNode[] {
  const nodes = new Map<string, CategoryTreeNode>();
  for (const row of rows) {
    nodes.set(row.id, {
      ...toCategoryRow(row),
      depth: row.path.split('.').length - 1,
      children: [],
    });
  }
  const roots: CategoryTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId) {
      const parent = nodes.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphan (parent deleted) — surface as a root so it stays visible.
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }
  const byPosition = (a: CategoryTreeNode, b: CategoryTreeNode) =>
    a.position - b.position || a.name.localeCompare(b.name);
  function sortRecursive(list: CategoryTreeNode[]): void {
    list.sort(byPosition);
    for (const n of list) sortRecursive(n.children);
  }
  sortRecursive(roots);
  return roots;
}

function serializeCategory(c: ProductCategory): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    handle: c.handle,
    parentId: c.parentId,
    path: c.path,
    position: c.position,
    featured: c.featured,
    deletedAt: c.deletedAt?.toISOString() ?? null,
  };
}

async function rewriteSubtreePaths(
  tx: Prisma.TransactionClient,
  rootId: string,
  oldPrefix: string,
  newPrefix: string
): Promise<void> {
  if (oldPrefix === newPrefix) return;
  const descendants = await tx.productCategory.findMany({
    where: {
      OR: [{ path: oldPrefix }, { path: { startsWith: `${oldPrefix}.` } }],
      NOT: { id: rootId },
    },
    select: { id: true, path: true },
  });
  for (const d of descendants) {
    await tx.productCategory.update({
      where: { id: d.id },
      data: { path: d.path.replace(oldPrefix, newPrefix) },
    });
  }
}

async function ensureUniqueHandle(
  tx: Prisma.TransactionClient,
  tenantId: string,
  seed: string,
  excludingCategoryId?: string
): Promise<string> {
  const base = seed.length > 0 ? seed.slice(0, 120) : 'category';
  for (let suffix = 0; suffix < 50; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const existing = await tx.productCategory.findFirst({
      where: {
        tenantId,
        handle: candidate,
        ...(excludingCategoryId ? { NOT: { id: excludingCategoryId } } : {}),
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
