// Per-message handler. The scope mapping (planRevalidation) is a pure function
// so tests can assert it without a DB or network; handleEvent wires it to the
// tenant lookup + the storefront revalidate POST.
//
// Failure model:
//   - Unmapped event type or unknown tenant → no-op, ack (return, no throw).
//   - Storefront POST non-2xx / network error → throw, so the Cloud Run
//     entrypoint returns 500 and Pub/Sub redelivers (transient storefront
//     unavailability shouldn't drop a cache purge).

import type { Logger } from 'pino';

import { prisma } from '@sparx/db';

import { env } from './env.js';

/** The minimal SparxEvent envelope this worker reads (see @sparx/events). */
export interface CacheEventEnvelope {
  type: string;
  tenantId: string;
  actorId?: string | null;
  occurredAt?: string;
  data?: unknown;
}

export type RevalidateScope = 'commerce' | 'content' | 'site';

/**
 * Map an event type to the storefront cache scope it invalidates, or null when
 * the event doesn't affect any cached read. Coarse on purpose: a single
 * `commerce:<slug>` purge clears every commerce read (products, collections,
 * Q&A) for the tenant, which is the right blast radius for a catalog edit.
 */
export function planRevalidation(type: string): RevalidateScope | null {
  if (
    type.startsWith('product.') ||
    type.startsWith('variant.') ||
    type.startsWith('inventory.') ||
    type.startsWith('review.')
  ) {
    return 'commerce';
  }
  if (type.startsWith('content.') || type.startsWith('content_type.') || type.startsWith('redirect.')) {
    return 'content';
  }
  // Site Builder publish events route here once they're on Pub/Sub (Phase 1
  // ships a noop publisher); the scope is wired so it's a one-line follow-up.
  if (type.startsWith('sitebuilder.')) {
    return 'site';
  }
  return null;
}

export interface HandleResult {
  revalidated: boolean;
  scope?: RevalidateScope;
  tenant?: string;
  reason?: string;
}

/** POST the storefront's on-demand revalidation endpoint for one tenant+scope. */
async function postRevalidate(slug: string, scope: RevalidateScope): Promise<void> {
  if (!env.SPARX_REVALIDATE_SECRET) {
    // Misconfiguration — without the secret the storefront returns 503. Throw
    // so it's loud (and retried) rather than silently dropping purges.
    throw new Error('SPARX_REVALIDATE_SECRET is not set');
  }
  const res = await fetch(env.STOREFRONT_REVALIDATE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-revalidate-secret': env.SPARX_REVALIDATE_SECRET,
    },
    body: JSON.stringify({ tenant: slug, scopes: [scope] }),
  });
  if (!res.ok) {
    throw new Error(`storefront revalidate returned ${res.status}`);
  }
}

export async function handleEvent(event: CacheEventEnvelope, logger: Logger): Promise<HandleResult> {
  const scope = planRevalidation(event.type);
  if (!scope) return { revalidated: false, reason: 'unmapped-type' };

  // tenants is the one non-RLS table; a direct lookup by id is safe here.
  const tenant = await prisma.tenant.findUnique({
    where: { id: event.tenantId },
    select: { slug: true },
  });
  if (!tenant) {
    logger.warn({ tenantId: event.tenantId, type: event.type }, 'unknown tenant; skipping');
    return { revalidated: false, reason: 'unknown-tenant' };
  }

  await postRevalidate(tenant.slug, scope);
  return { revalidated: true, scope, tenant: tenant.slug };
}
