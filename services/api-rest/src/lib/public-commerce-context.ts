// Public (unauthenticated) commerce context for the storefront write surface.
//
// The admin commerce routes derive their ServiceContext from a staff JWT
// (toCommerceContext). The storefront has no staff identity — carts and
// checkout are driven by anonymous shoppers — so this builds a ServiceContext
// from the `?tenant=<slug>` query param instead, with no userId (service
// actor). RLS still scopes every service call to the resolved tenant.
//
// Guest ownership of a cart/checkout is proven by an opaque token the client
// holds (issued on cart creation, echoed back via the `x-cart-token` header).
// Mutating routes call assertCartToken() to confirm the caller owns the cart
// before handing off to the service layer.

import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import type { ServiceContext } from '@sparx/commerce';
import { isModuleEnabled } from '@sparx/auth';
import { prisma, withTenant } from '@sparx/db';
import { forbidden, moduleDisabled, notFound } from '@sparx/api-core/errors';

const TenantQuery = z.object({ tenant: z.string().min(1).max(63) });

/** Resolve the tenant slug carried on the query string to its id, or 404. */
export async function resolveTenantId(request: FastifyRequest): Promise<string> {
  const { tenant } = TenantQuery.parse(request.query);
  const row = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { id: true } });
  if (!row) throw notFound('Tenant', tenant);
  if (row.id === '00000000-0000-0000-0000-000000000000') throw notFound('Tenant', tenant);
  return row.id;
}

/** A service context for the public storefront — tenant-scoped, no staff user. */
export function toPublicCommerceContext(tenantId: string): ServiceContext {
  return { tenantId };
}

/** 404 (via MODULE_DISABLED) when the tenant hasn't activated Commerce. */
export async function requirePublicCommerceModule(tenantId: string): Promise<void> {
  const enabled = await isModuleEnabled(tenantId, 'commerce');
  if (!enabled) throw moduleDisabled('commerce');
}

/** Resolve tenant + assert Commerce is active in one step. */
export async function publicCommerceContext(request: FastifyRequest): Promise<{
  tenantId: string;
  ctx: ServiceContext;
}> {
  const tenantId = await resolveTenantId(request);
  await requirePublicCommerceModule(tenantId);
  return { tenantId, ctx: toPublicCommerceContext(tenantId) };
}

/**
 * Confirm the caller owns `cartId`: either the `x-cart-token` header matches the
 * cart's guest token, or (future) the authenticated customer owns it. Throws
 * 404 if the cart doesn't exist for this tenant, 403 if the token doesn't match.
 */
export async function assertCartToken(
  request: FastifyRequest,
  tenantId: string,
  cartId: string
): Promise<void> {
  const token = request.headers['x-cart-token'];
  const cart = await withTenant({ tenantId }, (tx) =>
    tx.cart.findFirst({ where: { id: cartId }, select: { id: true, guestToken: true } })
  );
  if (!cart) throw notFound('Cart', cartId);
  if (!token || typeof token !== 'string' || cart.guestToken !== token) {
    throw forbidden('Cart token does not match.');
  }
}
