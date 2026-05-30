// Commerce — categories + collections.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { categoryService, collectionService } from '@sparx/commerce';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCommerceModule, toCommerceContext } from '../../../lib/commerce-context.js';

const PathId = z.object({ id: z.string().uuid() });

// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync type demands async; no top-level await needed because route registration is sync.
const categoryRoutes: FastifyPluginAsync = async (app) => {
  // Categories
  app.get('/v1/commerce/categories', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await categoryService.tree(toCommerceContext(request)));
  });

  app.get('/v1/commerce/categories/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await categoryService.get(toCommerceContext(request), id));
  });

  app.post('/v1/commerce/categories', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await categoryService.create(toCommerceContext(request), request.body);
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
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    const filter = {
      q: q?.q,
      type: q?.type as never,
      includeArchived: q?.include_archived === 'true',
      take: q?.take ? Number(q.take) : undefined,
      skip: q?.skip ? Number(q.skip) : undefined,
    };
    return ok(await collectionService.list(toCommerceContext(request), filter));
  });

  app.get('/v1/commerce/collections/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await collectionService.get(toCommerceContext(request), id));
  });

  app.post('/v1/commerce/collections', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await collectionService.create(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.patch('/v1/commerce/collections/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await collectionService.update(toCommerceContext(request), id, request.body));
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
