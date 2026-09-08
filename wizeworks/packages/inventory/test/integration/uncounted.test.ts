// DB-backed coverage for `listUncounted` — versions on sale that nobody has ever
// counted (issue 444).
//
// This is the question the stock list structurally cannot answer. That list
// starts `FROM inventory_levels`, so a version with no level row is not a row it
// can return however it is filtered — and a shirt with twenty versions, fifteen
// of them counted, reported "Showing 1-15 of 15" with nothing anywhere naming
// the other five.
//
// The five in question had gone on sale a minute earlier, from one press of
// "Give them all the same price" after a colorway was added, on a shop whose
// whole premise is twelve of a size. A version becomes stock-managed by being
// COUNTED, not by existing (availability.ts) — so they were selling without
// limit while their own setting read "stop selling it when you run out".
//
// Requires `pnpm db:up`; skipped in CI per vitest.config.

import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withTenant } from '@wizeworks/db';

import { listUncounted, updateLevelCount } from '../../src/services/public-api.js';
import { createInventoryFixture, createTestTenant, dropTestTenant } from '../helpers.js';

describe('listUncounted', () => {
  let tenantId: string;
  let userId: string;
  let warehouseId: string;
  const ctx = (): { tenantId: string; userId: string } => ({ tenantId, userId });

  let counted: string; // UC-CLAY   — has a level row
  let uncounted: string; // UC-MOSS   — never counted
  let alsoUncounted: string; // UC-SLATE  — never counted
  let draftOnly: string; // UC-DRAFT  — never counted, product not on sale
  let removed: string; // UC-GONE   — never counted, version deleted
  let backorder: string; // UC-BACK   — never counted, told to keep selling when out
  let download: string; // UC-FILE   — never counted, never posted

  beforeAll(async () => {
    const t = await createTestTenant();
    tenantId = t.tenantId;
    userId = t.userId;
    const fixture = await createInventoryFixture(tenantId);
    warehouseId = fixture.warehouseId;

    counted = await newVariant('UC-CLAY', 'The Ash Overshirt');
    uncounted = await newVariant('UC-MOSS', 'The Ash Overshirt');
    alsoUncounted = await newVariant('UC-SLATE', 'The Ash Overshirt');
    draftOnly = await newVariant('UC-DRAFT', 'Winter Coat', { status: 'draft' });
    removed = await newVariant('UC-GONE', 'The Ash Overshirt');
    backorder = await newVariant('UC-BACK', 'Made to order', { inventoryPolicy: 'continue' });
    download = await newVariant('UC-FILE', 'The Field Guide', { requiresShipping: false });

    await updateLevelCount(ctx(), counted, { warehouseId, onHand: 6, reason: 'recount' });
    await withTenant(ctx(), (tx) =>
      tx.productVariant.update({ where: { id: removed }, data: { deletedAt: new Date() } })
    );
  });
  afterAll(async () => {
    await dropTestTenant(tenantId);
  });

  async function newVariant(
    sku: string,
    title: string,
    over: { status?: string; inventoryPolicy?: string; requiresShipping?: boolean } = {}
  ): Promise<string> {
    const tag = crypto.randomBytes(3).toString('hex');
    return withTenant(ctx(), async (tx) => {
      const product = await tx.product.create({
        data: {
          tenantId,
          title,
          handle: `${sku.toLowerCase()}-${tag}`,
          status: over.status ?? 'active',
        },
      });
      const v = await tx.productVariant.create({
        data: {
          tenantId,
          productId: product.id,
          sku,
          priceCents: 12800,
          currency: 'USD',
          inventoryPolicy: over.inventoryPolicy ?? 'deny',
          requiresShipping: over.requiresShipping ?? true,
        },
      });
      return v.id;
    });
  }

  /** Only the versions this file made. The shared fixture creates one of its
   *  own, uncounted, and it is genuinely part of the answer — so it is filtered
   *  out of the assertions rather than asserted away. */
  const mine = (items: { sku: string }[]): string[] =>
    items
      .map((r) => r.sku)
      .filter((sku) => sku.startsWith('UC-'))
      .sort();

  it('finds the versions on sale that have no count anywhere', async () => {
    const all = await listUncounted(ctx(), { q: 'UC-' });

    expect(mine(all.items)).toEqual(['UC-MOSS', 'UC-SLATE']);
    expect(all.total).toBe(2);
  });

  it('leaves out the one that HAS a count, however small', async () => {
    // Six is a count. Zero would be a count too — the rule is whether anybody
    // ever said a number, not what the number was.
    const all = await listUncounted(ctx(), { q: 'UC-' });
    expect(all.items.map((r) => r.variantId)).not.toContain(counted);

    await updateLevelCount(ctx(), uncounted, { warehouseId, onHand: 0, reason: 'recount' });
    const after = await listUncounted(ctx(), { q: 'UC-' });
    expect(mine(after.items)).toEqual(['UC-SLATE']);
    expect(after.total).toBe(1);
  });

  it('leaves out a draft product and a removed version', async () => {
    // Neither is a promise anybody can take up: a draft is not on sale, and a
    // removed version cannot be bought. Listing them would bury the ones that
    // are actually selling.
    const all = await listUncounted(ctx(), { q: 'UC-' });
    const ids = all.items.map((r) => r.variantId);
    expect(ids).not.toContain(draftOnly);
    expect(ids).not.toContain(removed);
  });

  it('carries what the band has to say: the code, the product, and the setting', async () => {
    const all = await listUncounted(ctx(), { q: 'UC-' });
    expect(all.items[0]?.variantId).toBe(alsoUncounted);
    expect(all.items[0]).toMatchObject({
      sku: 'UC-SLATE',
      productTitle: 'The Ash Overshirt',
      // The setting that is NOT being honoured while nothing is counted.
      inventoryPolicy: 'deny',
    });
  });

  it('leaves out a version told to keep selling when it runs out', async () => {
    // `continue` MEANS unlimited, so an uncounted one is doing what was asked
    // and there is no promise being broken. Without this the band told a shop to
    // go and count 33 memberships and reports; the platform held 1,664 of these
    // against 55 real ones on 2026-09-08 (issue 445).
    const all = await listUncounted(ctx(), { q: 'UC-' });
    expect(all.items.map((r) => r.variantId)).not.toContain(backorder);
  });

  it('leaves out a version that is never posted', async () => {
    // A download has no shelf, so it cannot be counted at all and naming it
    // would send somebody to look for a box that does not exist.
    const all = await listUncounted(ctx(), { q: 'UC-' });
    expect(all.items.map((r) => r.variantId)).not.toContain(download);
  });

  it('narrows by the same needle the stock list uses, and pages', async () => {
    const byTitle = await listUncounted(ctx(), { q: 'ash overshirt' });
    expect(byTitle.total).toBe(1);
    const byCode = await listUncounted(ctx(), { q: 'uc-sl' });
    expect(byCode.items[0]?.sku).toBe('UC-SLATE');
    const miss = await listUncounted(ctx(), { q: 'winter coat' });
    expect(miss.total).toBe(0);

    // `total` is the whole answer whatever the window — the band names a few and
    // counts the rest, so a short page must not shrink the number it reports.
    const window = await listUncounted(ctx(), { q: 'UC-', take: 1 });
    expect(window.items).toHaveLength(1);
    expect(window.total).toBe(1);
  });
});
