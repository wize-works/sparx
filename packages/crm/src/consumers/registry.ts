// CRM consumer registry — the bootstrap that wires every consumer's handler
// against the platform bus, with the per-tenant module gate baked in.
//
// Locked decision #6: "Disabled tenants get zero consumer cycles and zero
// rows written." We implement that by wrapping each handler in a gate check
// before the consumer's body runs. The gate is cheap (LRU + 60s TTL); the
// alternative — physically un-subscribing per-tenant — would require one
// subscription per (tenant, topic) pair, which Pub/Sub doesn't bill cheaply.
// One subscription, gated dispatch, same net effect.
//
// Each consumer module exports a `register(opts)` function. The bootstrap
// calls them all. Order matters only for the test "drain everything" path;
// at runtime handlers fan out concurrently.

import { isModuleEnabled, invalidateModuleCache } from '@sparx/auth';

import { getDedupeStore } from './dedupe.js';
import { getPlatformBus, type PlatformEvent, type PlatformEventHandler } from './platform-bus.js';

import { registerOrderEventConsumers } from './order-events.js';
import { registerEmailEventConsumers } from './email-events.js';
import { registerQuoteEventConsumers } from './quote-events.js';
import { registerAuthEventConsumers } from './auth-events.js';

export interface RegisterOptions {
  /** Override the active bus — tests pass a fresh in-memory bus. */
  bus?: ReturnType<typeof getPlatformBus>;
}

export interface ConsumerRegistration {
  /** Drops every subscription this bootstrap registered. */
  unregister(): void;
}

/** Wire every CRM consumer against the platform bus. Returns an object that
 *  can tear down all subscriptions (used by tests for clean shutdown). */
export function registerCrmConsumers(opts: RegisterOptions = {}): ConsumerRegistration {
  const bus = opts.bus ?? getPlatformBus();
  const teardowns: Array<() => void> = [];

  // Each consumer registers its own subscriptions. The gate wrapper is shared.
  const ctx = { bus, gate: gateHandler };
  teardowns.push(...registerOrderEventConsumers(ctx));
  teardowns.push(...registerEmailEventConsumers(ctx));
  teardowns.push(...registerQuoteEventConsumers(ctx));
  teardowns.push(...registerAuthEventConsumers(ctx));

  // Cache invalidation — when a tenant activates/deactivates CRM at runtime,
  // we drop the module-gate cache so the next event reflects the new state.
  teardowns.push(
    bus.subscribe('module.activated', async (event) => {
      const slug = (event.payload as { module?: string } | null)?.module;
      if (slug === 'crm') invalidateModuleCache(event.tenantId, 'crm');
    })
  );
  teardowns.push(
    bus.subscribe('module.deactivated', async (event) => {
      const slug = (event.payload as { module?: string } | null)?.module;
      if (slug === 'crm') invalidateModuleCache(event.tenantId, 'crm');
    })
  );

  return {
    unregister() {
      while (teardowns.length > 0) {
        const fn = teardowns.shift();
        try {
          fn?.();
        } catch {
          // Best-effort teardown — don't let one subscription's cleanup
          // block the others.
        }
      }
    },
  };
}

export interface ConsumerContext {
  bus: ReturnType<typeof getPlatformBus>;
  gate: typeof gateHandler;
}

/** Wraps a consumer handler with module-gate + dedupe. Returns the wrapped
 *  handler. Use from consumer registration functions:
 *
 *    bus.subscribe('order.created', gateHandler(async (event) => { ... }))
 */
export function gateHandler<T = unknown>(
  handler: PlatformEventHandler<T>
): PlatformEventHandler<T> {
  return async (event: PlatformEvent<T>) => {
    // Gate first — disabled tenants don't even consult dedupe.
    const enabled = await isModuleEnabled(event.tenantId, 'crm');
    if (!enabled) return;

    const dedupe = getDedupeStore();
    const novel = await dedupe.shouldProcess(`crm:${event.topic}:${event.id}`);
    if (!novel) return;

    await handler(event);
  };
}
