// Mounts every /v1/commerce/* route group. One register call from app.ts so
// the Commerce URL space lives behind a single registration point.

import type { FastifyPluginAsync } from 'fastify';

import productRoutes from './products.js';
import categoryRoutes from './categories.js';
import inventoryRoutes from './inventory.js';
import pricingRoutes from './pricing.js';
import cartRoutes from './carts.js';
import shippingRoutes from './shipping.js';
import providerRoutes from './providers.js';
import reviewRoutes from './reviews.js';
import fitmentRoutes from './fitment.js';
import storefrontRoutes from './storefront.js';
import commerceListRoutes from './lists.js';

const commerceRoutes: FastifyPluginAsync = async (app) => {
  await app.register(productRoutes);
  await app.register(categoryRoutes);
  await app.register(inventoryRoutes);
  await app.register(pricingRoutes);
  await app.register(cartRoutes);
  await app.register(shippingRoutes);
  await app.register(providerRoutes);
  await app.register(reviewRoutes);
  await app.register(fitmentRoutes);
  await app.register(storefrontRoutes);
  await app.register(commerceListRoutes);
};

export default commerceRoutes;
