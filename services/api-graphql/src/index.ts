// Production / dev entrypoint. Boots the Fastify factory and wires up
// graceful shutdown. Tests import ./app.ts directly and skip listen().

import { configurePubsub } from '@sparx/api-core/pubsub';
import { startWebhookDeliveryLoop } from '@sparx/api-core/webhook-delivery';
import { createApp } from './app.js';
import { env } from './env.js';

async function main(): Promise<void> {
  // Hand api-core its Pub/Sub config before any resolver can call publish().
  // Unset GCP_PROJECT_ID → stdout-logging stub.
  configurePubsub({ gcpProjectId: env.GCP_PROJECT_ID });

  const app = await createApp();

  // Background tick that POSTs pending webhook deliveries to their
  // subscriber URLs with HMAC-SHA256 signatures. Singleton across pods via
  // a Postgres advisory lock — see @sparx/api-core/webhook-delivery.
  // api-rest runs the same loop; the advisory lock makes sure only one
  // pod-of-any-service actually delivers at any given tick.
  const stopWebhookDelivery = startWebhookDeliveryLoop(app.log);

  const shutdown = (signal: NodeJS.Signals): void => {
    app.log.info({ signal }, 'shutdown received');
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
