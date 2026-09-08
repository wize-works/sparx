// Which of a business's websites a byline writes for.
//
// WHY THIS EXISTS. The Author model says it in as many words:
//
//   An author is a PUBLIC PERSONA, not a login … The same person can write as
//   "Bob, master machinist" on one site and under a plain name on another, and
//   neither byline (nor its bio and avatar) belongs in the other publication's
//   author picker.
//
// `authors.property_id` shipped with migration 20261227, and its index
// `@@index([tenantId, propertyId])` shipped with it, for a query the route never
// made. Every read was tenant-wide, so a clothing maker with seven sites opened
// Authors on her shop and found nine strangers — the mastheads of two magazine
// designs installed on two OTHER sites. The same list feeds the content editor's
// byline picker, so those nine were the only names she could put on her own
// writing (issue 387).
//
// Slug uniqueness stays per TENANT deliberately (`/authors/jane` is one address
// for the business), so scoping the READ means a clash can be with a byline the
// writer cannot see. The refusal has to say which site holds it, and moving the
// one byline is the only way to put a name on two sites — a copy is refused.

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

/** Bylines, some belonging to one site and some to every site. */
async function seed(
  t: TestTenant,
  authors: { name: string; propertyId: string | null; bio?: string }[]
): Promise<void> {
  await withTenant({ tenantId: t.tenantId }, async (tx) => {
    for (const author of authors) {
      await tx.author.create({
        data: {
          tenantId: t.tenantId,
          propertyId: author.propertyId,
          slug: author.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          displayName: author.name,
          bio: author.bio ?? null,
        },
      });
    }
  });
}

