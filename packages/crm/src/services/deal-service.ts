// dealService — sales opportunities (docs/11 §4).
//
// Locked decisions in play here:
//   #5 — deals attach to orders/quotes via join tables (deal_orders /
//        deal_quotes), never via columns on orders/quotes. attachOrder /
//        attachQuote are the only paths that write to those tables.
//   #6 — moveStage emits crm.deal.stage_changed; the email module's
//        automation engine subscribes to this topic to trigger the
//        documented templates. Going through update() instead of
//        moveStage() would skip the event — moveStage is the only
//        sanctioned stage-change path.

import { CreateDealInput, MoveDealStageInput, UpdateDealInput } from '@sparx/crm-schemas';
import { withTenant } from '@sparx/db';
import type { Deal, Prisma } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { publishCrmEvent } from '../events';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError, CrmValidationError } from '../errors';

export interface ListDealsFilter {
  pipelineId?: string;
  stageId?: string;
  assignedRepId?: string | null;
  customerId?: string;
  b2bAccountId?: string;
  /** "open" excludes deals on won/lost stages; "closed" includes only those. */
  state?: 'open' | 'closed';
  take?: number;
  skip?: number;
}

export async function list(
  ctx: ServiceContext,
  filter: ListDealsFilter = {}
): Promise<{ items: Deal[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const where: Prisma.DealWhereInput = {
      deletedAt: null,
      ...(filter.pipelineId ? { pipelineId: filter.pipelineId } : {}),
      ...(filter.stageId ? { stageId: filter.stageId } : {}),
      ...(filter.assignedRepId !== undefined ? { assignedRepId: filter.assignedRepId } : {}),
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      ...(filter.b2bAccountId ? { b2bAccountId: filter.b2bAccountId } : {}),
      ...(filter.state === 'open'
        ? { closedAt: null }
        : filter.state === 'closed'
          ? { closedAt: { not: null } }
          : {}),
    };
    const [items, total] = await Promise.all([
      tx.deal.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: Math.min(filter.take ?? 50, 250),
        skip: filter.skip ?? 0,
      }),
      tx.deal.count({ where }),
    ]);
    return { items, total };
  });
}

