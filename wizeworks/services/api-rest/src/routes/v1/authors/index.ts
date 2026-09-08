// Authors.
//
//   GET    /v1/authors                  → list
//   POST   /v1/authors                  → create
//   GET    /v1/authors/:id              → fetch one
//   PATCH  /v1/authors/:id              → update
//   DELETE /v1/authors/:id              → soft? no — hard delete; entries
//                                          authorId is SetNull on cascade.
//
// Author rows are CMS-side identities distinct from User. One user can
// publish under multiple author names; an author can outlive the user row.
// Slug is unique per-tenant so external URL patterns like
// /blog/by/{author.slug} resolve deterministically.
//
// SITE SCOPE. A byline belongs to the publication it writes for
// (`Author.propertyId`, docs/131 §4), and the model says why in as many words:
//
//   An author is a PUBLIC PERSONA, not a login … The same person can write as
//   "Bob, master machinist" on one site and under a plain name on another, and
//   neither byline (nor its bio and avatar) belongs in the other publication's
//   author picker.
//
// The column shipped with migration 20261227, and its index
// `@@index([tenantId, propertyId])` shipped with it — for a query nothing in
// this file used to make. Every read here was tenant-wide, so a clothing maker
// with seven sites opened Authors on her shop and read nine strangers: the
// mastheads of two magazine designs installed on two OTHER sites. The same list
// feeds the content editor's byline picker, which is where it stopped being
// cosmetic — those nine were the only names she could put on her own writing
// (issue 387).
//
// Null means EVERY site, and that is a real editorial arrangement (one masthead
// across a family of publications), so every read here is two-tier: this site's
// bylines plus the shared ones.
//
// Slug uniqueness stays per TENANT by deliberate design — the slug is a URL
// segment, and letting two sites both own `/authors/jane` reintroduces exactly
// the ambiguity a slug exists to remove. The consequence is that a clash can now
// be with a byline the writer cannot see, so the refusal has to name the site.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@wizeworks/db';
import { withRequestTenant } from '@wizeworks/api-core/db';
import { ok, paged } from '@wizeworks/api-core/envelope';
import { requireRole } from '@wizeworks/api-core/auth';
import { conflict, notFound } from '@wizeworks/api-core/errors';
import { slugify } from '@wizeworks/api-core/slug';
import { writeAudit } from '@wizeworks/api-core/audit';
import { requireTenantProperty, resolveListScope, type SiteActor } from '../../../lib/property.js';

const PathId = z.object({ id: z.string().uuid() });

const ListQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  // A site id, or `all` for every site this member may reach (docs/131 §3.3).
  property: z.string().min(1).max(64).optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

const CreateBody = z.object({
  display_name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).optional(),
  bio: z.string().max(8192).optional(),
  user_id: z.string().uuid().optional(),
  avatar_asset_id: z.string().uuid().optional(),
  // Omitted → the site being worked in. Only an EXPLICIT null makes the byline
  // shared, the same contract redirects and quick replies use: defaulting the
  // other way is what put one publication's masthead in another's picker.
  property_id: z.string().uuid().nullable().optional(),
});

const UpdateBody = z.object({
  display_name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).optional(),
  bio: z.string().max(8192).nullable().optional(),
  user_id: z.string().uuid().nullable().optional(),
  avatar_asset_id: z.string().uuid().nullable().optional(),
  /** null shares the byline with every site; undefined leaves it where it is. */
  property_id: z.string().uuid().nullable().optional(),
});

interface WireAuthor {
  id: string;
  slug: string;
  display_name: string;
  bio: string | null;
  user_id: string | null;
  avatar_asset_id: string | null;
  /** The site this byline writes for, or null for every site. */
  property_id: string | null;
  created_at: string;
  updated_at: string;
}

