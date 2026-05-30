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
import { ok } from '@sparx/api-core/envelope';
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

  return Promise.resolve();
};

export default publicAccountRoutes;
