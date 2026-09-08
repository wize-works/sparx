// Shopper OAuth authorization-server metadata + authorize-request validation
// (docs/113 §5, docs/27 §6). The customer instance is the AS; api-rest mounts its
// Better Auth handler under `<store-origin>/v1/public/auth/*` (Caddy routes that
// path to api-rest, so the AS lives on the store's OWN origin — where the
// sparx_customer_session cookie lives). We serve OUR OWN AS metadata (not Better
// Auth's default, which only knows the openid/profile/email/offline_access
// scopes) so the discovery document advertises the real shopper scope vocabulary
// and the store-origin endpoints.
//
// Everything here is defensive: a public DCR client + a phishable redirect means
// we exact-match the redirect URI, require PKCE/S256 at our own layer (not only
// trust the plugin), and refuse to mint a token for any resource other than this
// store's MCP server.

import { withTenant } from '@wizeworks/db';

import { CUSTOMER_ALL_OAUTH_SCOPES } from './mcp-scopes';

/** RFC 8414 authorization-server metadata for a store origin. The endpoints all
 *  live on the store's own origin under `/v1/public/auth/mcp/*` (Better Auth's
 *  mcp() plugin routes), so the browser stays same-origin with its session
 *  cookie through authorize + consent. `storeOrigin` is `https://<host>` with no
 *  trailing slash. */
export function buildCustomerAuthServerMetadata(storeOrigin: string): Record<string, unknown> {
  const base = `${storeOrigin}/v1/public/auth`;
  return {
    issuer: storeOrigin,
    authorization_endpoint: `${base}/mcp/authorize`,
    token_endpoint: `${base}/mcp/token`,
    registration_endpoint: `${base}/mcp/register`,
    jwks_uri: `${base}/jwks`,
    scopes_supported: [...CUSTOMER_ALL_OAUTH_SCOPES],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    // OAuth 2.1 / MCP: PKCE is mandatory. Signal it in metadata too.
    pkce_required: true,
  };
}

// ─── Registered DCR client lookup ────────────────────────────────────────────

export interface RegisteredCustomerMcpClient {
  clientId: string;
  name: string | null;
  /** Exact-match redirect URI allowlist (DCR-registered, comma-joined in the row). */
  redirectUrls: string[];
  /** 'public' (PKCE) | 'web' (confidential) | … */
  type: string;
  disabled: boolean;
}

interface ClientRow {
  client_id: string;
  name: string | null;
  redirect_urls: string;
  type: string;
  disabled: boolean;
}

/** Look up a DCR-registered customer client by client_id within the tenant.
 *  Runs under RLS (the customer_oauth_applications table is FORCE-RLS + tenant
 *  scoped), so a client registered for another tenant is invisible. Returns null
 *  if unknown. */
export function getRegisteredCustomerMcpClient(
  tenantId: string,
  clientId: string
): Promise<RegisteredCustomerMcpClient | null> {
  if (!clientId) return Promise.resolve(null);
  return withTenant({ tenantId }, async (tx) => {
    const rows = await tx.$queryRaw<ClientRow[]>`
      SELECT client_id, name, redirect_urls, type, disabled
        FROM customer_oauth_applications
       WHERE client_id = ${clientId}
       LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      clientId: row.client_id,
      name: row.name,
      redirectUrls: row.redirect_urls.split(',').filter(Boolean),
      type: row.type,
      disabled: row.disabled,
    };
  });
}

// ─── Authorize-request validation ────────────────────────────────────────────

export interface CustomerAuthorizeParams {
  responseType: string;
  clientId: string;
  redirectUri: string;
  /** Raw requested scope string (may be empty). */
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string;
  nonce: string;
}

type QueryLike = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? '') : (v ?? '');

export function parseCustomerAuthorizeParams(q: QueryLike): CustomerAuthorizeParams {
  return {
    responseType: one(q.response_type),
    clientId: one(q.client_id),
    redirectUri: one(q.redirect_uri),
    scope: one(q.scope),
    state: one(q.state),
    codeChallenge: one(q.code_challenge),
    codeChallengeMethod: one(q.code_challenge_method),
    resource: one(q.resource),
    nonce: one(q.nonce),
  };
}

/** The authorize params as a plain record (empties dropped) — used to seed the
 *  consent page URL + the final authorize redirect. */
export function customerAuthorizeParamsRecord(p: CustomerAuthorizeParams): Record<string, string> {
  const rec: Record<string, string> = {
    response_type: p.responseType,
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    code_challenge: p.codeChallenge,
    code_challenge_method: p.codeChallengeMethod,
  };
  if (p.scope) rec.scope = p.scope;
  if (p.state) rec.state = p.state;
  if (p.resource) rec.resource = p.resource;
  if (p.nonce) rec.nonce = p.nonce;
  return rec;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export type CustomerAuthorizeValidation =
  { ok: true; client: RegisteredCustomerMcpClient } | { ok: false; error: string };

/** Validate an authorize request against protocol rules + the registered client.
 *  `storeOrigin` is the AS origin (the store's own origin); an RFC 8707 `resource`
 *  must be same-origin (the store's MCP lives at `<storeOrigin>/mcp`). Returns the
 *  client on success, or a human-readable error — we NEVER redirect to an
 *  unvalidated redirect_uri. */
export async function validateCustomerAuthorizeRequest(
  tenantId: string,
  p: CustomerAuthorizeParams,
  storeOrigin: string
): Promise<CustomerAuthorizeValidation> {
  if (p.responseType !== 'code') {
    return {
      ok: false,
      error: 'Unsupported response type — only the authorization-code flow is allowed.',
    };
  }
  if (!p.clientId) return { ok: false, error: 'Missing client_id.' };
  if (!p.redirectUri) return { ok: false, error: 'Missing redirect_uri.' };
  // OAuth 2.1 / MCP: PKCE with S256 is mandatory. Enforce here too, not only in
  // the token endpoint, so a non-PKCE request never reaches consent.
  if (!p.codeChallenge) return { ok: false, error: 'Missing PKCE code_challenge.' };
  if (p.codeChallengeMethod.toLowerCase() !== 's256') {
    return { ok: false, error: 'Only the S256 PKCE method is supported.' };
  }

  const client = await getRegisteredCustomerMcpClient(tenantId, p.clientId);
  if (!client) {
    return { ok: false, error: 'Unknown OAuth client. Try reconnecting from your assistant.' };
  }
  if (client.disabled) {
    return { ok: false, error: 'This connection has been disabled.' };
  }

  // Exact-match the redirect URI against the DCR allowlist — the core
  // anti-phishing gate. Never a prefix/substring match.
  if (!client.redirectUrls.includes(p.redirectUri)) {
    return { ok: false, error: 'The redirect URI does not match this client’s registration.' };
  }

  // RFC 8707: if the client names a target resource, it must be THIS store's MCP
  // server (same origin as the AS). Refuse to mint a token for a different one.
  if (p.resource) {
    const got = originOf(p.resource);
    if (!got || got !== storeOrigin) {
      return {
        ok: false,
        error: 'This authorization targets a resource other than this store’s assistant.',
      };
    }
  }

  return { ok: true, client };
}