function serialize(row: {
  id: string;
  slug: string;
  displayName: string;
  bio: string | null;
  userId: string | null;
  avatarAssetId: string | null;
  propertyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): WireAuthor {
  return {
    id: row.id,
    slug: row.slug,
    display_name: row.displayName,
    bio: row.bio,
    user_id: row.userId,
    avatar_asset_id: row.avatarAssetId,
    property_id: row.propertyId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** Bylines visible on one site: its own, plus the ones that write for every site.
 *
 *  `OR` rather than `in: [id, null]` — Prisma's `in` rejects null even on a
 *  nullable column, the same note `lib/ai/tool-policy.ts` carries. Exported so a
 *  test can assert the predicate directly rather than re-deriving it. */
export function authorsOnSite(propertyId: string | undefined): Prisma.AuthorWhereInput {
  return propertyId ? { OR: [{ propertyId }, { propertyId: null }] } : {};
}

/**
 * The site a write lands on. Omitted → where the caller is standing; an explicit
 * null → every site. An explicit id is validated against the tenant's own sites,
 * because a silent fall-back would file a byline under a publication the writer
 * never named.
 */
async function writeScope(
  auth: SiteActor,
  requested: string | null | undefined,
  active: string | undefined
): Promise<string | null> {
  if (requested === null) return null;
  if (requested !== undefined) return requireTenantProperty(auth, requested);
  return active ?? null;
}

/** The refusal for a taken web address. Uniqueness is per TENANT (see the header),
 *  so the byline this clashes with may well be on a site the writer cannot see
 *  from here — and "already in use" would leave her staring at a list that
 *  plainly does not contain the name. Name the publication that holds it. */
function slugTaken(
  taken: { displayName: string; propertyId: string | null; property: { name: string } | null },
  slug: string,
  here: string | undefined
): never {
  const elsewhere = here && taken.propertyId && taken.propertyId !== here;
  throw conflict(
    elsewhere
      ? `${taken.displayName} on ${taken.property?.name ?? 'another of your sites'} already uses the web address “${slug}”, and an author's address has to be unique across your whole business. Give this one a different one.`
      : `“${slug}” is already the web address of another author. Give this one a different one.`
  );
}

const authorRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/authors', async (request) => {
    const auth = requireRole(request, 'viewer');
    const q = ListQuery.parse(request.query);
    // This site's bylines plus the shared ones — a management list, so both
    // tiers show: a writer needs to see the shared name that will appear here,
    // not only the ones written for this publication.
    const propertyId = await resolveListScope(
      auth,
      q.property,
      request.headers['x-sparx-property-id']
    );
    const scope = authorsOnSite(propertyId);
    // AND, not a merged OR — the scope is itself an OR, and spreading the search
    // terms alongside it would let a name match on ANOTHER site's byline satisfy
    // the whole predicate, quietly undoing the scope for anyone who typed.
    const where: Prisma.AuthorWhereInput = q.q
      ? {
          AND: [
            scope,
            {
              OR: [
                { displayName: { contains: q.q, mode: 'insensitive' } },
                { slug: { contains: q.q, mode: 'insensitive' } },
                { bio: { contains: q.q, mode: 'insensitive' } },
              ],
            },
          ],
        }
      : scope;
    const [rows, total] = await withRequestTenant(request, (tx) =>
      Promise.all([
        tx.author.findMany({
          where,
          orderBy: { displayName: 'asc' },
          take: Math.min(q.take ?? 50, 250),
          skip: q.skip ?? 0,
        }),
        tx.author.count({ where }),
      ])
    );
    return paged(rows.map(serialize), { total, per_page: q.take ?? 50 });
  });

  app.get('/v1/authors/:id', async (request) => {
    const auth = requireRole(request, 'viewer');
    const { id } = PathId.parse(request.params);
    const propertyId = await resolveListScope(
      auth,
      undefined,
      request.headers['x-sparx-property-id']
    );
    const row = await withRequestTenant(request, (tx) =>
      tx.author.findFirst({ where: { id, ...authorsOnSite(propertyId) } })
    );
    if (!row) throw notFound('Author', id);
    return ok(serialize(row));
  });

  app.post('/v1/authors', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const input = CreateBody.parse(request.body);
    const slug = slugify(input.slug ?? input.display_name);
    if (!slug) throw conflict('Display name must contain letters or numbers.');
    const active = await resolveListScope(auth, undefined, request.headers['x-sparx-property-id']);
    const propertyId = await writeScope(auth, input.property_id, active);

    const created = await withRequestTenant(request, async (tx) => {
      const existing = await tx.author.findFirst({
        where: { slug },
        select: { displayName: true, propertyId: true, property: { select: { name: true } } },
      });
      if (existing) slugTaken(existing, slug, propertyId ?? active);
      const row = await tx.author.create({
        data: {
          tenantId: auth.tenantId,
          propertyId,
          slug,
          displayName: input.display_name,
          bio: input.bio ?? null,
          userId: input.user_id ?? null,
          avatarAssetId: input.avatar_asset_id ?? null,
        },
      });
      await writeAudit(tx, request, auth, {
        action: 'author.created',
        entityType: 'author',
        entityId: row.id,
        after: { slug: row.slug, displayName: row.displayName, propertyId: row.propertyId },
      });
      return row;
    });

    reply.code(201);
    return ok(serialize(created));
  });

  app.patch('/v1/authors/:id', async (request) => {
    const auth = requireRole(request, 'editor');
    const { id } = PathId.parse(request.params);
    const input = UpdateBody.parse(request.body);
    const active = await resolveListScope(auth, undefined, request.headers['x-sparx-property-id']);
    // Resolved OUTSIDE the transaction: `requireTenantProperty` opens its own
    // tenant connection, and nesting one inside `withRequestTenant` deadlocks
    // against a pool of one on a busy dev box.
    const moveTo =
      input.property_id === undefined
        ? undefined
        : await writeScope(auth, input.property_id, active);

    const updated = await withRequestTenant(request, async (tx) => {
      // Scoped: another publication's byline is not editable from here, and
      // reports as missing rather than forbidden — the same rule the rest of
      // docs/131 follows, so an error cannot enumerate a business's sites.
      const existing = await tx.author.findFirst({ where: { id, ...authorsOnSite(active) } });
      if (!existing) throw notFound('Author', id);

      let nextSlug = existing.slug;
      if (input.slug !== undefined) {
        const candidate = slugify(input.slug);
        if (candidate !== existing.slug) {
          const collision = await tx.author.findFirst({
            where: { slug: candidate, NOT: { id } },
            select: { displayName: true, propertyId: true, property: { select: { name: true } } },
          });
          if (collision) slugTaken(collision, candidate, active);
          nextSlug = candidate;
        }
      }

      const row = await tx.author.update({
        where: { id },
        data: {
          slug: nextSlug,
          displayName: input.display_name ?? existing.displayName,
          bio: input.bio === undefined ? existing.bio : input.bio,
          userId: input.user_id === undefined ? existing.userId : input.user_id,
          avatarAssetId:
            input.avatar_asset_id === undefined ? existing.avatarAssetId : input.avatar_asset_id,
          // Undefined leaves the byline where it is. An explicit value moves it,
          // which is the only way to put one person's name on every site — a
          // copy per site is impossible, since the slug is unique per tenant.
          propertyId: moveTo === undefined ? existing.propertyId : moveTo,
        },
      });
      await writeAudit(tx, request, auth, {
        action: 'author.updated',
        entityType: 'author',
        entityId: row.id,
        before: {
          slug: existing.slug,
          displayName: existing.displayName,
          propertyId: existing.propertyId,
        },
        after: { slug: row.slug, displayName: row.displayName, propertyId: row.propertyId },
      });
      return row;
    });
    return ok(serialize(updated));
  });

  app.delete('/v1/authors/:id', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const { id } = PathId.parse(request.params);
    const active = await resolveListScope(auth, undefined, request.headers['x-sparx-property-id']);
    await withRequestTenant(request, async (tx) => {
      const existing = await tx.author.findFirst({ where: { id, ...authorsOnSite(active) } });
      if (!existing) throw notFound('Author', id);
      // Cascade rule on ContentEntry.authorId is SetNull at the FK, so we
      // can hard-delete here without orphaning entries.
      await tx.author.delete({ where: { id } });
      await writeAudit(tx, request, auth, {
        action: 'author.deleted',
        entityType: 'author',
        entityId: id,
        before: { slug: existing.slug, displayName: existing.displayName },
      });
    });
    reply.code(204);
    return;
  });

  return Promise.resolve();
};

export default authorRoutes;
