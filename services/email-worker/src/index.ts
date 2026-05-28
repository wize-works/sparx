// Entry point. Boots a Pub/Sub pull subscription against
// `email.send.email-worker` and dispatches each message to handle().
//
// Concurrency: env.MAX_CONCURRENT controls how many messages we keep in
// flight. Email rendering is cheap (MJML compiled at boot, Handlebars
// + html-to-text per send) so the default (8) is well within Pub/Sub
// client limits.
//
// Graceful shutdown: on SIGTERM, the subscription stops pulling new
// messages and the process waits for in-flight ones to ack/nack before
// exiting.

import { PubSub, type Message, type Subscription } from '@google-cloud/pubsub';
import pino from 'pino';
import { env } from './env.js';
import { handle, parseEvent } from './handler.js';
import { loadTemplates } from './templates.js';
import { getTransport } from './transport.js';

const logger = pino({
  level: env.LOG_LEVEL,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

async function main(): Promise<void> {
  // Pre-compile all MJML templates so the first message doesn't pay the
  // compilation cost (50–100ms per template). A render failure here is a
  // boot-time error — better to crashloop than ship an unrenderable
  // template into prod.
  const templateIds = await loadTemplates();
  logger.info({ templates: templateIds }, 'email templates compiled');

  const transport = getTransport();
  logger.info({ transport: transport.mode }, 'email transport selected');

  const client = new PubSub({ projectId: env.GCP_PROJECT_ID });
  const subscription: Subscription = client.subscription(env.PUBSUB_SUBSCRIPTION, {
    flowControl: { maxMessages: env.MAX_CONCURRENT, allowExcessMessages: false },
  });

  subscription.on('message', (message: Message) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message.data.toString());
    } catch (err) {
      logger.error({ err, messageId: message.id }, 'failed to parse Pub/Sub message body');
      // Malformed JSON will never become valid — ack so it doesn't recycle.
      message.ack();
      return;
    }

    const event = parseEvent(parsed);
    if (!event) {
      logger.warn(
        { messageId: message.id, raw: parsed },
        'message did not match email.send schema; acking'
      );
      message.ack();
      return;
    }

    void handle(event, logger)
      .then((outcome) => {
        logger.info(
          {
            messageId: message.id,
            template: event.data.template,
            outcome: outcome.status,
            postalMessageId: outcome.messageId,
          },
          'message processed'
        );
        message.ack();
      })
      .catch((err: unknown) => {
        // Transient failure — nack so Pub/Sub redelivers. After
        // max_delivery_attempts (5 by default for this topic) it lands
        // in the dead-letter topic for manual inspection.
        logger.error({ err, messageId: message.id }, 'transient send failure — nacking');
        message.nack();
      });
  });

  subscription.on('error', (err: Error) => {
    logger.error({ err }, 'Pub/Sub subscription error');
  });

  logger.info(
    { subscription: env.PUBSUB_SUBSCRIPTION, project: env.GCP_PROJECT_ID },
    'email-worker subscribed; waiting for messages'
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
}

void main().catch((err: unknown) => {
  logger.fatal({ err }, 'email-worker failed to start');
  process.exit(1);
});
