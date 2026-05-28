// Per-topic Pub/Sub publisher. Topic name == event type — subscribers only
// receive events they care about, no fan-out filtering inside worker code.
//
// In dev (`GCP_PROJECT_ID` unset) the publisher logs to the supplied
// logger and otherwise no-ops — useful for quick iteration without a
// Pub/Sub emulator.

import type { Topic } from '@google-cloud/pubsub';
import { PubSub } from '@google-cloud/pubsub';
import type { EventType, SparxEvent } from './types';

export interface PublisherLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface Publisher {
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
      // attributes are duplicated metadata for log/DLQ inspection — each
      // subscriber already only sees its own topic.
      attributes: { type: event.type, tenantId: event.tenantId },
    });
  }
}

class LoggingPublisher implements Publisher {
  constructor(private readonly logger: PublisherLogger) {}

  publish<T>(event: SparxEvent<T>): Promise<void> {
    this.logger.info({ event }, '[pubsub:stub] would publish');
    return Promise.resolve();
  }
}

let cached: Publisher | null = null;

export interface CreatePublisherOptions {
  projectId?: string;
  logger: PublisherLogger;
}

export function createPublisher({ projectId, logger }: CreatePublisherOptions): Publisher {
  if (cached) return cached;

  if (projectId) {
    const client = new PubSub({ projectId });
    cached = new CloudPubSubPublisher(client);
    logger.info({ projectId }, 'pubsub: Google Cloud publisher initialised (per-topic)');
  } else {
    cached = new LoggingPublisher(logger);
    logger.info({}, 'pubsub: projectId unset — using logging stub');
  }
  return cached;
}

/**
 * Convenience: build the event envelope + publish. Most callers want this
 * rather than constructing a SparxEvent themselves.
 *
 * NEVER fails the calling request because Pub/Sub is down — catches and
 * logs. If a caller needs guaranteed delivery, it should construct the
 * publisher and handle errors itself.
 */
export async function publishEvent<T>(
  publisher: Publisher,
  type: EventType,
  tenantId: string,
  actorId: string | null,
  data: T,
  logger: PublisherLogger
): Promise<void> {
  const event: SparxEvent<T> = {
    type,
    tenantId,
    actorId,
    occurredAt: new Date().toISOString(),
    data,
  };
  try {
    await publisher.publish(event);
  } catch (err) {
    logger.error({ err, event }, 'pubsub: publish failed');
  }
}

/** Test hook — drop the cached publisher between suites. */
export function _resetPublisherForTest(): void {
  cached = null;
}
