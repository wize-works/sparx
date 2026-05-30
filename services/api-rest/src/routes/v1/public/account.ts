// Public customer-account surface for the storefront (Layer 2 — shoppers).
// See docs/27-customer-accounts-storefront-auth.md.
//
//   POST   /v1/public/commerce/account/register ?tenant=  { email, password, firstName?, lastName? }
//   POST   /v1/public/commerce/account/login    ?tenant=  { email, password }
//   POST   /v1/public/commerce/account/logout   ?tenant=
//   GET    /v1/public/commerce/account/me        ?tenant=
//   PATCH  /v1/public/commerce/account/me        ?tenant=  { firstName?, lastName?, phone? }
//   POST   /v1/public/commerce/account/password/forgot ?tenant=  { email }
//   POST   /v1/public/commerce/account/password/reset  ?tenant=  { token, password }
//   GET    /v1/public/commerce/account/orders    ?tenant=  (paged, customer-scoped)
//   GET    /v1/public/commerce/account/orders/:orderId   (ownership-checked)
//   GET/POST/PATCH/DELETE /v1/public/commerce/account/addresses[/:addressId]
//
// Auth is a first-party httpOnly cookie (sparx_customer_session) set here and
// relayed to the browser by the storefront's /api/sparx proxy. The tenant is
// resolved from ?tenant=<slug> (the storefront hostname upstream), so every
// call runs inside a tenant context and RLS isolates the customer's data.
// Login/register/forgot are enumeration-safe and per-IP rate-limited; the reset
// email reuses the existing 'password-reset' template via the email.send event.

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { isModuleEnabled } from '@sparx/auth';
import { orderService } from '@sparx/crm';
import { prisma, withTenant } from '@sparx/db';
import { createPublisher, publishEvent, type PublisherLogger } from '@sparx/events';
import {
  authenticateCustomer,
  CustomerAuthError,
  registerCustomer,
  requestPasswordReset,
  resetPassword,
  revokeCustomerSession,
  verifyCustomerSession,
  RESET_TTL_SECONDS,
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

import { env } from '../../../env.js';
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

const ForgotBody = z.object({ email: z.string().min(3).max(255) });
const ResetBody = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(8).max(200),
});

const WishlistAddBody = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
});
const WishlistParam = z.object({ productId: z.string().uuid() });

// Tighter limits on the credential endpoints than the global rate-limit, to
// blunt credential-stuffing / reset-spam. Per-IP via @fastify/rate-limit.
const AUTH_RATE_LIMIT = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

// Pub/Sub publisher for the password-reset email (reuses the existing
// 'password-reset' template). Stdout stub in dev (no GCP_PROJECT_ID).
const pubLogger: PublisherLogger = {
  info: (obj, msg) => console.log(JSON.stringify({ level: 'info', ...obj, msg })),
  warn: (obj, msg) => console.warn(JSON.stringify({ level: 'warn', ...obj, msg })),
  error: (obj, msg) => console.error(JSON.stringify({ level: 'error', ...obj, msg })),
};
const emailPublisher = createPublisher({ projectId: env.GCP_PROJECT_ID, logger: pubLogger });

/** The storefront base URL for a tenant — its custom primary domain if set,
 *  else the <slug>.sparx.zone subdomain. Used to build the reset link so the
 *  email points at the shopper's actual storefront (never a client-supplied
 *  origin, which would be a token-phishing vector). */
