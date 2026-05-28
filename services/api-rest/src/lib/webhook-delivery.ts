// Outgoing webhook delivery.
//
// Two pieces:
//
//   1. enqueueWebhookDeliveries(tx, tenantId, eventType, payload)
//      Called from inside a route's withRequestTenant transaction so the
//      delivery rows commit atomically with whatever caused the event.
//      Looks up matching WebhookSubscriptions (events[] contains
//      eventType, active=true) and inserts one WebhookDelivery per match
//      with status='pending'.
//
//   2. runWebhookDeliveryTick(logger)
//      Background loop singleton across pods (advisory lock). Selects
//      pending deliveries through the SECURITY DEFINER function
//      `find_pending_webhook_deliveries` (migration 20260601100100),
//      POSTs each with an HMAC-SHA256 `X-Sparx-Signature: sha256=<hex>`
//      header derived from the subscription's signing secret. On 2xx
//      flips status='delivered'; on any other outcome bumps attempt_count
//      and schedules next_attempt_at with exponential backoff up to 8
//      attempts (matches plan §4.1 "24h retry window").

import { createHmac } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Prisma, TxClient } from '@sparx/db';
import { prisma, withTenant } from '@sparx/db';

const WEBHOOK_DELIVERY_LOCK_KEY = 4242_4243;
const DEFAULT_INTERVAL_MS = 30_000;
const MAX_ATTEMPTS = 8;
// Exponential backoff (seconds): 30, 60, 300, 900, 1800, 3600, 7200, 14400
// Total ≈ 7.5 hours by attempt 8. We give up after that and leave status
// at 'failed' for the operator to inspect.
const BACKOFF_SECONDS = [30, 60, 300, 900, 1800, 3600, 7200, 14400];
const REQUEST_TIMEOUT_MS = 10_000;

interface PendingDelivery {
  delivery_id: string;
  tenant_id: string;
  subscription_id: string;
  event_type: string;
  payload: Prisma.JsonValue;
  attempt_count: number;
  subscription_url: string;
  signing_secret: string;
}

export interface TickResult {
  acquired: boolean;
  attempted: number;
  delivered: number;
  failed: number;
}

// Inserts WebhookDelivery rows for every active subscription that listens
// for `eventType`. Tenant-scoped — caller is already inside withRequestTenant
// so RLS sees the GUC and only this tenant's subscriptions match. Never
// throws — webhook delivery is best-effort relative to the main mutation.
export async function enqueueWebhookDeliveries(
  tx: TxClient,
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const subs = await tx.webhookSubscription.findMany({
    where: { active: true, events: { has: eventType } },
    select: { id: true },
  });
  if (subs.length === 0) return;
  await tx.webhookDelivery.createMany({
    data: subs.map((s) => ({
      tenantId,
      subscriptionId: s.id,
      eventType,
      payload: payload as Prisma.InputJsonValue,
      status: 'pending',
      nextAttemptAt: new Date(),
    })),
  });
}

// One-shot tick. Picks up to 100 pending deliveries, attempts each
// sequentially. Sequential rather than parallel because failure of one
// outbound POST shouldn't slow the next, and 100 × 10s timeout would
// pin the worker for ages; we trust the next tick to pick up the rest.
export async function runWebhookDeliveryTick(logger: FastifyBaseLogger): Promise<TickResult> {
  const lock = await prisma.$queryRaw<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(${WEBHOOK_DELIVERY_LOCK_KEY}::int) AS acquired
  `;
  if (!lock[0]?.acquired) {
    logger.debug('webhook-delivery: lock held by another pod, skipping');
    return { acquired: false, attempted: 0, delivered: 0, failed: 0 };
  }

  try {
    const pending = await prisma.$queryRaw<PendingDelivery[]>`
      SELECT delivery_id, tenant_id, subscription_id, event_type, payload,
             attempt_count, subscription_url, signing_secret
      FROM find_pending_webhook_deliveries(100)
    `;

    if (pending.length === 0) {
      return { acquired: true, attempted: 0, delivered: 0, failed: 0 };
    }

    logger.info({ count: pending.length }, 'webhook-delivery: attempting');

    let delivered = 0;
    let failed = 0;

    for (const row of pending) {
      const outcome = await attempt(row, logger);
      try {
        await withTenant({ tenantId: row.tenant_id }, async (tx) => {
          await persistOutcome(tx, row, outcome);
        });
      } catch (err) {
        logger.error(
          { err, deliveryId: row.delivery_id },
          'webhook-delivery: failed to persist outcome'
        );
      }
      if (outcome.kind === 'delivered') delivered += 1;
      else failed += 1;
    }

    return { acquired: true, attempted: pending.length, delivered, failed };
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${WEBHOOK_DELIVERY_LOCK_KEY}::int)`;
  }
}

