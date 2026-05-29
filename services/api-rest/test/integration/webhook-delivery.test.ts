// Webhook delivery end-to-end.
//
//   1. Subscribe to content.entry.published for a webhook target URL.
//   2. Publish an entry → enqueueWebhookDeliveries inserts a pending row.
//   3. Stand up an in-process HTTP test target, point the subscription
//      at it, run runWebhookDeliveryTick().
//   4. Assert: target received POST with x-sparx-signature header that
//      verifies against the stored signing secret. webhook_delivery row
//      flips to status='delivered'.
//   5. Failure path: subscription URL points at a 500-returning target →
//      delivery row stays 'pending' with attempt_count bumped + an
//      exponential-backoff nextAttemptAt.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createHmac } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { withTenant } from '@sparx/db';
import { runWebhookDeliveryTick } from '@sparx/api-core/webhook-delivery';
import { publish } from '@sparx/api-core/pubsub';
import { createApp } from '../../src/app.js';
import {
  type TestTenant,
  authHeader,
  createTestTenant,
  dropTestTenant,
  signToken,
} from '../helpers.js';

interface CapturedRequest {
  url: string;
  body: string;
  signature: string;
  event: string;
}

function captureServer(
  handler: (req: IncomingMessage, body: string) => { status: number; body?: string }
): { server: Server; url: () => string; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      captured.push({
        url: req.url ?? '',
        body,
        signature: (req.headers['x-sparx-signature'] as string) ?? '',
        event: (req.headers['x-sparx-event'] as string) ?? '',
      });
      const outcome = handler(req, body);
      res.writeHead(outcome.status, { 'content-type': 'text/plain' });
      res.end(outcome.body ?? '');
    });
  });
  return {
    server,
    captured,
    url: () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('server has no address');
      return `http://127.0.0.1:${address.port}`;
    },
  };
}

describe('webhook delivery tick', () => {
  let app: FastifyInstance;
  let tenant: TestTenant;
  let token: string;

  beforeAll(async () => {
    app = await createApp();
    tenant = await createTestTenant('owner');
    token = signToken(app, tenant);
  });

  afterAll(async () => {
    await dropTestTenant(tenant.tenantId);
    await app.close();
  });

  afterEach(async () => {
    // Each test creates its own subscription; null them between cases so
    // the delivery tick only sees the rows the current test inserted.
    await withTenant({ tenantId: tenant.tenantId }, (tx) =>
      tx.webhookDelivery.deleteMany({ where: { tenantId: tenant.tenantId } })
    );
    await withTenant({ tenantId: tenant.tenantId }, (tx) =>
      tx.webhookSubscription.deleteMany({ where: { tenantId: tenant.tenantId } })
    );
  });

  it('delivers a signed POST to a 2xx target and marks the row delivered', async () => {
    const target = captureServer(() => ({ status: 200, body: 'ok' }));
    await new Promise<void>((resolve) => target.server.listen(0, resolve));

    // Subscribe via the API (this gives us the one-time signing secret).
    const sub = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/subscriptions',
      headers: authHeader(token),
      payload: {
        name: 'happy-path',
        url: target.url(),
        events: ['content.entry.published'],
      },
    });
    expect(sub.statusCode).toBe(201);
    const signingSecret = sub.json().data.signing_secret as string;
    expect(signingSecret).toBeTruthy();

    // Drive a publish to enqueue the delivery row.
    await publish(app.log, 'content.entry.published', tenant.tenantId, tenant.userId, {
      sample: 'payload',
    });

    const tick = await runWebhookDeliveryTick(app.log);
    expect(tick.acquired).toBe(true);
    expect(tick.attempted).toBe(1);
    expect(tick.delivered).toBe(1);
    expect(tick.failed).toBe(0);

    expect(target.captured).toHaveLength(1);
    const captured = target.captured[0]!;
    expect(captured.event).toBe('content.entry.published');
    expect(captured.signature.startsWith('sha256=')).toBe(true);
    const expected = createHmac('sha256', signingSecret).update(captured.body).digest('hex');
    expect(captured.signature).toBe(`sha256=${expected}`);

    // DB row should be marked delivered.
    const rows = await withTenant({ tenantId: tenant.tenantId }, (tx) =>
      tx.webhookDelivery.findMany({ where: { tenantId: tenant.tenantId } })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('delivered');
    expect(rows[0]!.responseStatus).toBe(200);

    target.server.close();
  });

  it('schedules a retry with backoff when the target returns 5xx', async () => {
    const target = captureServer(() => ({ status: 503, body: 'unavailable' }));
    await new Promise<void>((resolve) => target.server.listen(0, resolve));

    const sub = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/subscriptions',
      headers: authHeader(token),
      payload: {
        name: 'sad-path',
        url: target.url(),
        events: ['content.entry.published'],
      },
    });
    expect(sub.statusCode).toBe(201);

    await publish(app.log, 'content.entry.published', tenant.tenantId, tenant.userId, {
      sample: 'payload',
    });

    const tick = await runWebhookDeliveryTick(app.log);
    expect(tick.acquired).toBe(true);
    expect(tick.attempted).toBe(1);
    expect(tick.delivered).toBe(0);
    expect(tick.failed).toBe(1);

    const rows = await withTenant({ tenantId: tenant.tenantId }, (tx) =>
      tx.webhookDelivery.findMany({ where: { tenantId: tenant.tenantId } })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('pending');
    expect(rows[0]!.attemptCount).toBe(1);
    expect(rows[0]!.responseStatus).toBe(503);
    expect(rows[0]!.nextAttemptAt).toBeInstanceOf(Date);
    expect(rows[0]!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    target.server.close();
  });
});
