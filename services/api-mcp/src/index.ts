// Entry point. Boots the Fastify app and listens.

import { env } from './env.js';
import { createApp } from './app.js';
import { preconnectAudit } from './audit.js';

async function main(): Promise<void> {
  const app = await createApp();
  await preconnectAudit();
  await app.listen({ host: env.HOST, port: env.PORT });

  const shutdown = (signal: NodeJS.Signals): void => {
    app.log.info({ signal }, 'shutdown received');
    app
      .close()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        app.log.error({ err }, 'graceful shutdown failed');
        process.exit(1);
      });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

void main().catch((err: unknown) => {
  console.error('[mcp-server] failed to start', err);
  process.exit(1);
});
