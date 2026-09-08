// CMS content reporting reads (docs/97 §5, docs/12).
//
//   GET /v1/content/reports/summary
//     → entry counts by status + by content type, published-last-30d,
//       scheduled-upcoming
//   GET /v1/content/reports/cadence?from=&to=&grain=day|week|month
//     → publishing cadence: entries published per bucket over the window
//   GET /v1/content/reports/recent?limit=
//     → recent editorial activity, recently-published, and upcoming-scheduled
//       lists (the three small feeds the CMS overview renders)
//
// These are LIVE aggregates over `content_entries` (no rollup table): content
// volume is low and every query rides an existing index — `[tenantId, status,
// publishedAt]` for cadence/published, `[tenantId, updatedAt]` for activity,
// `[tenantId, scheduledAt]` for upcoming. The cadence series follows the same
// daily-bucket/zero-fill/grain-fold shape as the rollup timeseries (docs/97) so
// the chart kit consumes it identically; it graduates to a rollup if a tenant's
// publish volume ever justifies one. Page-view / read-time / top-by-views
// metrics are NOT here — those need analytics event capture (workload B,
// docs/97 §4) and stay sample on the overview until that ships.
//
// Viewer-read, tenant-scoped via withRequestTenant (FORCE RLS).

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@wizeworks/db';
import { contentSiteVisibilityWhere } from '@wizeworks/db';
import { withRequestTenant } from '@wizeworks/api-core/db';
import { ok } from '@wizeworks/api-core/envelope';
import { requireRole } from '@wizeworks/api-core/auth';
import { resolveListScope } from '../../../lib/property.js';

const CONTENT_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;

/** Entries a person standing on ONE site should be counted as having.
 *
 *  The platform's own rule, from `contentSiteVisibilityWhere`: an entry linked to
 *  no site belongs to every site, one linked to sites belongs only to those. The
 *  summary counted the whole business, so a clothing maker standing in her shop
 *  read "Blog post · 21 entries" while the Content list two clicks away showed
 *  the 3 that are actually there — 18 of them written for her other six websites
 *  (issue 389). */
function entriesOnSite(propertyId: string | undefined): Prisma.ContentEntryWhereInput {
  return propertyId ? contentSiteVisibilityWhere(propertyId) : {};
}

const CadenceQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  grain: z.enum(['day', 'week', 'month']).optional(),
});

const RecentQuery = z.object({
  limit: z.coerce.number().int().min(1).max(24).optional(),
});

// ── UTC-day helpers (live-aggregate twin of the rollup timeseries) ──
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addUtcDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function eachUtcDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const end = startOfUtcDay(to).getTime();
  for (let d = startOfUtcDay(from); d.getTime() <= end; d = addUtcDays(d, 1)) out.push(d);
  return out;
}
function bucketStartFor(dateKey: string, grain: 'week' | 'month'): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  if (grain === 'month') {
    return utcDateKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
  }
  const deltaToMonday = (d.getUTCDay() + 6) % 7;
  return utcDateKey(addUtcDays(startOfUtcDay(d), -deltaToMonday));
}

/** Pull a human title from an entry's JSON body, falling back to slug. */
function entryTitle(body: unknown, slug: string | null): string {
  if (body && typeof body === 'object' && 'title' in body) {
    const t = (body as { title?: unknown }).title;
    if (typeof t === 'string' && t.trim().length > 0) return t;
  }
  return slug && slug.length > 0 ? slug : '(untitled)';
}

interface RawCadenceRow {
  bucket: Date;
  published_count: number;
}

