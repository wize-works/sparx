// Typed event publisher.
//
// In prod (`GCP_PROJECT_ID` set) publishes to a single Pub/Sub topic
// (`sparx.events` by default). Subscribers fan out by `event.type`:
// content.entry.published is consumed by webhook-delivery + search-index
// workers; media.uploaded triggers transcode; etc.
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
  private readonly topic: Topic;
  constructor(client: PubSub, topicName: string) {
    this.topic = client.topic(topicName, {
      batching: { maxMessages: 100, maxMilliseconds: 50 },
    });
  }

  async publish<T>(event: SparxEvent<T>): Promise<void> {
    const data = Buffer.from(JSON.stringify(event));
    await this.topic.publishMessage({
      data,
      attributes: { type: event.type, tenantId: event.tenantId },
    });
  }
}

class LoggingPublisher implements Publisher {
  constructor(private readonly logger: FastifyBaseLogger) {}
  async publish<T>(event: SparxEvent<T>): Promise<void> {
    this.logger.info({ event }, '[pubsub:stub] would publish');
  }
}

let publisher: Publisher | null = null;

export function getPublisher(logger: FastifyBaseLogger): Publisher {
  if (publisher) return publisher;

  if (env.GCP_PROJECT_ID) {
    const client = new PubSub({ projectId: env.GCP_PROJECT_ID });
    publisher = new CloudPubSubPublisher(client, env.PUBSUB_TOPIC);
    logger.info(
      { topic: env.PUBSUB_TOPIC, project: env.GCP_PROJECT_ID },
      'pubsub: Google Cloud publisher initialised',
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
  data: T,
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
