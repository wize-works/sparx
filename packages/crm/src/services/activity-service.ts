// activityService — the append-only event log (locked decision #3).
//
// `record()` is the single write path. Activities are never UPDATEd; edits
// to an existing note insert a new row with `correctsActivityId` pointing
// at the original. Both consumers (the Phase 2 Pub/Sub subscribers that
// auto-record from order/email/quote events) and humans (notes, calls,
// meetings via the dashboard) come through here, so the audit log and
// `crm.activity.recorded` event emission live in one place.

import { CreateActivityInput, ListActivitiesInput } from '@sparx/crm-schemas';
import { withTenant } from '@sparx/db';
import type { CrmActivity, Prisma } from '@sparx/db';

import { writeAuditLog } from '../audit.js';
import { publishCrmEvent } from '../events.js';
import type { ServiceContext } from '../errors.js';

export async function list(
  ctx: ServiceContext,
  rawFilter: unknown = {},
): Promise<CrmActivity[]> {
  const filter = ListActivitiesInput.parse(rawFilter);
  return withTenant(ctx, (tx) =>
    tx.crmActivity.findMany({
      where: {
        ...(filter.customerId ? { customerId: filter.customerId } : {}),
        ...(filter.dealId ? { dealId: filter.dealId } : {}),
        ...(filter.b2bAccountId ? { b2bAccountId: filter.b2bAccountId } : {}),
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.since || filter.until
          ? {
              occurredAt: {
                ...(filter.since ? { gte: new Date(filter.since) } : {}),
                ...(filter.until ? { lte: new Date(filter.until) } : {}),
              },
            }
          : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: filter.limit,
    }),
  );
}

export async function record(
  ctx: ServiceContext,
  rawInput: unknown,
): Promise<CrmActivity> {
  const input = CreateActivityInput.parse(rawInput);
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

  const activity = await withTenant(ctx, async (tx) => {
    const created = await tx.crmActivity.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: input.customerId ?? null,
        dealId: input.dealId ?? null,
        b2bAccountId: input.b2bAccountId ?? null,
        type: input.type,
        description: input.description ?? null,
        actorId: input.actorId ?? ctx.userId ?? null,
        actorType: input.actorType,
        occurredAt,
        linkedEntityType: input.linkedEntityType ?? null,
        linkedEntityId: input.linkedEntityId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        correctsActivityId: input.correctsActivityId ?? null,
      },
    });

    // Activities are themselves an audit trail; we still write a separate
    // audit_logs row when a human authored the activity so the audit log
    // remains the single forensic surface across modules. Auto-recorded
    // activities (from Pub/Sub consumers) skip the audit-log write — they
    // are already logged at the source event's audit row.
    if (input.actorType === 'staff' && ctx.userId) {
      await writeAuditLog({
        tx,
        tenantId: ctx.tenantId,
        actorId: ctx.userId,
        actorType: 'user',
        action: 'crm.activity.recorded',
        entityType: 'CrmActivity',
        entityId: created.id,
        diff: { after: { type: created.type } },
      });
    }

    return created;
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.activity.recorded',
    payload: {
      activityId: activity.id,
      type: activity.type,
      customerId: activity.customerId,
      dealId: activity.dealId,
      b2bAccountId: activity.b2bAccountId,
    },
    dedupeKey: `crm.activity.recorded:${activity.id}`,
    occurredAt,
  });

  return activity;
}