type Outcome =
  | { kind: 'delivered'; status: number; body: string }
  | { kind: 'retry'; status: number | null; body: string; error?: string }
  | { kind: 'failed'; status: number | null; body: string; error?: string };

async function attempt(row: PendingDelivery, logger: FastifyBaseLogger): Promise<Outcome> {
  const body = JSON.stringify({
    id: row.delivery_id,
    type: row.event_type,
    tenant_id: row.tenant_id,
    data: row.payload,
    delivered_at: new Date().toISOString(),
  });
  const signature = createHmac('sha256', row.signing_secret).update(body).digest('hex');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(row.subscription_url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sparx-event': row.event_type,
        'x-sparx-delivery': row.delivery_id,
        'x-sparx-signature': `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    });
    const text = await safeText(res);
    if (res.status >= 200 && res.status < 300) {
      return { kind: 'delivered', status: res.status, body: text };
    }
    const nextAttempt = row.attempt_count + 1;
    if (nextAttempt >= MAX_ATTEMPTS) {
      return { kind: 'failed', status: res.status, body: text };
    }
    return { kind: 'retry', status: res.status, body: text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ deliveryId: row.delivery_id, err: message }, 'webhook-delivery: network error');
    const nextAttempt = row.attempt_count + 1;
    if (nextAttempt >= MAX_ATTEMPTS) {
      return { kind: 'failed', status: null, body: '', error: message };
    }
    return { kind: 'retry', status: null, body: '', error: message };
  } finally {
    clearTimeout(timer);
  }
}

async function persistOutcome(tx: TxClient, row: PendingDelivery, outcome: Outcome): Promise<void> {
  const nextAttempt = row.attempt_count + 1;
  if (outcome.kind === 'delivered') {
    await tx.webhookDelivery.update({
      where: { id: row.delivery_id },
      data: {
        status: 'delivered',
        attemptCount: nextAttempt,
        responseStatus: outcome.status,
        responseBody: outcome.body.slice(0, 4096),
        deliveredAt: new Date(),
        nextAttemptAt: null,
      },
    });
    return;
  }
  if (outcome.kind === 'failed') {
    await tx.webhookDelivery.update({
      where: { id: row.delivery_id },
      data: {
        status: 'failed',
        attemptCount: nextAttempt,
        responseStatus: outcome.status,
        responseBody: (outcome.body || outcome.error || '').slice(0, 4096),
        nextAttemptAt: null,
      },
    });
    return;
  }
  const backoffSec = BACKOFF_SECONDS[nextAttempt] ?? BACKOFF_SECONDS[BACKOFF_SECONDS.length - 1]!;
  await tx.webhookDelivery.update({
    where: { id: row.delivery_id },
    data: {
      status: 'pending',
      attemptCount: nextAttempt,
      responseStatus: outcome.status,
      responseBody: (outcome.body || outcome.error || '').slice(0, 4096),
      nextAttemptAt: new Date(Date.now() + backoffSec * 1000),
    },
  });
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 4096);
  } catch {
    return '';
  }
}

// Background loop. Same shape as scheduled-publish.startScheduledPublishLoop —
// runs once per `intervalMs`, returns a stop() for graceful shutdown.
export function startWebhookDeliveryLoop(
  logger: FastifyBaseLogger,
  intervalMs: number = DEFAULT_INTERVAL_MS
): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await runWebhookDeliveryTick(logger);
    } catch (err) {
      logger.error({ err }, 'webhook-delivery: tick threw — will retry next interval');
    }
    if (stopped) return;
    timer = setTimeout(() => void tick(), intervalMs);
  };

  timer = setTimeout(() => void tick(), intervalMs);
  logger.info({ intervalMs }, 'webhook-delivery: loop started');

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    logger.info('webhook-delivery: loop stopped');
  };
}
