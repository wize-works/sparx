// Commerce — fitment (domains, categories, items, variants + product
// applicability) and configurator (templates + bundles).
//
// "Fitment" is the generalized "this product fits that thing" concept.
// Domain selects the vocabulary (vehicle / pet / device / apparel / ...);
// category → item → variant form the 1-3 level tree under it. See
// packages/commerce/src/services/fitment-service.ts for the storage model.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { configuratorService, fitmentService } from '@sparx/commerce';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCommerceModule, toCommerceContext } from '../../../lib/commerce-context.js';

const PathId = z.object({ id: z.string().uuid() });
const DomainParam = z.object({ domainId: z.string().uuid() });
const CategoryParam = z.object({ categoryId: z.string().uuid() });
const ItemParam = z.object({ itemId: z.string().uuid() });
const ProductIdParam = z.object({ productId: z.string().uuid() });
const FitmentParam = z.object({ fitmentId: z.string().uuid() });

const fitmentRoutes: FastifyPluginAsync = async (app) => {
  // ─── Domains ──────────────────────────────────────────────────────
  app.get('/v1/commerce/fitment/domains', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await fitmentService.listDomains(toCommerceContext(request)));
  });

  app.get('/v1/commerce/fitment/domains/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await fitmentService.getDomain(toCommerceContext(request), id));
  });

  app.post('/v1/commerce/fitment/domains', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await fitmentService.createDomain(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  // ─── Categories (L1) ──────────────────────────────────────────────
  app.get('/v1/commerce/fitment/domains/:domainId/categories', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { domainId } = DomainParam.parse(request.params);
    return ok(await fitmentService.listCategories(toCommerceContext(request), domainId));
  });

  app.post('/v1/commerce/fitment/categories', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await fitmentService.createCategory(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  // ─── Items (L2) ───────────────────────────────────────────────────
  app.get('/v1/commerce/fitment/categories/:categoryId/items', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { categoryId } = CategoryParam.parse(request.params);
    return ok(await fitmentService.listItems(toCommerceContext(request), categoryId));
  });

  app.post('/v1/commerce/fitment/items', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await fitmentService.createItem(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  // ─── Variants (L3) ────────────────────────────────────────────────
  app.get('/v1/commerce/fitment/items/:itemId/variants', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { itemId } = ItemParam.parse(request.params);
    return ok(await fitmentService.listVariants(toCommerceContext(request), itemId));
  });

  app.post('/v1/commerce/fitment/variants', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await fitmentService.createVariant(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  // ─── Product fitment ──────────────────────────────────────────────
  app.get('/v1/commerce/products/:productId/fitment', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { productId } = ProductIdParam.parse(request.params);
    return ok(await fitmentService.listForProduct(toCommerceContext(request), productId));
  });

  app.put('/v1/commerce/products/:productId/fitment', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { productId } = ProductIdParam.parse(request.params);
    // Body shape is validated by the service's Zod schema
    // (ProductFitmentInput, applied per-row inside setForProduct).
    const body = z.object({ fitments: z.array(z.unknown()) }).parse(request.body);
    await fitmentService.setForProduct(
      toCommerceContext(request),
      productId,
      body.fitments as Parameters<typeof fitmentService.setForProduct>[2]
    );
    return ok({ productId, updated: true });
  });

  app.post('/v1/commerce/fitment/bulk-assign', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    return ok(await fitmentService.bulkAssign(toCommerceContext(request), request.body));
  });

  app.delete('/v1/commerce/fitment/:fitmentId', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { fitmentId } = FitmentParam.parse(request.params);
    await fitmentService.deleteFitment(toCommerceContext(request), fitmentId);
    reply.code(204);
  });

  // ─── Lookup ───────────────────────────────────────────────────────
  app.get('/v1/commerce/fitment/lookup', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await fitmentService.lookup(toCommerceContext(request), request.query));
  });

  // ─── Configurator — bundles ───────────────────────────────────────
  app.get('/v1/commerce/bundles', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await configuratorService.listBundles(toCommerceContext(request)));
  });

  app.get('/v1/commerce/bundles/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await configuratorService.getBundle(toCommerceContext(request), id));
  });

  app.post('/v1/commerce/bundles', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await configuratorService.createBundle(
      toCommerceContext(request),
      request.body
    );
    reply.code(201);
    return ok(created);
  });

  app.patch('/v1/commerce/bundles/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await configuratorService.updateBundle(toCommerceContext(request), id, request.body));
  });

  app.delete('/v1/commerce/bundles/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await configuratorService.deleteBundle(toCommerceContext(request), id);
    reply.code(204);
  });

  // ─── Configurator — templates ─────────────────────────────────────
  app.get('/v1/commerce/configurator-templates', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await configuratorService.listAllTemplates(toCommerceContext(request), {
        ...(q?.status ? { status: q.status } : {}),
      })
    );
  });

  app.get('/v1/commerce/configurator-templates/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await configuratorService.getTemplate(toCommerceContext(request), id));
  });

  app.post('/v1/commerce/configurator-templates', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await configuratorService.createTemplate(
      toCommerceContext(request),
      request.body
    );
    reply.code(201);
    return ok(created);
  });

  app.patch('/v1/commerce/configurator-templates/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(
      await configuratorService.updateTemplate(toCommerceContext(request), id, request.body)
    );
  });

  app.delete('/v1/commerce/configurator-templates/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await configuratorService.deleteTemplate(toCommerceContext(request), id);
    reply.code(204);
  });
};

export default fitmentRoutes;
