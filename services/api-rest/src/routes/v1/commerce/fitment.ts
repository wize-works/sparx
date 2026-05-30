// Commerce — fitment (vehicle makes/models/engines + product fitment), and
// configurator (templates + bundles).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { configuratorService, fitmentService } from '@sparx/commerce';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCommerceModule, toCommerceContext } from '../../../lib/commerce-context.js';

const PathId = z.object({ id: z.string().uuid() });
const MakeParam = z.object({ makeId: z.string().uuid() });
const ProductIdParam = z.object({ productId: z.string().uuid() });
const FitmentParam = z.object({ fitmentId: z.string().uuid() });

const fitmentRoutes: FastifyPluginAsync = async (app) => {
  // Vehicles
  app.get('/v1/commerce/fitment/makes', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await fitmentService.listMakes(toCommerceContext(request)));
  });

  app.get('/v1/commerce/fitment/makes/:makeId/models', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { makeId } = MakeParam.parse(request.params);
    return ok(await fitmentService.listModels(toCommerceContext(request), makeId));
  });

  app.get('/v1/commerce/fitment/models/:modelId/engines', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { modelId } = z.object({ modelId: z.string().uuid() }).parse(request.params);
    return ok(await fitmentService.listEngines(toCommerceContext(request), modelId));
  });

  app.post('/v1/commerce/fitment/makes', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await fitmentService.createMake(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.post('/v1/commerce/fitment/models', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await fitmentService.createModel(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.post('/v1/commerce/fitment/engines', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await fitmentService.createEngine(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  // Product fitment
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
    const body = z
      .object({ fitments: z.array(z.unknown()) })
      .parse(request.body);
    await fitmentService.setForProduct(
      toCommerceContext(request),
      productId,
      body.fitments as never
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

  // Configurator — bundles
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
    const created = await configuratorService.createBundle(toCommerceContext(request), request.body);
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

  // Configurator — templates
  app.get('/v1/commerce/configurator-templates', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await configuratorService.listAllTemplates(toCommerceContext(request), {
        productId: q?.product_id,
        take: q?.take ? Number(q.take) : undefined,
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
