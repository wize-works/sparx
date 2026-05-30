// Commerce — products + variants.
//
//   GET    /v1/commerce/products                              → list
//   POST   /v1/commerce/products                              → create
//   GET    /v1/commerce/products/:id                          → fetch
//   PATCH  /v1/commerce/products/:id                          → update
//   POST   /v1/commerce/products/:id/archive                  → archive
//   POST   /v1/commerce/products/:id/restore                  → restore
//   POST   /v1/commerce/products/:id/publish                  → publish
//   POST   /v1/commerce/products/:id/unpublish                → unpublish
//   DELETE /v1/commerce/products/:id                          → soft delete
//   POST   /v1/commerce/products/bulk-status                  → bulk status change
//   POST   /v1/commerce/products/bulk-tag                     → bulk tag add/remove
//
// Variant sub-resource:
//   GET    /v1/commerce/products/:productId/variants          → list variants
//   GET    /v1/commerce/products/:productId/variants/options  → list options
//   POST   /v1/commerce/products/:productId/variants/options  → set options
//   POST   /v1/commerce/products/:productId/variants          → create variant
//   GET    /v1/commerce/variants/:id                          → fetch variant
//   PATCH  /v1/commerce/variants/:id                          → update variant
//   POST   /v1/commerce/variants/:id/rename-sku               → rename SKU
//   POST   /v1/commerce/variants/:id/default                  → set default
//   POST   /v1/commerce/variants/:id/archive                  → archive
//   POST   /v1/commerce/variants/:id/restore                  → restore
//   POST   /v1/commerce/variants/:id/images                   → add image
//   PUT    /v1/commerce/variants/:id/image-bindings           → set bindings
//   DELETE /v1/commerce/variant-images/:imageId               → remove image
//   POST   /v1/commerce/variants/:id/assign-options           → assign values
//
// Routes are intentionally thin — services own Zod validation, audit logs,
// and event publishing. Transport handles auth, module gate, envelope.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { productService, variantService } from '@sparx/commerce';
import { ok, paged } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCommerceModule, toCommerceContext } from '../../../lib/commerce-context.js';

const PathId = z.object({ id: z.string().uuid() });
const ProductIdParam = z.object({ productId: z.string().uuid() });
const VariantImageParam = z.object({ imageId: z.string().uuid() });

const ListProductsQuery = z.object({
  status: z.string().optional(),
  category_id: z.string().uuid().optional(),
  collection_id: z.string().uuid().optional(),
  vendor: z.string().optional(),
  tag: z.string().optional(),
  product_type: z.string().optional(),
  q: z.string().optional(),
  has_fitment: z.coerce.boolean().optional(),
  include_archived: z.coerce.boolean().optional(),
  include_deleted: z.coerce.boolean().optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  sort_by: z.enum(['updatedAt', 'createdAt', 'title', 'priceMinCents']).optional(),
});

const productRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/commerce/products', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = ListProductsQuery.parse(request.query);
    const { items, total } = await productService.list(toCommerceContext(request), {
      status: q.status as never,
      categoryId: q.category_id,
      collectionId: q.collection_id,
      vendor: q.vendor,
      tag: q.tag,
      productType: q.product_type,
      q: q.q,
      hasFitment: q.has_fitment,
      includeArchived: q.include_archived,
      includeDeleted: q.include_deleted,
      take: q.take,
      skip: q.skip,
      sortBy: q.sort_by,
    });
    return paged(items, { total, per_page: q.take ?? 50 });
  });

  app.post('/v1/commerce/products', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await productService.create(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.get('/v1/commerce/products/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await productService.get(toCommerceContext(request), id));
  });

  app.patch('/v1/commerce/products/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await productService.update(toCommerceContext(request), id, request.body));
  });

  app.post('/v1/commerce/products/:id/archive', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await productService.archive(toCommerceContext(request), id);
    return ok({ id, archived: true });
  });

  app.post('/v1/commerce/products/:id/restore', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await productService.restore(toCommerceContext(request), id);
    return ok({ id, restored: true });
  });

  app.post('/v1/commerce/products/:id/publish', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await productService.publish(toCommerceContext(request), id);
    return ok({ id, published: true });
  });

  app.post('/v1/commerce/products/:id/unpublish', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await productService.unpublish(toCommerceContext(request), id);
    return ok({ id, published: false });
  });

  app.delete('/v1/commerce/products/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await productService.softDelete(toCommerceContext(request), id);
    reply.code(204);
  });

  app.post('/v1/commerce/products/bulk-status', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const result = await productService.bulkUpdateStatus(
      toCommerceContext(request),
      request.body
    );
    return ok(result);
  });

  app.post('/v1/commerce/products/bulk-tag', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const result = await productService.bulkTag(toCommerceContext(request), request.body);
    return ok(result);
  });

  // ── Variants ─────────────────────────────────────────────

  app.get('/v1/commerce/products/:productId/variants', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { productId } = ProductIdParam.parse(request.params);
    return ok(await variantService.listForProduct(toCommerceContext(request), productId));
  });

  app.get('/v1/commerce/products/:productId/variants/options', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { productId } = ProductIdParam.parse(request.params);
    return ok(await variantService.listOptions(toCommerceContext(request), productId));
  });

  app.post('/v1/commerce/products/:productId/variants/options', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { productId } = ProductIdParam.parse(request.params);
    await variantService.setOptions(toCommerceContext(request), productId, request.body);
    return ok({ productId, updated: true });
  });

  app.post('/v1/commerce/products/:productId/variants', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { productId } = ProductIdParam.parse(request.params);
    const created = await variantService.create(toCommerceContext(request), productId, request.body);
    reply.code(201);
    return ok(created);
  });

  app.get('/v1/commerce/variants/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await variantService.get(toCommerceContext(request), id));
  });

  app.patch('/v1/commerce/variants/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await variantService.update(toCommerceContext(request), id, request.body);
    return ok({ id, updated: true });
  });

  app.post('/v1/commerce/variants/:id/rename-sku', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await variantService.renameSku(toCommerceContext(request), id, request.body);
    return ok({ id, renamed: true });
  });

  app.post('/v1/commerce/variants/:id/default', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await variantService.setDefault(toCommerceContext(request), id);
    return ok({ id, isDefault: true });
  });

  app.post('/v1/commerce/variants/:id/archive', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await variantService.archive(toCommerceContext(request), id);
    return ok({ id, archived: true });
  });

  app.post('/v1/commerce/variants/:id/restore', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await variantService.restore(toCommerceContext(request), id);
    return ok({ id, restored: true });
  });

  app.post('/v1/commerce/variants/images', async (request, reply) => {
    // addImage takes the productId + variantId inside its body, so we expose
    // it as a flat POST that just forwards request.body. Dashboard sets
    // productId in the payload.
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await variantService.addImage(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.put('/v1/commerce/variant-image-bindings', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    await variantService.setImageBindings(toCommerceContext(request), request.body);
    return ok({ updated: true });
  });

  app.delete('/v1/commerce/variant-images/:imageId', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { imageId } = VariantImageParam.parse(request.params);
    await variantService.removeImage(toCommerceContext(request), imageId);
    reply.code(204);
  });

  app.post('/v1/commerce/variants/assign-options', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    await variantService.assignOptionValues(toCommerceContext(request), request.body);
    return ok({ assigned: true });
  });
};

export default productRoutes;
