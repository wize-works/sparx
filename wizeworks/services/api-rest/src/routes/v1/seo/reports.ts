// SEO — reporting reads (docs/50 §7, docs/97 §5).
//
//   GET /v1/seo/reports/checklist
//     → site-wide technical checklist: every distinct audit check, aggregated
//       across all stored page audits (how many pages pass / warn / fail), with
//       a derived per-check site status + pass rate
//   GET /v1/seo/reports/activity?limit=
//     → recent audit runs (newest computed first) — the SEO activity feed
//
// LIVE aggregates over `seo_audits` (the stored Scorecard snapshots). The
// checklist unnests each audit's `card->'checks'` JSON and rolls the per-page
// CheckResults up by check id — so "Structured data: 12/18 pages pass" is the
// real signal, not an invented sitemap/robots/CWV row. Search-Console organic
// metrics (clicks / impressions / position / top queries) are NOT here — those
// need GSC ingestion (workload B) and stay sample on the overview.
//
// Viewer-read, tenant-scoped via withRequestTenant (FORCE RLS on seo_audits).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withRequestTenant } from '@wizeworks/api-core/db';
import { ok } from '@wizeworks/api-core/envelope';
import { requireRole } from '@wizeworks/api-core/auth';
import { storedPath } from '../../../lib/seo-audit.js';
import { resolveListScope } from '../../../lib/property.js';
import { auditsOnSite } from './site-scope.js';

const ActivityQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

type ChecklistStatus = 'pass' | 'warn' | 'fail' | 'info';

interface RawCheckRow {
  id: string;
  label: string;
  category: string;
  total: number;
  pass: number;
  warn: number;
  fail: number;
  info: number;
}

// Attention-first ordering: failing checks, then warnings, then clean.
const STATUS_RANK: Record<ChecklistStatus, number> = { fail: 0, warn: 1, pass: 2, info: 3 };

function deriveStatus(scored: number, fail: number, warn: number): ChecklistStatus {
  if (fail > 0) return 'fail';
  if (warn > 0) return 'warn';
  if (scored > 0) return 'pass';
  return 'info';
}

const seoReportRoutes: FastifyPluginAsync = (app) => {
  // ── Technical checklist: per-check site-wide pass/warn/fail roll-up ──
  app.get('/v1/seo/reports/checklist', async (request) => {
    const auth = requireRole(request, 'viewer');
    const propertyId = await resolveListScope(
      auth,
      undefined,
      request.headers['x-sparx-property-id']
    );
    // Written as a parameter rather than interpolated: this is raw SQL, and the
    // null case (an unscoped caller) has to mean "every row" rather than "no rows".
    const scope = propertyId ?? null;

    return withRequestTenant(request, async (tx) => {
      const [rows, pagesScored] = await Promise.all([
        tx.$queryRaw<RawCheckRow[]>`
          SELECT
            chk->>'id'       AS id,
            chk->>'label'    AS label,
            chk->>'category' AS category,
            COUNT(*)::int                                        AS total,
            COUNT(*) FILTER (WHERE chk->>'status' = 'pass')::int AS pass,
            COUNT(*) FILTER (WHERE chk->>'status' = 'warn')::int AS warn,
            COUNT(*) FILTER (WHERE chk->>'status' = 'fail')::int AS fail,
            COUNT(*) FILTER (WHERE chk->>'status' = 'info')::int AS info
          FROM seo_audits a
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(a.card -> 'checks') = 'array'
                 THEN a.card -> 'checks' ELSE '[]'::jsonb END
          ) AS chk
          WHERE ${scope}::uuid IS NULL
             OR a.property_id = ${scope}::uuid
             OR a.property_id IS NULL
          GROUP BY 1, 2, 3
        `,
        tx.seoAudit.count({ where: auditsOnSite(propertyId) }),
      ]);

      const checks = rows
        .map((r) => {
          const pass = Number(r.pass);
          const warn = Number(r.warn);
          const fail = Number(r.fail);
          const info = Number(r.info);
          const scored = Number(r.total) - info;
          const status = deriveStatus(scored, fail, warn);
          return {
            id: r.id,
            label: r.label,
            category: r.category,
            status,
            pagesPass: pass,
            pagesWarn: warn,
            pagesFail: fail,
            pagesScored: scored,
            passRate: scored > 0 ? +(pass / scored).toFixed(4) : null,
          };
        })
        .sort((a, b) => {
          const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
          if (byStatus !== 0) return byStatus;
          return (a.passRate ?? 1) - (b.passRate ?? 1);
        });

      const summary = {
        pagesScored,
        checks: checks.length,
        passing: checks.filter((c) => c.status === 'pass').length,
        warning: checks.filter((c) => c.status === 'warn').length,
        failing: checks.filter((c) => c.status === 'fail').length,
      };

      return ok({ summary, checks });
    });
  });

  // ── Activity feed: recent audit runs (newest computed first) ──
  app.get('/v1/seo/reports/activity', async (request) => {
    const auth = requireRole(request, 'viewer');
    const take = ActivityQuery.parse(request.query).limit ?? 12;
    const propertyId = await resolveListScope(
      auth,
      undefined,
      request.headers['x-sparx-property-id']
    );

    return withRequestTenant(request, async (tx) => {
      const audits = await tx.seoAudit.findMany({
        where: auditsOnSite(propertyId),
        orderBy: { computedAt: 'desc' },
        take,
        select: {
          id: true,
          entityType: true,
          entityId: true,
          title: true,
          path: true,
          score: true,
          grade: true,
          fixFirst: true,
          computedAt: true,
        },
      });

      return ok(
        audits.map((a) => ({
          id: a.id,
          entityType: a.entityType,
          entityId: a.entityId,
          title: a.title,
          path: storedPath(a.path),
          score: a.score,
          grade: a.grade,
          fixFirst: a.fixFirst,
          computedAt: a.computedAt.toISOString(),
        }))
      );
    });
  });

  return Promise.resolve();
};

export default seoReportRoutes;
