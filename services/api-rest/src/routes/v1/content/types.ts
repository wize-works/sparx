// GET /v1/content/types          — list every content type the tenant can use
// GET /v1/content/types/:key     — fetch one
//
// Custom-type CRUD (POST/PATCH/DELETE) is Pro+ gated and lives in a later
// milestone; for now this is read-only and covers the 90% case of the
// dashboard "what types exist?" lookup.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ok } from '../../../lib/envelope.js';
import { withRequestTenant } from '../../../lib/db.js';
import { requireAuth } from '../../../plugins/auth.js';
import { notFound } from '../../../errors.js';

const ParamsSchema = z.object({ key: z.string().min(1).max(63) });

const contentTypeRoutes: FastifyPluginAsync = (app) => {
    app.get('/v1/content/types', async (request) => {
        requireAuth(request);
        const rows = await withRequestTenant(request, (tx) =>
            tx.contentType.findMany({
                // The RLS policy on content_types makes platform-built-ins visible
                // alongside any tenant-owned customisations. Order so customisations
                // (is_built_in = false) sort first within the same key for the
                // dashboard "which one is active?" hint.
                orderBy: [{ isBuiltIn: 'asc' }, { key: 'asc' }],
            })
        );
        return ok(rows);
    });

    app.get('/v1/content/types/:key', async (request) => {
        requireAuth(request);
        const { key } = ParamsSchema.parse(request.params);
        const row = await withRequestTenant(request, (tx) =>
            tx.contentType.findFirst({
                where: { key },
                orderBy: [{ isBuiltIn: 'asc' }, { updatedAt: 'desc' }],
            })
        );
        if (!row) throw notFound('Content type', key);
        return ok(row);
    });
    return Promise.resolve();
};

export default contentTypeRoutes;
