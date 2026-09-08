// What the number beside a category MEANS.
//
// WHY THIS EXISTS. `categoryService` reported `productCount` as
// `_count.products` — a raw count of rows in the `commerce_category_products`
// join table. A link row outlives everything that would take its product off the
// website: archiving it, saving it back to draft, soft-deleting it, or scoping it
// to one of the tenant's other sites. So the console printed the number of FILING
// ROWS while every reader took it for the number of things in that part of their
// shop.
//
// Measured on Juniper Row (a clothing maker with seven sites) before the fix:
// Goods read "6" in the console over a category page on her own website that said
// "0 products · Nothing here yet", and seven of her eight stocked aisles
// overstated the same way. Platform-wide, 10 of 122 stocked categories were over,
// 5 of them claiming products where a shopper found none, with 21 counted
// products already soft-deleted.
//
// NOTHING CAUGHT IT, because nothing asserted on the number at all — the field
// shipped, was read by two surfaces, and had no test. So this suite drives the
// SERVICE against real rows and asserts the count agrees with the storefront's
// own product filter (`status: 'active'`, `deletedAt: null`, site visibility).
// The two have to keep agreeing: the whole value of the number is that it
// predicts what the shop page will print.

import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { invalidateModuleCache } from '@wizeworks/auth';
import { categoryService } from '@wizeworks/commerce';
import { prisma, withTenant } from '@wizeworks/db';
import { createTestTenant, dropTestTenant, type TestTenant } from '../helpers.js';

async function enableCommerce(tenantId: string): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: { modules: { commerce: { enabled: true } } } },
  });
  invalidateModuleCache();
}

async function createSite(t: TestTenant, name: string): Promise<string> {
  return withTenant({ tenantId: t.tenantId }, async (tx) => {
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
    const row = await tx.property.create({
      data: { tenantId: t.tenantId, slug, name, isPrimary: false },
      select: { id: true },
    });
    return row.id;
  });
}

/** A product filed in `categoryId`. `status` and `deletedAt` are the two things
 *  that take it off the website without touching the filing row, and
 *  `propertyIds` is the third. */
async function fileProduct(
  t: TestTenant,
  categoryId: string,
  opts: { status?: string; deleted?: boolean; propertyIds?: string[] } = {}
): Promise<string> {
  return withTenant({ tenantId: t.tenantId }, async (tx) => {
    const product = await tx.product.create({
      data: {
        tenantId: t.tenantId,
        title: 'The Marlow Knit',
        handle: `knit-${crypto.randomBytes(4).toString('hex')}`,
        status: opts.status ?? 'active',
        deletedAt: opts.deleted ? new Date() : null,
      },
      select: { id: true },
    });
    await tx.categoryProduct.create({ data: { categoryId, productId: product.id } });
    for (const propertyId of opts.propertyIds ?? []) {
      await tx.productProperty.create({ data: { productId: product.id, propertyId } });
    }
    return product.id;
  });
}

/** The one category out of the tree, by handle. */
async function readCategory(tenantId: string, handle: string, propertyId?: string) {
  const nodes = await categoryService.tree({ tenantId }, propertyId ? { propertyId } : {});
  const found = nodes.find((n) => n.handle === handle);
  if (!found) throw new Error(`category ${handle} missing from the tree`);
  return found;
}

