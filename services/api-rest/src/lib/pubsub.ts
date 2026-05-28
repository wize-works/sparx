// Typed event publisher.
//
// One Pub/Sub topic per `EventType`. Topic name == event type
// (`order.created`, `media.uploaded`, ...) so subscribers only receive the
// events they care about — no fan-out filtering inside worker code, no
// wasted message deliveries, and per-topic IAM + DLQs are possible.
//
// In dev (`GCP_PROJECT_ID` unset) the publisher logs the event to the
// Fastify logger and otherwise no-ops — useful for quick iteration without
// standing up a Pub/Sub emulator.

import type { Topic } from '@google-cloud/pubsub';
import { PubSub } from '@google-cloud/pubsub';
import type { FastifyBaseLogger } from 'fastify';
import { env } from '../env.js';

export type EventType =
  // Content
  | 'content.entry.created'
  | 'content.entry.updated'
  | 'content.entry.published'
  | 'content.entry.scheduled'
  | 'content.entry.unpublished'
  | 'content.entry.deleted'
  | 'content.revision.created'
  | 'content_type.upserted'
  // Media
  | 'media.uploaded'
  | 'media.processed'
  | 'media.deleted'
  // Webhooks / redirects (Phase 4)
  | 'redirect.added'
  | 'redirect.removed';

export interface SparxEvent<T = unknown> {
  type: EventType;
  tenantId: string;
  actorId: string | null;
  occurredAt: string; // ISO timestamp
  data: T;
}

interface Publisher {
  publish<T>(event: SparxEvent<T>): Promise<void>;
}

class CloudPubSubPublisher implements Publisher {
  private readonly client: PubSub;
  private readonly topicCache = new Map<EventType, Topic>();

  constructor(client: PubSub) {
    this.client = client;
  }

  private topicFor(type: EventType): Topic {
    let topic = this.topicCache.get(type);
    if (!topic) {
      topic = this.client.topic(type, {
        batching: { maxMessages: 100, maxMilliseconds: 50 },
      });
      this.topicCache.set(type, topic);
    }
    return topic;
  }

  async publish<T>(event: SparxEvent<T>): Promise<void> {
    const data = Buffer.from(JSON.stringify(event));
    await this.topicFor(event.type).publishMessage({
      data,
      // `type` attribute kept for parity with logs/dead-letter inspection
      // even though each subscriber only sees its own topic.
      attributes: { type: event.type, tenantId: event.tenantId },
    });
  }
}

class LoggingPublisher implements Publisher {
  constructor(private readonly logger: FastifyBaseLogger) {}
  publish<T>(event: SparxEvent<T>): Promise<void> {
    this.logger.info({ event }, '[pubsub:stub] would publish');
    return Promise.resolve();
  }
}

let publisher: Publisher | null = null;

export function getPublisher(logger: FastifyBaseLogger): Publisher {
  if (publisher) return publisher;

  if (env.GCP_PROJECT_ID) {
    const client = new PubSub({ projectId: env.GCP_PROJECT_ID });
    publisher = new CloudPubSubPublisher(client);
    logger.info(
      { project: env.GCP_PROJECT_ID },
      'pubsub: Google Cloud publisher initialised (per-topic, one topic per EventType)'
    );
  } else {
    publisher = new LoggingPublisher(logger);
    logger.info('pubsub: GCP_PROJECT_ID unset — using stdout-logging stub');
  }
  return publisher;
}

export async function publish<T>(
  logger: FastifyBaseLogger,
  type: EventType,
  tenantId: string,
  actorId: string | null,
  data: T
): Promise<void> {
  const event: SparxEvent<T> = {
    type,
    tenantId,
    actorId,
    occurredAt: new Date().toISOString(),
    data,
  };
  try {
    await getPublisher(logger).publish(event);
  } catch (err) {
    // Never fail a mutation because Pub/Sub is down — log and continue.
    // Webhook deliveries are reconstructed from `content_entries.updatedAt`
    // anyway, so dropped events recover on the next scheduled sync.
    logger.error({ err, event }, 'pubsub: publish failed');
  }
}
