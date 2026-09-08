// Which of a business's websites a label belongs to.
//
// WHY THIS EXISTS. The CMS taxonomy model says this in as many words:
//
//   null = the term appears on every site. Unlike its Taxonomy, a TERM is
//   CONTENT — "Diesel repair" is meaningless on a donut site, and it would
//   otherwise show up in that site's category filters and archive pages.
//
// It shipped as columns and indexes — `taxonomy_terms.property_id` plus
// `@@index([tenantId, propertyId, taxonomyId])`, an index serving a query nobody
// wrote — and not one read in the 310-line taxonomies route ever filtered on it.
// The installer stamped the column faithfully; nothing consulted it.
//
// So a clothing maker with seven sites opened Tags and topics on her shop and
// read Venture capital, Data centres, Chips, Artificial intelligence and
// Startups: thirty-two labels that two designs had introduced on two OTHER
// sites, and the screen showed the identical list on all seven (issue 385).
//
// A vocabulary is deliberately NOT scoped — a taxonomy is a schema ("posts have
// tags") and shared is its correct case — which is why the counts come in two:
// `term_count` is what this site holds, `all_sites_term_count` is what a DELETE
// destroys, and a delete reaches every site at once.

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

/** A vocabulary plus labels, some belonging to one site and some to every site. */
async function seed(
  t: TestTenant,
  terms: { name: string; propertyId: string | null }[]
): Promise<string> {
  return withTenant({ tenantId: t.tenantId }, async (tx) => {
    const taxonomy = await tx.taxonomy.create({
      data: {
        tenantId: t.tenantId,
        key: 'blog_tag',
        name: 'Tag',
        pluralName: 'Tags',
        hierarchical: false,
      },
      select: { id: true },
    });
    for (const term of terms) {
      await tx.taxonomyTerm.create({
        data: {
          tenantId: t.tenantId,
          taxonomyId: taxonomy.id,
          propertyId: term.propertyId,
          slug: term.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: term.name,
        },
      });
    }
    return taxonomy.id;
  });
}

describe('a label belongs to the site it was written on', () => {
  it('the list counts THIS site, and says separately what a delete would destroy', async () => {
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const shop = t.propertyId;
      const press = await createSite(t, 'The Press Room');
      await seed(t, [
        { name: 'Knitwear', propertyId: shop },
        { name: 'Venture capital', propertyId: press },
        { name: 'Data centres', propertyId: press },
        // No site at all — the model reads this as "every site".
        { name: 'News', propertyId: null },
      ]);
      const token = signToken(app, t);

      const onShop = await app.inject({
        method: 'GET',
        url: '/v1/taxonomies',
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
      });
      // Before the fix this was 4 on every site of the business.
      expect(onShop.json().data[0].term_count).toBe(2); // Knitwear + News
      // What a delete takes with it, which is every label everywhere.
      expect(onShop.json().data[0].all_sites_term_count).toBe(4);

      const onPress = await app.inject({
        method: 'GET',
        url: '/v1/taxonomies',
        headers: { ...authHeader(token), 'x-sparx-property-id': press },
      });
      expect(onPress.json().data[0].term_count).toBe(3); // the two + News
      expect(onPress.json().data[0].all_sites_term_count).toBe(4);
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('the labels themselves are the ones this site holds', async () => {
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const shop = t.propertyId;
      const press = await createSite(t, 'The Press Room');
      await seed(t, [
        { name: 'Knitwear', propertyId: shop },
        { name: 'Venture capital', propertyId: press },
        { name: 'News', propertyId: null },
      ]);
      const token = signToken(app, t);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/taxonomies/blog_tag/terms',
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
      });
      const names = (res.json().data as { name: string }[]).map((r) => r.name).sort();

      expect(names).toEqual(['Knitwear', 'News']);
      // The one that made this visible on a real account.
      expect(names).not.toContain('Venture capital');
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('a label written here belongs to here, not to every site', async () => {
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const shop = t.propertyId;
      await seed(t, []);
      const token = signToken(app, t);

      const created = await app.inject({
        method: 'POST',
        url: '/v1/taxonomies/blog_tag/terms',
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
        payload: { name: 'Knitwear' },
      });
      expect(created.statusCode).toBe(201);

      const row = await withTenant({ tenantId: t.tenantId }, (tx) =>
        tx.taxonomyTerm.findFirst({ where: { slug: 'knitwear' }, select: { propertyId: true } })
      );
      // Left null, it would have appeared on all seven of a business's sites.
      expect(row?.propertyId).toBe(shop);
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('a clash with a label on another site SAYS which site, because she cannot see it', async () => {
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const shop = t.propertyId;
      const press = await createSite(t, 'The Press Room');
      await seed(t, [{ name: 'Craft', propertyId: press }]);
      const token = signToken(app, t);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/taxonomies/blog_tag/terms',
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
        payload: { name: 'Craft' },
      });

      expect(res.statusCode).toBe(409);
      // Slug uniqueness is per vocabulary by design, so scoping the READ created
      // a refusal about something invisible. The message has to close that gap
      // or she is staring at a list that plainly does not contain the word.
      expect(res.json().error.message).toContain('The Press Room');
      expect(res.json().error.message).toContain('different one');
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it("another site's label cannot be renamed or deleted from here", async () => {
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const shop = t.propertyId;
      const press = await createSite(t, 'The Press Room');
      await seed(t, [{ name: 'Venture capital', propertyId: press }]);
      const token = signToken(app, t);
      const theirs = await withTenant({ tenantId: t.tenantId }, (tx) =>
        tx.taxonomyTerm.findFirst({ where: { slug: 'venture-capital' }, select: { id: true } })
      );

      const renamed = await app.inject({
        method: 'PATCH',
        url: `/v1/taxonomies/blog_tag/terms/${theirs?.id ?? ''}`,
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
        payload: { name: 'Knitwear' },
      });
      expect(renamed.statusCode).toBe(404);

      const deleted = await app.inject({
        method: 'DELETE',
        url: `/v1/taxonomies/blog_tag/terms/${theirs?.id ?? ''}`,
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
      });
      expect(deleted.statusCode).toBe(404);

      // And it is still there.
      const still = await withTenant({ tenantId: t.tenantId }, (tx) =>
        tx.taxonomyTerm.count({ where: { slug: 'venture-capital' } })
      );
      expect(still).toBe(1);
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });
});
