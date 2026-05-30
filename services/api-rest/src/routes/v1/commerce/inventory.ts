// Commerce — inventory, warehouses, lots, recalls.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { inventoryService } from '@sparx/commerce';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCommerceModule, toCommerceContext } from '../../../lib/commerce-context.js';

const PathId = z.object({ id: z.string().uuid() });
const VariantParam = z.object({ variantId: z.string().uuid() });
const WarehouseParam = z.object({ warehouseId: z.string().uuid() });

// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync type demands async; no top-level await needed because route registration is sync.
const inventoryRoutes: FastifyPluginAsync = async (app) => {
  // Warehouses
  app.get('/v1/commerce/warehouses', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await inventoryService.listWarehouses(toCommerceContext(request), {
        includeInactive: q?.include_archived === 'true',
      })
    );
  });

  app.get('/v1/commerce/warehouses/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await inventoryService.getWarehouse(toCommerceContext(request), id));
  });

  app.post('/v1/commerce/warehouses', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await inventoryService.createWarehouse(
      toCommerceContext(request),
      request.body
    );
    reply.code(201);
    return ok(created);
  });

  app.patch('/v1/commerce/warehouses/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await inventoryService.updateWarehouse(toCommerceContext(request), id, request.body));
  });

  app.post('/v1/commerce/warehouses/:id/archive', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await inventoryService.archiveWarehouse(toCommerceContext(request), id);
    return ok({ id, archived: true });
  });

  // Levels
  app.get('/v1/commerce/inventory/levels/variant/:variantId', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { variantId } = VariantParam.parse(request.params);
    return ok(await inventoryService.levelsForVariant(toCommerceContext(request), variantId));
  });

  app.get('/v1/commerce/inventory/levels/warehouse/:warehouseId', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { warehouseId } = WarehouseParam.parse(request.params);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await inventoryService.levelsForWarehouse(toCommerceContext(request), warehouseId, {
        ...(q?.take ? { take: Number(q.take) } : {}),
        ...(q?.skip ? { skip: Number(q.skip) } : {}),
        ...(q?.low_stock_only === 'true' ? { lowStockOnly: true } : {}),
      })
    );
  });

  // Movements
  app.post('/v1/commerce/inventory/adjust', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    return ok(await inventoryService.adjust(toCommerceContext(request), request.body));
  });

  app.post('/v1/commerce/inventory/transfer', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    await inventoryService.transfer(toCommerceContext(request), request.body);
    return ok({ transferred: true });
  });

  app.post('/v1/commerce/inventory/reorder-policy', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    await inventoryService.setReorderPolicy(toCommerceContext(request), request.body);
    return ok({ updated: true });
  });

  // Lots & serials & recalls
  app.post('/v1/commerce/inventory/lots', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await inventoryService.createLotBatch(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.get('/v1/commerce/inventory/lots/expiring', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    const beforeIso = q?.before ?? new Date(Date.now() + 30 * 86400_000).toISOString();
    return ok(await inventoryService.listLotsExpiringBefore(toCommerceContext(request), beforeIso));
  });

  app.post('/v1/commerce/inventory/serials', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await inventoryService.createSerialUnit(
      toCommerceContext(request),
      request.body
    );
    reply.code(201);
    return ok(created);
  });

  app.post('/v1/commerce/inventory/recalls', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    return ok(await inventoryService.initiateRecall(toCommerceContext(request), request.body));
  });

  app.get('/v1/commerce/inventory/low-stock', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await inventoryService.listLowStock(toCommerceContext(request), {
        ...(q?.warehouse_id ? { warehouseId: q.warehouse_id } : {}),
        ...(q?.take ? { take: Number(q.take) } : {}),
      })
    );
  });
};

export default inventoryRoutes;
