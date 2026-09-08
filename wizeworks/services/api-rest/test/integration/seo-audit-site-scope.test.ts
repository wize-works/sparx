// Whose pages a search score is about.
//
// WHY THIS EXISTS. `seo_audits.property_id` shipped and not one of the table's
// four indexes mentions it, because no read ever filtered on it. So a clothing
// maker with seven websites opened "How people find you" on her shop and read
// **51 pages checked, average 77** — her shop has 42 and averages 76. The other
// nine were her Archive site's pages, scored against a different domain with
// different content, quietly moving her number (issue 391).
//
// TWO TIERS, and the second is the point. A `builder_page` audit carries the site
// its page belongs to; a `cms_page` / `product` / `collection` audit carries NULL,
// because those entities express site visibility through junction tables rather
// than a column. So NULL means "not pinned by this row", and dropping those would
// have taken 20 of her 42 pages off the screen to fix a 9-page error.

import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { invalidateModuleCache } from '@wizeworks/auth';
import { prisma, withTenant } from '@wizeworks/db';
import { createApp } from '../../src/app.js';
import {
  authHeader,
  createTestTenant,
  dropTestTenant,
  signToken,
  type TestTenant,
} from '../helpers.js';

async function enableSeo(tenantId: string): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: { modules: { seo: { enabled: true }, builder: { enabled: true } } } },
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

/** Stored scorecards, each pinned to a site or to none. */
async function seed(
  t: TestTenant,
  audits: { title: string; score: number; propertyId: string | null }[]
): Promise<void> {
  await withTenant({ tenantId: t.tenantId }, async (tx) => {
    for (const a of audits) {
      await tx.seoAudit.create({
        data: {
          tenantId: t.tenantId,
          propertyId: a.propertyId,
          entityType: a.propertyId ? 'builder_page' : 'product',
          entityId: crypto.randomUUID(),
          score: a.score,
          grade: a.score >= 70 ? 'good' : 'poor',
          title: a.title,
          path: `/${a.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          card: { checks: [{ id: 'title', label: 'Title', category: 'basics', status: 'pass' }] },
          computedAt: new Date(),
        },
      });
    }
  });
}

describe('a search score is about the site you are looking at', () => {
  it("counts this site's pages plus the unpinned ones, and not another site's", async () => {
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableSeo(t.tenantId);
      const shop = t.propertyId;
      const archive = await createSite(t, 'The Archive');
      await seed(t, [
        { title: 'Shop home', score: 60, propertyId: shop },
        { title: 'Shop about', score: 80, propertyId: shop },
        // Not pinned by the audit row — a product, whose visibility lives in a
        // junction. Counted on every site, deliberately.
        { title: 'A product', score: 70, propertyId: null },
        // Another website's pages. These are the nine.
        { title: 'Archive home', score: 100, propertyId: archive },
        { title: 'Archive index', score: 100, propertyId: archive },
      ]);
      const token = signToken(app, t);

      const onShop = await app.inject({
        method: 'GET',
        url: '/v1/seo/audits',
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
      });
      const titles = (onShop.json().data as { title: string }[]).map((r) => r.title).sort();

      // Before the fix this was all five, on every site of the business.
      expect(titles).toEqual(['A product', 'Shop about', 'Shop home']);
      expect(titles).not.toContain('Archive home');
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('gives each site its own average, which is the number that moved', async () => {
    // The tiles are computed from this list, so the scoping IS the score. Her shop
    // averaged 76 and the screen said 77 because another site's high-scoring pages
    // were in the mean.
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableSeo(t.tenantId);
      const shop = t.propertyId;
      const archive = await createSite(t, 'The Archive');
      await seed(t, [
        { title: 'Shop one', score: 60, propertyId: shop },
        { title: 'Shop two', score: 60, propertyId: shop },
        { title: 'Archive one', score: 100, propertyId: archive },
        { title: 'Archive two', score: 100, propertyId: archive },
      ]);
      const token = signToken(app, t);

      const mean = async (id: string) => {
        const res = await app.inject({
          method: 'GET',
          url: '/v1/seo/audits',
          headers: { ...authHeader(token), 'x-sparx-property-id': id },
        });
        const rows = res.json().data as { score: number }[];
        return rows.reduce((sum, r) => sum + r.score, 0) / rows.length;
      };

      expect(await mean(shop), 'her shop').toBe(60);
      expect(await mean(archive), 'the archive').toBe(100);
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('scopes the checklist roll-up and the activity feed too', async () => {
    // Three reads feed this one screen — the tiles, "What to work on", and
    // "Recently checked". Scoping one and not the others is a screen that
    // disagrees with itself.
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableSeo(t.tenantId);
      const shop = t.propertyId;
      const archive = await createSite(t, 'The Archive');
      await seed(t, [
        { title: 'Shop one', score: 60, propertyId: shop },
        { title: 'Archive one', score: 100, propertyId: archive },
        { title: 'Archive two', score: 100, propertyId: archive },
      ]);
      const token = signToken(app, t);
      const here = { ...authHeader(token), 'x-sparx-property-id': shop };

      const checklist = await app.inject({
        method: 'GET',
        url: '/v1/seo/reports/checklist',
        headers: here,
      });
      expect(checklist.json().data.summary.pagesScored, 'pages behind the checklist').toBe(1);

      const activity = await app.inject({
        method: 'GET',
        url: '/v1/seo/reports/activity',
        headers: here,
      });
      const seen = (activity.json().data as { title: string }[]).map((r) => r.title);
      expect(seen).toEqual(['Shop one']);
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });
});
