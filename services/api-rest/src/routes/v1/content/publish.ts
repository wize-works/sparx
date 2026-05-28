// Publish / unpublish flows.
//
//   POST /v1/content/entries/:id/publish      { scheduledAt? }
//   POST /v1/content/entries/:id/unpublish
//
// Both flips record a manual revision with a summary so the publish history
// is visible in the dashboard's revision drawer. Emits the appropriate
// Pub/Sub event so the webhook-delivery worker can fan out to subscribers.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withRequestTenant } from '../../../lib/db.js';
import { ok } from '../../../lib/envelope.js';
import { requireRole } from '../../../plugins/auth.js';
import { conflict, notFound } from '../../../errors.js';
import { recordRevision, serializeEntry } from '../../../lib/entries.js';
import { writeAudit } from '../../../lib/audit.js';
import { publish } from '../../../lib/pubsub.js';

const PathId = z.object({ id: z.string().uuid() });
const PublishBody = z.object({
    scheduled_at: z.string().datetime({ offset: true }).optional(),
});

const publishRoutes: FastifyPluginAsync = (app) => {
    // ──────────────────────────────────────────────────────────────────────
    // PUBLISH
    // ──────────────────────────────────────────────────────────────────────

    app.post('/v1/content/entries/:id/publish', async (request) => {
        const auth = requireRole(request, 'editor');
        const { id } = PathId.parse(request.params);
        const input = PublishBody.parse(request.body ?? {});

        const updated = await withRequestTenant(request, async (tx) => {
            const existing = await tx.contentEntry.findFirst({ where: { id, deletedAt: null } });
            if (!existing) throw notFound('Entry', id);
            if (existing.status === 'published' && !input.scheduled_at) {
                throw conflict('Entry is already published.');
            }

            const scheduled = input.scheduled_at ? new Date(input.scheduled_at) : null;
            const nextStatus = scheduled && scheduled > new Date() ? 'scheduled' : 'published';

            const after = await tx.contentEntry.update({
                where: { id },
                data: {
                    status: nextStatus,
                    scheduledAt: nextStatus === 'scheduled' ? scheduled : null,
                    publishedAt:
                        nextStatus === 'published'
                            ? new Date()
                            : existing.publishedAt /* keep prior publish time when scheduling */,
                    archivedAt: null,
                },
            });

            await recordRevision(tx, {
                tenantId: auth.tenantId,
                entryId: after.id,
                body: (after.body ?? {}) as Record<string, unknown>,
                seoJson: (after.seoJson ?? {}) as Record<string, unknown>,
                status: after.status,
                kind: 'manual',
                authorId: auth.actorId,
                summary:
                    nextStatus === 'scheduled'
                        ? `Scheduled for ${scheduled?.toISOString() ?? ''}`
                        : 'Published',
            });
            await writeAudit(tx, request, auth, {
                action: nextStatus === 'scheduled' ? 'content.entry.scheduled' : 'content.entry.published',
                entityType: 'content_entry',
                entityId: after.id,
                before: { status: existing.status },
                after: {
                    status: after.status,
                    publishedAt: after.publishedAt,
                    scheduledAt: after.scheduledAt,
                },
            });

            return after;
        });

        await publish(
            request.log,
            updated.status === 'scheduled' ? 'content.entry.scheduled' : 'content.entry.published',
            auth.tenantId,
            auth.actorId,
            {
                entryId: updated.id,
                typeKey: updated.typeKey,
                slug: updated.slug,
                scheduledAt: updated.scheduledAt?.toISOString() ?? null,
            }
        );

        return ok(serializeEntry(updated));
    });

    // ──────────────────────────────────────────────────────────────────────
    // UNPUBLISH (back to draft)
    // ──────────────────────────────────────────────────────────────────────

    app.post('/v1/content/entries/:id/unpublish', async (request) => {
        const auth = requireRole(request, 'editor');
        const { id } = PathId.parse(request.params);

        const updated = await withRequestTenant(request, async (tx) => {
            const existing = await tx.contentEntry.findFirst({ where: { id, deletedAt: null } });
            if (!existing) throw notFound('Entry', id);
            if (existing.status === 'draft') return existing;

            const after = await tx.contentEntry.update({
                where: { id },
                data: { status: 'draft', scheduledAt: null },
            });
            await recordRevision(tx, {
                tenantId: auth.tenantId,
                entryId: after.id,
                body: (after.body ?? {}) as Record<string, unknown>,
                seoJson: (after.seoJson ?? {}) as Record<string, unknown>,
                status: 'draft',
                kind: 'manual',
                authorId: auth.actorId,
                summary: 'Unpublished',
            });
            await writeAudit(tx, request, auth, {
                action: 'content.entry.unpublished',
                entityType: 'content_entry',
                entityId: after.id,
                before: { status: existing.status },
                after: { status: 'draft' },
            });
            return after;
        });

        await publish(request.log, 'content.entry.unpublished', auth.tenantId, auth.actorId, {
            entryId: updated.id,
            typeKey: updated.typeKey,
        });

        return ok(serializeEntry(updated));
    });
    return Promise.resolve();
};

export default publishRoutes;
