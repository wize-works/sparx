// Commerce — pricing, discounts, gift cards, store credit.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { discountService, pricingService } from '@sparx/commerce';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCommerceModule, toCommerceContext } from '../../../lib/commerce-context.js';

const PathId = z.object({ id: z.string().uuid() });
const EntryParam = z.object({ entryId: z.string().uuid() });
const TierParam = z.object({ tierId: z.string().uuid() });

const pricingRoutes: FastifyPluginAsync = async (app) => {
  // Price lists
  app.get('/v1/commerce/price-lists', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await pricingService.listPriceLists(toCommerceContext(request), {
        ...(q?.status ? { status: q.status } : {}),
        ...(q?.channel ? { channel: q.channel } : {}),
        ...(q?.b2b_account_id ? { b2bAccountId: q.b2b_account_id } : {}),
      })
    );
  });

  app.get('/v1/commerce/price-lists/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await pricingService.getPriceList(toCommerceContext(request), id));
  });

  app.post('/v1/commerce/price-lists', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await pricingService.createPriceList(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.patch('/v1/commerce/price-lists/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await pricingService.updatePriceList(toCommerceContext(request), id, request.body));
  });

  app.post('/v1/commerce/price-lists/:id/archive', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await pricingService.archivePriceList(toCommerceContext(request), id);
    return ok({ id, archived: true });
  });

  app.get('/v1/commerce/price-lists/:id/entries', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await pricingService.listEntries(toCommerceContext(request), id));
  });

  app.post('/v1/commerce/price-list-entries', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    return ok(await pricingService.setPriceListEntry(toCommerceContext(request), request.body));
  });

  app.delete('/v1/commerce/price-list-entries/:entryId', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { entryId } = EntryParam.parse(request.params);
    await pricingService.deletePriceListEntry(toCommerceContext(request), entryId);
    reply.code(204);
  });

  // Bulk tiers
  app.get('/v1/commerce/bulk-tiers', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await pricingService.listBulkTiers(toCommerceContext(request), {
        variantId: q?.variant_id,
      })
    );
  });

  app.post('/v1/commerce/bulk-tiers', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await pricingService.createBulkTier(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.delete('/v1/commerce/bulk-tiers/:tierId', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { tierId } = TierParam.parse(request.params);
    await pricingService.deleteBulkTier(toCommerceContext(request), tierId);
    reply.code(204);
  });

  // Contract prices
  app.post('/v1/commerce/contract-prices', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await pricingService.createContractPrice(
      toCommerceContext(request),
      request.body
    );
    reply.code(201);
    return ok(created);
  });

  app.delete('/v1/commerce/contract-prices/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await pricingService.deleteContractPrice(toCommerceContext(request), id);
    reply.code(204);
  });

  // Discounts
  app.get('/v1/commerce/discounts', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await discountService.listDiscounts(toCommerceContext(request), {
        ...(q?.status ? { status: q.status } : {}),
        ...(q?.q ? { q: q.q } : {}),
      })
    );
  });

  app.post('/v1/commerce/discounts', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await discountService.createDiscount(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.patch('/v1/commerce/discounts/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await discountService.updateDiscount(toCommerceContext(request), id, request.body));
  });

  app.post('/v1/commerce/discounts/:id/activate', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await discountService.activateDiscount(toCommerceContext(request), id);
    return ok({ id, activated: true });
  });

  app.post('/v1/commerce/discounts/:id/archive', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await discountService.archiveDiscount(toCommerceContext(request), id);
    return ok({ id, archived: true });
  });

  // Gift cards
  app.get('/v1/commerce/gift-cards', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(
      await discountService.listGiftCards(toCommerceContext(request), {
        q: q?.q,
        take: q?.take ? Number(q.take) : undefined,
      })
    );
  });

  app.post('/v1/commerce/gift-cards', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await discountService.issueGiftCard(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.get('/v1/commerce/gift-cards/lookup', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    return ok(await discountService.lookupGiftCard(toCommerceContext(request), q?.code ?? ''));
  });

  app.post('/v1/commerce/gift-cards/adjust', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    return ok(await discountService.adjustGiftCard(toCommerceContext(request), request.body));
  });

  // Store credit
  app.post('/v1/commerce/store-credit/grant', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    return ok(await discountService.grantStoreCredit(toCommerceContext(request), request.body));
  });
};

export default pricingRoutes;
