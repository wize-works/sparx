// Commerce — carts (admin view) + checkout sessions.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { cartService, checkoutService } from '@sparx/commerce';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCommerceModule, toCommerceContext } from '../../../lib/commerce-context.js';

const CartParam = z.object({ cartId: z.string().uuid() });
const SessionParam = z.object({ sessionId: z.string().uuid() });

const cartRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/commerce/carts/:cartId', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { cartId } = CartParam.parse(request.params);
    return ok(await cartService.get(toCommerceContext(request), cartId));
  });

  app.post('/v1/commerce/carts/:cartId/abandoned', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { cartId } = CartParam.parse(request.params);
    await cartService.markAbandoned(toCommerceContext(request), cartId);
    return ok({ cartId, marked: 'abandoned' });
  });

  app.post('/v1/commerce/carts/:cartId/recovered', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { cartId } = CartParam.parse(request.params);
    await cartService.markRecovered(toCommerceContext(request), cartId);
    return ok({ cartId, marked: 'recovered' });
  });

  // Checkout sessions — most are storefront-only; here the read endpoint
  // backs the dashboard's session-inspection view.
  app.get('/v1/commerce/checkout-sessions/:sessionId', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { sessionId } = SessionParam.parse(request.params);
    return ok(await checkoutService.get(toCommerceContext(request), sessionId));
  });
};

export default cartRoutes;
