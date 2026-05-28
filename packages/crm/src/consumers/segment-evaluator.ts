// Segment evaluator — the consumer that materializes `segment_members`
// incrementally as events flow.
//
// Locked decision #4: segments are materialized into a join table, never
// re-evaluated at email-send time. This consumer subscribes to every event
// that could plausibly change a customer's projection (orders, refunds,
// quote-acceptance, activity recording) and, for each affected customer,
// re-evaluates every active segment for the tenant, diffing membership.
//
// Topics watched:
//   • order.created / order.cancelled / order.refunded
//   • crm.activity.recorded (covers email opens/clicks via consumers)
//   • crm.customer.updated
//   • crm.b2b.account_updated
//
// Each addition emits crm.segment.entered + writes a CrmActivity row;
// each removal emits crm.segment.exited + writes its activity row.

import { withTenant } from '@sparx/db';
import { evaluateSegmentRule, SegmentRuleSchema, type SegmentRule } from '@sparx/crm-schemas';

import { publishCrmEvent } from '../events';
import { gateHandler, type ConsumerContext } from './registry';
import { buildSegmentRuleProjection } from './segment-projection';
import type { PlatformEvent } from './platform-bus';

interface EventPayload {
  customerId?: string;
  orderId?: string;
}

export function registerSegmentEvaluatorConsumers(ctx: ConsumerContext): (() => void)[] {
  const teardowns: (() => void)[] = [];
  const topics = [
    'order.created',
    'order.cancelled',
    'order.refunded',
    'crm.activity.recorded',
    'crm.customer.updated',
    'crm.b2b.account_updated',
  ];

  for (const topic of topics) {
    teardowns.push(
      ctx.bus.subscribe(
        topic,
        gateHandler<unknown>(async (event) => {
          const customerId = await resolveCustomerId(event as PlatformEvent<EventPayload>);
          if (!customerId) return;
          await evaluateCustomerForTenant(event.tenantId, customerId);
        })
      )
    );
  }

  return teardowns;
}

/** Extract the customerId from an event payload. For order events without
 *  an explicit customerId, we hit Prisma to look it up — adding a few ms
 *  is preferable to schema-coupling every consumer to the same payload. */
async function resolveCustomerId(event: PlatformEvent<EventPayload>): Promise<string | null> {
  if (event.payload?.customerId) return event.payload.customerId;
  if (event.payload?.orderId) {
    return withTenant({ tenantId: event.tenantId, userId: undefined }, async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: event.payload.orderId },
        select: { customerId: true },
      });
      return order?.customerId ?? null;
    });
  }
  return null;
}

/** Re-evaluate every active segment for one customer; diff against the
 *  current segment_members rows and write entries/exits accordingly. */
export async function evaluateCustomerForTenant(
  tenantId: string,
  customerId: string
): Promise<{ entered: string[]; exited: string[] }> {
  const ctx = { tenantId, userId: undefined };
  const projection = await buildSegmentRuleProjection(ctx, customerId).catch(() => null);
  if (!projection) return { entered: [], exited: [] };

  const entered: string[] = [];
  const exited: string[] = [];

  await withTenant(ctx, async (tx) => {
    const segments = await tx.segment.findMany({ where: { archivedAt: null } });

    for (const segment of segments) {
      const parsed = SegmentRuleSchema.safeParse(segment.rules);
      if (!parsed.success) continue;
      const rule = parsed.data satisfies SegmentRule;

      const shouldBeMember = evaluateSegmentRule(rule, projection);
      const existing = await tx.segmentMember.findUnique({
        where: { segmentId_customerId: { segmentId: segment.id, customerId } },
      });

      if (shouldBeMember && !existing) {
        await tx.segmentMember.create({
          data: {
            tenantId,
            segmentId: segment.id,
            customerId,
          },
        });
        entered.push(segment.id);
      } else if (!shouldBeMember && existing) {
        await tx.segmentMember.delete({
          where: { segmentId_customerId: { segmentId: segment.id, customerId } },
        });
        exited.push(segment.id);
      }
    }
  });

  // Fire events outside the transaction so a failed publish doesn't roll
  // back the membership write.
  for (const segmentId of entered) {
    await publishCrmEvent({
      tenantId,
      topic: 'crm.segment.entered',
      payload: { segmentId, customerId },
      dedupeKey: `crm.segment.entered:${segmentId}:${customerId}`,
    });
  }
  for (const segmentId of exited) {
    await publishCrmEvent({
      tenantId,
      topic: 'crm.segment.exited',
      payload: { segmentId, customerId },
      dedupeKey: `crm.segment.exited:${segmentId}:${customerId}:${Date.now()}`,
    });
  }

  return { entered, exited };
}
