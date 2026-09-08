// Webhook subscriptions.
//
//   GET    /v1/webhooks/subscriptions
//   POST   /v1/webhooks/subscriptions          { name, url, events[] } → returns signingSecret ONCE
//   PATCH  /v1/webhooks/subscriptions/:id      { name?, url?, events?, active? }
//   DELETE /v1/webhooks/subscriptions/:id
//
// The signing secret is generated server-side and returned exactly once in
// the POST response (Stripe-style). Subsequent reads return a redacted
// preview only. The delivery worker (Phase 4) reads the full secret from
// the DB to sign each `X-sparx-Signature` header.

import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withRequestTenant } from '@wizeworks/api-core/db';
import { ok } from '@wizeworks/api-core/envelope';
import { requireRole } from '@wizeworks/api-core/auth';
import { notFound } from '@wizeworks/api-core/errors';
import { writeAudit } from '@wizeworks/api-core/audit';
import {
  decryptWebhookSecret,
  storeWebhookSecret,
} from '@wizeworks/api-core/webhook-secret-crypto';

import { webhookHealth } from './deliveries.js';

// The events a tenant may subscribe to.
//
// This is an ALLOW-LIST, not the event registry: `publish()` fans every
// EventType to matching subscriptions, so anything named here is deliverable
// the moment it is listed, and plenty of internal events (`email.send`) must
// never be. Adding a key here is therefore the whole of "expose this event".
//
// Two rules govern what may be added:
//
//   1. It must actually be EMITTED. An event that exists only in the type union
//      is a subscription that stays silent forever, which reads to the person
//      who set it up as their endpoint being broken. `inventory.levels.updated`
//      is declared in @wizeworks/events and published by nothing — it is the most
//      tempting key on the list and is deliberately absent until something
//      emits it.
//   2. The workbench's human catalogue must carry it too, or it is subscribable
//      only by someone hand-writing JSON. `scripts/check-webhook-events.mjs`
//      fails the build when the two drift.
const EVENT_KEYS = [
  'content.entry.created',
  'content.entry.updated',
  'content.entry.published',
  'content.entry.scheduled',
  'content.entry.unpublished',
  'content.entry.deleted',
  'media.uploaded',
  'media.processed',
  'form.submitted',
  'redirect.added',
  'redirect.changed',
  'redirect.removed',
  // ── Selling (persona issue 407) ──────────────────────────────────────────
  // The four above and these three were absent for one reason: the check holds
  // this list against a picker in EVERY brand console, and adding a key needs
  // both edited together. `order.placed` is still absent, and stays absent —
  // it is declared in the registry and published by nothing, which is rule 1.
  'order.paid',
  'payment.captured',
  'payment.failed',
  // ── Inventory (docs/146 Phase 12.3) ──────────────────────────────────────
  // Stock itself.
  'inventory.adjusted',
  'inventory.low',
  'inventory.depleted',
  'inventory.count.completed',
  'inventory.reconciliation.drift',
  'inventory.oversell.blocked',
  'inventory.classification.changed',
  'inventory.lot.expiring',
  // Work on the warehouse floor.
  'inventory.bin.moved',
  'inventory.pick_list.created',
  'inventory.pick_list.completed',
  'inventory.pick.short',
  'inventory.package.packed',
  'inventory.transfer.shipped',
  'inventory.transfer.received',
  'inventory.assembly.completed',
  // Supply and what has been promised.
  'inventory.purchase_order.late',
  'inventory.backorder.created',
  'inventory.backorder.allocated',
  // Feeds from other systems.
  'inventory.source.created',
  'inventory.source.sync_started',
  'inventory.source.sync_completed',
  'inventory.source.error',
  'inventory.source.stale',
  'inventory.source.recovered',
] as const;

const CreateBody = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url().max(2048),
  events: z.array(z.enum(EVENT_KEYS)).min(1),
  active: z.boolean().optional(),
});

const UpdateBody = CreateBody.partial();
const PathId = z.object({ id: z.string().uuid() });