async function storefrontBaseUrl(tenantId: string, slug: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  const settings = tenant?.settings as { primaryDomain?: unknown } | null;
  const domain =
    settings && typeof settings.primaryDomain === 'string' && settings.primaryDomain
      ? settings.primaryDomain
      : `${slug}.sparx.zone`;
  return `https://${domain}`;
}

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
  app.post('/v1/public/commerce/account/register', AUTH_RATE_LIMIT, async (request, reply) => {
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

  app.post('/v1/public/commerce/account/login', AUTH_RATE_LIMIT, async (request, reply) => {
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

  // ── Password reset ──────────────────────────────────────────────────────
  // Both endpoints are enumeration-safe: forgot always returns 200 regardless
  // of whether the email exists, and only sends mail when it does.
  app.post('/v1/public/commerce/account/password/forgot', AUTH_RATE_LIMIT, async (request) => {
    const body = ForgotBody.parse(request.body);
    const tenantId = await resolveTenantId(request);
    if (!(await isModuleEnabled(tenantId, 'storefront'))) throw moduleDisabled('storefront');
    const slug = (request.query as { tenant: string }).tenant;

    const reset = await requestPasswordReset({ tenantId }, body);
    if (reset) {
      const base = await storefrontBaseUrl(tenantId, slug);
      const resetUrl = `${base}/account/reset?token=${encodeURIComponent(reset.resetToken)}`;
      await publishEvent(
        emailPublisher,
        'email.send',
        tenantId,
        reset.customerId,
        {
          to: reset.email,
          template: 'password-reset' as const,
          props: { resetUrl, expiresInMinutes: Math.round(RESET_TTL_SECONDS / 60) },
        },
        pubLogger
      );
    }
    return ok({ ok: true });
  });

  app.post('/v1/public/commerce/account/password/reset', AUTH_RATE_LIMIT, async (request) => {
    const body = ResetBody.parse(request.body);
    const tenantId = await resolveTenantId(request);
    if (!(await isModuleEnabled(tenantId, 'storefront'))) throw moduleDisabled('storefront');
    const okReset = await resetPassword({ tenantId }, body);
    if (!okReset) throw validationError('This reset link is invalid or has expired.');
    return ok({ ok: true });
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

  // ── Wishlist ──────────────────────────────────────────────────────────
  app.get('/v1/public/commerce/account/wishlist', async (request) => {
    const ctx = await accountContext(request);
    const customerId = await requireCustomer(request, ctx);
    const wishlist = await withTenant(ctx, (tx) =>
      tx.wishlist.findFirst({
        where: { customerId },
        orderBy: { isDefault: 'desc' },
        include: {
          items: {
            orderBy: { createdAt: 'desc' },
            include: {
              product: {
                select: {
                  handle: true,
                  title: true,
                  images: { take: 1, orderBy: { position: 'asc' }, select: { mediaAssetId: true } },
                  variants: { select: { basePriceCents: true, priceModifierCents: true } },
                },
              },
            },
          },
        },
      })
    );
    const items = (wishlist?.items ?? []).map((it) => {
      const prices = it.product.variants.map((v) => v.basePriceCents + v.priceModifierCents);
      return {
        productId: it.productId,
        variantId: it.variantId,
        handle: it.product.handle,
        title: it.product.title,
        imageMediaId: it.product.images[0]?.mediaAssetId ?? null,
        priceMinCents: prices.length ? Math.min(...prices) : null,
      };
    });
    return ok({ items });
  });

  app.post('/v1/public/commerce/account/wishlist', async (request) => {
    const body = WishlistAddBody.parse(request.body);
    const ctx = await accountContext(request);
    const customerId = await requireCustomer(request, ctx);
    await withTenant(ctx, async (tx) => {
      // Find-or-create the customer's default wishlist.
      let wishlist = await tx.wishlist.findFirst({
        where: { customerId },
        orderBy: { isDefault: 'desc' },
        select: { id: true },
      });
      wishlist ??= await tx.wishlist.create({
        data: { tenantId: ctx.tenantId, customerId },
        select: { id: true },
      });
      // Dedupe by product (the schema has no unique on (wishlist, product)).
      const existing = await tx.wishlistItem.findFirst({
        where: { wishlistId: wishlist.id, productId: body.productId },
        select: { id: true },
      });
      if (!existing) {
        await tx.wishlistItem.create({
          data: {
            tenantId: ctx.tenantId,
            wishlistId: wishlist.id,
            productId: body.productId,
            variantId: body.variantId ?? null,
          },
        });
      }
    });
    return ok({ ok: true });
  });

  app.delete('/v1/public/commerce/account/wishlist/:productId', async (request) => {
    const { productId } = WishlistParam.parse(request.params);
    const ctx = await accountContext(request);
    const customerId = await requireCustomer(request, ctx);
    await withTenant(ctx, (tx) =>
      tx.wishlistItem.deleteMany({ where: { productId, wishlist: { customerId } } })
    );
    return ok({ ok: true });
  });

  return Promise.resolve();
};

export default publicAccountRoutes;
