// Fastify factory. Tests import createApp() to spin up an in-memory instance
// (no listen()); the bootstrap in index.ts wraps it with listen() + signal
// handlers. Keeping the two split is a Fastify convention worth observing.
//
// Shared Fastify primitives (auth, error envelope, db helpers, audit,
// pubsub, content-type validation) live in @sparx/api-core. This service
// composes the factories with its own env config and stays focused on
// REST-only route plumbing. GraphQL is a separate service (api-graphql).

import { randomUUID } from 'node:crypto';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyServerOptions,
} from 'fastify';
import { CrmConflictError, CrmNotFoundError, CrmValidationError } from '@sparx/crm';
import { createAuthPlugin } from '@sparx/api-core/auth';
import { createErrorsPlugin, type ErrorEnvelope } from '@sparx/api-core/errors-plugin';
import { env } from './env.js';
import openapiPlugin from './plugins/openapi.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import healthRoutes from './routes/health.js';
import domainCheckRoutes from './routes/internal/domain-check.js';
import crmCronRoutes from './routes/internal/crm-cron.js';
import commerceCronRoutes from './routes/internal/commerce-cron.js';
import contentTypeRoutes from './routes/v1/content/types.js';
import entryRoutes from './routes/v1/content/entries.js';
import publishRoutes from './routes/v1/content/publish.js';
import revisionRoutes from './routes/v1/content/revisions.js';
import previewTokenRoutes from './routes/v1/content/preview-tokens.js';
import navigationRoutes from './routes/v1/navigation/menus.js';
import redirectRoutes from './routes/v1/redirects/index.js';
import authorRoutes from './routes/v1/authors/index.js';
import taxonomyRoutes from './routes/v1/taxonomies/index.js';
import webhookRoutes from './routes/v1/webhooks/subscriptions.js';
import sitemapRoutes from './routes/v1/sitemap.js';
import rssRoutes from './routes/v1/rss.js';
import publicContentRoutes from './routes/v1/public/content.js';
import publicCommerceRoutes from './routes/v1/public/commerce.js';
import publicMediaRoutes from './routes/v1/public/media.js';
import uploadRoutes from './routes/v1/media/uploads.js';
import mediaAssetRoutes from './routes/v1/media/assets.js';
import crmRoutes from './routes/v1/crm/index.js';
import tenantRoutes from './routes/v1/tenant.js';
import meRoutes from './routes/v1/me.js';
import userRoutes from './routes/v1/users.js';
import emailTestRoutes from './routes/v1/email/test.js';
import dashboardRoutes from './routes/v1/dashboard.js';

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

// CRM service-layer errors share the platform vocabulary (NOT_FOUND /
// VALIDATION_ERROR / CONFLICT) — register them as extra mappers so the
// generic api-core plugin doesn't need to know CRM exists.
function crmErrorMapper(
  err: unknown,
  request: { id: string },
  reply: FastifyReply
): FastifyReply | undefined {
  const requestId = request.id;
  if (err instanceof CrmNotFoundError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: err.message,
        details: { entityType: err.entityType, entityId: err.entityId },
        request_id: requestId,
      },
    };
    return reply.code(404).send(body);
  }
  if (err instanceof CrmValidationError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.details,
        request_id: requestId,
      },
    };
    return reply.code(422).send(body);
  }
  if (err instanceof CrmConflictError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'CONFLICT',
        message: err.message,
        ...(err.field !== undefined ? { details: { field: err.field } } : {}),
        request_id: requestId,
      },
    };
    return reply.code(409).send(body);
  }
  return undefined;
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

  // Raw-bytes parser for local-mode media uploads. In prod (GCS) the
  // browser PUTs directly to a signed Cloud Storage URL and the bytes
  // never touch api-rest; this parser only fires in dev / test where the
  // local storage backend serves the "presigned" URL itself. Routes that
  // want a Buffer just declare a per-route `bodyLimit` and inspect
  // `request.body`.
  app.addContentTypeParser(
    /^(application\/octet-stream|application\/pdf|image\/.+|video\/.+|audio\/.+)$/,
    { parseAs: 'buffer', bodyLimit: 200 * 1024 * 1024 },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // Order matters: errors → openapi → rate-limit → auth → routes. Error
  // handler must be registered first so it catches anything that throws
  // from the others. OpenAPI must be initialised before routes register so
  // each route's schema is recorded.
  await app.register(createErrorsPlugin({ extraMappers: [crmErrorMapper] }));
  await app.register(openapiPlugin);
  await app.register(rateLimitPlugin);
  await app.register(
    createAuthPlugin({
      jwtSecret: env.SPARX_INTERNAL_JWT_SECRET,
      publicPrefixes: [
        '/v1/openapi.json',
        '/v1/sitemap.xml',
        '/v1/public/',
        // Local-mode media upload endpoints — issued by `presignPut` and
        // self-authorising via the in-URL object key. Skipping the Bearer
        // check here mirrors the GCS signed-URL contract.
        '/v1/media/_local/',
      ],
    })
  );

  // Surface request_id on every response (success or failure) so callers
  // logging a 5xx have something to send back to support.
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(healthRoutes);
  await app.register(domainCheckRoutes);
  await app.register(crmCronRoutes);
  await app.register(commerceCronRoutes);

  // v1 surface. Each route file owns its own URL prefix so this central
  // map is easy to skim. Adding a new route group is a one-line registration.
  await app.register(contentTypeRoutes);
  await app.register(entryRoutes);
  await app.register(publishRoutes);
  await app.register(revisionRoutes);
  await app.register(previewTokenRoutes);
  await app.register(navigationRoutes);
  await app.register(redirectRoutes);
  await app.register(authorRoutes);
  await app.register(taxonomyRoutes);
  await app.register(webhookRoutes);
  await app.register(sitemapRoutes);
  await app.register(rssRoutes);
  await app.register(publicContentRoutes);
  await app.register(publicCommerceRoutes);
  await app.register(publicMediaRoutes);
  await app.register(uploadRoutes);
  await app.register(mediaAssetRoutes);
  await app.register(crmRoutes);
  await app.register(tenantRoutes);
  await app.register(meRoutes);
  await app.register(userRoutes);
  await app.register(emailTestRoutes);
  await app.register(dashboardRoutes);

  return app;
}
