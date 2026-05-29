// Taxonomies + terms.
//
//   GET    /v1/taxonomies                       → list taxonomies
//   POST   /v1/taxonomies                       → create taxonomy
//   PATCH  /v1/taxonomies/:key                  → update taxonomy
//   DELETE /v1/taxonomies/:key                  → delete + cascade
//
//   GET    /v1/taxonomies/:key/terms            → list terms (hierarchical)
//   POST   /v1/taxonomies/:key/terms            → create term
//   PATCH  /v1/taxonomies/:key/terms/:id        → update term
//   DELETE /v1/taxonomies/:key/terms/:id        → delete term
//
// Terms can be hierarchical when the taxonomy has hierarchical=true; we
// don't enforce hierarchy at the API beyond preventing self-parent loops.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withRequestTenant } from '@sparx/api-core/db';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { conflict, notFound } from '@sparx/api-core/errors';
import { slugify } from '@sparx/api-core/slug';

const KeyParams = z.object({ key: z.string().min(1).max(63) });
const TermPath = z.object({
  key: z.string().min(1).max(63),
  id: z.string().uuid(),
});

const TaxonomyKeySchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z][a-z0-9_]*$/, 'Key must be lowercase letters, numbers, and underscores.');

const CreateTaxonomy = z.object({
  key: TaxonomyKeySchema,
  name: z.string().min(1).max(120),
  plural_name: z.string().min(1).max(120),
  hierarchical: z.boolean().optional(),
});

const UpdateTaxonomy = z.object({
  name: z.string().min(1).max(120).optional(),
  plural_name: z.string().min(1).max(120).optional(),
  hierarchical: z.boolean().optional(),
});

const CreateTerm = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().max(255).optional(),
  description: z.string().max(8192).optional(),
  parent_term_id: z.string().uuid().nullable().optional(),
});

const UpdateTerm = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).optional(),
  description: z.string().max(8192).nullable().optional(),
  parent_term_id: z.string().uuid().nullable().optional(),
});

const taxonomyRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/taxonomies', async (request) => {
    requireRole(request, 'viewer');
    const rows = await withRequestTenant(request, (tx) =>
      tx.taxonomy.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { terms: true } } },
      })
    );
    return ok(
      rows.map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        plural_name: t.pluralName,
        hierarchical: t.hierarchical,
        term_count: t._count.terms,
        created_at: t.createdAt.toISOString(),
        updated_at: t.updatedAt.toISOString(),
      }))
    );
  });

  app.post('/v1/taxonomies', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    const input = CreateTaxonomy.parse(request.body);
    const created = await withRequestTenant(request, async (tx) => {
      const existing = await tx.taxonomy.findFirst({ where: { key: input.key } });
      if (existing) throw conflict(`Taxonomy "${input.key}" already exists.`);
      return tx.taxonomy.create({
        data: {
          tenantId: auth.tenantId,
          key: input.key,
          name: input.name,
          pluralName: input.plural_name,
          hierarchical: input.hierarchical ?? false,
        },
      });
    });
    reply.code(201);
    return ok({
      id: created.id,
      key: created.key,
      name: created.name,
      plural_name: created.pluralName,
      hierarchical: created.hierarchical,
    });
  });

  app.patch('/v1/taxonomies/:key', async (request) => {
    requireRole(request, 'editor');
    const { key } = KeyParams.parse(request.params);
    const input = UpdateTaxonomy.parse(request.body);
    const updated = await withRequestTenant(request, async (tx) => {
      const existing = await tx.taxonomy.findFirst({ where: { key } });
      if (!existing) throw notFound('Taxonomy', key);
      return tx.taxonomy.update({
        where: { id: existing.id },
        data: {
          name: input.name ?? existing.name,
          pluralName: input.plural_name ?? existing.pluralName,
          hierarchical: input.hierarchical ?? existing.hierarchical,
        },
      });
    });
    return ok({
      id: updated.id,
      key: updated.key,
      name: updated.name,
      plural_name: updated.pluralName,
      hierarchical: updated.hierarchical,
    });
  });

  app.delete('/v1/taxonomies/:key', async (request, reply) => {
    requireRole(request, 'editor');
    const { key } = KeyParams.parse(request.params);
    await withRequestTenant(request, async (tx) => {
      const existing = await tx.taxonomy.findFirst({ where: { key } });
      if (!existing) throw notFound('Taxonomy', key);
      await tx.taxonomy.delete({ where: { id: existing.id } });
    });
    reply.code(204);
    return;
  });

  // ─── Terms ──────────────────────────────────────────────────────────────

  app.get('/v1/taxonomies/:key/terms', async (request) => {
    requireRole(request, 'viewer');
    const { key } = KeyParams.parse(request.params);
    const rows = await withRequestTenant(request, async (tx) => {
      const taxonomy = await tx.taxonomy.findFirst({ where: { key } });
      if (!taxonomy) throw notFound('Taxonomy', key);
      return tx.taxonomyTerm.findMany({
        where: { taxonomyId: taxonomy.id },
        orderBy: { name: 'asc' },
      });
    });
    return ok(
      rows.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        description: t.description,
        parent_term_id: t.parentTermId,
      }))
    );
  });

  app.post('/v1/taxonomies/:key/terms', async (request, reply) => {
    requireRole(request, 'editor');
    const { key } = KeyParams.parse(request.params);
    const input = CreateTerm.parse(request.body);
    const slug = slugify(input.slug ?? input.name);
    if (!slug) throw conflict('Name must contain letters or numbers.');

    const created = await withRequestTenant(request, async (tx) => {
      const taxonomy = await tx.taxonomy.findFirst({ where: { key } });
      if (!taxonomy) throw notFound('Taxonomy', key);
      const collision = await tx.taxonomyTerm.findFirst({
        where: { taxonomyId: taxonomy.id, slug },
      });
      if (collision) throw conflict(`Slug "${slug}" already exists in "${key}".`);
      if (input.parent_term_id) {
        const parent = await tx.taxonomyTerm.findFirst({
          where: { id: input.parent_term_id, taxonomyId: taxonomy.id },
        });
        if (!parent) throw notFound('Parent term', input.parent_term_id);
      }
      return tx.taxonomyTerm.create({
        data: {
          tenantId: taxonomy.tenantId,
          taxonomyId: taxonomy.id,
          parentTermId: input.parent_term_id ?? null,
          slug,
          name: input.name,
          description: input.description ?? null,
        },
      });
    });
    reply.code(201);
    return ok({
      id: created.id,
      slug: created.slug,
      name: created.name,
      description: created.description,
      parent_term_id: created.parentTermId,
    });
  });

  app.patch('/v1/taxonomies/:key/terms/:id', async (request) => {
    requireRole(request, 'editor');
    const { key, id } = TermPath.parse(request.params);
    const input = UpdateTerm.parse(request.body);

    const updated = await withRequestTenant(request, async (tx) => {
      const taxonomy = await tx.taxonomy.findFirst({ where: { key } });
      if (!taxonomy) throw notFound('Taxonomy', key);
      const existing = await tx.taxonomyTerm.findFirst({
        where: { id, taxonomyId: taxonomy.id },
      });
      if (!existing) throw notFound('Term', id);

      let nextSlug = existing.slug;
      if (input.slug !== undefined) {
        const candidate = slugify(input.slug);
        if (candidate !== existing.slug) {
          const collision = await tx.taxonomyTerm.findFirst({
            where: { taxonomyId: taxonomy.id, slug: candidate, NOT: { id } },
          });
          if (collision) throw conflict(`Slug "${candidate}" already in use.`);
          nextSlug = candidate;
        }
      }

      if (input.parent_term_id === id) {
        throw conflict('A term cannot be its own parent.');
      }

      return tx.taxonomyTerm.update({
        where: { id },
        data: {
          slug: nextSlug,
          name: input.name ?? existing.name,
          description: input.description === undefined ? existing.description : input.description,
          parentTermId:
            input.parent_term_id === undefined ? existing.parentTermId : input.parent_term_id,
        },
      });
    });
    return ok({
      id: updated.id,
      slug: updated.slug,
      name: updated.name,
      description: updated.description,
      parent_term_id: updated.parentTermId,
    });
  });

  app.delete('/v1/taxonomies/:key/terms/:id', async (request, reply) => {
    requireRole(request, 'editor');
    const { key, id } = TermPath.parse(request.params);
    await withRequestTenant(request, async (tx) => {
      const taxonomy = await tx.taxonomy.findFirst({ where: { key } });
      if (!taxonomy) throw notFound('Taxonomy', key);
      const existing = await tx.taxonomyTerm.findFirst({
        where: { id, taxonomyId: taxonomy.id },
      });
      if (!existing) throw notFound('Term', id);
      await tx.taxonomyTerm.delete({ where: { id } });
    });
    reply.code(204);
    return;
  });

  return Promise.resolve();
};

export default taxonomyRoutes;