describe('a byline writes for the site it was created on', () => {
  it("lists this site's bylines plus the shared ones, and not another site's", async () => {
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const shop = t.propertyId;
      const press = await createSite(t, 'The Press Room');
      await seed(t, [
        { name: 'Devi Raman', propertyId: shop },
        { name: 'Dana Ruiz', propertyId: press },
        { name: 'Marcus Bell', propertyId: press },
        // No site at all — the model reads this as "every site".
        { name: 'The Editors', propertyId: null },
      ]);
      const token = signToken(app, t);

      const onShop = await app.inject({
        method: 'GET',
        url: '/v1/authors',
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
      });
      const names = (onShop.json().data as { display_name: string }[])
        .map((a) => a.display_name)
        .sort();

      // Before the fix this was all four, on every site of the business.
      expect(names).toEqual(['Devi Raman', 'The Editors']);
      expect(names).not.toContain('Dana Ruiz');
      expect(onShop.json().meta.total).toBe(2);
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('does not let a SEARCH reach past the scope', async () => {
    // The scope is itself an OR (this site, or every site), so merging the search
    // terms into the same object would let a name match on another site's byline
    // satisfy the whole predicate — scoping the list and leaking it to anyone who
    // typed. The two have to be ANDed.
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const shop = t.propertyId;
      const press = await createSite(t, 'The Press Room');
      await seed(t, [
        { name: 'Devi Raman', propertyId: shop },
        { name: 'Dana Ruiz', propertyId: press, bio: 'Dana Ruiz covers artificial intelligence.' },
      ]);
      const token = signToken(app, t);

      const res = await app.inject({
        method: 'GET',
        url: '/v1/authors?q=Dana',
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
      });

      expect(res.json().data).toEqual([]);
      expect(res.json().meta.total).toBe(0);
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('a byline created here belongs to here, not to every site', async () => {
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const shop = t.propertyId;
      const token = signToken(app, t);

      const created = await app.inject({
        method: 'POST',
        url: '/v1/authors',
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
        payload: { display_name: 'Devi Raman' },
      });

      expect(created.statusCode).toBe(201);
      // Left null, it would have appeared on all seven of a business's sites.
      expect(created.json().data.property_id).toBe(shop);
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('an explicit null shares one name across every site', async () => {
    // The arrangement the model is nullable FOR: one masthead across a family of
    // publications, rather than one person's bio maintained in N places.
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const shop = t.propertyId;
      const press = await createSite(t, 'The Press Room');
      const token = signToken(app, t);

      const created = await app.inject({
        method: 'POST',
        url: '/v1/authors',
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
        payload: { display_name: 'Devi Raman', property_id: null },
      });
      expect(created.json().data.property_id).toBeNull();

      const onPress = await app.inject({
        method: 'GET',
        url: '/v1/authors',
        headers: { ...authHeader(token), 'x-sparx-property-id': press },
      });
      expect(
        (onPress.json().data as { display_name: string }[]).map((a) => a.display_name)
      ).toContain('Devi Raman');
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('MOVES a byline rather than copying it, because a copy is refused', async () => {
    // The reason the editor needs a control at all: the web address is unique per
    // business, so "make another Devi Raman for my journal" cannot work. Moving
    // the one byline to every site is the whole remedy.
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const shop = t.propertyId;
      const press = await createSite(t, 'The Press Room');
      await seed(t, [{ name: 'Devi Raman', propertyId: shop }]);
      const token = signToken(app, t);
      const mine = await withTenant({ tenantId: t.tenantId }, (tx) =>
        tx.author.findFirst({ where: { slug: 'devi-raman' }, select: { id: true } })
      );

      const moved = await app.inject({
        method: 'PATCH',
        url: `/v1/authors/${mine?.id ?? ''}`,
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
        payload: { property_id: null },
      });
      expect(moved.statusCode).toBe(200);
      expect(moved.json().data.property_id).toBeNull();
      // The name did not change on the way — a scope edit is not a rename.
      expect(moved.json().data.display_name).toBe('Devi Raman');

      const onPress = await app.inject({
        method: 'GET',
        url: '/v1/authors',
        headers: { ...authHeader(token), 'x-sparx-property-id': press },
      });
      expect(
        (onPress.json().data as { display_name: string }[]).map((a) => a.display_name)
      ).toEqual(['Devi Raman']);
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('a clash with a byline on another site SAYS which site, because she cannot see it', async () => {
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const shop = t.propertyId;
      const press = await createSite(t, 'The Press Room');
      await seed(t, [{ name: 'Dana Ruiz', propertyId: press }]);
      const token = signToken(app, t);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/authors',
        headers: { ...authHeader(token), 'x-sparx-property-id': shop },
        payload: { display_name: 'Dana Ruiz' },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.message).toContain('The Press Room');
      expect(res.json().error.message).toContain('different one');
      // The old wording, which said "slug" to somebody who has never seen one.
      expect(res.json().error.message).not.toContain('slug');
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it("another site's byline cannot be read, renamed or deleted from here", async () => {
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const shop = t.propertyId;
      const press = await createSite(t, 'The Press Room');
      await seed(t, [{ name: 'Dana Ruiz', propertyId: press }]);
      const token = signToken(app, t);
      const theirs = await withTenant({ tenantId: t.tenantId }, (tx) =>
        tx.author.findFirst({ where: { slug: 'dana-ruiz' }, select: { id: true } })
      );
      const here = { ...authHeader(token), 'x-sparx-property-id': shop };

      const read = await app.inject({
        method: 'GET',
        url: `/v1/authors/${theirs?.id ?? ''}`,
        headers: here,
      });
      expect(read.statusCode).toBe(404);

      const renamed = await app.inject({
        method: 'PATCH',
        url: `/v1/authors/${theirs?.id ?? ''}`,
        headers: here,
        payload: { display_name: 'Devi Raman' },
      });
      expect(renamed.statusCode).toBe(404);

      const deleted = await app.inject({
        method: 'DELETE',
        url: `/v1/authors/${theirs?.id ?? ''}`,
        headers: here,
      });
      expect(deleted.statusCode).toBe(404);

      // And she is still there, under the name she was given.
      const still = await withTenant({ tenantId: t.tenantId }, (tx) =>
        tx.author.findFirst({ where: { slug: 'dana-ruiz' }, select: { displayName: true } })
      );
      expect(still?.displayName).toBe('Dana Ruiz');
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });

  it('a shared byline IS editable from any site, since it belongs to all of them', async () => {
    const t = await createTestTenant('owner');
    const app = await createApp();
    try {
      await enableCms(t.tenantId);
      const press = await createSite(t, 'The Press Room');
      await seed(t, [{ name: 'The Editors', propertyId: null }]);
      const token = signToken(app, t);
      const shared = await withTenant({ tenantId: t.tenantId }, (tx) =>
        tx.author.findFirst({ where: { slug: 'the-editors' }, select: { id: true } })
      );

      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/authors/${shared?.id ?? ''}`,
        headers: { ...authHeader(token), 'x-sparx-property-id': press },
        payload: { bio: 'The people who put this together.' },
      });

      expect(res.statusCode).toBe(200);
      // Editing the bio must not quietly claim the byline for the site doing it.
      expect(res.json().data.property_id).toBeNull();
    } finally {
      await app.close();
      await dropTestTenant(t.tenantId);
    }
  });
});
