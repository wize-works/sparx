// Email-platform domain-event publisher (mirrors @sparx/crm events).
//
// These are MANAGEMENT/domain events the email module emits (broadcast sent,
// domain verified, suppression added, …) — distinct from the `email.send`
// Pub/Sub event in @sparx/events that the dispatch path publishes to actually
// deliver mail. Keeping the publisher abstract lets unit tests inject a
// RecordingPublisher and assert emissions without standing up Pub/Sub.

export interface EmailPlatformEvent {
  /** Tenant the event belongs to. */
  tenantId: string;
  /** Topic name (e.g. "email.broadcast.sent"). */
  topic: EmailPlatformTopic;
  /** Structured payload — must be JSON-serializable. */
  payload: Record<string, unknown>;
  /** Optional idempotency key — consumers deduplicate against this. */
  dedupeKey?: string;
  /** Wall-clock time the event occurred; defaults to now. */
  occurredAt?: Date;
}

// Canonical topic list for the email management module. Adding a topic here is
// how the rest of the platform (CRM activity mirror, webhook dispatcher) starts
// receiving it.
export type EmailPlatformTopic =
  | 'email.settings.updated'
  | 'email.domain.created'
  | 'email.domain.verifying'
  | 'email.domain.verified'
  | 'email.domain.failed'
  | 'email.template.created'
  | 'email.template.updated'
  | 'email.template.activated'
  | 'email.automation.updated'
  | 'email.automation.enabled'
  | 'email.automation.disabled'
  | 'email.broadcast.created'
  | 'email.broadcast.scheduled'
  | 'email.broadcast.sending'
  | 'email.broadcast.sent'
  | 'email.broadcast.cancelled'
  | 'email.suppression.added'
  | 'email.suppression.removed';

export interface Publisher {
  publish(event: EmailPlatformEvent): Promise<void>;
}

// Default publisher — logs and discards. Replaced via setPublisher() once the
// Pub/Sub worker is wired. Tests inject RecordingPublisher.
class LoggingPublisher implements Publisher {
  publish(event: EmailPlatformEvent): Promise<void> {
    console.log(
      '[email-event]',
      JSON.stringify({
        tenantId: event.tenantId,
        topic: event.topic,
        payload: event.payload,
        dedupeKey: event.dedupeKey,
        occurredAt: (event.occurredAt ?? new Date()).toISOString(),
      })
    );
    return Promise.resolve();
  }
}

let activePublisher: Publisher = new LoggingPublisher();

/** Replace the active publisher. Tests pass a recording instance; the worker
 *  bootstrap passes the real Pub/Sub-backed implementation. */
export function setPublisher(publisher: Publisher): void {
  activePublisher = publisher;
}

export function getPublisher(): Publisher {
  return activePublisher;
}

/** Publish a domain event through the active publisher. Service-layer
 *  functions call this AFTER their DB write commits so we never emit for a
 *  write that rolled back. */
export async function publishEmailEvent(event: EmailPlatformEvent): Promise<void> {
  await activePublisher.publish(event);
}

// Recording publisher for tests.
export class RecordingPublisher implements Publisher {
  readonly events: EmailPlatformEvent[] = [];
  publish(event: EmailPlatformEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
  clear(): void {
    this.events.length = 0;
  }
}
