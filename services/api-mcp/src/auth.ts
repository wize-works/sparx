// MCP transport auth. Two paths accepted:
//
//   1. Internal-trust JWT — minted by the dashboard for first-party calls
//      from logged-in staff. Same payload shape api-rest uses (sub, tid,
//      role + optional `scopes`).
//
//   2. External API key — `Bearer sk_live_<8>_<32>`. Issued by the AI
//      Integrations dashboard, verified via @sparx/auth/api-keys. Scopes
//      come from the key row; role is fixed as 'api'.
//
// In both cases the tenant must have the CRM module active or the request
// is rejected with the documented MODULE_DISABLED-shaped envelope.

import fastifyJwt from '@fastify/jwt';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { McpScope } from '@sparx/crm';
import { isModuleEnabled, verifyApiKey } from '@sparx/auth';
import { env } from './env.js';

export type StaffRole = 'owner' | 'admin' | 'editor' | 'viewer' | 'api';

export interface McpAuthContext {
  tenantId: string;
  userId: string;
  role: StaffRole;
  scopes: ReadonlySet<McpScope>;
  /** 'jwt' for first-party staff tokens, 'api_key' for external keys.
   *  Used by the audit logger to record the right actor_type. */
  source: 'jwt' | 'api_key';
}

interface InternalJwtPayload {
  sub: string;
  tid: string;
  role: Exclude<StaffRole, 'api'>;
  scopes?: McpScope[];
}

const DEFAULT_SCOPES_BY_ROLE: Record<StaffRole, McpScope[]> = {
  owner: ['read:crm', 'write:crm', 'write:crm_bulk'],
  admin: ['read:crm', 'write:crm', 'write:crm_bulk'],
  editor: ['read:crm', 'write:crm'],
  viewer: ['read:crm'],
  // External api keys have no role-derived default; their scope list is
  // exactly what the dashboard issued.
  api: [],
};

declare module 'fastify' {
  interface FastifyRequest {
    mcpAuth: McpAuthContext | null;
  }
}

const authPlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyJwt, {
    secret: env.SPARX_INTERNAL_JWT_SECRET,
    verify: { algorithms: ['HS256'] },
  });
  app.decorateRequest('mcpAuth', null);
};

export default fp(authPlugin, { name: 'mcp-auth' });

/** Verifies the bearer token and returns the auth context. Routes the
 *  inspection between API-key and JWT paths based on the token shape. */
export async function authenticate(request: FastifyRequest): Promise<McpAuthContext> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AuthError('Missing or malformed Authorization header');
  }
  const token = header.slice('Bearer '.length).trim();

  const auth = token.startsWith('sk_live_')
    ? await authenticateApiKey(token)
    : await authenticateJwt(request);

  const enabled = await isModuleEnabled(auth.tenantId, 'crm');
  if (!enabled) {
    throw new AuthError('CRM module is not active for this tenant');
  }

  request.mcpAuth = auth;
  return auth;
}

async function authenticateApiKey(token: string): Promise<McpAuthContext> {
  const verified = await verifyApiKey(token);
  if (!verified) {
    throw new AuthError('Invalid, revoked, or expired API key');
  }
  return {
    tenantId: verified.tenantId,
    userId: verified.actorId,
    role: 'api',
    scopes: new Set(verified.scopes as McpScope[]),
    source: 'api_key',
  };
}

async function authenticateJwt(request: FastifyRequest): Promise<McpAuthContext> {
  let payload: InternalJwtPayload;
  try {
    payload = await request.jwtVerify<InternalJwtPayload>();
  } catch {
    throw new AuthError('Invalid or expired token');
  }
  if (!payload.sub || !payload.tid) {
    throw new AuthError('Token is missing required claims');
  }
  const granted = payload.scopes ?? DEFAULT_SCOPES_BY_ROLE[payload.role] ?? [];
  return {
    tenantId: payload.tid,
    userId: payload.sub,
    role: payload.role,
    scopes: new Set(granted),
    source: 'jwt',
  };
}

export class AuthError extends Error {
  readonly code = 'UNAUTHORIZED' as const;
  constructor(message: string) {
    super(message);
  }
}
