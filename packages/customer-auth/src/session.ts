// Session + reset token primitives. Tokens are opaque 256-bit random values;
// only their SHA-256 hash is persisted (in customer_sessions.token_hash /
// customer_password_resets.token_hash). The plaintext lives in the cookie
// (session) or the emailed link (reset) and is never stored.

import crypto from 'node:crypto';

/** The first-party httpOnly cookie carrying the storefront session token. */
export const SESSION_COOKIE_NAME = 'sparx_customer_session';

/** Session lifetime. Sessions slide forward on use (see verifyCustomerSession). */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** When a session has less than this remaining, verifying it extends it back to
 *  a full TTL — keeps active shoppers logged in without unbounded sessions. */
export const SESSION_REFRESH_THRESHOLD_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** Password-reset links expire quickly — single-use within this window. */
export const RESET_TTL_SECONDS = 60 * 60; // 1 hour

/** Default cookie attributes for the session cookie. `secure` is toggled off in
 *  dev (http://localhost) by the route layer. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: true,
  path: '/',
  maxAge: SESSION_TTL_SECONDS,
};

/** Mint a fresh opaque token + its at-rest hash. */
export function mintToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url'); // 256 bits
  return { token, tokenHash: hashToken(token) };
}

/** SHA-256 hex of a token — used both to store and to look up by token. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/** A Date `seconds` from now (no Date.now reliance beyond the standard clock). */
export function expiryFromNow(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}
