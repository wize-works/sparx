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
// RLS: the cross-tenant SELECT uses the `find_due_scheduled_entries(int)`
// SECURITY DEFINER function (migration 20260601100000). The function is
// owned by sparx_owner and EXECUTE-granted only to sparx_app, so the app
// role reads scheduled entries across tenants without itself gaining RLS
// bypass. Per-entry UPDATE rides `withTenant({tenantId})` so the write
// still goes through the standard tenant_isolation policy.

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
    // SECURITY DEFINER function — runs as sparx_owner, returns the
    // due-entry projection across all tenants without sparx_app
    // gaining RLS bypass. See migration 20260601100000.
    const due = await prisma.$queryRaw<DueEntry[]>`
      SELECT id, tenant_id, type_key, slug, scheduled_at
      FROM find_due_scheduled_entries(100)
    `;

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
