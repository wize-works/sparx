// Internal-trust JWT verification.
//
// Phase 1 only supports tokens issued by the dashboard (Better Auth session
// → short-lived HS256 JWT signed with SPARX_INTERNAL_JWT_SECRET). External
// API-key authentication lands in Phase 4 alongside the webhook-delivery
// worker.
//
// Token shape:
//   { sub: <user_id>, tid: <tenant_id>, role: 'owner'|'admin'|'editor'|'viewer',
//     iat, exp }
//
// Behaviour:
//   - No Authorization header → `request.auth` stays null. Routes that need
//     auth call `requireAuth(request)` to throw UNAUTHORIZED.
//   - Authorization: Bearer <token> with a valid signature → `request.auth`
//     populated with normalized AuthContext.
//   - Authorization: Bearer <token> with an invalid signature → throws
//     UNAUTHORIZED at the preHandler hook so a malformed token never
//     silently bypasses auth.

import fastifyJwt from '@fastify/jwt';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env.js';
import { unauthorized, forbidden } from '../errors.js';

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

const authPlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyJwt, {
    secret: env.SPARX_INTERNAL_JWT_SECRET,
    sign: { algorithm: 'HS256', expiresIn: '5m' },
    verify: { algorithms: ['HS256'] },
  });

  app.decorateRequest('auth', null);

  app.addHook('preHandler', async (request) => {
    // Public paths skip auth entirely. They handle their own authorisation
    // (read-only, status=published only, tenant by slug). Anything outside
    // this allowlist falls through to the Bearer-token check below.
    if (
      request.url === '/health' ||
      request.url.startsWith('/v1/openapi.json') ||
      request.url.startsWith('/v1/sitemap.xml') ||
      request.url.startsWith('/v1/public/') ||
      // Local-mode media upload endpoints — issued by `presignPut` and
      // self-authorising via the in-URL object key. Skipping the Bearer
      // check here mirrors the GCS signed-URL contract.
      request.url.startsWith('/v1/media/_local/')
    ) {
      return;
    }

    const header = request.headers.authorization;
    if (!header) return;
    if (!header.startsWith('Bearer ')) return;

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
export default fp(authPlugin, { name: 'auth', dependencies: ['envelope-errors'] });

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
