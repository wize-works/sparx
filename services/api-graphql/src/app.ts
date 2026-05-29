// Fastify factory. Tests import createApp() to spin up an in-memory instance
// (no listen()); the bootstrap in index.ts wraps it with listen() + signal
// handlers. Keeping the two split is a Fastify convention worth observing.
//
// Service scope: GraphQL only. REST (CRUD, media uploads, sitemap/rss,
// CRM, webhooks) lives in api-rest. Shared Fastify primitives come from
// @sparx/api-core so the two services can't drift on auth, error envelope,
// or RLS-aware DB helpers.

import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { createAuthPlugin } from '@sparx/api-core/auth';
import { createErrorsPlugin } from '@sparx/api-core/errors-plugin';
import { env } from './env.js';
import healthRoutes from './routes/health.js';
import graphqlRoutes from './routes/graphql.js';

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
    // GraphQL bodies can be larger than REST ones (variables + queries
    // packed together). 1 MiB is plenty for hand-written queries; cap kept
    // sane to discourage abuse.
    bodyLimit: 1 * 1024 * 1024,
  });

  // Order matters: errors → auth → routes. Error handler must be registered
  // first so it catches anything that throws from the others. No CRM/REST-
  // specific error mappers here — api-graphql doesn't touch CRM.
  await app.register(createErrorsPlugin());
  await app.register(
    createAuthPlugin({
      jwtSecret: env.SPARX_INTERNAL_JWT_SECRET,
      // No publicPrefixes for /v1/graphql — the auth preHandler is already
      // permissive (skips verification when no Bearer header is present, so
      // GraphiQL introspection GETs pass), and it populates request.auth
      // for valid tokens. Listing it as a public prefix made the preHandler
      // short-circuit BEFORE jwt.verify, leaving authenticated POSTs with a
      // null auth context. The onRequest hook in graphqlRoutes still
      // enforces auth-required for POSTs.
    })
  );

  // Surface request_id on every response (success or failure) so callers
  // logging a 5xx have something to send back to support.
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(healthRoutes);
  await app.register(graphqlRoutes);

  return app;
}
