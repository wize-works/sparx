// Idempotency for at-least-once event delivery.
//
// Pub/Sub redelivers on consumer failure or partial ack. Without dedupe, a
// retried order.created would insert a second activity row and double-count
// the customer's total_spent. Two layers defend against that:
//
//   1. **Application-level dedupe** (this file) — an in-process LRU keyed on
//      the event id. Skips the consumer work entirely on duplicates.
//   2. **Database-level dedupe** — the activity write itself uses
//      ON CONFLICT DO NOTHING on a partial unique on (tenant_id, type,
//      linked_entity_id, occurred_at). A duplicate that slips past the LRU
//      becomes a no-op insert, not a double row.
//
// Phase 2 ships in-memory dedupe. When Redis is wired (Phase 5), swap the
// implementation here without changing the interface — consumers only call
// `shouldProcess()` and don't care where the seen-set lives.

export interface DedupeStore {
  /** Returns true if this id is novel (caller should process). */
  shouldProcess(id: string): Promise<boolean>;
  /** Drops every entry. Used by tests; no-op in production. */
  reset(): Promise<void>;
}

// Simple capped Map. Insertion-order eviction once the cap is hit — same
// shape as a Redis SET with TTL but local. 100k entries × ~64 bytes/key
// ≈ 6 MB; the cap is the bound, not the TTL.
class InMemoryDedupe implements DedupeStore {
  private readonly seen = new Map<string, number>();
  private readonly capacity: number;

  constructor(capacity = 100_000) {
    this.capacity = capacity;
  }

  async shouldProcess(id: string): Promise<boolean> {
    if (this.seen.has(id)) return false;
    if (this.seen.size >= this.capacity) {
      // Drop the oldest 10% to amortize eviction cost.
      const dropCount = Math.ceil(this.capacity * 0.1);
      const iter = this.seen.keys();
      for (let i = 0; i < dropCount; i++) {
        const k = iter.next().value;
        if (k === undefined) break;
        this.seen.delete(k);
      }
    }
    this.seen.set(id, Date.now());
    return true;
  }

  async reset(): Promise<void> {
    this.seen.clear();
  }
}

let activeDedupe: DedupeStore = new InMemoryDedupe();

export function getDedupeStore(): DedupeStore {
  return activeDedupe;
}

export function setDedupeStore(store: DedupeStore): void {
  activeDedupe = store;
}

export function resetDedupeForTesting(): DedupeStore {
  activeDedupe = new InMemoryDedupe();
  return activeDedupe;
}
