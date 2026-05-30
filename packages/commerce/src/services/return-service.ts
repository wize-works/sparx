// returnService — RMA workflow. Customer- or staff-initiated; staff
// inspection + restock decision per line item; refund-or-store-credit
// settlement. Actual provider-side refund settlement (Stripe) is
// invoked through the order-payments path; this service owns the
// lifecycle state machine + audit + events.

import {
  ApproveReturnInput,
  CreateReturnRequestInput,
  DenyReturnInput,
  IssueReturnRefundInput,
  RecordReturnInspectionInput,
  type ReturnStatus,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma, ReturnLineItem, ReturnRequest, TxClient } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

export interface ReturnSummary {
  id: string;
  orderId: string;
  customerId: string | null;
  status: ReturnStatus;
  preferredOutcome: string;
  itemCount: number;
  requestedAt: string;
}

export interface ReturnDetail extends ReturnSummary {
  staffNote: string | null;
  refundedAmountCents: number | null;
  restockingFeeCents: number | null;
  refundIssuedAs: string | null;
  approvedAt: string | null;
  receivedAt: string | null;
  refundedAt: string | null;
  cancelledAt: string | null;
  items: {
    id: string;
    orderItemId: string;
    quantity: number;
    approvedQuantity: number;
    reasonCode: string;
    customerNote: string | null;
    mediaAssetIds: string[];
  }[];
  inspections: {
    id: string;
    returnLineItemId: string;
    condition: string;
    restockable: boolean;
    warehouseId: string | null;
    note: string | null;
  }[];
  labels: {
    id: string;
    providerSlug: string;
    labelRef: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
  }[];
}

// ─── Reads ───────────────────────────────────────────────────────────

export async function list(
  ctx: ServiceContext,
  filter: {
    status?: ReturnStatus;
    orderId?: string;
    take?: number;
    skip?: number;
  } = {}
): Promise<{ items: ReturnSummary[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const where: Prisma.ReturnRequestWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.orderId ? { orderId: filter.orderId } : {}),
    };
    const [rows, total] = await Promise.all([
      tx.returnRequest.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: filter.take ?? 50,
        skip: filter.skip ?? 0,
      }),
      tx.returnRequest.count({ where }),
    ]);

    const orderIds = [...new Set(rows.map((r) => r.orderId))];
    const orders = await tx.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, customerId: true },
    });
    const customerByOrder = new Map(orders.map((o) => [o.id, o.customerId]));

    return {
      items: rows.map((row) => toSummary(row, customerByOrder.get(row.orderId) ?? null)),
      total,
    };
  });
}

export async function get(ctx: ServiceContext, returnId: string): Promise<ReturnDetail> {
  const detail = await withTenant(ctx, async (tx) => {
    const row = await tx.returnRequest.findFirst({
      where: { id: returnId },
      include: { items: true, inspections: true, labels: true },
    });
    if (!row) return null;
    const order = await tx.order.findFirst({
      where: { id: row.orderId },
      select: { customerId: true },
    });
    return { row, customerId: order?.customerId ?? null };
  });
  if (!detail) throw new CommerceNotFoundError('ReturnRequest', returnId);

  const { row, customerId } = detail;
  return {
    ...toSummary(row, customerId),
    staffNote: row.staffNote,
    refundedAmountCents: row.refundedAmountCents,
    restockingFeeCents: row.restockingFeeCents,
    refundIssuedAs: row.refundIssuedAs,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    refundedAt: row.refundedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    items: row.items.map((it) => ({
      id: it.id,
      orderItemId: it.orderItemId,
      quantity: it.quantity,
      approvedQuantity: it.approvedQuantity,
      reasonCode: it.reasonCode,
      customerNote: it.customerNote,
      mediaAssetIds: Array.isArray(it.mediaAssetIds) ? (it.mediaAssetIds as string[]) : [],
    })),
    inspections: row.inspections.map((ins) => ({
      id: ins.id,
      returnLineItemId: ins.returnLineItemId,
      condition: ins.condition,
      restockable: ins.restockable,
      warehouseId: ins.warehouseId,
      note: ins.note,
    })),
    labels: row.labels.map((lbl) => ({
      id: lbl.id,
      providerSlug: lbl.providerSlug,
      labelRef: lbl.labelRef,
      trackingNumber: lbl.trackingNumber,
      trackingUrl: lbl.trackingUrl,
    })),
  };
}

