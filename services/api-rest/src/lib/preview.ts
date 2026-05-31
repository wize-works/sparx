// Preview-token verifier for public read endpoints.
//
// A valid preview token shifts the "status filter" from `published` to
// "this specific entry, any status (except deleted)". The token is
// scoped to exactly one entry by `sub` claim; cross-entry replay is
// rejected.
//
// Verifier consults preview_tokens for revocation/expiry — the JWT exp
// claim is necessary but not sufficient, because revocation has to be
// instantaneous (an editor sharing a token by mistake should be able to
// kill it without rotating SPARX_INTERNAL_JWT_SECRET).

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withTenant } from '@sparx/db';

interface PreviewClaims {
  sub: string;
  tid: string;
  aud: string;
  jti: string;
  iat?: number;
  exp?: number;
}

export interface PreviewContext {
  entryId: string;
  tenantId: string;
  jti: string;
}

// Extract a preview token from either the standard "Authorization: Preview <jwt>"
// header (matching api-rest's session pattern of "Bearer <jwt>") or the
// `?preview=<jwt>` query param. The query path is what apps/web uses when
// it forwards `?sparxPreview=` from the browser URL.
function extractToken(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (auth?.startsWith('Preview ')) return auth.slice('Preview '.length);
  const query = request.query as { preview?: unknown };
  if (typeof query?.preview === 'string' && query.preview.length > 0) {
    return query.preview;
  }
  return null;
}

// Returns the PreviewContext if a valid token is present, or null when
// no token was offered. Throws when a token IS offered but invalid —
// silent fall-through to published-only would mask a typo in the URL.
export async function tryVerifyPreviewToken(
  app: FastifyInstance,
  request: FastifyRequest
): Promise<PreviewContext | null> {
  const token = extractToken(request);
  if (!token) return null;

  let claims: PreviewClaims;
  try {
    // fastify-jwt's verify is synchronous for HS256 + no async secret provider.
    claims = app.jwt.verify<PreviewClaims>(token);
  } catch {
    throw Object.assign(new Error('Invalid preview token.'), {
      statusCode: 401,
      code: 'INVALID_PREVIEW_TOKEN',
    });
  }
  if (claims.aud !== 'preview') {
    throw Object.assign(new Error('Token is not a preview token.'), {
      statusCode: 401,
      code: 'INVALID_PREVIEW_TOKEN',
    });
  }

  // Revocation + ttl check against the database row.
  const valid = await withTenant({ tenantId: claims.tid }, async (tx) => {
    const row = await tx.previewToken.findFirst({
      where: { entryId: claims.sub, jti: claims.jti },
      select: { revokedAt: true, expiresAt: true },
    });
    if (!row) return false;
    if (row.revokedAt) return false;
    if (row.expiresAt && row.expiresAt < new Date()) return false;
    return true;
  });

  if (!valid) {
    throw Object.assign(new Error('Preview token expired or revoked.'), {
      statusCode: 401,
      code: 'INVALID_PREVIEW_TOKEN',
    });
  }

  return { entryId: claims.sub, tenantId: claims.tid, jti: claims.jti };
}

interface SitePreviewClaims {
  tid: string;
  aud: string;
  iat?: number;
  exp?: number;
}

// Verify a Site Builder *site-preview* token. Unlike the CMS entry token above,
// this is tenant-scoped (no entry, no per-token DB row): it authorizes reading
// the tenant's whole draft site composition, and a short JWT TTL is the only
// control — minting requires an authenticated dashboard editor, and the draft
// it exposes is the merchant's own. Returns true when a valid token for
// `tenantId` is present, false when none is offered. Throws when a token IS
// offered but invalid (a bad token is a signal, not a silent fall-through to
// published — which is exactly the bug this whole change fixes).
export function tryVerifySitePreview(
  app: FastifyInstance,
  request: FastifyRequest,
  tenantId: string
): boolean {
  const auth = request.headers.authorization;
  const token = auth?.startsWith('Preview ') ? auth.slice('Preview '.length) : null;
  if (!token) return false;

  let claims: SitePreviewClaims;
  try {
    claims = app.jwt.verify<SitePreviewClaims>(token);
  } catch {
    throw Object.assign(new Error('Invalid site preview token.'), {
      statusCode: 401,
      code: 'INVALID_PREVIEW_TOKEN',
    });
  }
  if (claims.aud !== 'site-preview' || claims.tid !== tenantId) {
    throw Object.assign(new Error('Token is not a valid site preview token.'), {
      statusCode: 401,
      code: 'INVALID_PREVIEW_TOKEN',
    });
  }
  return true;
}
