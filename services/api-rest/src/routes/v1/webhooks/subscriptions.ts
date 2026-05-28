// Webhook subscriptions.
//
//   GET    /v1/webhooks/subscriptions
//   POST   /v1/webhooks/subscriptions          { name, url, events[] } → returns signing_secret ONCE
//   PATCH  /v1/webhooks/subscriptions/:id      { name?, url?, events?, active? }
//   DELETE /v1/webhooks/subscriptions/:id
//
// The signing secret is generated server-side and returned exactly once in
// the POST response (Stripe-style). Subsequent reads return a redacted
// preview only. The delivery worker (Phase 4) reads the full secret from
// the DB to sign each `X-Sparx-Signature` header.

import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withRequestTenant } from '@sparx/api-core/db';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { notFound } from '@sparx/api-core/errors';
import { writeAudit } from '@sparx/api-core/audit';

const EVENT_KEYS = [
  'content.entry.created',
  'content.entry.updated',
  'content.entry.published',
  'content.entry.scheduled',
  'content.entry.unpublished',
  'content.entry.deleted',
  'media.uploaded',
  'media.processed',
  'redirect.added',
  'redirect.removed',
] as const;

const CreateBody = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url().max(2048),
  events: z.array(z.enum(EVENT_KEYS)).min(1),
  active: z.boolean().optional(),
});

const UpdateBody = CreateBody.partial();
const PathId = z.object({ id: z.string().uuid() });

function redact(secret: string): string {
  // Show first 8 chars + ellipsis. Sufficient for the dashboard to identify
  // which subscription a leaked secret belongs to, no more.
  return `${secret.slice(0, 8)}…`;
}

const webhookRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/webhooks/subscriptions', async (request) => {
    requireRole(request, 'viewer');
    const rows = await withRequestTenant(request, (tx) =>
      tx.webhookSubscription.findMany({ orderBy: { createdAt: 'desc' } })
    );
    return ok(
      rows.map((r) => ({
        ...r,
        signingSecret: redact(r.signingSecret),
      }))
    );
  });

  app.post('/v1/webhooks/subscriptions', async (request, reply) => {
    const auth = requireRole(request, 'admin');
    const input = CreateBody.parse(request.body);

    const created = await withRequestTenant(request, async (tx) => {
      const secret = `whsec_${randomBytes(32).toString('hex')}`;
      const row = await tx.webhookSubscription.create({
        data: {
          tenantId: auth.tenantId,
          name: input.name,
          url: input.url,
          events: input.events,
          active: input.active ?? true,
          signingSecret: secret,
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
      // First and only time the full secret is returned.
      signingSecret: created.signingSecret,
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
