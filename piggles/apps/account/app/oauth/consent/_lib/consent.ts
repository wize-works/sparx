// Shared validation for the MCP OAuth consent screen (docs/07 §5).
//
// Both the page (render) and the approve/deny submit route (authoritative
// re-validation) run these checks. Everything here is defensive: a public DCR
// client plus a phishable redirect means we exact-match the redirect URI,
// require PKCE/S256 at our own layer rather than only trusting the plugin, and
// refuse to issue a token for any resource other than our own MCP server.
//
// Nothing in this file may be relaxed for convenience. Every check is the one
// standing between somebody's business data and an app that asked for it.

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
 * Piggles', because this app is Piggles' authorization server and no other
 * brand's consent can be approved here.
 *
 * This used to read the platform-wide `MCP_RESOURCE_URL`, which named
 * mcp.sparx.works: every Piggles authorization was therefore checked against
 * another company's address, and this screen would have refused a genuine
 * Piggles request as "for a different service" — had anything ever reached it.
 * Nothing did, because the discovery document api-mcp served named
 * app.sparx.works as the authorization server, so a Piggles customer connecting
 * an assistant was sent to sparx to sign in instead.
 *
 * The brand is named rather than read from the request because it is this
 * deployment's own identity, not a per-request variable.
 */
export function mcpResourceUrl(): string {
  return brandMcpResourceUrl('piggles');
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

/**
 * Validate an authorize request against the protocol rules and the registered
 * client. Returns the client on success, or a message to show ON the consent
 * page — we never redirect to an unvalidated `redirect_uri`, because doing so is
 * the exact move an attacker is trying to provoke.
 */
export async function validateAuthorizeRequest(p: AuthorizeParams): Promise<ValidationResult> {
  if (p.responseType !== 'code') {
    return {
      ok: false,
      error: 'That sign-in method is not supported. Only the standard code flow is allowed.',
    };
  }
  if (!p.clientId) return { ok: false, error: 'The request is missing its app id.' };
  if (!p.redirectUri) return { ok: false, error: 'The request is missing its return address.' };
  // OAuth 2.1 / MCP: PKCE with S256 is mandatory. Enforced here as well as at the
  // token endpoint, so a request without it never reaches a person to approve.
  if (!p.codeChallenge) {
    return { ok: false, error: 'The request is missing the security check it needs (PKCE).' };
  }
  if (p.codeChallengeMethod.toLowerCase() !== 's256') {
    return { ok: false, error: 'That security method is not supported — only S256.' };
  }

  const client = await getRegisteredMcpClient(p.clientId);
  if (!client) {
    return { ok: false, error: 'We do not recognise this app. Try connecting again from it.' };
  }
  if (client.disabled) {
    return { ok: false, error: 'This connection has been turned off by an administrator.' };
  }

  // Exact-match the redirect URI against the DCR allowlist — the core
  // anti-phishing gate. Never a prefix or substring match.
  if (!client.redirectUrls.includes(p.redirectUri)) {
    return { ok: false, error: 'This app is asking us to send your access somewhere unexpected.' };
  }

  // RFC 8707: if the client names a target resource, it must be OUR MCP server.
  // Refuse to mint a token intended for a different one.
  if (p.resource) {
    const want = originOf(mcpResourceUrl());
    const got = originOf(p.resource);
    if (!got || got !== want) {
      return { ok: false, error: 'This request is for a different service, so we stopped it.' };
    }
  }

  return { ok: true, client };
}
