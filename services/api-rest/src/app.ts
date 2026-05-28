// Fastify factory. Tests import createApp() to spin up an in-memory instance
// (no listen()); the bootstrap in index.ts wraps it with listen() + signal
// handlers. Keeping the two split is a Fastify convention worth observing.

import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { env } from './env.js';
import errorsPlugin from './plugins/errors.js';
import authPlugin from './plugins/auth.js';
import openapiPlugin from './plugins/openapi.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import healthRoutes from './routes/health.js';
import contentTypeRoutes from './routes/v1/content/types.js';
import entryRoutes from './routes/v1/content/entries.js';
import publishRoutes from './routes/v1/content/publish.js';
import revisionRoutes from './routes/v1/content/revisions.js';
import previewTokenRoutes from './routes/v1/content/preview-tokens.js';
import navigationRoutes from './routes/v1/navigation/menus.js';
import redirectRoutes from './routes/v1/redirects/index.js';
import webhookRoutes from './routes/v1/webhooks/subscriptions.js';
import sitemapRoutes from './routes/v1/sitemap.js';

function loggerOptions(): FastifyServerOptions['logger'] {
  if (env.NODE_ENV === 'test') return false;
  if (env.NODE_ENV === 'development') {
    return {
      level: env.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    };
  }
  return { level: env.LOG_LEVEL };
}

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(),
    // Per docs/06-api-specification.md every error response carries a
    // `request_id` of the form `req_<hex>` — Fastify exposes it as
    // `request.id` everywhere once configured here.
    genReqId: () => `req_${randomUUID().replace(/-/g, '')}`,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'request_id',
    // X-Forwarded-* — sparx-prod sits behind Caddy.
    trustProxy: true,
    disableRequestLogging: false,
    bodyLimit: 5 * 1024 * 1024, // 5 MiB — rich-text bodies, not media (those upload direct-to-GCS).
  });

  // Order matters: errors → openapi → rate-limit → auth → routes. Error
  // handler must be registered first so it catches anything that throws
  // from the others. OpenAPI must be initialised before routes register so
  // each route's schema is recorded.
  await app.register(errorsPlugin);
  await app.register(openapiPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);

  // Surface request_id on every response (success or failure) so callers
  // logging a 5xx have something to send back to support.
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(healthRoutes);

  // v1 surface. Each route file owns its own URL prefix so this central
  // map is easy to skim. Adding a new route group is a one-line registration.
  await app.register(contentTypeRoutes);
  await app.register(entryRoutes);
  await app.register(publishRoutes);
  await app.register(revisionRoutes);
  await app.register(previewTokenRoutes);
  await app.register(navigationRoutes);
  await app.register(redirectRoutes);
  await app.register(webhookRoutes);
  await app.register(sitemapRoutes);

  return app;
}
