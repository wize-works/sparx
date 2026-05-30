// Public cart write surface for the storefront.
//
//   POST   /v1/public/commerce/cart                       ?tenant=  → create (issues x-cart-token)
//   GET    /v1/public/commerce/cart/:cartId               ?tenant=
//   POST   /v1/public/commerce/cart/:cartId/items         ?tenant=  { variantId, quantity }
//   PATCH  /v1/public/commerce/cart/:cartId/items/:itemId ?tenant=  { quantity }
//   DELETE /v1/public/commerce/cart/:cartId/items/:itemId ?tenant=
//   POST   /v1/public/commerce/cart/:cartId/discount      ?tenant=  { code }
//   DELETE /v1/public/commerce/cart/:cartId/discount/:code?tenant=
//
// Ownership: cart creation issues an opaque guest token returned in the body
// AND surfaced for the client to store; every later call must echo it via the
// `x-cart-token` header (assertCartToken). RLS scopes all reads to the tenant.

import { randomUUID } from 'node:crypto';

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { cartService, discountService, type ServiceContext } from '@sparx/commerce';
import { withTenant } from '@sparx/db';
import { ok } from '@sparx/api-core/envelope';
import { badRequest } from '@sparx/api-core/errors';

import {
  assertCartToken,
  publicCommerceContext,
  resolveTenantId,
  toPublicCommerceContext,
} from '../../../lib/public-commerce-context.js';

const CartParam = z.object({ cartId: z.string().uuid() });
const ItemParam = z.object({ cartId: z.string().uuid(), itemId: z.string().uuid() });
const CodeParam = z.object({ cartId: z.string().uuid(), code: z.string().min(1).max(64) });

const AddItemBody = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive().max(999).default(1),
});
const UpdateItemBody = z.object({ quantity: z.number().int().nonnegative().max(999) });
const DiscountBody = z.object({ code: z.string().min(1).max(64) });

// Storefront-facing line shape: the service snapshot enriched with the product
// handle + primary image so the cart UI can link + show a thumbnail without a
// second round-trip.
interface PublicCartLine {
  id: string;
  variantId: string;
  productId: string;
  productHandle: string | null;
  title: string;
  variantTitle: string | null;
  sku: string;
  imageMediaId: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

async function serializePublicCart(
  ctx: ServiceContext,
  tenantId: string,
  cartId: string
): Promise<{
  cartId: string;
  currency: string;
  items: PublicCartLine[];
  appliedDiscountCodes: string[];
  totals: ReturnType<typeof totalsView>;
} | null> {
  const snapshot = await cartService.get(ctx, cartId);
  if (!snapshot) return null;

  // Enrich each line with handle + variant title + primary image in one query.
  const variantIds = snapshot.items.map((i) => i.variantId);
  const variants = variantIds.length
    ? await withTenant({ tenantId }, (tx) =>
        tx.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: {
            id: true,
            title: true,
            product: {
              select: {
                handle: true,
                images: {
                  take: 1,
                  orderBy: { position: 'asc' },
                  select: { mediaAssetId: true },
                },
              },
            },
          },
        })
      )
    : [];
  const byVariant = new Map(variants.map((v) => [v.id, v]));

  const items: PublicCartLine[] = snapshot.items.map((i) => {
    const v = byVariant.get(i.variantId);
    return {
      id: i.cartItemId,
      variantId: i.variantId,
      productId: i.productId,
      productHandle: v?.product.handle ?? null,
      title: i.name,
      variantTitle: v?.title ?? null,
      sku: i.sku,
      imageMediaId: v?.product.images[0]?.mediaAssetId ?? null,
      unitPriceCents: i.unitPriceCents,
      quantity: i.quantity,
      lineTotalCents: i.subtotalCents,
    };
  });

  return {
    cartId: snapshot.cartId,
    currency: snapshot.currency,
    items,
    appliedDiscountCodes: snapshot.appliedDiscountCodes,
    totals: totalsView(snapshot.totals),
  };
}

function totalsView(t: {
  subtotalCents: number;
  discountTotalCents: number;
  shippingTotalCents: number;
  taxTotalCents: number;
  totalCents: number;
}) {
  return {
    subtotalCents: t.subtotalCents,
    discountTotalCents: t.discountTotalCents,
    shippingTotalCents: t.shippingTotalCents,
    taxTotalCents: t.taxTotalCents,
    totalCents: t.totalCents,
  };
}

