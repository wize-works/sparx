// Entry point. Boots a Pub/Sub pull subscription against
// `sparx.events` (filtered to attributes.type='media.uploaded') and
// dispatches each message to `processAsset()`.
//
// Concurrency: env.MAX_CONCURRENT controls how many messages we keep in
// flight. sharp is CPU-heavy so over-subscribing thrashes the pod; under-
// subscribing means a long tail of unprocessed uploads while the queue
// grows. The default (2) is tuned for a 2-vCPU GKE Autopilot pod.
//
// Graceful shutdown: on SIGTERM, the subscription stops pulling new
// messages and the process waits for in-flight ones to ack/nack before
// exiting.

import { PubSub, type Message, type Subscription } from '@google-cloud/pubsub';
import pino from 'pino';
import { env } from './env.js';
import { processAsset } from './processor.js';

interface MediaUploadedEvent {
  type: 'media.uploaded';
  tenantId: string;
  occurredAt: string;
  data: {
    assetId: string;
    key: string;
    mimeType: string;
    byteSize: string;
  };
}

const logger = pino({
  level: env.LOG_LEVEL,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

const client = new PubSub({ projectId: env.GCP_PROJECT_ID });
const subscription: Subscription = client.subscription(env.PUBSUB_SUBSCRIPTION, {
  flowControl: { maxMessages: env.MAX_CONCURRENT, allowExcessMessages: false },
});

function parseEvent(message: Message): MediaUploadedEvent | null {
  try {
    const parsed = JSON.parse(message.data.toString()) as MediaUploadedEvent;
    if (parsed.type !== 'media.uploaded') return null;
    if (!parsed.data?.assetId) return null;
    return parsed;
  } catch (err) {
    logger.error({ err, messageId: message.id }, 'failed to parse Pub/Sub message');
    return null;
  }
}

subscription.on('message', (message: Message) => {
  const event = parseEvent(message);
  if (!event) {
    // Bad/foreign messages get acked so they don't recycle forever.
    message.ack();
    return;
  }

  // Process synchronously inside the message handler — the Pub/Sub client
  // honours `maxMessages` here, so awaiting throttles the queue naturally.
  void processAsset(event.data.assetId, logger)
    .then((result) => {
      logger.info({ assetId: event.data.assetId, ...result }, 'message processed');
      message.ack();
    })
    .catch((err: unknown) => {
      // The processor already records the failure to MediaAsset; ack the
      // message so we don't retry forever. Re-enqueue is a manual op.
      logger.error({ err, assetId: event.data.assetId }, 'unhandled processor error');
      message.ack();
    });
});

subscription.on('error', (err: Error) => {
  logger.error({ err }, 'Pub/Sub subscription error');
});

logger.info(
  { subscription: env.PUBSUB_SUBSCRIPTION, project: env.GCP_PROJECT_ID },
  'media-worker subscribed; waiting for messages'
);

function shutdown(signal: NodeJS.Signals): void {
  logger.info({ signal }, 'shutdown received; closing subscription');
  subscription
    .close()
    .then(() => {
      logger.info('subscription closed; exiting');
      process.exit(0);
    })
    .catch((err: unknown) => {
      logger.error({ err }, 'graceful shutdown failed');
      process.exit(1);
    });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