export async function get(ctx: ServiceContext, dealId: string): Promise<Deal> {
  const deal = await withTenant(ctx, (tx) => tx.deal.findUnique({ where: { id: dealId } }));
  if (deal?.deletedAt !== null) throw new CrmNotFoundError('Deal', dealId);
  return deal;
}

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<Deal> {
  const input = CreateDealInput.parse(rawInput);

  const deal = await withTenant(ctx, async (tx) => {
    // Validate the stage belongs to the supplied pipeline. RLS already
    // scopes both to the tenant; this check catches stage-pipeline mismatch
    // before the FK constraint trips.
    const stage = await tx.pipelineStage.findUnique({ where: { id: input.stageId } });
    if (stage?.pipelineId !== input.pipelineId) {
      throw new CrmValidationError('Stage does not belong to the supplied pipeline', [
        { field: 'stageId', message: 'Stage and pipeline must match' },
      ]);
    }

    const created = await tx.deal.create({
      data: {
        tenantId: ctx.tenantId,
        pipelineId: input.pipelineId,
        stageId: input.stageId,
        customerId: input.customerId ?? null,
        b2bAccountId: input.b2bAccountId ?? null,
        assignedRepId: input.assignedRepId ?? null,
        title: input.title,
        value: input.value,
        currency: input.currency,
        probability: input.probability,
        expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : null,
        source: input.source ?? null,
        tags: input.tags ?? [],
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    // Also drop a CRM activity for the deal creation so the timeline picks
    // it up. Keeping this inline (vs going through activityService) keeps
    // the side effect inside the same transaction as the deal write.
    await tx.crmActivity.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: created.customerId,
        dealId: created.id,
        b2bAccountId: created.b2bAccountId,
        type: 'deal.created',
        description: `Deal "${created.title}" created`,
        actorId: ctx.userId ?? null,
        actorType: ctx.userId ? 'staff' : 'system',
        occurredAt: created.createdAt,
        linkedEntityType: 'Deal',
        linkedEntityId: created.id,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.deal.created',
      entityType: 'Deal',
      entityId: created.id,
      diff: { after: { title: created.title, value: created.value.toString() } },
    });

    return created;
  });

  await publishCrmEvent({
    tenantId: ctx.tenantId,
    topic: 'crm.deal.created',
    payload: { dealId: deal.id, pipelineId: deal.pipelineId, stageId: deal.stageId },
    dedupeKey: `crm.deal.created:${deal.id}`,
  });

  return deal;
}

export async function update(
  ctx: ServiceContext,
  dealId: string,
  rawInput: unknown
): Promise<Deal> {
  const input = UpdateDealInput.parse(rawInput);

  // Guardrail: stageId changes MUST go through moveStage() so the
  // stage_changed event fires. We reject stageId in the generic update
  // path rather than silently emitting the wrong event.
  if (input.stageId !== undefined) {
    throw new CrmValidationError(
      'Stage changes must go through dealService.moveStage so the deal.stage_changed event fires',
      [{ field: 'stageId', message: 'Use moveStage() to change the stage' }]
    );
  }

  return withTenant(ctx, async (tx) => {
    const before = await tx.deal.findUnique({ where: { id: dealId } });
    if (before?.deletedAt !== null) throw new CrmNotFoundError('Deal', dealId);
    const updated = await tx.deal.update({
      where: { id: dealId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.probability !== undefined ? { probability: input.probability } : {}),
        ...(input.expectedCloseDate !== undefined
          ? {
              expectedCloseDate: input.expectedCloseDate ? new Date(input.expectedCloseDate) : null,
            }
          : {}),
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        ...(input.b2bAccountId !== undefined ? { b2bAccountId: input.b2bAccountId } : {}),
        ...(input.assignedRepId !== undefined ? { assignedRepId: input.assignedRepId } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.metadata !== undefined
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.deal.updated',
      entityType: 'Deal',
      entityId: updated.id,
      diff: null,
    });
    return updated;
  });
}

/** Move a deal to a new stage. The single sanctioned stage-change path —
 *  emits crm.deal.stage_changed which the email automation engine listens
 *  for. On move-to-won or move-to-lost, also sets closed_at/closed_reason. */
export async function moveStage(
  ctx: ServiceContext,
  dealId: string,
  rawInput: unknown
): Promise<Deal> {
  const input = MoveDealStageInput.parse(rawInput);

  const { deal, fromStageId, fromStageType, toStageType } = await withTenant(ctx, async (tx) => {
    const before = await tx.deal.findUnique({
      where: { id: dealId },
      include: { stage: true },
    });
    if (before?.deletedAt !== null) throw new CrmNotFoundError('Deal', dealId);

    const toStage = await tx.pipelineStage.findUnique({ where: { id: input.toStageId } });
    if (!toStage) throw new CrmNotFoundError('PipelineStage', input.toStageId);
    if (toStage.pipelineId !== before.pipelineId) {
      throw new CrmValidationError('Cannot move deal to a stage in a different pipeline', [
        { field: 'toStageId', message: 'Stage belongs to a different pipeline' },
      ]);
    }
    if (toStage.id === before.stageId) {
      // No-op move — return the existing row without an event emission.
      return {
        deal: before,
        fromStageId: before.stageId,
        fromStageType: before.stage.stageType,
        toStageType: toStage.stageType,
      };
    }

    const isClosing = toStage.stageType === 'won' || toStage.stageType === 'lost';

    const updated = await tx.deal.update({
      where: { id: dealId },
      data: {
        stageId: toStage.id,
        probability: toStage.probability,
        ...(isClosing
          ? { closedAt: new Date(), closedReason: input.closedReason ?? null }
          : { closedAt: null, closedReason: null }),
      },
    });

    // Stage-change activity.
    await tx.crmActivity.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: updated.customerId,
        dealId: updated.id,
        b2bAccountId: updated.b2bAccountId,
        type:
          toStage.stageType === 'won'
            ? 'deal.closed'
            : toStage.stageType === 'lost'
              ? 'deal.lost'
              : 'deal.stage.changed',
        description: `Stage changed: ${before.stage.name} → ${toStage.name}`,
        actorId: ctx.userId ?? null,
        actorType: ctx.userId ? 'staff' : 'system',
        occurredAt: new Date(),
        linkedEntityType: 'Deal',
        linkedEntityId: updated.id,
        metadata: {
          fromStageId: before.stageId,
          fromStageName: before.stage.name,
          toStageId: toStage.id,
          toStageName: toStage.name,
        },
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'crm.deal.stage_changed',
      entityType: 'Deal',
      entityId: updated.id,
      diff: {
        before: { stageId: before.stageId, stageType: before.stage.stageType },
        after: { stageId: toStage.id, stageType: toStage.stageType },
      },
    });

    return {
      deal: updated,
      fromStageId: before.stageId,
      fromStageType: before.stage.stageType,
      toStageType: toStage.stageType,
    };
  });

  if (fromStageId !== deal.stageId) {
    await publishCrmEvent({
      tenantId: ctx.tenantId,
      topic: 'crm.deal.stage_changed',
      payload: {
        dealId: deal.id,
        fromStageId,
        fromStageType,
        toStageId: deal.stageId,
        toStageType,
        closed: deal.closedAt !== null,
      },
      dedupeKey: `crm.deal.stage_changed:${deal.id}:${deal.updatedAt.toISOString()}`,
    });

    if (toStageType === 'won' || toStageType === 'lost') {
      await publishCrmEvent({
        tenantId: ctx.tenantId,
        topic: 'crm.deal.closed',
        payload: { dealId: deal.id, outcome: toStageType },
        dedupeKey: `crm.deal.closed:${deal.id}`,
      });
    }
  }

  return deal;
}

// ─────────────────────────────────────────────────────────────────────────
// Join-table operations (locked decision #5) — implementations live in
// deal-attach-service.ts so this file stays under the 200-line target.
// Forecast lives in deal-forecast-service.ts for the same reason.
// ─────────────────────────────────────────────────────────────────────────

export {
  attachOrder,
  detachOrder,
  attachQuote,
  detachQuote,
  listAttachedOrders,
  listAttachedQuotes,
} from './deal-attach-service';
export {
  forecast,
  type ForecastArgs,
  type ForecastBucket,
  type ForecastResult,
} from './deal-forecast-service';
