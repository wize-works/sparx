// Public customer-account surface for the storefront (Layer 2 — shoppers).
// See docs/27-customer-accounts-storefront-auth.md.
//
//   POST /v1/public/commerce/account/register ?tenant=  { email, password, firstName?, lastName? }
//   POST /v1/public/commerce/account/login    ?tenant=  { email, password }
//   POST /v1/public/commerce/account/logout   ?tenant=
//   GET  /v1/public/commerce/account/me       ?tenant=
//
// Auth is a first-party httpOnly cookie (sparx_customer_session) set here and
// relayed to the browser by the storefront's /api/sparx proxy. The tenant is
// resolved from ?tenant=<slug> (the storefront hostname upstream), so every
// call runs inside a tenant context and RLS isolates the customer's data.
//
// Forgot/reset-password endpoints ship with the email templates in a later
// slice; this file covers the core register → login → session → logout loop
// plus guest-cart claiming on auth.

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { isModuleEnabled } from '@sparx/auth';
import { orderService } from '@sparx/crm';
import { withTenant } from '@sparx/db';
import {
  authenticateCustomer,
  CustomerAuthError,
  registerCustomer,
  revokeCustomerSession,
  verifyCustomerSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  type CustomerAuthContext,
} from '@sparx/customer-auth';
import { ok, paged } from '@sparx/api-core/envelope';
import {
  conflict,
  moduleDisabled,
  notFound,
  unauthorized,
  validationError,
} from '@sparx/api-core/errors';

import { resolveTenantId } from '../../../lib/public-commerce-context.js';

const RegisterBody = z.object({
  email: z.string().min(3).max(255),
  password: z.string().min(1).max(200),
  firstName: z.string().max(255).optional(),
  lastName: z.string().max(255).optional(),
});
const LoginBody = z.object({
  email: z.string().min(3).max(255),
  password: z.string().min(1).max(200),
});

const OrdersQuery = z.object({
  tenant: z.string(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(10),
});
const OrderParam = z.object({ orderId: z.string().uuid() });
const AddressParam = z.object({ addressId: z.string().uuid() });

const AddressBody = z.object({
  type: z.enum(['shipping', 'billing', 'both']).default('shipping'),
  label: z.string().max(120).optional(),
  recipientName: z.string().max(255).optional(),
  company: z.string().max(255).optional(),
  line1: z.string().min(1).max(255),
  line2: z.string().max(255).optional(),
  city: z.string().min(1).max(120),
  region: z.string().max(120).optional(),
  postalCode: z.string().max(32).optional(),
  country: z.string().length(2),
  phone: z.string().max(50).optional(),
  isDefault: z.boolean().optional(),
});
const ProfileBody = z.object({
  firstName: z.string().max(255).nullable().optional(),
  lastName: z.string().max(255).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
});

/** CRM money columns are Decimal(12,2) dollars; the storefront speaks integer
 *  cents. Convert at the boundary. */
function toCents(value: unknown): number {
  return Math.round(Number(value) * 100);
}

// Cookies must not carry Secure over plaintext localhost in dev, or the browser
// drops them. Prod storefronts are always https.
const SECURE_COOKIE = process.env.NODE_ENV === 'production';

interface CustomerProfile {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
}

/** Resolve the tenant and assert the Storefront module is active (404 otherwise). */
async function accountContext(request: FastifyRequest): Promise<CustomerAuthContext> {
  const tenantId = await resolveTenantId(request);
  if (!(await isModuleEnabled(tenantId, 'storefront'))) throw moduleDisabled('storefront');
  return { tenantId };
}

function sessionMeta(request: FastifyRequest): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const ua = request.headers['user-agent'];
  return { ipAddress: request.ip || null, userAgent: typeof ua === 'string' ? ua : null };
}

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: SECURE_COOKIE,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

async function loadProfile(
  ctx: CustomerAuthContext,
  customerId: string
): Promise<CustomerProfile | null> {
  return withTenant(ctx, (tx) =>
    tx.customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true },
    })
  );
}

/**
 * Claim the active guest cart for a freshly-authenticated customer: stamp the
 * customer id onto the cart that the guest token owns. The guest token is left
 * in place so the client's existing x-cart-token keeps authorizing cart calls
 * for this session — the cart simply gains an owner (so the resulting order is
 * attributed to the account). Best-effort: never fail auth over the cart.
 */
async function claimGuestCart(
  ctx: CustomerAuthContext,
  request: FastifyRequest,
  customerId: string
): Promise<void> {
  const token = request.headers['x-cart-token'];
  if (!token || typeof token !== 'string') return;
  try {
    await withTenant(ctx, (tx) =>
      tx.cart.updateMany({
        where: { guestToken: token, customerId: null },
        data: { customerId },
      })
    );
  } catch {
    // Swallow — cart claiming is a convenience, not part of the auth contract.
  }
}

/** Read + verify the session cookie, returning the customer id or throwing 401. */
async function requireCustomer(request: FastifyRequest, ctx: CustomerAuthContext): Promise<string> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (!token) throw unauthorized('Not signed in.');
  const session = await verifyCustomerSession(ctx, token);
  if (!session) throw unauthorized('Session expired. Please sign in again.');
  return session.customerId;
}

const publicAccountRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/public/commerce/account/register', async (request, reply) => {
    const body = RegisterBody.parse(request.body);
    const ctx = await accountContext(request);
    let session;
    try {
      session = await registerCustomer(ctx, body, sessionMeta(request));
    } catch (err) {
      if (err instanceof CustomerAuthError) {
        if (err.code === 'EMAIL_TAKEN') throw conflict(err.message);
        throw validationError(err.message);
      }
      throw err;
    }
    setSessionCookie(reply, session.sessionToken);
    await claimGuestCart(ctx, request, session.customerId);
    return ok({ customer: await loadProfile(ctx, session.customerId) });
  });

  app.post('/v1/public/commerce/account/login', async (request, reply) => {
    const body = LoginBody.parse(request.body);
    const ctx = await accountContext(request);
    const session = await authenticateCustomer(ctx, body, sessionMeta(request));
    if (!session) throw unauthorized('Invalid email or password.');
    setSessionCookie(reply, session.sessionToken);
    await claimGuestCart(ctx, request, session.customerId);
    return ok({ customer: await loadProfile(ctx, session.customerId) });
  });

  app.post('/v1/public/commerce/account/logout', async (request, reply) => {
    const ctx = await accountContext(request);
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) await revokeCustomerSession(ctx, token);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return ok({ ok: true });
  });

  app.get('/v1/public/commerce/account/me', async (request) => {
    const ctx = await accountContext(request);
    const customerId = await requireCustomer(request, ctx);
    const customer = await loadProfile(ctx, customerId);
    if (!customer) throw notFound('Customer', customerId);
    return ok({ customer });
  });

  app.patch('/v1/public/commerce/account/me', async (request) => {
    const body = ProfileBody.parse(request.body);
    const ctx = await accountContext(request);
    const customerId = await requireCustomer(request, ctx);
    await withTenant(ctx, (tx) =>
      tx.customer.updateMany({
        where: { id: customerId, deletedAt: null },
        data: {
          ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
          ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
        },
      })
    );
    return ok({ customer: await loadProfile(ctx, customerId) });
  });

  // ── Orders ────────────────────────────────────────────────────────────
  app.get('/v1/public/commerce/account/orders', async (request) => {
    const { page, pageSize } = OrdersQuery.parse(request.query);
    const ctx = await accountContext(request);
    const customerId = await requireCustomer(request, ctx);
    const { items, total } = await orderService.list(ctx, {
      customerId,
      take: pageSize,
      skip: (page - 1) * pageSize,
    });
    return paged(
      items.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        totalCents: toCents(o.total),
        currency: o.currency,
        placedAt: o.placedAt.toISOString(),
      })),
      { page, per_page: pageSize, total, total_pages: Math.ceil(total / pageSize) }
    );
  });

  app.get('/v1/public/commerce/account/orders/:orderId', async (request) => {
    const { orderId } = OrderParam.parse(request.params);
    const ctx = await accountContext(request);
    const customerId = await requireCustomer(request, ctx);
    const order = await orderService.get(ctx, orderId);
    // get() scopes to tenant, not customer — enforce ownership without leaking
    // existence of other customers' orders.
    if (order.customerId !== customerId) throw notFound('Order', orderId);
    return ok({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      currency: order.currency,
      placedAt: order.placedAt.toISOString(),
      subtotalCents: toCents(order.subtotal),
      taxTotalCents: toCents(order.taxTotal),
      shippingTotalCents: toCents(order.shippingTotal),
      discountTotalCents: toCents(order.discountTotal),
      totalCents: toCents(order.total),
      shippingAddress: order.shippingAddress ?? null,
      items: order.items.map((it) => ({
        id: it.id,
        name: it.name,
        sku: it.sku,
        quantity: it.quantity,
        unitPriceCents: toCents(it.unitPrice),
        lineTotalCents: toCents(it.lineTotal),
      })),
    });
  });

  // ── Addresses ─────────────────────────────────────────────────────────
  app.get('/v1/public/commerce/account/addresses', async (request) => {
    const ctx = await accountContext(request);
    const customerId = await requireCustomer(request, ctx);
    const addresses = await withTenant(ctx, (tx) =>
      tx.customerAddress.findMany({
        where: { customerId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      })
    );
    return ok({ addresses });
  });

  app.post('/v1/public/commerce/account/addresses', async (request) => {
    const body = AddressBody.parse(request.body);
    const ctx = await accountContext(request);
    const customerId = await requireCustomer(request, ctx);
    const address = await withTenant(ctx, async (tx) => {
      if (body.isDefault) {
        await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
      }
      return tx.customerAddress.create({
        data: { tenantId: ctx.tenantId, customerId, ...body, country: body.country.toUpperCase() },
      });
    });
    return ok({ address });
  });

  app.patch('/v1/public/commerce/account/addresses/:addressId', async (request) => {
    const { addressId } = AddressParam.parse(request.params);
    const body = AddressBody.partial().parse(request.body);
    const ctx = await accountContext(request);
    const customerId = await requireCustomer(request, ctx);
    const updated = await withTenant(ctx, async (tx) => {
      const owned = await tx.customerAddress.findFirst({
        where: { id: addressId, customerId },
        select: { id: true },
      });
      if (!owned) return null;
      if (body.isDefault) {
        await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
      }
      return tx.customerAddress.update({
        where: { id: addressId },
        data: { ...body, ...(body.country ? { country: body.country.toUpperCase() } : {}) },
      });
    });
    if (!updated) throw notFound('Address', addressId);
    return ok({ address: updated });
  });

  app.delete('/v1/public/commerce/account/addresses/:addressId', async (request) => {
    const { addressId } = AddressParam.parse(request.params);
    const ctx = await accountContext(request);
    const customerId = await requireCustomer(request, ctx);
    await withTenant(ctx, (tx) =>
      tx.customerAddress.deleteMany({ where: { id: addressId, customerId } })
    );
    return ok({ ok: true });
  });

  return Promise.resolve();
};

export default publicAccountRoutes;