async function defaultCurrency(tenantId: string): Promise<string> {
  const row = await withTenant({ tenantId }, (tx) =>
    tx.storefrontSettings.findUnique({
      where: { tenantId },
      select: { defaultCurrency: true },
    })
  );
  return row?.defaultCurrency ?? 'USD';
}

const publicCartRoutes: FastifyPluginAsync = async (app) => {
  // Create a guest cart. Returns the cart id + the guest token the client must
  // echo via x-cart-token on every later call.
  app.post('/v1/public/commerce/cart', async (request) => {
    const { tenantId, ctx } = await publicCommerceContext(request);
    const token = randomUUID();
    const currency = await defaultCurrency(tenantId);
    const { cartId } = await cartService.create(ctx, {
      channel: 'storefront',
      currency,
      guestToken: token,
    });
    const cart = await serializePublicCart(ctx, tenantId, cartId);
    return ok({ ...cart, token });
  });

  app.get('/v1/public/commerce/cart/:cartId', async (request) => {
    const { cartId } = CartParam.parse(request.params);
    const { tenantId, ctx } = await publicCommerceContext(request);
    await assertCartToken(request, tenantId, cartId);
    const cart = await serializePublicCart(ctx, tenantId, cartId);
    return ok(cart);
  });

  app.post('/v1/public/commerce/cart/:cartId/items', async (request) => {
    const { cartId } = CartParam.parse(request.params);
    const body = AddItemBody.parse(request.body);
    const { tenantId, ctx } = await publicCommerceContext(request);
    await assertCartToken(request, tenantId, cartId);
    await cartService.addItem(ctx, { cartId, variantId: body.variantId, quantity: body.quantity });
    return ok(await serializePublicCart(ctx, tenantId, cartId));
  });

  app.patch('/v1/public/commerce/cart/:cartId/items/:itemId', async (request) => {
    const { cartId, itemId } = ItemParam.parse(request.params);
    const body = UpdateItemBody.parse(request.body);
    const { tenantId, ctx } = await publicCommerceContext(request);
    await assertCartToken(request, tenantId, cartId);
    await cartService.updateItem(ctx, { cartItemId: itemId, quantity: body.quantity });
    return ok(await serializePublicCart(ctx, tenantId, cartId));
  });

  app.delete('/v1/public/commerce/cart/:cartId/items/:itemId', async (request) => {
    const { cartId, itemId } = ItemParam.parse(request.params);
    const { tenantId, ctx } = await publicCommerceContext(request);
    await assertCartToken(request, tenantId, cartId);
    await cartService.removeItem(ctx, itemId);
    return ok(await serializePublicCart(ctx, tenantId, cartId));
  });

  app.post('/v1/public/commerce/cart/:cartId/discount', async (request) => {
    const { cartId } = CartParam.parse(request.params);
    const body = DiscountBody.parse(request.body);
    const { tenantId, ctx } = await publicCommerceContext(request);
    await assertCartToken(request, tenantId, cartId);
    try {
      await discountService.redeemCode(ctx, { cartId, code: body.code });
    } catch (err) {
      // Surface a clean 400 for an invalid/expired code rather than a 500.
      throw badRequest((err as Error).message || 'That code can’t be applied.');
    }
    return ok(await serializePublicCart(ctx, tenantId, cartId));
  });

  app.delete('/v1/public/commerce/cart/:cartId/discount/:code', async (request) => {
    const { cartId, code } = CodeParam.parse(request.params);
    const { tenantId } = await publicCommerceContext(request);
    await assertCartToken(request, tenantId, cartId);
    // No service method removes a cart discount; the join row is safe to drop
    // directly under RLS. Recompute happens lazily on the next cart read.
    await withTenant({ tenantId }, (tx) =>
      tx.cartDiscount.deleteMany({
        where: { cartId, discount: { code: { equals: code, mode: 'insensitive' } } },
      })
    );
    const ctx = toPublicCommerceContext(tenantId);
    return ok(await serializePublicCart(ctx, tenantId, cartId));
  });

  return Promise.resolve();
};

// Re-export to keep the module's intent obvious where it's registered.
export { resolveTenantId, toPublicCommerceContext };
export default publicCartRoutes;
