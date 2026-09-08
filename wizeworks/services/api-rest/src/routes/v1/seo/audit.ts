// SEO audit — live scorecard, stored snapshots, and reindex (docs/50 §7).
//
//   GET  /v1/seo/audit?type=<entity>&id=<uuid>   live audit (computes + stores)
//   GET  /v1/seo/audits[?type=<entity>]          list stored snapshots (overview)
//   POST /v1/seo/audits/reindex                  recompute + store every entity
//
// All authed (dashboard). The live audit recomputes fresh so the editor never
// shows a stale number AND upserts the snapshot; the overview reads snapshots so
// it can rank the whole site without firing N live audits. The mapping from DB
// rows to the engine's input lives in `lib/seo-audit.ts`.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withRequestTenant } from '@wizeworks/api-core/db';
import { ok } from '@wizeworks/api-core/envelope';
import { requireRole } from '@wizeworks/api-core/auth';
import { notFound } from '@wizeworks/api-core/errors';
import type { EntityType } from '@wizeworks/seo-audit';

import { auditAndStore, storedPath } from '../../../lib/seo-audit.js';
import { resolveListScope } from '../../../lib/property.js';
import { auditsOnSite } from './site-scope.js';

const ENTITY_TYPES = ['builder_page', 'cms_page', 'product', 'collection'] as const;

const AuditQuery = z.object({
  type: z.enum(ENTITY_TYPES),
  id: z.string().uuid(),
});

const ListQuery = z.object({
  type: z.enum(ENTITY_TYPES).optional(),
});

// Per-type cap on a single reindex pass — a guard against an unbounded scan, not
// a real limit at Phase-1 catalog sizes. A larger site moves this to a job.
const REINDEX_LIMIT = 500;

const seoAuditRoutes: FastifyPluginAsync = (app) => {
  // ── Live audit (compute + store) ──────────────────────────────────────────
  app.get('/v1/seo/audit', async (request) => {
    const auth = requireRole(request, 'viewer');
    const { type, id } = AuditQuery.parse(request.query);
    const card = await withRequestTenant(request, (tx) =>
      auditAndStore(tx, auth.tenantId, type, id)
    );
    if (!card) throw notFound('Entity', id);
    return ok(card);
  });

  // ── Stored snapshots for the overview ─────────────────────────────────────
  app.get('/v1/seo/audits', async (request) => {
    const auth = requireRole(request, 'viewer');
    const { type } = ListQuery.parse(request.query);
    // The overview's four tiles are computed from THIS list, so an unscoped read
    // put another site's pages into her score (issue 391).
    const propertyId = await resolveListScope(
      auth,
      undefined,
      request.headers['x-sparx-property-id']
    );
    const rows = await withRequestTenant(request, (tx) =>
      tx.seoAudit.findMany({
        where: { ...auditsOnSite(propertyId), ...(type ? { entityType: type } : {}) },
        select: {
          id: true,
          entityType: true,
          entityId: true,
          score: true,
          grade: true,
          fixFirst: true,
          title: true,
          path: true,
          computedAt: true,
        },
        // Worst-scoring first — the overview's whole point is "what needs work".
        orderBy: [{ score: 'asc' }, { computedAt: 'desc' }],
      })
    );
    return ok(rows.map((row) => ({ ...row, path: storedPath(row.path) })));
  });

  // ── Reindex the whole site ────────────────────────────────────────────────
  app.post('/v1/seo/audits/reindex', async (request) => {
    const auth = requireRole(request, 'editor');
    const result = await withRequestTenant(request, async (tx) => {
      const [builderPages, entries, products, collections] = await Promise.all([
        tx.builderPage.findMany({
          where: { kind: 'singleton' },
          select: { id: true },
          take: REINDEX_LIMIT,
        }),
        tx.contentEntry.findMany({
          where: { deletedAt: null },
          select: { id: true },
          take: REINDEX_LIMIT,
        }),
        tx.product.findMany({
          where: { deletedAt: null },
          select: { id: true },
          take: REINDEX_LIMIT,
        }),
        tx.productCollection.findMany({
          where: { deletedAt: null },
          select: { id: true },
          take: REINDEX_LIMIT,
        }),
      ]);

      const work: [EntityType, string][] = [
        ...builderPages.map((r): [EntityType, string] => ['builder_page', r.id]),
        ...entries.map((r): [EntityType, string] => ['cms_page', r.id]),
        ...products.map((r): [EntityType, string] => ['product', r.id]),
        ...collections.map((r): [EntityType, string] => ['collection', r.id]),
      ];

      let reindexed = 0;
      for (const [type, id] of work) {
        if (await auditAndStore(tx, auth.tenantId, type, id)) reindexed += 1;
      }
      const truncated =
        builderPages.length === REINDEX_LIMIT ||
        entries.length === REINDEX_LIMIT ||
        products.length === REINDEX_LIMIT ||
        collections.length === REINDEX_LIMIT;
      return { reindexed, truncated };
    });
    return ok(result);
  });

  return Promise.resolve();
};

export default seoAuditRoutes;
