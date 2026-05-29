// Cloud Run entrypoint. Pub/Sub pushes media.uploaded events to POST /;
// we decode the OIDC token's `email` claim, dispatch to processAsset(),
// and respond 204 (ack) / 5xx (nack-and-retry).
//
// Cloud Run's frontend cryptographically verifies the OIDC token signature
// before the request reaches this process; we only need to confirm the
// `email` claim matches the expected invoker SA. That catches IAM
// misconfigurations where additional SAs end up with run.invoker on this
// service.
//
// Concurrency: Cloud Run's containerConcurrency (TF-managed) replaces the
// old MAX_CONCURRENT knob. sharp is CPU-heavy, so we keep concurrency=2
// per instance to match the original tuning; Cloud Run scales horizontally
// when more load arrives.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import pino from 'pino';
import { env } from './env.js';
import { processAsset } from './processor.js';

interface MediaUploadedEvent {
  type: 'media.uploaded';
  tenantId: string;
  occurredAt: string;
  data: {
    assetId: string;
    key: string;
    mimeType: string;
    byteSize: string;
  };
}

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

function parseEvent(raw: unknown): MediaUploadedEvent | null {
  const event = raw as Partial<MediaUploadedEvent> | undefined;
  if (event?.type !== 'media.uploaded') return null;
  if (!event.data?.assetId) return null;
  return event as MediaUploadedEvent;
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
    logger.warn({ messageId }, 'message did not match media.uploaded schema; acking');
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const result = await processAsset(event.data.assetId, logger);
    logger.info({ messageId, assetId: event.data.assetId, ...result }, 'message processed');
    // processAsset records 'failed' to the MediaAsset row internally; ack
    // regardless so the message doesn't recycle forever. Manual re-enqueue
    // is the recovery path for failed assets.
    res.statusCode = 204;
    res.end();
  } catch (err) {
    logger.error({ err, messageId, assetId: event.data.assetId }, 'unhandled processor error');
    // processor.ts catches its own errors; if we got here, it's something
    // unexpected. 5xx triggers Pub/Sub redelivery.
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
    logger.info({ port: env.PORT }, 'media-worker listening for Pub/Sub pushes');
  });

  function shutdown(signal: NodeJS.Signals): void {
    logger.info({ signal }, 'shutdown received; draining');
    server.close(() => {
      logger.info('server closed; exiting');
      process.exit(0);
    });
    // Cloud Run grace period is 10s by default. Force exit if an in-flight
    // libvips encode hasn't returned.
    setTimeout(() => process.exit(1), 9_000).unref();
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

try {
  main();
} catch (err) {
  logger.fatal({ err }, 'media-worker failed to start');
  process.exit(1);
}
