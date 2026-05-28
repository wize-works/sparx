// Rate limit.
//
// Phase 1: simple per-IP token bucket. Plan-tiered limits (docs/06 §433
// listed Starter 60 rpm, Pro 600 rpm, etc.) land when billing data wires
// in — read tenant.plan from request.auth and override `max` accordingly.
// For now this protects against trivial scrapers + accidental tight loops.

import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

const rateLimitPlugin: FastifyPluginAsync = async (app) => {
  await app.register(fastifyRateLimit, {
    global: true,
    max: 600, // 10 per second, generous default
    timeWindow: '1 minute',
    // /health is liveness — never rate limit, would flap pods unhealthy.
    allowList: (request) => request.url === '/health',
    // Surface in the same envelope as everything else (Fastify throws
    // FastifyError with statusCode 429; our errors plugin catches that).
    errorResponseBuilder: (request, context) => ({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Rate limit of ${String(context.max)} requests per ${context.after} exceeded.`,
        details: { retry_after_seconds: Math.ceil(context.ttl / 1000) },
        request_id: request.id,
      },
    }),
  });
};

export default fp(rateLimitPlugin, { name: 'rate-limit' });
