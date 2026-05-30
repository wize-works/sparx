// Commerce — shipping zones, profiles, rates + tax zones, rates, exemptions.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { shippingService, taxService } from '@sparx/commerce';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { requireCommerceModule, toCommerceContext } from '../../../lib/commerce-context.js';

const PathId = z.object({ id: z.string().uuid() });
const ZoneParam = z.object({ zoneId: z.string().uuid() });

const shippingRoutes: FastifyPluginAsync = async (app) => {
  // Shipping zones
  app.get('/v1/commerce/shipping/zones', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await shippingService.listZones(toCommerceContext(request)));
  });

  app.get('/v1/commerce/shipping/zones/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await shippingService.getZone(toCommerceContext(request), id));
  });

  app.post('/v1/commerce/shipping/zones', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await shippingService.createZone(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.patch('/v1/commerce/shipping/zones/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await shippingService.updateZone(toCommerceContext(request), id, request.body));
  });

  app.delete('/v1/commerce/shipping/zones/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await shippingService.deleteZone(toCommerceContext(request), id);
    reply.code(204);
  });

  // Shipping profiles
  app.get('/v1/commerce/shipping/profiles', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await shippingService.listProfiles(toCommerceContext(request)));
  });

  app.get('/v1/commerce/shipping/profiles/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await shippingService.getProfile(toCommerceContext(request), id));
  });

  app.post('/v1/commerce/shipping/profiles', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await shippingService.createProfile(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.patch('/v1/commerce/shipping/profiles/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await shippingService.updateProfile(toCommerceContext(request), id, request.body));
  });

  app.delete('/v1/commerce/shipping/profiles/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await shippingService.deleteProfile(toCommerceContext(request), id);
    reply.code(204);
  });

  // Shipping rates
  app.get('/v1/commerce/shipping/zones/:zoneId/rates', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { zoneId } = ZoneParam.parse(request.params);
    return ok(await shippingService.listRatesForZone(toCommerceContext(request), zoneId));
  });

  app.post('/v1/commerce/shipping/rates', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await shippingService.createRate(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.delete('/v1/commerce/shipping/rates/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await shippingService.deleteRate(toCommerceContext(request), id);
    reply.code(204);
  });

  // Tax zones + rates
  app.get('/v1/commerce/tax/zones', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    return ok(await taxService.listZones(toCommerceContext(request)));
  });

  app.get('/v1/commerce/tax/zones/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await taxService.getZone(toCommerceContext(request), id));
  });

  app.post('/v1/commerce/tax/zones', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await taxService.createZone(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.patch('/v1/commerce/tax/zones/:id', async (request) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await taxService.updateZone(toCommerceContext(request), id, request.body));
  });

  app.delete('/v1/commerce/tax/zones/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await taxService.deleteZone(toCommerceContext(request), id);
    reply.code(204);
  });

  app.get('/v1/commerce/tax/zones/:zoneId/rates', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { zoneId } = ZoneParam.parse(request.params);
    return ok(await taxService.listRatesForZone(toCommerceContext(request), zoneId));
  });

  app.post('/v1/commerce/tax/rates', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await taxService.createRate(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.delete('/v1/commerce/tax/rates/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await taxService.deleteRate(toCommerceContext(request), id);
    reply.code(204);
  });

  app.post('/v1/commerce/tax/exemptions', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const created = await taxService.createExemption(toCommerceContext(request), request.body);
    reply.code(201);
    return ok(created);
  });

  app.delete('/v1/commerce/tax/exemptions/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);
    await taxService.deleteExemption(toCommerceContext(request), id);
    reply.code(204);
  });
};

export default shippingRoutes;
