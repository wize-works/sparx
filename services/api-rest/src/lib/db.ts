// Database access helpers for route handlers.
//
// Every tenant-scoped query MUST go through `withRequestTenant` so the
// `app.tenant_id` GUC is set inside the transaction and Row Level Security
// enforces isolation. Talking to the bare `prisma` client from a route is
// a bug — RLS policies are FORCE'd, so an un-scoped query silently returns
// zero rows rather than leaking, but the error is mysterious. This helper
// makes the right thing the easy thing.
//
// PLATFORM_TENANT_ID is the sentinel tenant id that owns built-in content
// types; the `content_types` RLS policy exposes those rows to every tenant
// implicitly, so routes don't usually need to switch to it.

import { withTenant, type TxClient } from '@sparx/db';
import { PLATFORM_TENANT_ID } from '@sparx/cms-schemas';
import type { FastifyRequest } from 'fastify';
import { requireAuth } from '../plugins/auth.js';

export { PLATFORM_TENANT_ID };

export function withRequestTenant<T>(
  request: FastifyRequest,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  const auth = requireAuth(request);
  return withTenant({ tenantId: auth.tenantId, userId: auth.actorId }, fn);
}

// Sentinel-tenant variant — used by the boot-time upsert of BUILT_IN_CONTENT
// _TYPES and by background workers that need to read platform-owned data.
// Should not be used inside a request handler.

export function withPlatformTenant<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
  return withTenant({ tenantId: PLATFORM_TENANT_ID }, fn);
}
