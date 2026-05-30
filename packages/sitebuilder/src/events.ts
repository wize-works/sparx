// Site Builder Pub/Sub event publisher.
//
// Phase 1 ships a noop-with-logging publisher behind a minimal interface;
// the worker bootstrap swaps in a real Pub/Sub-backed implementation via
// setPublisher(). Tests inject RecordingPublisher and assert emissions.
// Service functions call publishSitebuilderEvent AFTER their withTenant()
// transaction commits, so a rolled-back write never emits a phantom event.
// Mirrors packages/crm/src/events.ts.

export interface SitebuilderEvent {
  tenantId: string;
  topic: SitebuilderTopic;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  occurredAt?: Date;
}

export type SitebuilderTopic =
  | 'sitebuilder.theme_changed'
  | 'sitebuilder.published'
  | 'sitebuilder.rolled_back'
  | 'sitebuilder.scheduled'
  | 'sitebuilder.schedule_cancelled';

export interface Publisher {
  publish(event: SitebuilderEvent): Promise<void>;
}

class LoggingPublisher implements Publisher {
  publish(event: SitebuilderEvent): Promise<void> {
    console.log(
      '[sitebuilder-event]',
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

export function setPublisher(publisher: Publisher): void {
  activePublisher = publisher;
}

export function getPublisher(): Publisher {
  return activePublisher;
}

export async function publishSitebuilderEvent(event: SitebuilderEvent): Promise<void> {
  await activePublisher.publish(event);
}

export class RecordingPublisher implements Publisher {
  readonly events: SitebuilderEvent[] = [];
  publish(event: SitebuilderEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
  clear(): void {
    this.events.length = 0;
  }
}
