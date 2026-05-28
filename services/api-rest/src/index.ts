// Production / dev entrypoint. Boots the Fastify factory and wires up
// graceful shutdown. Tests import ./app.ts directly and skip listen().

import { createApp } from './app.js';
import { env } from './env.js';

async function main(): Promise<void> {
  const app = await createApp();

  const shutdown = (signal: NodeJS.Signals): void => {
    app.log.info({ signal }, 'shutdown received');
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