// ─── Lifecycle ───────────────────────────────────────────────────────

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<{ id: string }> {
  const input = CreateReturnRequestInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: input.orderId },
      select: { id: true, items: { select: { id: true, quantity: true } } },
    });
    if (!order) throw new CommerceNotFoundError('Order', input.orderId);

    const validItemIds = new Set(order.items.map((it) => it.id));
    for (const line of input.items) {
      if (!validItemIds.has(line.orderItemId)) {
        throw new CommerceValidationError(
          `Order item ${line.orderItemId} does not belong to order ${input.orderId}`
        );
      }
    }

    const created = await tx.returnRequest.create({
      data: {
        tenantId: ctx.tenantId,
        orderId: input.orderId,
        requestedBy: input.requestedBy,
        status: 'requested',
        preferredOutcome: input.preferredOutcome,
        items: {
          create: input.items.map((line) => ({
            tenantId: ctx.tenantId,
            orderItemId: line.orderItemId,
            quantity: line.quantity,
            reasonCode: line.reasonCode,
            customerNote: line.customerNote ?? null,
            mediaAssetIds: line.mediaAssetIds,
          })),
        },
      },
      select: { id: true },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: input.requestedBy === 'staff' ? 'user' : 'customer',
      action: 'commerce.return.requested',
      entityType: 'ReturnRequest',
      entityId: created.id,
      diff: { after: { orderId: input.orderId, itemCount: input.items.length } },
    });
    return created.id;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'return.requested',
    data: { returnId: result, orderId: input.orderId },
  });

  return { id: result };
}

export async function approve(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ labelMediaId: string | null }> {
  const input = ApproveReturnInput.parse(rawInput);

  await withTenant(ctx, async (tx) => {
    const ret = await assertReturnWritable(tx, input.returnId);
    if (ret.status !== 'requested' && ret.status !== 'denied') {
      throw new CommerceConflictError(
        `Cannot approve return from status "${ret.status}"; expected "requested" or "denied"`
      );
    }
    for (const decision of input.itemDecisions) {
      const line = await tx.returnLineItem.findFirst({
        where: { id: decision.returnLineItemId, returnId: ret.id },
      });
      if (!line) {
        throw new CommerceNotFoundError('ReturnLineItem', decision.returnLineItemId);
      }
      if (decision.approvedQuantity > line.quantity) {
        throw new CommerceValidationError(
          `Approved quantity ${decision.approvedQuantity} exceeds requested ${line.quantity} on line ${decision.returnLineItemId}`
        );
      }
      await tx.returnLineItem.update({
        where: { id: decision.returnLineItemId },
        data: { approvedQuantity: decision.approvedQuantity },
      });
    }
    await tx.returnRequest.update({
      where: { id: ret.id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: ctx.userId ?? null,
        staffNote: input.staffNote ?? null,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.return.approved',
      entityType: 'ReturnRequest',
      entityId: ret.id,
      diff: { after: { status: 'approved' } },
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'return.approved',
    data: { returnId: input.returnId },
  });

  // Label generation lands when the ShippingProvider bridge is live.
  // For now we return null so callers know to surface a "print label
  // manually" CTA in the dashboard.
  return { labelMediaId: null };
}

export async function deny(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = DenyReturnInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const ret = await assertReturnWritable(tx, input.returnId);
    if (ret.status !== 'requested') {
      throw new CommerceConflictError(
        `Cannot deny return from status "${ret.status}"; expected "requested"`
      );
    }
    await tx.returnRequest.update({
      where: { id: ret.id },
      data: { status: 'denied', staffNote: input.reason },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.return.denied',
      entityType: 'ReturnRequest',
      entityId: ret.id,
      diff: { after: { status: 'denied', reason: input.reason } },
    });
  });
}

export async function markReceived(ctx: ServiceContext, returnId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const ret = await assertReturnWritable(tx, returnId);
    if (
      ret.status !== 'approved' &&
      ret.status !== 'in_transit' &&
      ret.status !== 'awaiting_shipment'
    ) {
      throw new CommerceConflictError(`Cannot mark received from status "${ret.status}"`);
    }
    await tx.returnRequest.update({
      where: { id: returnId },
      data: { status: 'received', receivedAt: new Date() },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.return.received',
      entityType: 'ReturnRequest',
      entityId: returnId,
      diff: { after: { status: 'received' } },
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'return.received',
    data: { returnId },
  });
}

export async function recordInspection(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = RecordReturnInspectionInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const ret = await assertReturnWritable(tx, input.returnId);
    if (ret.status !== 'received' && ret.status !== 'inspecting') {
      throw new CommerceConflictError(`Cannot record inspection from status "${ret.status}"`);
    }
    for (const ins of input.inspections) {
      const line = await tx.returnLineItem.findFirst({
        where: { id: ins.returnLineItemId, returnId: ret.id },
      });
      if (!line) throw new CommerceNotFoundError('ReturnLineItem', ins.returnLineItemId);
      await tx.returnInspection.create({
        data: {
          tenantId: ctx.tenantId,
          returnId: ret.id,
          returnLineItemId: ins.returnLineItemId,
          condition: ins.condition,
          restockable: ins.restockable,
          warehouseId: ins.warehouseId ?? null,
          photoMediaIds: ins.photoMediaIds,
          note: ins.note ?? null,
          inspectedBy: ctx.userId ?? null,
        },
      });
    }
    await tx.returnRequest.update({
      where: { id: ret.id },
      data: { status: 'inspected' },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.return.inspected',
      entityType: 'ReturnRequest',
      entityId: ret.id,
      diff: { after: { status: 'inspected', lineCount: input.inspections.length } },
    });
  });
}

