// Scheduled Site Builder publish tick.
//
// Runs every `SITEBUILDER_PUBLISH_INTERVAL_MS` (default 60s) from
// services/api-rest's bootstrap. Finds SitePublishSchedule rows with
// status='pending' whose `scheduled_at <= NOW()` and publishes each tenant's
// current draft (creating a new SiteVersion + write-through). Mirrors
// lib/scheduled-publish.ts.
//
// Singleton across pods: a Postgres advisory lock (constant key, distinct from
// the CMS scheduled-publish lock) is acquired with pg_try_advisory_lock; if
// another pod holds it the tick returns immediately.
//
// RLS: the cross-tenant SELECT uses the `find_due_site_publishes(int)`
// SECURITY DEFINER function (migration 20260608000000). Per-row publish rides
// scheduleService.processDueSchedule, which runs inside withTenant({tenantId})
// so writes still go through tenant_isolation.

import type { FastifyBaseLogger } from 'fastify';
import { prisma } from '@sparx/db';
import { scheduleService } from '@sparx/sitebuilder';

const SITEBUILDER_PUBLISH_LOCK_KEY = 4242_4243;
const DEFAULT_INTERVAL_MS = 60_000;

interface DueSchedule {
  id: string;
  tenant_id: string;
  scheduled_at: Date;
}

export interface TickResult {
  acquired: boolean;
  processed: number;
  errors: number;
}

export async function runSitebuilderPublishTick(logger: FastifyBaseLogger): Promise<TickResult> {
  const lock = await prisma.$queryRaw<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(${SITEBUILDER_PUBLISH_LOCK_KEY}::int) AS acquired
  `;
  if (!lock[0]?.acquired) {
    logger.debug('sitebuilder-publish: lock held by another pod, skipping');
    return { acquired: false, processed: 0, errors: 0 };
  }

  try {
    const due = await prisma.$queryRaw<DueSchedule[]>`
      SELECT id, tenant_id, scheduled_at
      FROM find_due_site_publishes(100)
    `;

    if (due.length === 0) {
      return { acquired: true, processed: 0, errors: 0 };
    }

    logger.info({ count: due.length }, 'sitebuilder-publish: publishing due schedules');

    let processed = 0;
    let errors = 0;

    for (const row of due) {
      try {
        const result = await scheduleService.processDueSchedule(
          { tenantId: row.tenant_id, userId: undefined },
          row.id
        );
        if (result.status === 'failed') {
          errors += 1;
          logger.error({ scheduleId: row.id }, 'sitebuilder-publish: publish failed for schedule');
        } else {
          processed += 1;
        }
      } catch (err) {
        errors += 1;
        logger.error({ err, scheduleId: row.id }, 'sitebuilder-publish: tick error on schedule');
      }
    }

    return { acquired: true, processed, errors };
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${SITEBUILDER_PUBLISH_LOCK_KEY}::int)`;
  }
}

export function startSitebuilderPublishLoop(
  logger: FastifyBaseLogger,
  intervalMs: number = DEFAULT_INTERVAL_MS
): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await runSitebuilderPublishTick(logger);
    } catch (err) {
      logger.error({ err }, 'sitebuilder-publish: tick threw — will retry next interval');
    }
    if (stopped) return;
    timer = setTimeout(() => void tick(), intervalMs);
  };

  timer = setTimeout(() => void tick(), intervalMs);
  logger.info({ intervalMs }, 'sitebuilder-publish: loop started');

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    logger.info('sitebuilder-publish: loop stopped');
  };
}
