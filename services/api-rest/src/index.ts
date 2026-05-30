// Production / dev entrypoint. Boots the Fastify factory and wires up
// graceful shutdown. Tests import ./app.ts directly and skip listen().

import { configurePubsub } from '@sparx/api-core/pubsub';
import { startWebhookDeliveryLoop } from '@sparx/api-core/webhook-delivery';
import { installCrmWebhookFanout, preconnectWebhookFanout } from '@sparx/crm';
import { createApp } from './app.js';
import { env } from './env.js';
import { startScheduledPublishLoop } from './lib/scheduled-publish.js';
import { startSitebuilderPublishLoop } from './lib/sitebuilder-publish.js';

async function main(): Promise<void> {
  // Hand api-core its Pub/Sub config before any route handler can call
  // publish(). Unset GCP_PROJECT_ID → stdout-logging stub.
  configurePubsub({ gcpProjectId: env.GCP_PROJECT_ID });

  // Wrap the CRM publisher so every publishCrmEvent() also enqueues a
  // WebhookDelivery row per matching tenant subscription. Pre-warm the
  // DB connection so the first event doesn't pay startup latency.
  installCrmWebhookFanout();
  await preconnectWebhookFanout();

  const app = await createApp();

  // Background tick that flips entries with status='scheduled' to
  // 'published' once their `scheduled_at` has passed. Singleton across
  // pods via Postgres advisory lock — see lib/scheduled-publish.ts.
  const stopScheduledPublish = startScheduledPublishLoop(app.log);

  // Background tick that publishes Site Builder drafts whose scheduled
  // publish time has passed. Singleton across pods via its own advisory
  // lock — see lib/sitebuilder-publish.ts.
  const stopSitebuilderPublish = startSitebuilderPublishLoop(app.log);

  // Background tick that POSTs pending webhook deliveries to their
  // subscriber URLs with HMAC-SHA256 signatures. Singleton across pods
  // via a separate advisory lock — see @sparx/api-core/webhook-delivery.
  const stopWebhookDelivery = startWebhookDeliveryLoop(app.log);

  const shutdown = (signal: NodeJS.Signals): void => {
    app.log.info({ signal }, 'shutdown received');
    stopScheduledPublish();
    stopSitebuilderPublish();
    stopWebhookDelivery();
    void app
      .close()
      .then(() => {
        process.exit(0);
      })
      .catch((err: unknown) => {
        app.log.error({ err }, 'graceful shutdown failed');
        process.exit(1);
      });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error({ err }, 'listen failed');
    process.exit(1);
  }
}

void main();
