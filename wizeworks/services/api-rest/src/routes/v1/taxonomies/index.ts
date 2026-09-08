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
//
// ── WHICH SITE A LABEL BELONGS TO ──────────────────────────────────────────
// A TAXONOMY is a schema ("posts have tags") and is shared across a business's
// sites. A TERM is CONTENT, and the schema says so in as many words:
//
//   null = the term appears on every site. Unlike its Taxonomy, a TERM is
//   CONTENT — "Diesel repair" is meaningless on a donut site, and it would
//   otherwise show up in that site's category filters and archive pages.
//
// That model shipped as columns and indexes — `taxonomy_terms.property_id` and
// `@@index([tenantId, propertyId, taxonomyId])`, an index for a query nothing
// wrote — and no read here ever filtered on it. So a clothing maker with seven
// sites opened Tags and topics on her shop and read Venture capital, Data
// centres, Chips and Artificial intelligence: thirty-two labels a design had
// introduced on two OTHER sites, with nothing to say they were not hers
// (issue 385).
//
// Reads are scoped now, and a term created here is stamped with the site it was
// created on, so the model is implemented rather than merely declared.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@wizeworks/db';
import { withRequestTenant } from '@wizeworks/api-core/db';
import { ok, paged } from '@wizeworks/api-core/envelope';
import { requireRole } from '@wizeworks/api-core/auth';
import { conflict, notFound } from '@wizeworks/api-core/errors';
import { slugify } from '@wizeworks/api-core/slug';
import { resolveListScope } from '../../../lib/property.js';

const KeyParams = z.object({ key: z.string().min(1).max(63) });

const ListQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(['hierarchical', 'flat']).optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});
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

/** Terms visible on one site: its own, plus the ones that belong to every site.
 *
 *  `OR` rather than `in: [id, null]` — Prisma's `in` rejects null even on a
 *  nullable column, the same note `lib/ai/tool-policy.ts` carries. Exported so a
 *  test can assert the predicate directly rather than re-deriving it. */
export function termsOnSite(propertyId: string | undefined): Prisma.TaxonomyTermWhereInput {
  return propertyId ? { OR: [{ propertyId }, { propertyId: null }] } : {};
}

const taxonomyRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/taxonomies', async (request) => {
    const auth = requireRole(request, 'viewer');
    const q = ListQuery.parse(request.query);
    // The vocabularies themselves are NOT scoped — a taxonomy is a schema and
    // shared is its correct case (see the model comment). Only the count is,
    // because "how many labels" means "how many labels on the site I am in".
    const propertyId = await resolveListScope(
      auth,
      undefined,
      request.headers['x-sparx-property-id']
    );
    const where: Prisma.TaxonomyWhereInput = {
      ...(q.kind ? { hierarchical: q.kind === 'hierarchical' } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { pluralName: { contains: q.q, mode: 'insensitive' } },
              { key: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total, onThisSite] = await withRequestTenant(request, (tx) =>
      Promise.all([
        tx.taxonomy.findMany({
          where,
          orderBy: { name: 'asc' },
          // The UNSCOPED total. Both numbers are served, because two screens ask
          // two different questions of the same relation: the list asks "how many
          // labels are on the site I am in", and the DELETE asks "how many labels
          // does this destroy" — and a vocabulary is shared, so a delete reaches
          // every site's labels at once. Serving only the scoped one would have
          // turned a warning that said "and all 19 of its labels" into silence
          // (issue 385).
          include: { _count: { select: { terms: true } } },
          take: Math.min(q.take ?? 50, 250),
          skip: q.skip ?? 0,
        }),
        tx.taxonomy.count({ where }),
        tx.taxonomyTerm.groupBy({
          by: ['taxonomyId'],
          where: termsOnSite(propertyId),
          _count: { _all: true },
        }),
      ])
    );
    const here = new Map(onThisSite.map((r) => [r.taxonomyId, r._count._all]));
    return paged(
      rows.map((t) => ({
        id: t.id,
        key: t.key,
        name: t.name,
        plural_name: t.pluralName,
        hierarchical: t.hierarchical,
        /** Labels on the site the caller is working in. */
        term_count: here.get(t.id) ?? 0,
        /** Labels across every site, which is what a delete takes with it. */
        all_sites_term_count: t._count.terms,
        created_at: t.createdAt.toISOString(),
        updated_at: t.updatedAt.toISOString(),
      })),
      { total, per_page: q.take ?? 50 }
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
    const auth = requireRole(request, 'viewer');
    const { key } = KeyParams.parse(request.params);
    const propertyId = await resolveListScope(
      auth,
      undefined,
      request.headers['x-sparx-property-id']
    );
    const rows = await withRequestTenant(request, async (tx) => {
      const taxonomy = await tx.taxonomy.findFirst({ where: { key } });
      if (!taxonomy) throw notFound('Taxonomy', key);
      return tx.taxonomyTerm.findMany({
        where: { taxonomyId: taxonomy.id, ...termsOnSite(propertyId) },
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
    const auth = requireRole(request, 'editor');
    const { key } = KeyParams.parse(request.params);
    const input = CreateTerm.parse(request.body);
    const slug = slugify(input.slug ?? input.name);
    if (!slug) throw conflict('Name must contain letters or numbers.');
    const propertyId = await resolveListScope(
      auth,
      undefined,
      request.headers['x-sparx-property-id']
    );

    const created = await withRequestTenant(request, async (tx) => {
      const taxonomy = await tx.taxonomy.findFirst({ where: { key } });
      if (!taxonomy) throw notFound('Taxonomy', key);
      // Slug uniqueness is per VOCABULARY, deliberately (a slug is a URL
      // segment, and two sites owning `/specials` inside one vocabulary makes
      // that address ambiguous). The consequence is that a clash can be with a
      // label on a site the writer cannot see, so the refusal has to SAY that —
      // otherwise she is looking at a list that plainly does not contain the
      // word the console just told her was taken.
      const collision = await tx.taxonomyTerm.findFirst({
        where: { taxonomyId: taxonomy.id, slug },
        select: { name: true, propertyId: true, property: { select: { name: true } } },
      });
      if (collision) {
        const elsewhere = propertyId && collision.propertyId && collision.propertyId !== propertyId;
        throw conflict(
          elsewhere
            ? `“${collision.name}” on ${collision.property?.name ?? 'another of your sites'} already uses the web address “${slug}”, and a label's address has to be unique across your whole business. Give this one a different one.`
            : `“${slug}” is already the web address of another label here. Give this one a different one.`
        );
      }
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
          // The site it was written on owns it. Undefined (an unscoped caller)
          // leaves it null, which the model reads as "every site".
          propertyId: propertyId ?? null,
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
    const auth = requireRole(request, 'editor');
    const { key, id } = TermPath.parse(request.params);
    const input = UpdateTerm.parse(request.body);
    const propertyId = await resolveListScope(
      auth,
      undefined,
      request.headers['x-sparx-property-id']
    );

    const updated = await withRequestTenant(request, async (tx) => {
      const taxonomy = await tx.taxonomy.findFirst({ where: { key } });
      if (!taxonomy) throw notFound('Taxonomy', key);
      // Scoped the same way the read is: a label this site cannot SEE is one it
      // must not be able to rename either, or a stale tab from another site
      // becomes a write path into that site's vocabulary.
      const existing = await tx.taxonomyTerm.findFirst({
        where: { id, taxonomyId: taxonomy.id, ...termsOnSite(propertyId) },
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
    const auth = requireRole(request, 'editor');
    const { key, id } = TermPath.parse(request.params);
    const propertyId = await resolveListScope(
      auth,
      undefined,
      request.headers['x-sparx-property-id']
    );
    await withRequestTenant(request, async (tx) => {
      const taxonomy = await tx.taxonomy.findFirst({ where: { key } });
      if (!taxonomy) throw notFound('Taxonomy', key);
      // Same scope as the read and the rename — a delete is the one of the three
      // where reaching another site's label would be unrecoverable.
      const existing = await tx.taxonomyTerm.findFirst({
        where: { id, taxonomyId: taxonomy.id, ...termsOnSite(propertyId) },
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
