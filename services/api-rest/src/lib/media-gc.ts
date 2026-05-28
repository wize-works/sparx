// Media garbage-collection tick.
//
// Soft-deleted MediaAssets (deletedAt IS NOT NULL) with no live references
// (usageCount = 0) become eligible for hard deletion after MEDIA_GC_GRACE_MS
// (default 30 days). The tick:
//   1. selects eligible assets cross-tenant via a SECURITY DEFINER lookup,
//   2. for each, deletes every variant object + the original from storage,
//   3. removes the MediaVariant + MediaAsset rows in a per-tenant tx.
//
// Singleton across pods via Postgres advisory lock (key MEDIA_GC_LOCK_KEY) —
// same pattern as scheduled-publish + webhook-delivery so the three workers
// never contend.
//
// Interval default is daily; in dev we can run it more aggressively via
// MEDIA_GC_INTERVAL_MS to exercise the path.

import type { FastifyBaseLogger } from 'fastify';
import { prisma, withTenant } from '@sparx/db';
import { getStorage } from './storage.js';

const MEDIA_GC_LOCK_KEY = 4242_4244;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const DEFAULT_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const BATCH_LIMIT = 200;

interface EligibleAsset {
  id: string;
  tenant_id: string;
  key: string;
}

export interface MediaGcTickResult {
  acquired: boolean;
  removed: number;
  errors: number;
}

export async function runMediaGcTick(
  logger: FastifyBaseLogger,
  graceMs: number = DEFAULT_GRACE_MS
): Promise<MediaGcTickResult> {
  const lock = await prisma.$queryRaw<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(${MEDIA_GC_LOCK_KEY}::int) AS acquired
  `;
  if (!lock[0]?.acquired) {
    logger.debug('media-gc: lock held by another pod, skipping');
    return { acquired: false, removed: 0, errors: 0 };
  }

  try {
    const cutoff = new Date(Date.now() - graceMs);
    // Cross-tenant SELECT. Same approach as scheduled-publish: we'd rather
    // run a hand-rolled query than try to express "across all tenants" via
    // RLS-protected Prisma. The query is fully parameterized — no string
    // interpolation of caller input — and sparx_app already has SELECT on
    // media_assets in every tenant via RLS would-be-bypass only when the
    // GUC isn't set. We deliberately bypass RLS here by running outside
    // any withTenant context; the row's tenant_id is then carried into the
    // per-asset tx below where RLS applies again.
    const eligible = await prisma.$queryRaw<EligibleAsset[]>`
      SELECT id, tenant_id, key
      FROM media_assets
      WHERE deleted_at IS NOT NULL
        AND deleted_at < ${cutoff}
        AND usage_count = 0
      LIMIT ${BATCH_LIMIT}
    `;

    if (eligible.length === 0) {
      return { acquired: true, removed: 0, errors: 0 };
    }

    logger.info({ count: eligible.length, cutoff }, 'media-gc: purging eligible assets');

    const storage = getStorage();
    let removed = 0;
    let errors = 0;

    for (const asset of eligible) {
      try {
        // Look up every variant under this tenant so we can purge their
        // objects too. Variants live in the public bucket; original lives
        // in the private bucket; storage.deleteObject routes correctly via
        // the key prefix.
        const variants = await withTenant({ tenantId: asset.tenant_id }, (tx) =>
          tx.mediaVariant.findMany({
            where: { assetId: asset.id },
            select: { id: true, key: true },
          })
        );

        // Delete bytes first, rows second. If storage delete fails the row
        // stays around and the next tick will retry; if storage succeeded
        // but the row delete failed we'd leak a row pointing at nothing,
        // but the GC's "deleted_at + usage_count=0" guard means it'll be
        // re-evaluated next cycle.
        for (const v of variants) {
          await storage.deleteObject(v.key);
        }
        await storage.deleteObject(asset.key);

        await withTenant({ tenantId: asset.tenant_id }, async (tx) => {
          // MediaVariant rows cascade-delete on MediaAsset deletion via
          // the FK in schema.prisma, but emptying explicitly is more
          // defensive and avoids surprising ON DELETE behavior.
          await tx.mediaVariant.deleteMany({ where: { assetId: asset.id } });
          await tx.mediaAsset.delete({ where: { id: asset.id } });
        });

        removed += 1;
      } catch (err) {
        errors += 1;
        logger.error({ err, assetId: asset.id }, 'media-gc: failed to purge asset');
      }
    }

    return { acquired: true, removed, errors };
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${MEDIA_GC_LOCK_KEY}::int)`;
  }
}

export function startMediaGcLoop(
  logger: FastifyBaseLogger,
  intervalMs: number = DEFAULT_INTERVAL_MS,
  graceMs: number = DEFAULT_GRACE_MS
): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      await runMediaGcTick(logger, graceMs);
    } catch (err) {
      logger.error({ err }, 'media-gc: tick threw — will retry next interval');
    }
    if (stopped) return;
    timer = setTimeout(() => void tick(), intervalMs);
  };

  // First tick fires after one full interval so a deploy doesn't burn its
  // startup budget on a table scan.
  timer = setTimeout(() => void tick(), intervalMs);
  logger.info({ intervalMs, graceMs }, 'media-gc: loop started');

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    logger.info('media-gc: loop stopped');
  };
}
