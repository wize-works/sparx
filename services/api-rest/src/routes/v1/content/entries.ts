// Content entries CRUD + list.
//
//   GET    /v1/content/entries                 → list (filterable, cursor-paged)
//   POST   /v1/content/entries                 → create draft
//   GET    /v1/content/entries/:id             → fetch one
//   PATCH  /v1/content/entries/:id             → update; creates autosave revision
//   DELETE /v1/content/entries/:id             → soft delete
//
// Publish / preview-token / revisions routes live alongside this file —
// they share the same lib/entries.ts helpers (recordRevision,
// syncReferences, serialize*).

import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@sparx/db';

// Prisma's `Json` columns want InputJsonValue, which the runtime accepts
// any plain object for but the TypeScript type doesn't widen from
// `Record<string, unknown>`. Validated body/seo come out of `validateAnd
// NormalizeBody` so we know they're JSON-safe; cast at the assign site.
type Json = Prisma.InputJsonValue;
import { z } from 'zod';
import { withRequestTenant } from '@sparx/api-core/db';
import { ok, paged } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import {
  parseTypeSchema,
  resolveType,
  validateAndNormalizeBody,
} from '@sparx/api-core/content-types';
import { recordRevision, serializeEntry, syncReferences } from '@sparx/api-core/entries';
import { writeAudit } from '@sparx/api-core/audit';
import { publish } from '@sparx/api-core/pubsub';
import { slugify, uniqueSlug } from '@sparx/api-core/slug';
import { conflict, notFound } from '@sparx/api-core/errors';

const SeoSchema = z
  .object({
    title: z.string().max(255).optional(),
    description: z.string().max(500).optional(),
    // Canonical accepts any absolute or relative URL up to 2048 chars.
    // Strict `.url()` would reject `/foo/bar` (relative), which is a
    // legitimate canonical for same-origin de-duplication.
    canonical: z.string().max(2048).optional(),
    robots: z.string().max(120).optional(),
    // OG image lives as a MediaAsset UUID *or* an absolute URL (in case
    // the merchant pastes a CDN URL from outside the media library).
    ogImage: z.string().max(2048).optional(),
    jsonLdOverride: z.unknown().optional(),
  })
  .strict()
  .partial();

const CreateBody = z.object({
  type_key: z.string().min(1).max(63),
  slug: z.string().min(1).max(255).optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'archived']).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  seo: SeoSchema.optional(),
  author_id: z.string().uuid().optional(),
  locale_code: z.string().max(10).optional(),
});

const UpdateBody = z.object({
  slug: z.string().min(1).max(255).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
  seo: SeoSchema.optional(),
  author_id: z.string().uuid().nullable().optional(),
  locale_code: z.string().max(10).nullable().optional(),
});

const ListQuery = z.object({
  type: z.string().max(63).optional(),
  status: z.enum(['draft', 'scheduled', 'published', 'archived']).optional(),
  slug: z.string().max(255).optional(),
  q: z.string().max(255).optional(),
  author: z.string().uuid().optional(),
  locale: z.string().max(10).optional(),
  updated_after: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
});

const PathId = z.object({ id: z.string().uuid() });

