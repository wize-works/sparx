// Module gate — enforces the "disabled module = zero overhead" rule.
//
// Locked decision #6: feature flags live in middleware, not handlers. Every
// CRM (and eventually every modular) Server Action / Fastify route wraps
// its work in `requireModule('crm')` so a disabled tenant gets the
// documented 404 envelope before any handler logic runs.
//
// Storage: per-tenant flags live in `tenants.settings.modules.<slug>.enabled`.
// The tenants table is RLS-exempt by design (it's the dispatch table — every
// request needs to read it before tenant context is set), so this helper
// uses the raw prisma client directly rather than wrapping in withTenant.
//
// Caching: a small in-process LRU keyed by `${tenantId}:${module}` with a
// 60-second TTL avoids hammering the DB for the same flag on every request.
// Cache invalidation happens via module.activated / module.deactivated
// Pub/Sub events (Phase 2+) — for now the TTL is the floor.

import { prisma } from '@sparx/db';

import type { SparxSession } from './session';

export type ModuleSlug =
  | 'storefront'
  | 'commerce'
  | 'cms'
  | 'crm'
  | 'email'
  | 'b2b'
  | 'dropship'
  | 'ai';

export class ModuleDisabledError extends Error {
  readonly code = 'MODULE_DISABLED' as const;
  readonly module: ModuleSlug;
  readonly tenantId: string;
  constructor(module: ModuleSlug, tenantId: string) {
    super(`Module "${module}" is not active for this tenant`);
    this.module = module;
    this.tenantId = tenantId;
    // Preserve correct prototype for `instanceof` checks across module
    // boundaries in tsx / Next bundling.
    Object.setPrototypeOf(this, ModuleDisabledError.prototype);
  }
}

interface CacheEntry {
  enabled: boolean;
  expiresAt: number;
}
const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

function cacheKey(tenantId: string, module: ModuleSlug): string {
  return `${tenantId}:${module}`;
}

/** Drop any cached state for a tenant — called by the module.activated /
 *  module.deactivated event consumer once that worker lands. Exported now
 *  so tests can call it directly without waiting for the TTL. */
export function invalidateModuleCache(tenantId?: string, module?: ModuleSlug): void {
  if (tenantId && module) {
    cache.delete(cacheKey(tenantId, module));
    return;
  }
  if (tenantId) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${tenantId}:`)) cache.delete(key);
    }
    return;
  }
  cache.clear();
}

/** Check whether a module is enabled for a tenant. Reads tenant.settings
 *  with a per-process LRU + 60s TTL. */
export async function isModuleEnabled(tenantId: string, module: ModuleSlug): Promise<boolean> {
  const key = cacheKey(tenantId, module);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.enabled;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });

  // Default-deny: an unset flag means the module is not active. This
  // mirrors the production billing model — modules opt in via Stripe
  // subscription. Dev/test enables modules explicitly via the seed.
  const enabled = readModuleFlag(tenant?.settings, module);

  cache.set(key, { enabled, expiresAt: Date.now() + TTL_MS });
  return enabled;
}

function readModuleFlag(settings: unknown, module: ModuleSlug): boolean {
  if (!settings || typeof settings !== 'object') return false;
  const modules = (settings as Record<string, unknown>).modules;
  if (!modules || typeof modules !== 'object') return false;
  const slot = (modules as Record<string, unknown>)[module];
  if (!slot || typeof slot !== 'object') return false;
  return (slot as Record<string, unknown>).enabled === true;
}

/** Throws ModuleDisabledError if the session's tenant doesn't have the
 *  given module active. Returns void on success.
 *
 *  Use from Server Actions / Fastify preHandlers — both call this directly
 *  with the resolved session, so the gate is the same function across
 *  transports (locked decision #6). */
export async function requireModule(session: SparxSession, module: ModuleSlug): Promise<void> {
  const enabled = await isModuleEnabled(session.user.tenantId, module);
  if (!enabled) {
    throw new ModuleDisabledError(module, session.user.tenantId);
  }
}

/** Same shape as the platform error envelope from docs/06 §4 — REST and
 *  Server Actions both render this shape so the dashboard / SDK / MCP
 *  client see a single error format regardless of transport. */
export function moduleDisabledEnvelope(err: ModuleDisabledError): {
  success: false;
  error: {
    code: 'MODULE_DISABLED';
    message: string;
    module: ModuleSlug;
  };
} {
  return {
    success: false,
    error: {
      code: 'MODULE_DISABLED',
      message: err.message,
      module: err.module,
    },
  };
}
