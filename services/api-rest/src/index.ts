// Production / dev entrypoint. Boots the Fastify factory and wires up
// graceful shutdown. Tests import ./app.ts directly and skip listen().

import { createApp } from './app.js';
import { env } from './env.js';
import { startScheduledPublishLoop } from './lib/scheduled-publish.js';

async function main(): Promise<void> {
  const app = await createApp();

  // Background tick that flips entries with status='scheduled' to
  // 'published' once their `scheduled_at` has passed. Singleton across
  // pods via Postgres advisory lock — see lib/scheduled-publish.ts.
  const stopScheduledPublish = startScheduledPublishLoop(app.log);

  const shutdown = (signal: NodeJS.Signals): void => {
    app.log.info({ signal }, 'shutdown received');
    stopScheduledPublish();
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