const entryRoutes: FastifyPluginAsync = (app) => {
  // ──────────────────────────────────────────────────────────────────────
  // LIST
  // ──────────────────────────────────────────────────────────────────────

  app.get('/v1/content/entries', async (request) => {
    requireRole(request, 'viewer');
    const q = ListQuery.parse(request.query);

    const where: Prisma.ContentEntryWhereInput = {
      deletedAt: null,
      ...(q.type ? { typeKey: q.type } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.slug ? { slug: q.slug } : {}),
      ...(q.author ? { authorId: q.author } : {}),
      ...(q.locale ? { localeCode: q.locale } : {}),
      ...(q.updated_after ? { updatedAt: { gt: new Date(q.updated_after) } } : {}),
      ...(q.q
        ? {
            OR: [
              { slug: { contains: q.q, mode: 'insensitive' } },
              // Body title search via JSONB ->>'title'. Postgres can index
              // this with a GIN expression index — added when search load
              // demands it (Phase 4 puts the full-text path on Typesense).
              { body: { path: ['title'], string_contains: q.q } },
            ],
          }
        : {}),
    };

    const rows = await withRequestTenant(request, (tx) =>
      tx.contentEntry.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      })
    );

    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    return paged(page.map(serializeEntry), { per_page: q.limit, next_cursor: nextCursor });
  });

  // ──────────────────────────────────────────────────────────────────────
  // GET ONE
  // ──────────────────────────────────────────────────────────────────────

  app.get('/v1/content/entries/:id', async (request) => {
    requireRole(request, 'viewer');
    const { id } = PathId.parse(request.params);
    const row = await withRequestTenant(request, (tx) =>
      tx.contentEntry.findFirst({ where: { id, deletedAt: null } })
    );
    if (!row) throw notFound('Entry', id);
    return ok(serializeEntry(row));
  });

  // ──────────────────────────────────────────────────────────────────────
  // CREATE
  // ──────────────────────────────────────────────────────────────────────

  app.post('/v1/content/entries', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const input = CreateBody.parse(request.body);

    const created = await withRequestTenant(request, async (tx) => {
      const type = await resolveType(tx, input.type_key);
      const schema = parseTypeSchema(type);
      const body = validateAndNormalizeBody(schema, input.body ?? {});
      const seo = (input.seo ?? {}) as Record<string, unknown>;

      // Slug: an explicitly-supplied slug is honoured verbatim — collision
      // is a 409 the caller can show. A derived slug (from body.title) is
      // auto-uniquified with -2 / -3 / … so the title-only "happy path"
      // never punches the user in the face.
      const candidateBase = input.slug
        ? slugify(input.slug)
        : slugify((body.title as string) ?? '');
      let slug: string | null = null;
      if (type.urlPattern) {
        if (!candidateBase) {
          throw conflict('A slug is required for routable content types.');
        }
        if (input.slug) {
          const collision = await tx.contentEntry.findFirst({
            where: { typeKey: type.key, slug: candidateBase, deletedAt: null },
            select: { id: true },
          });
          if (collision) {
            throw conflict(
              `A ${type.name.toLowerCase()} with slug "${candidateBase}" already exists.`
            );
          }
          slug = candidateBase;
        } else {
          slug = await uniqueSlug(candidateBase, async (s) => {
            const collision = await tx.contentEntry.findFirst({
              where: { typeKey: type.key, slug: s, deletedAt: null },
              select: { id: true },
            });
            return collision !== null;
          });
        }
      } else if (input.slug) {
        slug = slugify(input.slug);
      }

      const entry = await tx.contentEntry.create({
        data: {
          tenantId: auth.tenantId,
          typeKey: type.key,
          slug,
          status: input.status ?? 'draft',
          body: body as Json,
          seoJson: seo as Json,
          authorId: input.author_id ?? null,
          localeCode: input.locale_code ?? null,
        },
      });

      await syncReferences(tx, auth.tenantId, entry.id, schema, body);
      await recordRevision(tx, {
        tenantId: auth.tenantId,
        entryId: entry.id,
        body,
        seoJson: seo,
        status: entry.status,
        kind: 'manual',
        authorId: auth.actorId,
        summary: 'Initial revision',
      });
      await writeAudit(tx, request, auth, {
        action: 'content.entry.created',
        entityType: 'content_entry',
        entityId: entry.id,
        after: { typeKey: entry.typeKey, slug: entry.slug, status: entry.status },
      });

      return entry;
    });

    await publish(request.log, 'content.entry.created', auth.tenantId, auth.actorId, {
      entryId: created.id,
      typeKey: created.typeKey,
      slug: created.slug,
      status: created.status,
    });

    reply.code(201);
    return ok(serializeEntry(created));
  });

  // ──────────────────────────────────────────────────────────────────────
  // UPDATE
  // ──────────────────────────────────────────────────────────────────────

  app.patch('/v1/content/entries/:id', async (request) => {
    const auth = requireRole(request, 'editor');
    const { id } = PathId.parse(request.params);
    const input = UpdateBody.parse(request.body);

    const updated = await withRequestTenant(request, async (tx) => {
      const existing = await tx.contentEntry.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw notFound('Entry', id);

      const type = await resolveType(tx, existing.typeKey);
      const schema = parseTypeSchema(type);

      const nextBody =
        input.body !== undefined
          ? validateAndNormalizeBody(schema, input.body)
          : ((existing.body ?? {}) as Record<string, unknown>);
      const nextSeo =
        input.seo !== undefined
          ? ((input.seo ?? {}) as Record<string, unknown>)
          : ((existing.seoJson ?? {}) as Record<string, unknown>);

      // Slug update — only allowed for types with a urlPattern, and only
      // if the new slug is free.
      let nextSlug = existing.slug;
      if (input.slug !== undefined && type.urlPattern) {
        const candidate = slugify(input.slug);
        if (candidate !== existing.slug) {
          const collision = await tx.contentEntry.findFirst({
            where: { typeKey: type.key, slug: candidate, NOT: { id }, deletedAt: null },
            select: { id: true },
          });
          if (collision) throw conflict(`Slug "${candidate}" is already in use.`);
          nextSlug = candidate;
        }
      }

      const after = await tx.contentEntry.update({
        where: { id },
        data: {
          slug: nextSlug,
          body: nextBody as Json,
          seoJson: nextSeo as Json,
          authorId: input.author_id === undefined ? existing.authorId : input.author_id,
          localeCode: input.locale_code === undefined ? existing.localeCode : input.locale_code,
          updatedAt: new Date(),
        },
      });

      await syncReferences(tx, auth.tenantId, after.id, schema, nextBody);
      await recordRevision(tx, {
        tenantId: auth.tenantId,
        entryId: after.id,
        body: nextBody,
        seoJson: nextSeo,
        status: after.status,
        kind: 'autosave',
        authorId: auth.actorId,
      });
      await writeAudit(tx, request, auth, {
        action: 'content.entry.updated',
        entityType: 'content_entry',
        entityId: after.id,
        before: { slug: existing.slug, status: existing.status },
        after: { slug: after.slug, status: after.status },
      });

      return after;
    });

    await publish(request.log, 'content.entry.updated', auth.tenantId, auth.actorId, {
      entryId: updated.id,
      typeKey: updated.typeKey,
    });

    return ok(serializeEntry(updated));
  });

  // ──────────────────────────────────────────────────────────────────────
  // DELETE (soft)
  // ──────────────────────────────────────────────────────────────────────

  app.delete('/v1/content/entries/:id', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const { id } = PathId.parse(request.params);

    await withRequestTenant(request, async (tx) => {
      const existing = await tx.contentEntry.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw notFound('Entry', id);

      await tx.contentEntry.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await writeAudit(tx, request, auth, {
        action: 'content.entry.deleted',
        entityType: 'content_entry',
        entityId: id,
        before: { slug: existing.slug, status: existing.status },
      });
    });

    await publish(request.log, 'content.entry.deleted', auth.tenantId, auth.actorId, {
      entryId: id,
    });

    reply.code(204);
  });
  return Promise.resolve();
};

export default entryRoutes;
