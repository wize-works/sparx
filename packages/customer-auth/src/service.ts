// Customer-auth service — register / authenticate / session lifecycle /
// password reset for storefront shoppers. See docs/27.
//
// Every function takes a tenant-scoped context `{ tenantId }` and runs inside
// withTenant(), so Postgres RLS isolates all reads/writes to that tenant. The
// tenant is always known up front (the storefront hostname), so there is no
// pre-tenant lookup and no global-email requirement — the same email can be a
// separate account at every merchant.
//
// Hard rules: passwords stored ONLY as Argon2id hashes; session/reset tokens
// stored ONLY as SHA-256 hashes; login + reset-request are enumeration-safe.

import { withTenant, type TxClient } from '@sparx/db';
import { z } from 'zod';

import { CustomerAuthError } from './errors';
import { dummyVerify, hashPassword, verifyPassword } from './hash';
import {
  RESET_TTL_SECONDS,
  SESSION_REFRESH_THRESHOLD_SECONDS,
  SESSION_TTL_SECONDS,
  expiryFromNow,
  hashToken,
  mintToken,
} from './session';

export interface CustomerAuthContext {
  tenantId: string;
}

/** Optional request metadata recorded on the session row for audit/security. */
export interface SessionMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface IssuedSession {
  customerId: string;
  /** Plaintext session token — set as the cookie value; never stored. */
  sessionToken: string;
  expiresAt: Date;
}

const emailSchema = z.string().trim().toLowerCase().email().max(255);

const passwordSchema = z.string().min(8).max(200);

const RegisterInput = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().max(255).optional(),
  lastName: z.string().trim().max(255).optional(),
});

const LoginInput = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

const ForgotInput = z.object({ email: emailSchema });

const ResetInput = z.object({
  token: z.string().min(1).max(512),
  password: passwordSchema,
});

// ─── session helper ──────────────────────────────────────────────────────

async function openSession(
  tx: TxClient,
  tenantId: string,
  customerId: string,
  credentialId: string,
  meta: SessionMeta
): Promise<IssuedSession> {
  const { token, tokenHash } = mintToken();
  const expiresAt = expiryFromNow(SESSION_TTL_SECONDS);
  await tx.customerSession.create({
    data: {
      tenantId,
      customerId,
      credentialId,
      tokenHash,
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });
  return { customerId, sessionToken: token, expiresAt };
}

// ─── register ──────────────────────────────────────────────────────────────

/**
 * Create a storefront account. If a `customers` row already exists for this
 * (tenant, email) without a credential — a guest who checked out, or a
 * CRM-imported prospect — the credential is attached to that row rather than
 * creating a duplicate (preserving the single customer spine). Throws
 * EMAIL_TAKEN if a credential already exists.
 */
export function registerCustomer(
  ctx: CustomerAuthContext,
  rawInput: unknown,
  meta: SessionMeta = {}
): Promise<IssuedSession> {
  const input = parse(RegisterInput, rawInput);

  return withTenant(ctx, async (tx) => {
    const existing = await tx.customer.findFirst({
      where: { email: input.email, deletedAt: null },
      select: {
        id: true,
        type: true,
        firstName: true,
        lastName: true,
        credential: { select: { id: true } },
      },
    });

    let customerId: string;
    if (existing) {
      if (existing.credential) {
        throw new CustomerAuthError('EMAIL_TAKEN', 'An account with that email already exists.');
      }
      customerId = existing.id;
      await tx.customer.update({
        where: { id: existing.id },
        data: {
          // Promote a prospect to a retail customer; fill in names if absent.
          ...(existing.type === 'prospect' ? { type: 'retail' } : {}),
          ...(input.firstName && !existing.firstName ? { firstName: input.firstName } : {}),
          ...(input.lastName && !existing.lastName ? { lastName: input.lastName } : {}),
        },
      });
    } else {
      const created = await tx.customer.create({
        data: {
          tenantId: ctx.tenantId,
          type: 'retail',
          email: input.email,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
        },
        select: { id: true },
      });
      customerId = created.id;
    }

    const passwordHash = await hashPassword(input.password);
    const credential = await tx.customerCredential.create({
      data: { tenantId: ctx.tenantId, customerId, passwordHash },
      select: { id: true },
    });

    return openSession(tx, ctx.tenantId, customerId, credential.id, meta);
  });
}

// ─── authenticate ────────────────────────────────────────────────────────

/**
 * Verify email + password and open a session. Returns null on any failure
 * (unknown email, no credential, wrong password) — the caller surfaces a single
 * generic "invalid credentials" message. Spends roughly equal CPU whether or
 * not the account exists (dummy verify) to flatten the timing signal.
 */
export function authenticateCustomer(
  ctx: CustomerAuthContext,
  rawInput: unknown,
  meta: SessionMeta = {}
): Promise<IssuedSession | null> {
  const input = parse(LoginInput, rawInput);

  return withTenant(ctx, async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { email: input.email, deletedAt: null },
      select: { id: true, credential: { select: { id: true, passwordHash: true } } },
    });

    if (!customer?.credential) {
      // No account / no password set — burn equivalent time, then fail.
      await dummyVerify(input.password);
      return null;
    }

    const ok = await verifyPassword(customer.credential.passwordHash, input.password);
    if (!ok) return null;

    await tx.customerCredential.update({
      where: { id: customer.credential.id },
      data: { lastLoginAt: new Date() },
    });

    return openSession(tx, ctx.tenantId, customer.id, customer.credential.id, meta);
  });
}