export async function issueRefund(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ refundId: string }> {
  const input = IssueReturnRefundInput.parse(rawInput);

  let refundId = '';
  await withTenant(ctx, async (tx) => {
    const ret = await assertReturnWritable(tx, input.returnId);
    if (ret.status !== 'inspected' && ret.status !== 'received') {
      throw new CommerceConflictError(
        `Cannot issue refund from status "${ret.status}"; expected "inspected" or "received"`
      );
    }
    const issuedAs = input.asStoreCredit ? 'store_credit' : 'original_payment';
    await tx.returnRequest.update({
      where: { id: ret.id },
      data: {
        status: 'refunded',
        refundedAt: new Date(),
        refundedAmountCents: input.refundAmountCents,
        restockingFeeCents: input.restockingFeeCents ?? null,
        refundIssuedAs: issuedAs,
      },
    });
    // Provider-driven refund settlement (Stripe.refund / store-credit
    // grant) lands with the provider bridge. The record above is the
    // commerce-side state-machine commit.
    refundId = ret.id;
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.return.refunded',
      entityType: 'ReturnRequest',
      entityId: ret.id,
      diff: {
        after: {
          refundAmountCents: input.refundAmountCents,
          issuedAs,
        },
      },
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'return.refunded',
    data: {
      returnId: input.returnId,
      refundAmountCents: input.refundAmountCents,
      asStoreCredit: input.asStoreCredit,
    },
  });

  return { refundId };
}

// ─── helpers ─────────────────────────────────────────────────────────

async function assertReturnWritable(tx: TxClient, returnId: string): Promise<ReturnRequest> {
  const ret = await tx.returnRequest.findFirst({ where: { id: returnId } });
  if (!ret) throw new CommerceNotFoundError('ReturnRequest', returnId);
  if (ret.status === 'cancelled' || ret.status === 'refunded') {
    throw new CommerceConflictError(`Cannot mutate a ${ret.status} return`);
  }
  return ret;
}

function toSummary(
  row: ReturnRequest & { items: ReturnLineItem[] },
  customerId: string | null
): ReturnSummary {
  return {
    id: row.id,
    orderId: row.orderId,
    customerId,
    status: row.status as ReturnStatus,
    preferredOutcome: row.preferredOutcome,
    itemCount: row.items.length,
    requestedAt: row.createdAt.toISOString(),
  };
}
