// GET    /v1/content/types          → list every content type the tenant can use
// GET    /v1/content/types/:key     → fetch one
// POST   /v1/content/types          → create a tenant-custom type
// PATCH  /v1/content/types/:key     → update a tenant-custom type (built-ins are read-only)
// DELETE /v1/content/types/:key     → remove a tenant-custom type (built-ins are read-only)
//
// Custom-type schemas are validated against the FieldDef union from
// @sparx/cms-schemas — the same validator that's used at entry write
// time, so a schema can never persist in a shape the body validator
// won't accept.

import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@sparx/db';
import { z } from 'zod';
import { ok } from '@sparx/api-core/envelope';
import { withRequestTenant } from '@sparx/api-core/db';
import { requireAuth, requireRole } from '@sparx/api-core/auth';
import { conflict, notFound } from '@sparx/api-core/errors';
import { ContentTypeSchema } from '@sparx/cms-schemas';
import { writeAudit } from '@sparx/api-core/audit';
import { publish } from '@sparx/api-core/pubsub';

type Json = Prisma.InputJsonValue;

const KeyParams = z.object({ key: z.string().min(1).max(63) });

const KeySchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z][a-z0-9_]*$/, 'Key must be lowercase letters, numbers, and underscores.');

const CreateBody = z.object({
  key: KeySchema,
  name: z.string().min(1).max(120),
  plural_name: z.string().min(1).max(120),
  description: z.string().max(2048).optional(),
  icon: z.string().max(60).optional(),
  url_pattern: z.string().max(255).optional(),
  is_singleton: z.boolean().optional(),
  schema: ContentTypeSchema,
});

const UpdateBody = z.object({
  name: z.string().min(1).max(120).optional(),
  plural_name: z.string().min(1).max(120).optional(),
  description: z.string().max(2048).nullable().optional(),
  icon: z.string().max(60).nullable().optional(),
  url_pattern: z.string().max(255).nullable().optional(),
  is_singleton: z.boolean().optional(),
  schema: ContentTypeSchema.optional(),
});

const contentTypeRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/content/types', async (request) => {
    requireAuth(request);
    const rows = await withRequestTenant(request, (tx) =>
      tx.contentType.findMany({
        orderBy: [{ isBuiltIn: 'asc' }, { key: 'asc' }],
      })
    );
    return ok(rows);
  });

  app.get('/v1/content/types/:key', async (request) => {
    requireAuth(request);
    const { key } = KeyParams.parse(request.params);
    const row = await withRequestTenant(request, (tx) =>
      tx.contentType.findFirst({
        where: { key },
        orderBy: [{ isBuiltIn: 'asc' }, { updatedAt: 'desc' }],
      })
    );
    if (!row) throw notFound('Content type', key);
    return ok(row);
  });

  app.post('/v1/content/types', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const input = CreateBody.parse(request.body);

    const created = await withRequestTenant(request, async (tx) => {
      // Collide against any existing row in the tenant scope OR any
      // built-in with the same key — built-ins are nominally tenantId
      // NULL but RLS still surfaces them.
      const collision = await tx.contentType.findFirst({ where: { key: input.key } });
      if (collision) {
        throw conflict(`A content type with key "${input.key}" already exists.`);
      }
      const row = await tx.contentType.create({
        data: {
          tenantId: auth.tenantId,
          key: input.key,
          name: input.name,
          pluralName: input.plural_name,
          description: input.description ?? null,
          icon: input.icon ?? null,
          urlPattern: input.url_pattern ?? null,
          isSingleton: input.is_singleton ?? false,
          isBuiltIn: false,
          schemaJson: input.schema,
        },
      });
      await writeAudit(tx, request, auth, {
        action: 'content_type.upserted',
        entityType: 'content_type',
        entityId: row.id,
        after: { key: row.key, name: row.name },
      });
      return row;
    });
    await publish(request.log, 'content_type.upserted', auth.tenantId, auth.actorId, {
      typeKey: created.key,
    });
    reply.code(201);
    return ok(created);
  });

  app.patch('/v1/content/types/:key', async (request) => {
    const auth = requireRole(request, 'editor');
    const { key } = KeyParams.parse(request.params);
    const input = UpdateBody.parse(request.body);

    const updated = await withRequestTenant(request, async (tx) => {
      const existing = await tx.contentType.findFirst({ where: { key, isBuiltIn: false } });
      if (!existing) throw notFound('Custom content type', key);

      const row = await tx.contentType.update({
        where: { id: existing.id },
        data: {
          name: input.name ?? existing.name,
          pluralName: input.plural_name ?? existing.pluralName,
          description: input.description === undefined ? existing.description : input.description,
          icon: input.icon === undefined ? existing.icon : input.icon,
          urlPattern: input.url_pattern === undefined ? existing.urlPattern : input.url_pattern,
          isSingleton: input.is_singleton ?? existing.isSingleton,
          schemaJson:
            input.schema === undefined ? (existing.schemaJson as Json) : (input.schema as Json),
        },
      });
      await writeAudit(tx, request, auth, {
        action: 'content_type.upserted',
        entityType: 'content_type',
        entityId: row.id,
        before: { name: existing.name },
        after: { name: row.name },
      });
      return row;
    });
    await publish(request.log, 'content_type.upserted', auth.tenantId, auth.actorId, {
      typeKey: updated.key,
    });
    return ok(updated);
  });

  app.delete('/v1/content/types/:key', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const { key } = KeyParams.parse(request.params);
    await withRequestTenant(request, async (tx) => {
      const existing = await tx.contentType.findFirst({ where: { key, isBuiltIn: false } });
      if (!existing) throw notFound('Custom content type', key);
      // Reject deletion when entries still reference the type — the
      // ContentEntry rows would orphan otherwise.
      const inUse = await tx.contentEntry.count({
        where: { typeKey: key, deletedAt: null },
      });
      if (inUse > 0) {
        throw conflict(
          `Cannot delete "${key}" — ${inUse} entr${inUse === 1 ? 'y' : 'ies'} still use it. Archive the entries first.`
        );
      }
      await tx.contentType.delete({ where: { id: existing.id } });
      await writeAudit(tx, request, auth, {
        action: 'content_type.deleted',
        entityType: 'content_type',
        entityId: existing.id,
        before: { key: existing.key, name: existing.name },
      });
    });
    reply.code(204);
    return;
  });

  return Promise.resolve();
};

export default contentTypeRoutes;