// ─── session verify / revoke ───────────────────────────────────────────────

export interface VerifiedSession {
  customerId: string;
  credentialId: string;
}

/**
 * Resolve a session token to its customer, or null if missing/expired. Slides
 * the expiry forward when it's within the refresh threshold so active shoppers
 * stay logged in.
 */
export function verifyCustomerSession(
  ctx: CustomerAuthContext,
  token: string
): Promise<VerifiedSession | null> {
  if (!token) return Promise.resolve(null);
  const tokenHash = hashToken(token);

  return withTenant(ctx, async (tx) => {
    const session = await tx.customerSession.findFirst({
      where: { tokenHash },
      select: { id: true, customerId: true, credentialId: true, expiresAt: true },
    });
    if (!session) return null;

    const now = Date.now();
    if (session.expiresAt.getTime() <= now) {
      // Expired — best-effort cleanup, then deny.
      await tx.customerSession.deleteMany({ where: { id: session.id } });
      return null;
    }

    if (session.expiresAt.getTime() - now < SESSION_REFRESH_THRESHOLD_SECONDS * 1000) {
      await tx.customerSession.update({
        where: { id: session.id },
        data: { expiresAt: expiryFromNow(SESSION_TTL_SECONDS) },
      });
    }

    return { customerId: session.customerId, credentialId: session.credentialId };
  });
}

/** Revoke (delete) the session for a token. Idempotent. */
export function revokeCustomerSession(ctx: CustomerAuthContext, token: string): Promise<void> {
  if (!token) return Promise.resolve();
  const tokenHash = hashToken(token);
  return withTenant(ctx, async (tx) => {
    await tx.customerSession.deleteMany({ where: { tokenHash } });
  });
}

// ─── password reset ──────────────────────────────────────────────────────

export interface ResetRequest {
  customerId: string;
  email: string;
  /** Plaintext reset token — put in the emailed link; never stored. */
  resetToken: string;
  expiresAt: Date;
}

/**
 * Begin a password reset. Returns the reset token + recipient ONLY when a
 * registered account exists; returns null otherwise. The caller ALWAYS responds
 * with a generic 200 (enumeration-safe) and only sends the email when this
 * returns non-null.
 */
export function requestPasswordReset(
  ctx: CustomerAuthContext,
  rawInput: unknown
): Promise<ResetRequest | null> {
  const input = parse(ForgotInput, rawInput);

  return withTenant(ctx, async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { email: input.email, deletedAt: null },
      select: { id: true, email: true, credential: { select: { id: true } } },
    });
    if (!customer?.credential || !customer.email) return null;

    const { token, tokenHash } = mintToken();
    const expiresAt = expiryFromNow(RESET_TTL_SECONDS);
    await tx.customerPasswordReset.create({
      data: { tenantId: ctx.tenantId, customerId: customer.id, tokenHash, expiresAt },
    });

    return { customerId: customer.id, email: customer.email, resetToken: token, expiresAt };
  });
}

/**
 * Consume a reset token and set a new password. Returns true on success, false
 * if the token is unknown, expired, or already used. Invalidates all of the
 * customer's existing sessions on success (force re-login everywhere).
 */
export function resetPassword(ctx: CustomerAuthContext, rawInput: unknown): Promise<boolean> {
  const input = parse(ResetInput, rawInput);
  const tokenHash = hashToken(input.token);

  return withTenant(ctx, async (tx) => {
    const reset = await tx.customerPasswordReset.findFirst({
      where: { tokenHash },
      select: { id: true, customerId: true, expiresAt: true, usedAt: true },
    });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) return false;

    const passwordHash = await hashPassword(input.password);
    await tx.customerCredential.update({
      where: { customerId: reset.customerId },
      data: { passwordHash },
    });
    await tx.customerPasswordReset.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    });
    // Revoke every active session for this customer — a reset implies the old
    // credential may be compromised.
    await tx.customerSession.deleteMany({ where: { customerId: reset.customerId } });
    return true;
  });
}

// ─── helpers ───────────────────────────────────────────────────────────────

function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new CustomerAuthError(
      'INVALID_INPUT',
      result.error.issues[0]?.message ?? 'Invalid input.'
    );
  }
  return result.data;
}