const reportRoutes: FastifyPluginAsync = (app) => {
  // ── Summary: counts by status + by type, published-30d, scheduled-upcoming ──
  app.get('/v1/content/reports/summary', async (request) => {
    const auth = requireRole(request, 'viewer');
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const propertyId = await resolveListScope(
      auth,
      undefined,
      request.headers['x-sparx-property-id']
    );
    const here = entriesOnSite(propertyId);

    return withRequestTenant(request, async (tx) => {
      const [
        total,
        byStatusRows,
        totalByType,
        publishedByType,
        allSitesByType,
        types,
        published30d,
        upcoming,
      ] = await Promise.all([
        tx.contentEntry.count({ where: { deletedAt: null, ...here } }),
        tx.contentEntry.groupBy({
          by: ['status'],
          where: { deletedAt: null, ...here },
          _count: { _all: true },
        }),
        tx.contentEntry.groupBy({
          by: ['typeKey'],
          where: { deletedAt: null, ...here },
          _count: { _all: true },
        }),
        tx.contentEntry.groupBy({
          by: ['typeKey'],
          where: { deletedAt: null, status: 'published', ...here },
          _count: { _all: true },
        }),
        // UNSCOPED, and deliberately. Two screens ask two different questions of
        // one relation: the list asks "how much of this is on the site I am in",
        // and the delete asks "how much does this type hold anywhere" — because
        // `deleteContentTypeTx` refuses tenant-wide, so a type with nothing on
        // THIS site can still be undeletable. Serving only the scoped number
        // would have put "0 entries use this type" above a Delete button the
        // server then refuses, with nothing on screen explaining why. Same trap
        // as issue 385, pointing the other way.
        tx.contentEntry.groupBy({
          by: ['typeKey'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        tx.contentType.findMany({ select: { key: true, name: true, pluralName: true } }),
        tx.contentEntry.count({
          where: {
            deletedAt: null,
            status: 'published',
            publishedAt: { gte: thirtyDaysAgo },
            ...here,
          },
        }),
        tx.contentEntry.count({
          where: { deletedAt: null, status: 'scheduled', scheduledAt: { gte: now }, ...here },
        }),
      ]);

      const byStatus = Object.fromEntries(CONTENT_STATUSES.map((s) => [s, 0])) as Record<
        (typeof CONTENT_STATUSES)[number],
        number
      >;
      for (const r of byStatusRows) {
        if ((CONTENT_STATUSES as readonly string[]).includes(r.status)) {
          byStatus[r.status as (typeof CONTENT_STATUSES)[number]] = r._count._all;
        }
      }

      const nameByKey = new Map(types.map((t) => [t.key, t.pluralName || t.name]));
      const publishedByKey = new Map(publishedByType.map((r) => [r.typeKey, r._count._all]));
      const allSitesByKey = new Map(allSitesByType.map((r) => [r.typeKey, r._count._all]));
      // Keyed off the UNSCOPED groups, so a type whose entries all live on the
      // business's other sites still gets a row. Dropping it would hide the one
      // fact that explains why its Delete is refused.
      const byType = [...allSitesByKey.keys()]
        .map((typeKey) => ({
          typeKey,
          name: nameByKey.get(typeKey) ?? typeKey,
          /** On the site being worked in — what the "entries" column means. */
          count: totalByType.find((r) => r.typeKey === typeKey)?._count._all ?? 0,
          publishedCount: publishedByKey.get(typeKey) ?? 0,
          /** Across every site — what a delete has to reckon with. */
          allSitesCount: allSitesByKey.get(typeKey) ?? 0,
        }))
        .sort((a, b) => b.count - a.count || b.allSitesCount - a.allSitesCount);

      return ok({
        total,
        byStatus,
        byType,
        publishedLast30d: published30d,
        scheduledUpcoming: upcoming,
      });
    });
  });

  // ── Cadence: entries published per bucket over the window (live aggregate) ──
  app.get('/v1/content/reports/cadence', async (request) => {
    requireRole(request, 'viewer');
    const q = CadenceQuery.parse(request.query);
    const grain = q.grain ?? 'day';
    const to = startOfUtcDay(q.to ? new Date(q.to) : new Date());
    const from = startOfUtcDay(q.from ? new Date(q.from) : addUtcDays(to, -29));
    const toExclusive = addUtcDays(to, 1);

    return withRequestTenant(request, async (tx) => {
      const rows = await tx.$queryRaw<RawCadenceRow[]>`
        SELECT
          (published_at AT TIME ZONE 'UTC')::date AS bucket,
          COUNT(*)::int                           AS published_count
        FROM content_entries
        WHERE deleted_at IS NULL
          AND status = 'published'
          AND published_at IS NOT NULL
          AND published_at >= ${from}
          AND published_at < ${toExclusive}
        GROUP BY 1
        ORDER BY 1
      `;

      const byKey = new Map<string, number>();
      for (const r of rows) {
        byKey.set(utcDateKey(startOfUtcDay(new Date(r.bucket))), Number(r.published_count ?? 0));
      }

      const daily = eachUtcDay(from, to).map((d) => ({
        bucket: utcDateKey(d),
        publishedCount: byKey.get(utcDateKey(d)) ?? 0,
      }));

      let points = daily;
      if (grain !== 'day') {
        const map = new Map<string, { bucket: string; publishedCount: number }>();
        for (const p of daily) {
          const key = bucketStartFor(p.bucket, grain);
          const cur = map.get(key);
          if (cur) cur.publishedCount += p.publishedCount;
          else map.set(key, { bucket: key, publishedCount: p.publishedCount });
        }
        points = [...map.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
      }

      return ok({
        range: { from: utcDateKey(from), to: utcDateKey(to), grain },
        points,
        totals: { publishedCount: daily.reduce((s, p) => s + p.publishedCount, 0) },
      });
    });
  });

  // ── Recent: editorial activity + recently-published + upcoming-scheduled ──
  app.get('/v1/content/reports/recent', async (request) => {
    requireRole(request, 'viewer');
    const q = RecentQuery.parse(request.query);
    const take = q.limit ?? 6;
    const now = new Date();

    return withRequestTenant(request, async (tx) => {
      const select = {
        id: true,
        slug: true,
        typeKey: true,
        status: true,
        body: true,
        publishedAt: true,
        scheduledAt: true,
        updatedAt: true,
        author: { select: { displayName: true } },
      } as const;

      const [activity, published, upcoming, types] = await Promise.all([
        tx.contentEntry.findMany({
          where: { deletedAt: null },
          orderBy: { updatedAt: 'desc' },
          take,
          select,
        }),
        tx.contentEntry.findMany({
          where: { deletedAt: null, status: 'published', publishedAt: { not: null } },
          orderBy: { publishedAt: 'desc' },
          take,
          select,
        }),
        tx.contentEntry.findMany({
          where: { deletedAt: null, status: 'scheduled', scheduledAt: { gte: now } },
          orderBy: { scheduledAt: 'asc' },
          take,
          select,
        }),
        tx.contentType.findMany({ select: { key: true, name: true } }),
      ]);

      const nameByKey = new Map(types.map((t) => [t.key, t.name]));
      const serialize = (e: (typeof activity)[number]) => ({
        id: e.id,
        title: entryTitle(e.body, e.slug),
        typeKey: e.typeKey,
        typeName: nameByKey.get(e.typeKey) ?? e.typeKey,
        slug: e.slug,
        status: e.status,
        author: e.author?.displayName ?? null,
        publishedAt: e.publishedAt?.toISOString() ?? null,
        scheduledAt: e.scheduledAt?.toISOString() ?? null,
        updatedAt: e.updatedAt.toISOString(),
      });

      return ok({
        activity: activity.map(serialize),
        published: published.map(serialize),
        upcoming: upcoming.map(serialize),
      });
    });
  });

  return Promise.resolve();
};

export default reportRoutes;