describe('a category counts what a shopper would find', () => {
  it('leaves out archived, drafted and deleted products, and says how many it left out', async () => {
    const t = await createTestTenant('owner');
    try {
      await enableCommerce(t.tenantId);
      const ctx = { tenantId: t.tenantId };
      const { id: categoryId } = await categoryService.create(ctx, { name: 'Knitwear' });

      // One of each way a filed product can be off the website, plus one that is on it.
      await fileProduct(t, categoryId);
      await fileProduct(t, categoryId, { status: 'archived' });
      await fileProduct(t, categoryId, { status: 'draft' });
      await fileProduct(t, categoryId, { deleted: true });

      const row = await readCategory(t.tenantId, 'knitwear');

      // Before the fix this was 4 — every filing row, whatever became of its product.
      expect(row.productCount).toBe(1);
      expect(row.hiddenProductCount).toBe(3);
      // The two halves add up to what is FILED, which is what a delete detaches.
      expect(row.productCount + row.hiddenProductCount).toBe(4);
    } finally {
      await dropTestTenant(t.tenantId);
    }
  });

  it('a category with nothing live reads zero rather than the size of its filing drawer', async () => {
    const t = await createTestTenant('owner');
    try {
      await enableCommerce(t.tenantId);
      const ctx = { tenantId: t.tenantId };
      const { id: categoryId } = await categoryService.create(ctx, { name: 'Goods' });
      for (let i = 0; i < 6; i += 1) await fileProduct(t, categoryId, { status: 'archived' });

      const row = await readCategory(t.tenantId, 'goods');

      // Juniper Row's exact case: the console said 6, her shop page said 0.
      expect(row.productCount).toBe(0);
      expect(row.hiddenProductCount).toBe(6);
    } finally {
      await dropTestTenant(t.tenantId);
    }
  });

  it('counts per site, so a product kept for the other business is not counted here', async () => {
    const t = await createTestTenant('owner');
    try {
      await enableCommerce(t.tenantId);
      const ctx = { tenantId: t.tenantId };
      const here = t.propertyId;
      const there = await createSite(t, 'The Archive');
      const { id: categoryId } = await categoryService.create(ctx, { name: 'Tops' });

      await fileProduct(t, categoryId, { propertyIds: [here] });
      await fileProduct(t, categoryId, { propertyIds: [there] });
      // No scope rows at all = on every site, the backward-compatible default.
      await fileProduct(t, categoryId);

      const onThisSite = await readCategory(t.tenantId, 'tops', here);
      expect(onThisSite.productCount).toBe(2);
      expect(onThisSite.hiddenProductCount).toBe(1);

      const onTheOther = await readCategory(t.tenantId, 'tops', there);
      expect(onTheOther.productCount).toBe(2);
      expect(onTheOther.hiddenProductCount).toBe(1);

      // Unscoped, the site dimension drops out and all three are live somewhere.
      const anywhere = await readCategory(t.tenantId, 'tops');
      expect(anywhere.productCount).toBe(3);
      expect(anywhere.hiddenProductCount).toBe(0);
    } finally {
      await dropTestTenant(t.tenantId);
    }
  });

  it('reports zero, not absent, for a category nothing is filed in', async () => {
    const t = await createTestTenant('owner');
    try {
      await enableCommerce(t.tenantId);
      const ctx = { tenantId: t.tenantId };
      await categoryService.create(ctx, { name: 'Sneakers' });

      const row = await readCategory(t.tenantId, 'sneakers');

      // A category with no filing rows at all comes back with real zeroes rather
      // than dropping out of the count map — the reader must never have to tell
      // "none" apart from "not answered".
      expect(row.productCount).toBe(0);
      expect(row.hiddenProductCount).toBe(0);
    } finally {
      await dropTestTenant(t.tenantId);
    }
  });

  it('the single-category read agrees with the tree', async () => {
    const t = await createTestTenant('owner');
    try {
      await enableCommerce(t.tenantId);
      const ctx = { tenantId: t.tenantId };
      const here = t.propertyId;
      const { id: categoryId } = await categoryService.create(ctx, { name: 'Trousers' });
      await fileProduct(t, categoryId);
      await fileProduct(t, categoryId, { status: 'archived' });

      // The detail pane and the list are two screens onto one fact. They opened
      // different questions about it while `get` counted join rows and the tree
      // counted them too — both wrong, so both agreed. They have to agree while
      // both are RIGHT.
      const fromTree = await readCategory(t.tenantId, 'trousers', here);
      const fromDetail = await categoryService.get(ctx, categoryId, here);

      expect(fromDetail.productCount).toBe(fromTree.productCount);
      expect(fromDetail.hiddenProductCount).toBe(fromTree.hiddenProductCount);
      expect(fromDetail.productCount).toBe(1);
      expect(fromDetail.hiddenProductCount).toBe(1);
    } finally {
      await dropTestTenant(t.tenantId);
    }
  });
});
