// OpenAPI spec generation.
//
// @fastify/swagger walks every registered route (their schema + tags) and
// emits a v3 spec at /v1/openapi.json. The TypeScript SDK in
// packages/api-client (Phase 4) runs `openapi-typescript` against this
// spec to produce typed `cms.getEntry()` etc. helpers.
//
// In production the spec is also useful for: external developer docs,
// generated client SDKs in other languages, and contract tests.
//
// Routes added without an explicit schema still appear in the spec — they
// just don't get strong request/response typing. Routes that DO supply a
// Zod schema (via the request body Zod parse) currently flow through Zod
// rather than Fastify's JSON-schema validation, so their bodies are
// documented as `object` until we wire fastify-type-provider-zod. That's a
// nice-to-have, not a blocker.

import fastifySwagger from '@fastify/swagger';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../env.js';

const openapiPlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Sparx API',
        description:
          'Sparx public REST API. Tenant-scoped via Better Auth-issued internal JWTs (Phase 1) and `sparx_live_*` API keys (Phase 4+). Every response uses the envelope shape `{ success, data, meta? }` or `{ success: false, error: { code, message, request_id } }`. See docs/06-api-specification.md.',
        version: '1.0.0',
      },
      servers: [
        {
          url:
            env.NODE_ENV === 'production'
              ? 'https://api.sparx.works'
              : `http://localhost:${env.PORT}`,
        },
      ],
      tags: [
        { name: 'content', description: 'Content types, entries, revisions, publishing' },
        { name: 'navigation', description: 'Header / footer / mega menu trees' },
        { name: 'redirects', description: '301/302 redirect rules' },
        { name: 'webhooks', description: 'Subscription management for content + media events' },
        { name: 'sitemap', description: 'Public sitemap.xml' },
        { name: 'system', description: 'Health probes, readiness' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'Internal-trust JWT issued by the dashboard or a sparx_live_* API key (Phase 4).',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  app.get('/v1/openapi.json', { schema: { hide: true } }, () => app.swagger());
};

export default fp(openapiPlugin, { name: 'openapi' });
