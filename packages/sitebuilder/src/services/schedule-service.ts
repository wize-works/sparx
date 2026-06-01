// scheduleService — scheduled publishing.
//
// schedule/listSchedules/cancel are the tenant-facing API. processDueSchedule
// is called by the in-process tick in services/api-rest (one row at a time,
// after the cross-tenant SECURITY DEFINER scan) — it flips the schedule to
// 'published' and runs the publish in the SAME transaction so the two never
// drift. The cross-tenant scan + advisory lock live in api-rest, not here, so
// this package stays tenant-scoped.

import { ScheduleInput } from '@sparx/sitebuilder-schemas';
import type { SitePublishSchedule, SiteVersion } from '@sparx/db';
import { withTenant } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishSitebuilderEvent } from '../events';
import type { ServiceContext } from '../errors';
import { SitebuilderNotFoundError } from '../errors';
import { getOrCreateConfig } from './_config';
import { publishWithinTx } from './publish-internals';

export async function schedule(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<SitePublishSchedule> {
  const input = ScheduleInput.parse(rawInput);
  const created = await withTenant(ctx, async (tx) => {
    await getOrCreateConfig(tx, ctx.tenantId);
    const row = await tx.sitePublishSchedule.create({
      data: {
        tenantId: ctx.tenantId,
        scheduledAt: new Date(input.scheduledAt),
        status: 'pending',
        note: input.note ?? null,
        createdById: ctx.userId ?? null,
        themeId: input.themeId ?? null,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'sitebuilder.scheduled',
      entityType: 'SitePublishSchedule',
      entityId: row.id,
      diff: { after: { scheduledAt: row.scheduledAt.toISOString() } },
    });
    return row;
  });

  await publishSitebuilderEvent({
    tenantId: ctx.tenantId,
    topic: 'sitebuilder.scheduled',
    payload: { scheduleId: created.id, scheduledAt: created.scheduledAt.toISOString() },
    dedupeKey: `sitebuilder.scheduled:${created.id}`,
  });

  return created;
}

export function listSchedules(ctx: ServiceContext): Promise<SitePublishSchedule[]> {
  return withTenant(ctx, (tx) =>
    tx.sitePublishSchedule.findMany({ orderBy: { scheduledAt: 'desc' } })
  );
}

export async function cancel(
  ctx: ServiceContext,
  scheduleId: string
): Promise<SitePublishSchedule> {
  const cancelled = await withTenant(ctx, async (tx) => {
    const existing = await tx.sitePublishSchedule.findUnique({ where: { id: scheduleId } });
    if (!existing) throw new SitebuilderNotFoundError('SitePublishSchedule', scheduleId);
    if (existing.status !== 'pending') return existing;
    const row = await tx.sitePublishSchedule.update({
      where: { id: scheduleId },
      data: { status: 'cancelled' },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'user',
      action: 'sitebuilder.schedule_cancelled',
      entityType: 'SitePublishSchedule',
      entityId: row.id,
      diff: { before: { status: 'pending' }, after: { status: 'cancelled' } },
    });
    return row;
  });

  await publishSitebuilderEvent({
    tenantId: ctx.tenantId,
    topic: 'sitebuilder.schedule_cancelled',
    payload: { scheduleId: cancelled.id },
    dedupeKey: `sitebuilder.schedule_cancelled:${cancelled.id}`,
  });

  return cancelled;
}

export interface ProcessResult {
  status: 'published' | 'skipped' | 'failed';
  version?: SiteVersion;
}

/**
 * Publishes a single due schedule, flipping its status in the same transaction
 * as the publish. Called by the api-rest tick after the cross-tenant scan. The
 * caller passes a system ServiceContext for the schedule's tenant. Emits the
 * publish event after commit.
 */
export async function processDueSchedule(
  ctx: ServiceContext,
  scheduleId: string
): Promise<ProcessResult> {
  let publishedVersion: SiteVersion | undefined;

  try {
    // Publish + flip the schedule atomically. If publish throws, the whole
    // transaction rolls back and we mark the row failed in a fresh tx below
    // (a thrown query poisons the current transaction — it can't be reused).
    const status = await withTenant(ctx, async (tx): Promise<'published' | 'skipped'> => {
      const schedule = await tx.sitePublishSchedule.findUnique({ where: { id: scheduleId } });
      if (schedule?.status !== 'pending') return 'skipped';

      const config = await getOrCreateConfig(tx, ctx.tenantId);

      // Seasonal/holiday swap (docs/36): if the schedule points at a saved theme,
      // apply it to the draft (theme_key + presentation) before snapshotting, so
      // the published version carries it. A deleted theme nulled the FK → skip.
      if (schedule.themeId) {
        const theme = await tx.siteTheme.findUnique({ where: { id: schedule.themeId } });
        if (theme) {
          const draft = (config.draftSettings ?? {}) as Record<string, unknown>;
          await tx.siteConfig.update({
            where: { tenantId: ctx.tenantId },
            data: {
              themeKey: theme.basePresetKey,
              draftSettings: {
                ...draft,
                presentation: theme.presentation,
              },
            },
          });
        }
      }

      const version = await publishWithinTx(tx, {
        tenantId: ctx.tenantId,
        userId: null,
        note: schedule.note ?? `Scheduled publish ${schedule.scheduledAt.toISOString()}`,
      });
      publishedVersion = version;
      await tx.sitePublishSchedule.update({
        where: { id: scheduleId },
        data: { status: 'published', processedAt: new Date(), resultVersionId: version.id },
      });
      return 'published';
    });

    if (status === 'published' && publishedVersion) {
      await publishSitebuilderEvent({
        tenantId: ctx.tenantId,
        topic: 'sitebuilder.published',
        payload: {
          versionId: publishedVersion.id,
          versionNumber: publishedVersion.versionNumber,
          scheduled: true,
        },
        dedupeKey: `sitebuilder.published:${publishedVersion.id}`,
      });
    }

    return { status, version: publishedVersion };
  } catch (err) {
    await withTenant(ctx, (tx) =>
      tx.sitePublishSchedule.updateMany({
        where: { id: scheduleId, status: 'pending' },
        data: {
          status: 'failed',
          processedAt: new Date(),
          error: err instanceof Error ? err.message : String(err),
        },
      })
    );
    return { status: 'failed' };
  }
}
