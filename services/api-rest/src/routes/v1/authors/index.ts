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

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withRequestTenant } from '@sparx/api-core/db';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { conflict, notFound } from '@sparx/api-core/errors';
import { slugify } from '@sparx/api-core/slug';
import { writeAudit } from '@sparx/api-core/audit';

const PathId = z.object({ id: z.string().uuid() });

const CreateBody = z.object({
  display_name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).optional(),
  bio: z.string().max(8192).optional(),
  user_id: z.string().uuid().optional(),
  avatar_asset_id: z.string().uuid().optional(),
});

const UpdateBody = z.object({
  display_name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).optional(),
  bio: z.string().max(8192).nullable().optional(),
  user_id: z.string().uuid().nullable().optional(),
  avatar_asset_id: z.string().uuid().nullable().optional(),
});

interface WireAuthor {
  id: string;
  slug: string;
  display_name: string;
  bio: string | null;
  user_id: string | null;
  avatar_asset_id: string | null;
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
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

const authorRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/authors', async (request) => {
    requireRole(request, 'viewer');
    const rows = await withRequestTenant(request, (tx) =>
      tx.author.findMany({ orderBy: { displayName: 'asc' } })
    );
    return ok(rows.map(serialize));
  });

  app.get('/v1/authors/:id', async (request) => {
    requireRole(request, 'viewer');
    const { id } = PathId.parse(request.params);
    const row = await withRequestTenant(request, (tx) => tx.author.findUnique({ where: { id } }));
    if (!row) throw notFound('Author', id);
    return ok(serialize(row));
  });

  app.post('/v1/authors', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const input = CreateBody.parse(request.body);
    const slug = slugify(input.slug ?? input.display_name);
    if (!slug) throw conflict('Display name must contain letters or numbers.');

    const created = await withRequestTenant(request, async (tx) => {
      const existing = await tx.author.findFirst({ where: { slug } });
      if (existing) throw conflict(`An author with slug "${slug}" already exists.`);
      const row = await tx.author.create({
        data: {
          tenantId: auth.tenantId,
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
        after: { slug: row.slug, displayName: row.displayName },
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

    const updated = await withRequestTenant(request, async (tx) => {
      const existing = await tx.author.findUnique({ where: { id } });
      if (!existing) throw notFound('Author', id);

      let nextSlug = existing.slug;
      if (input.slug !== undefined) {
        const candidate = slugify(input.slug);
        if (candidate !== existing.slug) {
          const collision = await tx.author.findFirst({
            where: { slug: candidate, NOT: { id } },
            select: { id: true },
          });
          if (collision) throw conflict(`Slug "${candidate}" is already in use.`);
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
        },
      });
      await writeAudit(tx, request, auth, {
        action: 'author.updated',
        entityType: 'author',
        entityId: row.id,
        before: { slug: existing.slug, displayName: existing.displayName },
        after: { slug: row.slug, displayName: row.displayName },
      });
      return row;
    });
    return ok(serialize(updated));
  });

  app.delete('/v1/authors/:id', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const { id } = PathId.parse(request.params);
    await withRequestTenant(request, async (tx) => {
      const existing = await tx.author.findUnique({ where: { id } });
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
