// Fastify factory for the MCP server.
//
// Surface:
//   • GET  /health           — liveness/readiness probe
//   • POST /v1/mcp           — MCP JSON-RPC over Streamable HTTP
//   • GET  /v1/mcp           — SSE channel for server→client messages
//   • DELETE /v1/mcp         — explicit session termination
//
// Auth: bearer JWT (see ./auth.ts). One McpServer + transport pair is built
// per request — stateless mode — so each call is hermetic and easy to test.

import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { env } from './env.js';
import authPlugin, { AuthError, authenticate } from './auth.js';
import { buildServerForRequest } from './server.js';
import { enforceRateLimit, RateLimitError } from './rate-limit.js';
import { isWriteToolCall } from './tool-registry.js';

function loggerOptions(): FastifyServerOptions['logger'] {
  if (env.NODE_ENV === 'test') return false;
  if (env.NODE_ENV === 'development') {
    return {
      level: env.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    };
  }
  return { level: env.LOG_LEVEL };
}

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(),
    genReqId: () => `mcp_${randomUUID().replace(/-/g, '')}`,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'request_id',
    trustProxy: true,
    bodyLimit: 512 * 1024, // MCP payloads are JSON-RPC envelopes — 512 KiB ceiling.
  });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AuthError) {
      return reply.code(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: err.message, request_id: request.id },
      });
    }
    if (err instanceof RateLimitError) {
      if (err.retryAfterSeconds > 0) {
        reply.header('retry-after', String(err.retryAfterSeconds));
      }
      return reply.code(429).send({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: err.message,
          details: {
            scope: err.scope,
            window: err.window,
            limit: err.limit,
            retry_after_seconds: err.retryAfterSeconds,
          },
          request_id: request.id,
        },
      });
    }
    request.log.error({ err }, 'unhandled mcp error');
    return reply.code(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred.',
        request_id: request.id,
      },
    });
  });

  await app.register(authPlugin);

  app.get('/health', (_request, reply) => {
    reply.code(200).send({ status: 'ok' });
  });

  // POST handles initialize + JSON-RPC requests. GET handles the SSE channel
  // the SDK opens for streaming responses; DELETE terminates a session.
  app.route({
    method: ['POST', 'GET', 'DELETE'],
    url: '/v1/mcp',
    handler: async (request, reply) => {
      const auth = await authenticate(request);
      // POST is the only method that carries a JSON-RPC body — GET opens the
      // SSE channel and DELETE terminates. Only count POST against the
      // tenant's quota; GET/DELETE are framing, not work.
      if (request.method === 'POST') {
        await enforceRateLimit({
          auth,
          isWriteCall: isWriteToolCall(request.body),
        });
      }
      const server = buildServerForRequest(auth);
      // Stateless mode — no session id, every request stands alone.
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
      // handleRequest takes over the response — tell Fastify to stop.
      reply.hijack();
    },
  });

  return app;
}
