// Platform event bus — the in-process backbone for upstream events the CRM
// consumer subscribes to.
//
// Now that orders / quotes are part of the CRM spine (locked decision #1),
// the CRM also PUBLISHES to this bus: orderService emits `order.created`
// when it writes an order; the order-event consumer (which subscribes to
// the same topic) picks it up and writes the matching CrmActivity row +
// bumps the customer's denormalized stats. One bus, both directions —
// keeps the test path identical to production.
//
// External modules (Email, B2B) will publish their topics here too once
// they land. Replacing the in-memory implementation with a Google Pub/Sub
// backing only swaps the transport — the publisher/subscriber API is the
// same.
//
// Phase 2 ships an in-process implementation so tests and dev can exercise
// the full pipeline before Commerce/Email actually land. The same interface
// will back a Google Pub/Sub subscription in production: replacing the
// implementation does not require a consumer rewrite.
//
// One bus per process. The CRM bootstrap (see ./registry.ts) wires its
// subscribers against the singleton at startup; module-lifecycle events
// (module.activated / module.deactivated) flip the per-tenant gate without
// adding/removing subscriptions — the gate check lives in the dispatch path.

export interface PlatformEvent<T = unknown> {
  /** Globally unique id — used for dedupe across redelivery. */
  id: string;
  /** Topic name, dot-namespaced. e.g. "order.created", "email.opened". */
  topic: string;
  /** Tenant the event belongs to. Consumers gate on tenant before doing work. */
  tenantId: string;
  /** Wall-clock time the upstream module recorded the event. */
  occurredAt: Date;
  /** Topic-specific payload. Consumers validate before use. */
  payload: T;
}

export type PlatformEventHandler<T = unknown> = (event: PlatformEvent<T>) => Promise<void>;

export interface PlatformEventBus {
  publish(event: PlatformEvent): Promise<void>;
  subscribe(topic: string, handler: PlatformEventHandler): () => void;
  /** Convenience for tests — drains in-flight work. No-op in Pub/Sub. */
  drain(): Promise<void>;
}

// In-process implementation. Synchronous dispatch — each subscriber is awaited
// in registration order. Errors are caught per-subscriber so one bad consumer
// doesn't poison the others (mirrors at-least-once Pub/Sub semantics: each
// subscriber's failure is its own retry surface).
class InMemoryPlatformBus implements PlatformEventBus {
  private readonly handlers = new Map<string, Set<PlatformEventHandler>>();
  private readonly inflight: Promise<unknown>[] = [];

  publish(event: PlatformEvent): Promise<void> {
    const set = this.handlers.get(event.topic);
    if (!set || set.size === 0) return Promise.resolve();
    // Snapshot — handlers may unsubscribe themselves mid-dispatch.
    const snapshot = [...set];
    const work = Promise.all(
      snapshot.map((h) =>
        h(event).catch((err: unknown) => {
          console.error('[crm-consumer]', event.topic, err);
        })
      )
    );
    this.inflight.push(work);
    return work.then(() => undefined);
  }

  subscribe(topic: string, handler: PlatformEventHandler): () => void {
    let set = this.handlers.get(topic);
    if (!set) {
      set = new Set();
      this.handlers.set(topic, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  async drain(): Promise<void> {
    while (this.inflight.length > 0) {
      const batch = this.inflight.splice(0, this.inflight.length);
      await Promise.all(batch);
    }
  }
}

let activeBus: PlatformEventBus = new InMemoryPlatformBus();

export function getPlatformBus(): PlatformEventBus {
  return activeBus;
}

/** Swap the active bus. Production bootstrap injects a Pub/Sub-backed
 *  implementation; tests inject a fresh in-memory bus per suite. */
export function setPlatformBus(bus: PlatformEventBus): void {
  activeBus = bus;
}

/** Reset to a brand-new in-memory bus — convenience for tests. */
export function resetPlatformBusForTesting(): PlatformEventBus {
  activeBus = new InMemoryPlatformBus();
  return activeBus;
}

/** Publish a platform event through the active bus. Services call this
 *  after their DB transaction commits — never before, so a rolled-back
 *  write never emits a phantom event. The consumer's at-least-once
 *  dedupe (./dedupe.ts) covers the duplicate-on-retry case. */
export async function publishPlatformEvent(event: PlatformEvent): Promise<void> {
  await activeBus.publish(event);
}
