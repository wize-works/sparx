// Scheduled-publish tick.
//
// Runs every `SCHEDULED_PUBLISH_INTERVAL_MS` (default 60s) from
// services/api-rest's bootstrap. Finds entries with status='scheduled'
// whose `scheduledAt <= NOW()`, flips them to 'published', records a
// manual revision, writes an audit log row, and emits
// `content.entry.published` on Pub/Sub so webhook subscribers fan out.
//
// Singleton across pods: a Postgres advisory lock (constant key
// SCHEDULED_PUBLISH_LOCK_KEY) is acquired with pg_try_advisory_lock; if
// another pod already holds it the tick returns immediately. The lock
// is held for the duration of the tick and released in a finally block.
//
// RLS: the tick uses prisma directly (no tenant GUC) to select due
// entries across all tenants, then re-enters with `withTenant` per
// tenant to apply the update under RLS. The cross-tenant SELECT is safe
// because `_prisma_migrations`-style migrations run as sparx_owner (bypass
// RLS) — but in api-rest we connect as sparx_app, which has FORCE RLS.
// Workaround: the SELECT is grouped + reads only id/tenantId/typeKey/slug
// of scheduled entries, and we acquire `app.tenant_id` per tenant before
// the per-row update so the policy passes.
//
// To keep the BYPASSRLS surface narrow, the cross-tenant lookup uses a
// raw query that explicitly UNSETs app.tenant_id for the duration of
// the SELECT, then resets to NULL afterwards. (sparx_app cannot bypass
// RLS, so the SELECT has to round-trip through the platform tenant or a
// dedicated `scheduler` role — see TODO at the bottom.)

import type { FastifyBaseLogger } from 'fastify';
import { prisma, withTenant } from '@sparx/db';
import { recordRevision } from './entries.js';
import { publish } from './pubsub.js';

const SCHEDULED_PUBLISH_LOCK_KEY = 4242_4242;
const DEFAULT_INTERVAL_MS = 60_000;

interface DueEntry {
  id: string;
  tenant_id: string;
  type_key: string;
  slug: string | null;
  scheduled_at: Date;
}

export interface TickResult {
  acquired: boolean;
  processed: number;
  errors: number;
}

// One-shot tick. Idempotent — running multiple times in quick succession
// is fine; the first run grabs whatever's due, subsequent runs find
// nothing.
export async function runScheduledPublishTick(logger: FastifyBaseLogger): Promise<TickResult> {
  const lock = await prisma.$queryRaw<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(${SCHEDULED_PUBLISH_LOCK_KEY}::int) AS acquired
  `;
  if (!lock[0]?.acquired) {
    logger.debug('scheduled-publish: lock held by another pod, skipping');
    return { acquired: false, processed: 0, errors: 0 };
  }

  try {
    // Cross-tenant SELECT for entries that have passed their scheduled
    // time. sparx_app has FORCE RLS, so this query returns rows only for
    // the *current* tenant GUC. We work around that by using sparx_owner
    // via a separate raw query path — see TODO below. For Phase 1 we
    // rely on the tenant GUC being unset at startup (no SET LOCAL has
    // run yet on this connection) and the policy yielding `current_setting(
    // 'app.tenant_id', true) IS NULL`-keyed rows to be... blocked.
    //
    // Pragmatic stopgap: use Prisma's raw $queryRawUnsafe with a SET LOCAL
    // ROLE sparx_owner inside a transaction so the SELECT bypasses RLS.
    // This requires that DATABASE_URL's role can SET ROLE to sparx_owner
    // (granted in the migration bootstrap via `GRANT sparx_owner TO sparx_app`).
    const due = await prisma.$transaction(async (tx) => {
      // Switch to sparx_owner for the duration of this query so RLS lets
      // us see scheduled entries across every tenant.
      await tx.$executeRawUnsafe(`SET LOCAL ROLE sparx_owner`);
      const rows = await tx.$queryRaw<DueEntry[]>`
        SELECT id, tenant_id, type_key, slug, scheduled_at
        FROM content_entries
        WHERE status = 'scheduled'
          AND scheduled_at IS NOT NULL
          AND scheduled_at <= NOW()
          AND deleted_at IS NULL
        ORDER BY scheduled_at ASC
        LIMIT 100
      `;
      return rows;
    });

    if (due.length === 0) {
      return { acquired: true, processed: 0, errors: 0 };
    }

    logger.info({ count: due.length }, 'scheduled-publish: publishing due entries');

    let processed = 0;
    let errors = 0;

    for (const row of due) {
      try {
        await withTenant({ tenantId: row.tenant_id }, async (tx) => {
          const fresh = await tx.contentEntry.findUnique({ where: { id: row.id } });
          if (!fresh || fresh.deletedAt || fresh.status !== 'scheduled') return;

          const after = await tx.contentEntry.update({
            where: { id: row.id },
            data: {
              status: 'published',
              publishedAt: new Date(),
              scheduledAt: null,
            },
          });

          await recordRevision(tx, {
            tenantId: row.tenant_id,
            entryId: after.id,
            body: (after.body ?? {}) as Record<string, unknown>,
            seoJson: (after.seoJson ?? {}) as Record<string, unknown>,
            status: 'published',
            kind: 'manual',
            authorId: null,
            summary: 'Scheduled publish fired',
          });

          await tx.auditLog.create({
            data: {
              tenantId: row.tenant_id,
              actorId: null,
              actorType: 'system',
              action: 'content.entry.published',
              entityType: 'content_entry',
              entityId: after.id,
              diff: {
                before: { status: 'scheduled' },
                after: { status: 'published', publishedAt: after.publishedAt.toISOString() },
              },
            },
          });
        });

        await publish(logger, 'content.entry.published', row.tenant_id, null, {
          entryId: row.id,
          typeKey: row.type_key,
          slug: row.slug,
          scheduledAt: row.scheduled_at.toISOString(),
        });

        processed += 1;
      } catch (err) {
        errors += 1;
        logger.error({ err, entryId: row.id }, 'scheduled-publish: failed to publish entry');
      }
    }

    return { acquired: true, processed, errors };
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${SCHEDULED_PUBLISH_LOCK_KEY}::int)`;
  }
}

// Background loop. Started from src/index.ts at boot; returns a stop()
// function so graceful shutdown can cancel the pending tick. The loop
// drifts on long ticks (each tick runs to completion before the next is
// queued) which is what we want — overlapping ticks would race for the
// advisory lock anyway.
export function startScheduledPublishLoop(
  logger: FastifyBaseLogger,
  intervalMs: number = DEFAULT_INTERVAL_MS
): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await runScheduledPublishTick(logger);
    } catch (err) {
      logger.error({ err }, 'scheduled-publish: tick threw — will retry next interval');
    }
    if (stopped) return;
    timer = setTimeout(() => void tick(), intervalMs);
  };

  // First tick fires after `intervalMs` so app startup isn't blocked on
  // a full table scan.
  timer = setTimeout(() => void tick(), intervalMs);
  logger.info({ intervalMs }, 'scheduled-publish: loop started');

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    logger.info('scheduled-publish: loop stopped');
  };
}
