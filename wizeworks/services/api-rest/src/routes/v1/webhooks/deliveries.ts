// What actually happened to the notifications we tried to send.
//
//   GET /v1/webhooks/subscriptions/:id/deliveries   → the recent attempts
//
// WHY THIS EXISTS. The `webhook_deliveries` table has recorded every attempt
// since the feature shipped -- status, attempt_count, response_status,
// response_body, delivered_at -- and carries an index on
// `[subscriptionId, createdAt DESC]`, which is the index for exactly one
// screen. That screen did not exist, and neither did this route, so the rows
// were written and read by nobody.
//
// The cost was not a missing feature, it was a LIE. The delivery worker retries
// eight times over about seven and a half hours and then gives up, marking the
// row `failed`. Nothing told the tenant. Their subscription went on showing a
// green "Active" badge and the sentence "Notifications are being sent to this
// address as events happen" -- which is a description of a SETTING printed
// where a RESULT belongs. Somebody could mistype an address, watch it save,
// read that sentence, and never learn that not one message ever arrived
// (persona issue 403).
//
// `health` on the LIST route is the other half: a per-subscription summary so
// the list can say "12 failed" instead of "Active". Both deliberately
// distinguish "nothing has been sent yet" from "everything worked" -- they are
// different facts and only one of them is reassuring.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withRequestTenant } from '@wizeworks/api-core/db';
import { ok } from '@wizeworks/api-core/envelope';
import { requireRole } from '@wizeworks/api-core/auth';
import { notFound } from '@wizeworks/api-core/errors';
import type { TxClient } from '@wizeworks/db';

/** How far back the counts look. `lastAttemptAt` is deliberately NOT windowed:
 *  "the last thing that happened" has to stay true however long ago it was. */
const WINDOW_DAYS = 7;

const PathId = z.object({ id: z.string().uuid() });
const ListQuery = z.object({
  take: z.coerce.number().int().min(1).max(100).optional(),
});

export interface WebhookHealth {
  /** Attempts inside the window that reached the far end and were accepted. */
  delivered: number;
  /** Attempts inside the window that ran out of retries. */
  failed: number;
  /** Attempts inside the window still queued or mid-retry. */
  pending: number;
  /** When we last tried, ever. `null` means we have never sent anything. */
  lastAttemptAt: string | null;
  /** How that last attempt ended. `null` alongside a null time means untested. */
  lastOutcome: 'delivered' | 'failed' | 'pending' | null;
  windowDays: number;
}

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

function emptyHealth(): WebhookHealth {
  return {
    delivered: 0,
    failed: 0,
    pending: 0,
    lastAttemptAt: null,
    lastOutcome: null,
    windowDays: WINDOW_DAYS,
  };
}

function outcomeOf(status: string): WebhookHealth['lastOutcome'] {
  if (status === 'delivered') return 'delivered';
  if (status === 'failed') return 'failed';
  return 'pending';
}

/**
 * A health summary per subscription, for every subscription this tenant has.
 *
 * Two queries rather than one per row: a grouped count inside the window, and a
 * `DISTINCT ON (subscription_id)` for the newest attempt regardless of age.
 * Both are aggregated in Postgres, so this stays one round trip each however
 * many attempts have piled up.
 */
export async function webhookHealth(
  tx: TxClient,
  subscriptionIds: string[]
): Promise<Map<string, WebhookHealth>> {
  const health = new Map<string, WebhookHealth>();
  for (const id of subscriptionIds) health.set(id, emptyHealth());
  if (subscriptionIds.length === 0) return health;

  const [counts, latest] = await Promise.all([
    tx.webhookDelivery.groupBy({
      by: ['subscriptionId', 'status'],
      where: { subscriptionId: { in: subscriptionIds }, createdAt: { gte: windowStart() } },
      _count: { _all: true },
    }),
    tx.webhookDelivery.findMany({
      where: { subscriptionId: { in: subscriptionIds } },
      distinct: ['subscriptionId'],
      orderBy: [{ subscriptionId: 'asc' }, { createdAt: 'desc' }],
      select: { subscriptionId: true, status: true, createdAt: true },
    }),
  ]);

  for (const row of counts) {
    const entry = health.get(row.subscriptionId);
    if (!entry) continue;
    const n = row._count._all;
    if (row.status === 'delivered') entry.delivered += n;
    else if (row.status === 'failed') entry.failed += n;
    else entry.pending += n;
  }

  for (const row of latest) {
    const entry = health.get(row.subscriptionId);
    if (!entry) continue;
    entry.lastAttemptAt = row.createdAt.toISOString();
    entry.lastOutcome = outcomeOf(row.status);
  }

  return health;
}

/** One attempt, as the pane reads it. `responseBody` is capped here rather than
 *  at the field: an endpoint that answers with an HTML error page would
 *  otherwise put a whole document through the wire and into a table cell. */
function toApiDelivery(row: {
  id: string;
  eventType: string;
  status: string;
  attemptCount: number;
  responseStatus: number | null;
  responseBody: string | null;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    event_type: row.eventType,
    status: row.status,
    attempt_count: row.attemptCount,
    response_status: row.responseStatus,
    response_body: row.responseBody ? row.responseBody.slice(0, 500) : null,
    next_attempt_at: row.nextAttemptAt ? row.nextAttemptAt.toISOString() : null,
    delivered_at: row.deliveredAt ? row.deliveredAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
  };
}

const deliveryRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/webhooks/subscriptions/:id/deliveries', async (request) => {
    requireRole(request, 'viewer');
    const { id } = PathId.parse(request.params);
    const q = ListQuery.parse(request.query);

    const result = await withRequestTenant(request, async (tx) => {
      // Checked rather than assumed: without it a deleted or another tenant's
      // id would answer with an empty list, which reads as "nothing has been
      // sent" when the truth is "there is no such thing".
      const subscription = await tx.webhookSubscription.findFirst({ where: { id } });
      if (!subscription) throw notFound('Webhook subscription', id);

      const [rows, health] = await Promise.all([
        tx.webhookDelivery.findMany({
          where: { subscriptionId: id },
          orderBy: { createdAt: 'desc' },
          take: q.take ?? 20,
        }),
        webhookHealth(tx, [id]),
      ]);

      return { rows, health: health.get(id) ?? emptyHealth() };
    });

    return ok({
      items: result.rows.map(toApiDelivery),
      health: result.health,
    });
  });

  return Promise.resolve();
};

export default deliveryRoutes;
