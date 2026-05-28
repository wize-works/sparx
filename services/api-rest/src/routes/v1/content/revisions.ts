// Revision history.
//
//   GET  /v1/content/entries/:id/revisions                → list (metadata only)
//   GET  /v1/content/entries/:id/revisions/:n             → full body
//   POST /v1/content/entries/:id/revisions/:n/restore     → new revision from old
//
// Restore is non-destructive: it copies an old revision's body/seo back onto
// the entry and records a new revision summarising the restore, so the
// revision history reads chronologically.

import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@sparx/db';
import { z } from 'zod';

type Json = Prisma.InputJsonValue;
import { withRequestTenant } from '../../../lib/db.js';
import { ok } from '../../../lib/envelope.js';
import { requireRole } from '../../../plugins/auth.js';
import { notFound } from '../../../errors.js';
import { parseTypeSchema, resolveType } from '../../../lib/content-types.js';
import {
    recordRevision,
    serializeEntry,
    serializeRevisionFull,
    serializeRevisionMeta,
    syncReferences,
} from '../../../lib/entries.js';
import { writeAudit } from '../../../lib/audit.js';

const ListParams = z.object({ id: z.string().uuid() });
const OneParams = z.object({
    id: z.string().uuid(),
    n: z.coerce.number().int().positive(),
});

const revisionRoutes: FastifyPluginAsync = (app) => {
    app.get('/v1/content/entries/:id/revisions', async (request) => {
        requireRole(request, 'viewer');
        const { id } = ListParams.parse(request.params);
        const rows = await withRequestTenant(request, async (tx) => {
            const entry = await tx.contentEntry.findFirst({
                where: { id, deletedAt: null },
                select: { id: true },
            });
            if (!entry) throw notFound('Entry', id);
            return tx.contentRevision.findMany({
                where: { entryId: id },
                orderBy: { revisionNumber: 'desc' },
                take: 100,
            });
        });
        return ok(rows.map(serializeRevisionMeta));
    });

    app.get('/v1/content/entries/:id/revisions/:n', async (request) => {
        requireRole(request, 'viewer');
        const { id, n } = OneParams.parse(request.params);
        const row = await withRequestTenant(request, async (tx) => {
            const entry = await tx.contentEntry.findFirst({
                where: { id, deletedAt: null },
                select: { id: true },
            });
            if (!entry) throw notFound('Entry', id);
            return tx.contentRevision.findFirst({
                where: { entryId: id, revisionNumber: n },
            });
        });
        if (!row) throw notFound('Revision', `${id}#${n}`);
        return ok(serializeRevisionFull(row));
    });

    app.post('/v1/content/entries/:id/revisions/:n/restore', async (request) => {
        const auth = requireRole(request, 'editor');
        const { id, n } = OneParams.parse(request.params);

        const updated = await withRequestTenant(request, async (tx) => {
            const entry = await tx.contentEntry.findFirst({ where: { id, deletedAt: null } });
            if (!entry) throw notFound('Entry', id);

            const target = await tx.contentRevision.findFirst({
                where: { entryId: id, revisionNumber: n },
            });
            if (!target) throw notFound('Revision', `${id}#${n}`);

            const type = await resolveType(tx, entry.typeKey);
            const schema = parseTypeSchema(type);

            const body = (target.body ?? {}) as Record<string, unknown>;
            const seoJson = (target.seoJson ?? {}) as Record<string, unknown>;

            const after = await tx.contentEntry.update({
                where: { id },
                data: { body: body as Json, seoJson: seoJson as Json, updatedAt: new Date() },
            });
            await syncReferences(tx, auth.tenantId, after.id, schema, body);
            await recordRevision(tx, {
                tenantId: auth.tenantId,
                entryId: after.id,
                body,
                seoJson,
                status: after.status,
                kind: 'manual',
                authorId: auth.actorId,
                summary: `Restored from revision #${n}`,
            });
            await writeAudit(tx, request, auth, {
                action: 'content.entry.restored',
                entityType: 'content_entry',
                entityId: after.id,
                before: { revisionNumber: 'current' },
                after: { restoredFrom: n },
            });

            return after;
        });

        return ok(serializeEntry(updated));
    });
    return Promise.resolve();
};

export default revisionRoutes;
