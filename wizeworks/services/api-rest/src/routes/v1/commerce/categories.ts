// Commerce — categories + collections.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queryBool } from '@wizeworks/api-core/query';
import { categoryService, collectionService } from '@wizeworks/commerce';
import { ok, paged } from '@wizeworks/api-core/envelope';
import { requireRole } from '@wizeworks/api-core/auth';
import { withRequestTenant } from '@wizeworks/api-core/db';
import {
  defaultActiveSiteScope,
  requireCommerceModule,
  toCommerceContext,
} from '../../../lib/commerce-context.js';
import { resolveListScope } from '../../../lib/property.js';
import { auditAndStore } from '../../../lib/seo-audit.js';

const PathId = z.object({ id: z.string().uuid() });

const ListCategoriesQuery = z.object({
  q: z.string().optional(),
  // Model B (docs/49 §3): omitted → the site the caller is working in
  // (`x-sparx-property-id`, else primary); `all` → every site.
  property: z.string().min(1).optional(),

  // Tri-state featured filter (docs/34 §7.1): yes → featured, no → not-featured,
  // omitted → no filter.
  featured: z.enum(['yes', 'no']).optional(),
});

const ListCollectionsQuery = z.object({
  q: z.string().optional(),
  // Model B (docs/49 §3): omitted → the site the caller is working in
  // (`x-sparx-property-id`, else primary); `all` → every site.
  property: z.string().min(1).optional(),

  type: z.enum(['manual', 'rules']).optional(),
  include_archived: queryBool.optional(),

  // Server-side sort. The whitelist IS the set of orderable columns — an
  // off-list value is rejected here rather than silently ignored, so the client
  // can never ask the table to sort by something the server won't honour.
  sort_by: z.enum(['name', 'type', 'productCount', 'updatedAt']).optional(),
  order: z.enum(['asc', 'desc']).optional(),

  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync type demands async; no top-level await needed because route registration is sync.
const categoryRoutes: FastifyPluginAsync = async (app) => {
  // Categories
  app.get('/v1/commerce/categories', async (request) => {
    const auth = requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const query = ListCategoriesQuery.parse(request.query);
    const propertyId = await resolveListScope(
      auth,
      query.property,
      request.headers['x-sparx-property-id']
    );
    // No q/featured → the full nested tree; with either → flat matches (the
    // service decides). Bare callers (parent pickers, options loaders) pass
    // nothing and still get the whole tree.
    return ok(
      await categoryService.tree(toCommerceContext(request), {
        q: query.q,
        featured: query.featured === 'yes' ? true : query.featured === 'no' ? false : undefined,
        propertyId,
      })
    );
  });

  app.get('/v1/commerce/categories/:id', async (request) => {
    const auth = requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    // Same site scope as the list, so the detail's product counts agree with the
    // row the reader clicked. Without it the two screens would answer different
    // questions about the same category on a multi-site tenant.
    const propertyId = await resolveListScope(
      auth,
      undefined,
      request.headers['x-sparx-property-id']
    );
    return ok(await categoryService.get(toCommerceContext(request), id, propertyId));
  });

  app.post('/v1/commerce/categories', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    await requireCommerceModule(request);
    const body = (request.body ?? {}) as Record<string, unknown>;
    // Model B: a new category defaults to the active site on a multi-site tenant.
    await defaultActiveSiteScope(request, auth, body);
    const created = await categoryService.create(toCommerceContext(request), body);
    reply.code(201);
    return ok(created);
  });

  app.patch('/v1/commerce/categories/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await categoryService.update(toCommerceContext(request), id, request.body));
  });

  app.delete('/v1/commerce/categories/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await categoryService.remove(toCommerceContext(request), id);
    reply.code(204);
  });

  app.post('/v1/commerce/categories/reparent', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    await categoryService.reparent(toCommerceContext(request), request.body);
    return ok({ reparented: true });
  });

  app.post('/v1/commerce/categories/set-product-categories', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const body = z
      .object({ productId: z.string().uuid(), categoryIds: z.array(z.string().uuid()) })
      .parse(request.body);
    await categoryService.setProductCategories(
      toCommerceContext(request),
      body.productId,
      body.categoryIds
    );
    return ok({ updated: true });
  });

  // Collections
  app.get('/v1/commerce/collections', async (request) => {
    const auth = requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = ListCollectionsQuery.parse(request.query);
    const propertyId = await resolveListScope(
      auth,
      q.property,
      request.headers['x-sparx-property-id']
    );
    const { items, total } = await collectionService.list(toCommerceContext(request), {
      q: q.q,
      type: q.type,
      propertyId,
      sortBy: q.sort_by,
      order: q.order,
      take: q.take,
      skip: q.skip,
    });
    return paged(items, { total, per_page: q.take ?? 50 });
  });

  app.get('/v1/commerce/collections/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await collectionService.get(toCommerceContext(request), id));
  });

  app.post('/v1/commerce/collections', async (request, reply) => {
    const auth = requireRole(request, 'editor');
    await requireCommerceModule(request);
    const body = (request.body ?? {}) as Record<string, unknown>;
    // Model B: a new collection defaults to the active site on a multi-site tenant.
    await defaultActiveSiteScope(request, auth, body);
    const created = await collectionService.create(toCommerceContext(request), body);
    // Collections have no publish lifecycle — they're live on existence — so seed
    // the SEO snapshot at create so the new collection shows in the overview
    // (docs/50 §7). Best-effort.
    await withRequestTenant(request, (tx) =>
      auditAndStore(tx, auth.tenantId, 'collection', created.id)
    ).catch(() => undefined);
    reply.code(201);
    return ok(created);
  });

  app.patch('/v1/commerce/collections/:id', async (request) => {
    const auth = requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    const updated = await collectionService.update(toCommerceContext(request), id, request.body);
    // A collection edit is live immediately — refresh the snapshot. Best-effort.
    await withRequestTenant(request, (tx) =>
      auditAndStore(tx, auth.tenantId, 'collection', id)
    ).catch(() => undefined);
    return ok(updated);
  });

  app.delete('/v1/commerce/collections/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await collectionService.remove(toCommerceContext(request), id);
    reply.code(204);
  });

  app.post('/v1/commerce/collections/:id/reindex', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await collectionService.reindex(toCommerceContext(request), id);
    return ok({ id, reindexed: true });
  });

  app.post('/v1/commerce/collections/set-products', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    await collectionService.setProducts(toCommerceContext(request), request.body);
    return ok({ updated: true });
  });

  app.post('/v1/commerce/collections/set-product-collections', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const body = z
      .object({ productId: z.string().uuid(), collectionIds: z.array(z.string().uuid()) })
      .parse(request.body);
    await collectionService.setProductCollections(
      toCommerceContext(request),
      body.productId,
      body.collectionIds
    );
    return ok({ updated: true });
  });
};

export default categoryRoutes;
