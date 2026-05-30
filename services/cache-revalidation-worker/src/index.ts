// Cloud Run entrypoint. Pub/Sub pushes catalog/content events to POST /; we
// decode the OIDC token's `email` claim (defense in depth on top of Cloud
// Run's own auth check), map the event to a storefront cache scope, and
// respond 204 (ack) / 5xx (nack-and-retry).
//
// Same shape as services/commerce-indexer / email-worker so operational
// tooling (log queries, alerts, the deploy workflow) stays uniform.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import pino from 'pino';

import { env } from './env.js';
import { handleEvent, type CacheEventEnvelope } from './handler.js';

interface PubSubPushEnvelope {
  message: {
    data?: string;
    attributes?: Record<string, string>;
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

const logger = pino({
  level: env.LOG_LEVEL,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function decodeOidcEmail(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const [, payloadB64] = authHeader.slice(7).split('.');
  if (!payloadB64) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      email?: unknown;
    };
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

function parseEvent(raw: unknown): CacheEventEnvelope | null {
  const e = raw as Partial<CacheEventEnvelope> | undefined;
  if (!e || typeof e.type !== 'string' || typeof e.tenantId !== 'string') return null;
  return e as CacheEventEnvelope;
}

async function handlePush(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end();
    return;
  }

  if (env.PUBSUB_INVOKER_SA) {
    const callerEmail = decodeOidcEmail(req.headers.authorization);
    if (callerEmail !== env.PUBSUB_INVOKER_SA) {
      logger.warn({ callerEmail }, 'rejecting push from unexpected invoker SA');
      res.statusCode = 403;
      res.end();
      return;
    }
  }

  let envelope: PubSubPushEnvelope;
  try {
    envelope = JSON.parse(await readBody(req)) as PubSubPushEnvelope;
  } catch (err) {
    logger.error({ err }, 'failed to parse push envelope');
    res.statusCode = 400;
    res.end();
    return;
  }

  const messageId = envelope.message?.messageId;
  if (!envelope.message?.data) {
    logger.warn({ messageId }, 'push envelope missing message.data; acking');
    res.statusCode = 204;
    res.end();
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(envelope.message.data, 'base64').toString('utf8'));
  } catch (err) {
    logger.error({ err, messageId }, 'message data not valid JSON; acking');
    res.statusCode = 204;
    res.end();
    return;
  }

  const event = parseEvent(parsed);
  if (!event) {
    logger.warn({ messageId }, 'event payload did not match envelope shape; acking');
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const result = await handleEvent(event, logger);
    logger.info(
      { messageId, type: event.type, tenantId: event.tenantId, ...result },
      'event processed'
    );
    res.statusCode = 204;
    res.end();
  } catch (err) {
    logger.error(
      { err, messageId, type: event.type, tenantId: event.tenantId },
      'unhandled handler error'
    );
    res.statusCode = 500;
    res.end();
  }
}

function main(): void {
  const server = createServer((req, res) => {
    void handlePush(req, res).catch((err: unknown) => {
      logger.error({ err }, 'unhandled error in push handler');
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end();
      }
    });
  });

  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT }, 'cache-revalidation-worker listening for Pub/Sub pushes');
  });

  function shutdown(signal: NodeJS.Signals): void {
    logger.info({ signal }, 'shutdown received; draining');
    server.close(() => {
      logger.info('server closed; exiting');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 9_000).unref();
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main();
