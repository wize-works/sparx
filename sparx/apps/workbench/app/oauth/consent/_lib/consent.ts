// Shared validation for the MCP OAuth consent screen (docs/07 §5).
//
// Both the page (render) and the approve/deny submit route (authoritative
// re-validation) run these checks. Everything here is defensive: a public DCR
// client + a phishable redirect means we must exact-match the redirect URI,
// require PKCE/S256 at our own layer (not only trust the plugin), and refuse to
// issue a token for any resource other than our MCP server.

import 'server-only';
import { getRegisteredMcpClient, type RegisteredMcpClient } from '@wizeworks/auth';
import { mcpResourceUrl as brandMcpResourceUrl } from '@wizeworks/links/server';

export interface AuthorizeParams {
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

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? '') : (v ?? '');

export function parseAuthorizeParams(sp: SP): AuthorizeParams {
  return {
    responseType: one(sp.response_type),
    clientId: one(sp.client_id),
    redirectUri: one(sp.redirect_uri),
    scope: one(sp.scope),
    state: one(sp.state),
    codeChallenge: one(sp.code_challenge),
    codeChallengeMethod: one(sp.code_challenge_method),
    resource: one(sp.resource),
    nonce: one(sp.nonce),
  };
}

/**
 * Canonical resource identifier of the MCP server this authorization targets —
 * sparx's, because this app is sparx's authorization server and no other brand's
 * consent can be approved here.
 *
 * The brand is named rather than read from the request for exactly that reason:
 * it is this deployment's own identity, not a per-request variable. Resolved
 * through the shared seam so it matches what api-mcp advertises at
 * mcp.sparx.works and what the console tells a customer to paste.
 */
export function mcpResourceUrl(): string {
  return brandMcpResourceUrl('sparx');
}

/** The authorize params as a plain record (empties dropped) — used to seed the
 *  consent form's hidden fields. */
export function authorizeParamsRecord(p: AuthorizeParams): Record<string, string> {
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

/** Path that reproduces the consent page for this request — used to bounce back
 *  on error and as the sign-in callbackURL. */
export function consentReturnPath(p: AuthorizeParams): string {
  return `/oauth/consent?${new URLSearchParams(authorizeParamsRecord(p)).toString()}`;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export type ValidationResult =
  { ok: true; client: RegisteredMcpClient } | { ok: false; error: string };

/** Validate an authorize request against protocol rules + the registered
 *  client. Returns the client on success, or a human-readable error to show on
 *  the consent page (we never redirect to an unvalidated redirect_uri). */
export async function validateAuthorizeRequest(p: AuthorizeParams): Promise<ValidationResult> {
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

  const client = await getRegisteredMcpClient(p.clientId);
  if (!client)
    return { ok: false, error: 'Unknown OAuth client. Try reconnecting from your assistant.' };
  if (client.disabled)
    return { ok: false, error: 'This connection has been disabled by an administrator.' };

  // Exact-match the redirect URI against the DCR allowlist — the core
  // anti-phishing gate. Never a prefix/substring match.
  if (!client.redirectUrls.includes(p.redirectUri)) {
    return { ok: false, error: 'The redirect URI does not match this client’s registration.' };
  }

  // RFC 8707: if the client names a target resource, it must be OUR MCP server.
  // Refuse to mint a token intended for a different resource.
  if (p.resource) {
    const want = originOf(mcpResourceUrl());
    const got = originOf(p.resource);
    if (!got || got !== want) {
      return {
        ok: false,
        error: 'This authorization targets a resource other than the sparx MCP server.',
      };
    }
  }

  return { ok: true, client };
}
