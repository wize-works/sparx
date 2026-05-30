// Internal-trust JWT + `sk_live_*` API-key verification.
//
// Token shape (JWT, issued by the dashboard for a logged-in user):
//   { sub: <user_id>, tid: <tenant_id>, role: 'owner'|'admin'|'editor'|'viewer',
//     iat, exp }
//
// API key shape (issued in /settings/ai-integrations, persisted in api_keys):
//   sk_live_<8 base32>_<32 base32>
//   Lookup by `keyPrefix` (sk_live_<8>); suffix SHA-256-compared to keyHash
//   with `crypto.timingSafeEqual`. Revoked + expired keys reject.
//
// Behaviour:
//   - No Authorization header → `request.auth` stays null. Routes that need
//     auth call `requireAuth(request)` to throw UNAUTHORIZED.
//   - `Authorization: Bearer <jwt>` valid → `request.auth.actorType = 'user'`.
//   - `Authorization: Bearer sk_live_*` valid → `request.auth.actorType = 'api'`.
//     API-key auth gets a fixed `role: 'editor'` for now; per-key scope
//     enforcement is a route-level concern (see MCP scope checks).
//   - `Authorization: Bearer <anything-else>` → UNAUTHORIZED.
//
// Service-agnostic: the plugin is built as a factory so each API service
// (api-rest, api-graphql, future api-mcp) supplies its own JWT secret + an
// optional list of public path prefixes that should skip Bearer validation.

import crypto from 'node:crypto';

import fastifyJwt from '@fastify/jwt';
import { prisma } from '@sparx/db';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { unauthorized, forbidden } from './errors.js';

const API_KEY_PUBLIC_PREFIX = 'sk_live_';
const API_KEY_PREFIX_LEN = API_KEY_PUBLIC_PREFIX.length + 8;

export type StaffRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type ActorType = 'user' | 'api';

export interface AuthContext {
  tenantId: string;
  actorId: string;
  actorType: ActorType;
  role: StaffRole;
}

interface InternalJwtPayload {
  sub: string;
  tid: string;
  role: StaffRole;
  iat?: number;
  exp?: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export interface AuthPluginOptions {
  jwtSecret: string;
  // Each consuming service has its own public/anonymous surface (health,
  // OpenAPI, signed-media URLs, etc). The plugin treats `request.url ===` for
  // the exact paths and `request.url.startsWith(prefix)` for prefixes.
  publicPaths?: string[];
  publicPrefixes?: string[];
}

const DEFAULT_PUBLIC_PATHS = ['/health'];

export function createAuthPlugin(options: AuthPluginOptions): FastifyPluginAsync {
  const publicPaths = new Set<string>([...DEFAULT_PUBLIC_PATHS, ...(options.publicPaths ?? [])]);
  const publicPrefixes = options.publicPrefixes ?? [];

  const authPlugin: FastifyPluginAsync = async (app) => {
    await app.register(fastifyJwt, {
      secret: options.jwtSecret,
      sign: { algorithm: 'HS256', expiresIn: '5m' },
      verify: { algorithms: ['HS256'] },
    });

    app.decorateRequest('auth', null);

    app.addHook('preHandler', async (request) => {
      if (publicPaths.has(request.url)) return;
      for (const prefix of publicPrefixes) {
        if (request.url.startsWith(prefix)) return;
      }

      const header = request.headers.authorization;
      if (!header) return;
      if (!header.startsWith('Bearer ')) return;

      const token = header.slice('Bearer '.length).trim();

      // `sk_live_*` tokens are API keys, not JWTs. Resolving them as JWTs
      // would just throw immediately on the `.` count check — short-circuit
      // to the api_keys lookup so the failure mode is "wrong key" vs
      // "malformed JWT".
      if (token.startsWith(API_KEY_PUBLIC_PREFIX)) {
        const apiKey = await verifyApiKeyToken(token);
        if (!apiKey) throw unauthorized('Invalid or expired API key.');
        request.auth = {
          tenantId: apiKey.tenantId,
          actorId: apiKey.actorId,
          actorType: 'api',
          // API keys ship with a fixed editor role; finer-grained scopes are
          // surfaced in `apiKey.scopes` and enforced at the route handler.
          role: 'editor',
        };
        return;
      }

      let payload: InternalJwtPayload;
      try {
        payload = await request.jwtVerify<InternalJwtPayload>();
      } catch {
        throw unauthorized('Invalid or expired token.');
      }

      if (!payload.sub || !payload.tid) {
        throw unauthorized('Token is missing required claims.');
      }

      request.auth = {
        tenantId: payload.tid,
        actorId: payload.sub,
        actorType: 'user',
        role: payload.role,
      };
    });
  };

  // fastify-plugin wrapper: the preHandler hook + request.auth decorator
  // must be visible to sibling route plugins. Without it, the auth hook
  // only runs on routes inside the same encapsulated scope.
  return fp(authPlugin, { name: 'auth', dependencies: ['envelope-errors'] });
}

// Route-handler helpers. Cheap to call repeatedly; throw the canonical
// ApiError so the envelope handler renders the right shape + status.

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

const ROLE_ORDER: Record<StaffRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export function requireRole(request: FastifyRequest, min: StaffRole): AuthContext {
  const auth = requireAuth(request);
  if (ROLE_ORDER[auth.role] < ROLE_ORDER[min]) {
    throw forbidden(`Requires ${min} role or higher.`);
  }
  return auth;
}

// ─── api-key verification (sk_live_*) ──────────────────────────────────
//
// Inlined here rather than imported from `@sparx/auth` so api-core stays
// fastify-only (no Next/React peerDeps pulled into the service builds).
// Schema source: packages/db/prisma/schema/05-api-keys.prisma + canonical
// issuer at packages/auth/src/api-keys.ts — keep the hash/format logic in
// sync if either side changes.

interface VerifiedApiKey {
  tenantId: string;
  actorId: string;
  scopes: string[];
}

async function verifyApiKeyToken(token: string): Promise<VerifiedApiKey | null> {
  const lastUnderscore = token.lastIndexOf('_');
  if (lastUnderscore <= API_KEY_PUBLIC_PREFIX.length) return null;
  const prefix = token.slice(0, lastUnderscore);
  const suffix = token.slice(lastUnderscore + 1);
  if (prefix.length !== API_KEY_PREFIX_LEN) return null;
  if (suffix.length < 8) return null;

  const row = await prisma.apiKey.findUnique({ where: { keyPrefix: prefix } });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null;

  const candidateHash = crypto.createHash('sha256').update(suffix, 'utf8').digest();
  const storedHash = Buffer.from(row.keyHash, 'hex');
  if (candidateHash.length !== storedHash.length) return null;
  if (!crypto.timingSafeEqual(candidateHash, storedHash)) return null;

  // Fire-and-forget last-used bump — never gate verification on the write.
  void prisma.apiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    tenantId: row.tenantId,
    actorId: row.createdByUserId ?? row.id,
    scopes: row.scopes,
  };
}
