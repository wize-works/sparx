// JWT auth for MCP transport.
//
// Symmetric with services/api-rest/src/plugins/auth.ts:
//   • Same SPARX_INTERNAL_JWT_SECRET, same payload shape (sub, tid, role).
//   • One extra optional claim — `scopes`: an array of McpScope values. If
//     omitted, owner/admin roles get every CRM scope by default; lower roles
//     get only `read:crm`. This default-grant lives only until the AI
//     Integrations dashboard issues real scoped API keys.
//
// The MCP server runs requireModule('crm') per request — a tenant with the
// CRM module off can't call CRM tools even with a valid token.

import fastifyJwt from '@fastify/jwt';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { McpScope } from '@sparx/crm';
import { isModuleEnabled } from '@sparx/auth';
import { env } from './env.js';

export type StaffRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface McpAuthContext {
  tenantId: string;
  userId: string;
  role: StaffRole;
  scopes: ReadonlySet<McpScope>;
}

interface InternalJwtPayload {
  sub: string;
  tid: string;
  role: StaffRole;
  scopes?: McpScope[];
}

const DEFAULT_SCOPES_BY_ROLE: Record<StaffRole, McpScope[]> = {
  owner: ['read:crm', 'write:crm', 'write:crm_bulk'],
  admin: ['read:crm', 'write:crm', 'write:crm_bulk'],
  editor: ['read:crm', 'write:crm'],
  viewer: ['read:crm'],
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

/** Verifies the bearer token and returns the auth context. Throws a 401
 *  with the documented envelope shape on any failure. */
export async function authenticate(request: FastifyRequest): Promise<McpAuthContext> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AuthError('Missing or malformed Authorization header');
  }
  let payload: InternalJwtPayload;
  try {
    payload = await request.jwtVerify<InternalJwtPayload>();
  } catch {
    throw new AuthError('Invalid or expired token');
  }
  if (!payload.sub || !payload.tid) {
    throw new AuthError('Token is missing required claims');
  }

  const enabled = await isModuleEnabled(payload.tid, 'crm');
  if (!enabled) {
    throw new AuthError('CRM module is not active for this tenant');
  }

  const granted = payload.scopes ?? DEFAULT_SCOPES_BY_ROLE[payload.role] ?? [];
  const auth: McpAuthContext = {
    tenantId: payload.tid,
    userId: payload.sub,
    role: payload.role,
    scopes: new Set(granted),
  };
  request.mcpAuth = auth;
  return auth;
}

export class AuthError extends Error {
  readonly code = 'UNAUTHORIZED' as const;
  constructor(message: string) {
    super(message);
  }
}