function redact(stored: string): string {
  // Decrypt first — the column holds an `enc:` bundle at rest — then show the
  // first 8 chars of the plaintext `whsec_…` so the dashboard can identify
  // which subscription a secret belongs to, no more. Tolerant of legacy
  // plaintext rows (decrypt returns them as-is).
  return `${decryptWebhookSecret(stored).slice(0, 8)}…`;
}

const webhookRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/webhooks/subscriptions', async (request) => {
    requireRole(request, 'viewer');
    // `health` rides along rather than needing a second call, because the LIST
    // is where the lie was loudest: a column reading "Active" beside an address
    // that has rejected every message for a week. `active` is a setting the
    // tenant chose; this is what came back. See ./deliveries.ts.
    const rows = await withRequestTenant(request, async (tx) => {
      const subscriptions = await tx.webhookSubscription.findMany({
        orderBy: { createdAt: 'desc' },
      });
      const health = await webhookHealth(
        tx,
        subscriptions.map((s) => s.id)
      );
      return subscriptions.map((r) => ({ row: r, health: health.get(r.id) }));
    });
    return ok(
      rows.map(({ row, health }) => ({
        ...row,
        signingSecret: redact(row.signingSecret),
        health,
      }))
    );
  });

  app.post('/v1/webhooks/subscriptions', async (request, reply) => {
    const auth = requireRole(request, 'admin');
    const input = CreateBody.parse(request.body);

    const secret = `whsec_${randomBytes(32).toString('hex')}`;
    const created = await withRequestTenant(request, async (tx) => {
      const row = await tx.webhookSubscription.create({
        data: {
          tenantId: auth.tenantId,
          name: input.name,
          url: input.url,
          events: input.events,
          active: input.active ?? true,
          // Encrypted at rest (enc: bundle) when a key is configured.
          signingSecret: storeWebhookSecret(secret),
        },
      });
      await writeAudit(tx, request, auth, {
        action: 'webhook.subscription.created',
        entityType: 'webhook_subscription',
        entityId: row.id,
        after: { name: row.name, url: row.url, events: row.events },
      });
      return row;
    });

    reply.code(201);
    return ok({
      ...created,
      // First and only time the full secret is returned — the plaintext we just
      // generated, never the stored ciphertext.
      signingSecret: secret,
    });
  });

  app.patch('/v1/webhooks/subscriptions/:id', async (request) => {
    const auth = requireRole(request, 'admin');
    const { id } = PathId.parse(request.params);
    const input = UpdateBody.parse(request.body);

    const updated = await withRequestTenant(request, async (tx) => {
      const existing = await tx.webhookSubscription.findFirst({ where: { id } });
      if (!existing) throw notFound('Webhook subscription', id);
      const after = await tx.webhookSubscription.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.url !== undefined ? { url: input.url } : {}),
          ...(input.events !== undefined ? { events: input.events } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      await writeAudit(tx, request, auth, {
        action: 'webhook.subscription.updated',
        entityType: 'webhook_subscription',
        entityId: id,
        before: { events: existing.events, active: existing.active },
        after: { events: after.events, active: after.active },
      });
      return after;
    });

    return ok({
      ...updated,
      signingSecret: redact(updated.signingSecret),
    });
  });

  app.delete('/v1/webhooks/subscriptions/:id', async (request, reply) => {
    const auth = requireRole(request, 'admin');
    const { id } = PathId.parse(request.params);
    await withRequestTenant(request, async (tx) => {
      const existing = await tx.webhookSubscription.findFirst({ where: { id } });
      if (!existing) throw notFound('Webhook subscription', id);
      await tx.webhookSubscription.delete({ where: { id } });
      await writeAudit(tx, request, auth, {
        action: 'webhook.subscription.deleted',
        entityType: 'webhook_subscription',
        entityId: id,
        before: { name: existing.name },
      });
    });
    reply.code(204);
  });
  return Promise.resolve();
};

export default webhookRoutes;
