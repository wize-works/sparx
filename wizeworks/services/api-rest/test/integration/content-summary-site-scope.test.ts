// How much content a business has, counted from where it is standing.
//
// WHY THIS EXISTS. `/v1/content/reports/summary` counted the whole tenant, and it
// feeds the Content types pane's "entries" column. So a clothing maker with seven
// websites stood in her shop and read **Blog post · 21 entries** while the Content
// list two clicks away showed the 3 that are actually there — the other 18 were
// written for her Press and Sample Sale sites (issue 389).
//
// The rule is the platform's own `contentSiteVisibilityWhere`: an entry linked to
// NO site belongs to every site, one linked to sites belongs only to those.
//
// The counts come in TWO, and that is the point. The column asks "how much of this
// is on the site I am in"; the DELETE asks "how much does this type hold anywhere",
// because `deleteContentTypeTx` refuses tenant-wide. Serving only the scoped number
// would put "No entries yet" above a Delete the server then refuses, with nothing
// on screen explaining why — the same trap as issue 385, pointing the other way.

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

async function enableCms(tenantId: string): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: { modules: { cms: { enabled: true } } } },
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

/** Entries of one type, each pinned to the given sites — an empty list meaning
 *  "no links at all", which the model reads as every site. */
async function seed(
  t: TestTenant,
  entries: { slug: string; typeKey: string; sites: string[] }[]
): Promise<void> {
  await withTenant({ tenantId: t.tenantId }, async (tx) => {
    for (const entry of entries) {
      await tx.contentEntry.create({
        data: {
          tenantId: t.tenantId,
          typeKey: entry.typeKey,
          slug: entry.slug,
          status: 'published',
          publishedAt: new Date(),
          body: { title: entry.slug },
          ...(entry.sites.length > 0
            ? {
                propertyLinks: {
                  create: entry.sites.map((propertyId) => ({ propertyId })),
                },
              }
            : {}),
        },
      });
    }
  });
}

interface ByType {
  typeKey: string;
  count: number;
  allSitesCount: number;
}

function typeRow(body: { data: { byType: ByType[] } }, key: string): ByType | undefined {
  return body.data.byType.find((r) => r.typeKey === key);
}

describe('the content summary counts the site you are standing on', () => {
  it('counts THIS site, and says separately what the whole business holds', async () => {
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const shop = t.propertyId;
      const press = await createSite(t, 'The Press Room');
      await seed(t, [
        { slug: 'fewer-clothes', typeKey: 'blog_post', sites: [shop] },
        { slug: 'reading-fabric', typeKey: 'blog_post', sites: [shop] },
        { slug: 'venture-capital', typeKey: 'blog_post', sites: [press] },
        { slug: 'data-centers', typeKey: 'blog_post', sites: [press] },
        { slug: 'chips', typeKey: 'blog_post', sites: [press] },
      ]);
      const token = signToken(app, t);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/content/reports/summary',
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
      });

      const row = typeRow(res.json(), 'blog_post');
      // Before the fix this was 5 on every site of the business.
      expect(row?.count, 'on her shop').toBe(2);
      // What a delete has to reckon with, which is every site at once.
      expect(row?.allSitesCount, 'across the business').toBe(5);
      expect(res.json().data.total, 'the headline total is scoped too').toBe(2);
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('an entry pinned to no site counts on every site', async () => {
    // The platform's empty-means-all rule, which is why her six legal pages read
    // the same 6 from every one of her seven sites and were never the bug.
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const press = await createSite(t, 'The Press Room');
      await seed(t, [
        { slug: 'privacy-policy', typeKey: 'page', sites: [] },
        { slug: 'return-policy', typeKey: 'page', sites: [] },
      ]);
      const token = signToken(app, t);

      for (const [where, id] of [
        ['her shop', t.propertyId],
        ['the press site', press],
      ] as const) {
        const res = await app.inject({
          method: 'GET',
          url: '/v1/content/reports/summary',
          headers: { ...authHeader(token), 'x-sparx-property-id': id },
        });
        expect(typeRow(res.json(), 'page')?.count, where).toBe(2);
      }
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('keeps a row for a type whose entries all live on ANOTHER site', async () => {
    // The row that explains a refused Delete. Dropping it — which keying off the
    // scoped groups would have done — leaves "No entries yet" beside a Delete the
    // server refuses, and nothing on screen to explain the contradiction.
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const press = await createSite(t, 'The Press Room');
      await seed(t, [{ slug: 'press-release', typeKey: 'announcement', sites: [press] }]);
      const token = signToken(app, t);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/content/reports/summary',
        headers: { ...authHeader(token), 'x-sparx-property-id': t.propertyId },
      });

      const row = typeRow(res.json(), 'announcement');
      expect(row, 'the row must survive').toBeDefined();
      expect(row?.count, 'none of them are here').toBe(0);
      expect(row?.allSitesCount, 'but one exists, and it blocks the delete').toBe(1);
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('scopes the status breakdown too, not just the per-type counts', async () => {
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const press = await createSite(t, 'The Press Room');
      await seed(t, [
        { slug: 'mine-one', typeKey: 'blog_post', sites: [t.propertyId] },
        { slug: 'theirs-one', typeKey: 'blog_post', sites: [press] },
        { slug: 'theirs-two', typeKey: 'blog_post', sites: [press] },
      ]);
      const token = signToken(app, t);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/content/reports/summary',
        headers: { ...authHeader(token), 'x-sparx-property-id': t.propertyId },
      });

      expect(res.json().data.byStatus.published).toBe(1);
      expect(res.json().data.publishedLast30d).toBe(1);
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });
});
