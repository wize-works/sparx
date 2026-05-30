// subscriptionService — auto-ship / recurring orders. The Sparx side
// owns the schedule shape, the item set, the customer-facing
// pause/skip/cancel surface, and the dunning state machine. Actual
// charges are driven by a SubscriptionBilling provider (Stripe by
// default); the subscription-billing-worker advances the schedule and
// creates a CRM Order on each occurrence.

import { orderService } from '@sparx/crm';
import {
  CancelSubscriptionInput,
  ChangeSubscriptionAddressInput,
  CreateSubscriptionInput,
  PauseSubscriptionInput,
  ResumeSubscriptionInput,
  SkipNextOccurrenceInput,
  type SubscriptionStatus,
  UpdateSubscriptionItemsInput,
  UpdateSubscriptionScheduleInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma, Subscription, SubscriptionItem, TxClient } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

export interface SubscriptionSummary {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  nextOccurrenceAt: string | null;
  itemCount: number;
  monthlyRecurringRevenueCents: number;
  currency: string;
  providerSlug: string;
}

export interface SubscriptionDetail extends SubscriptionSummary {
  intervalUnit: string;
  intervalCount: number;
  deliveriesPerCycle: number;
  trialEndsAt: string | null;
  startedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  pausedUntil: string | null;
  cancelledAt: string | null;
  shippingAddress: unknown;
  billingAddress: unknown;
  items: {
    id: string;
    variantId: string;
    quantity: number;
    unitPriceCents: number;
    addonOfId: string | null;
  }[];
}

// ─── Reads ───────────────────────────────────────────────────────────

export async function list(
  ctx: ServiceContext,
  filter: {
    status?: SubscriptionStatus;
    customerId?: string;
    take?: number;
    skip?: number;
  } = {}
): Promise<{ items: SubscriptionSummary[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const where: Prisma.SubscriptionWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
    };
    const [rows, total] = await Promise.all([
      tx.subscription.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: filter.take ?? 50,
        skip: filter.skip ?? 0,
      }),
      tx.subscription.count({ where }),
    ]);
    return { items: rows.map(toSummary), total };
  });
}

export async function get(
  ctx: ServiceContext,
  subscriptionId: string
): Promise<SubscriptionDetail> {
  const row = await withTenant(ctx, (tx) =>
    tx.subscription.findFirst({
      where: { id: subscriptionId },
      include: { items: true },
    })
  );
  if (!row) throw new CommerceNotFoundError('Subscription', subscriptionId);
  return {
    ...toSummary(row),
    intervalUnit: row.intervalUnit,
    intervalCount: row.intervalCount,
    deliveriesPerCycle: row.deliveriesPerCycle,
    trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    pausedUntil: row.pausedUntil?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    shippingAddress: row.shippingAddress,
    billingAddress: row.billingAddress,
    items: row.items.map((it) => ({
      id: it.id,
      variantId: it.variantId,
      quantity: it.quantity,
      unitPriceCents: it.unitPriceCents,
      addonOfId: it.addonOfId,
    })),
  };
}

export async function listForCustomer(
  ctx: ServiceContext,
  customerId: string
): Promise<SubscriptionSummary[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.subscription.findMany({
      where: { customerId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toSummary);
  });
}

// ─── Create ──────────────────────────────────────────────────────────

export async function create(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string; nextOccurrenceAt: string }> {
  const input = CreateSubscriptionInput.parse(rawInput);

  const startAt = input.startAt ? new Date(input.startAt) : new Date();
  const trialEndsAt =
    input.trialDays != null ? new Date(startAt.getTime() + input.trialDays * 86_400_000) : null;
  const initialStatus: SubscriptionStatus = trialEndsAt ? 'trialing' : 'active';
  const nextOccurrenceAt = computeNextOccurrence(
    trialEndsAt ?? startAt,
    input.schedule.intervalUnit,
    input.schedule.intervalCount
  );

  const result = await withTenant(ctx, async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) throw new CommerceNotFoundError('Customer', input.customerId);

    const sub = await tx.subscription.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        channel: input.channel,
        currency: input.currency,
        status: initialStatus,
        providerSlug: input.paymentProviderSlug,
        intervalUnit: input.schedule.intervalUnit,
        intervalCount: input.schedule.intervalCount,
        deliveriesPerCycle: input.schedule.deliveriesPerCycle,
        anchorDayOfMonth: input.schedule.anchorDayOfMonth ?? null,
        anchorDayOfWeek: input.schedule.anchorDayOfWeek ?? null,
        endAfterOccurrences: input.schedule.endAfterOccurrences ?? null,
        endOnDate: input.schedule.endOnDate ? new Date(input.schedule.endOnDate) : null,
        shippingAddress: input.shippingAddress,
        ...(input.billingAddress !== undefined ? { billingAddress: input.billingAddress } : {}),
        startedAt: startAt,
        trialEndsAt,
        nextOccurrenceAt,
        items: {
          create: input.items.map((it) => ({
            tenantId: ctx.tenantId,
            variantId: it.variantId,
            quantity: it.quantity,
            unitPriceCents: it.unitPriceCents,
            ...(it.configuration ? { configurationPayload: it.configuration } : {}),
            addonOfId: it.addonOfId ?? null,
          })),
        },
      },
      select: { id: true, nextOccurrenceAt: true },
    });

    await tx.subscriptionEvent.create({
      data: {
        tenantId: ctx.tenantId,
        subscriptionId: sub.id,
        event: 'created',
        payload: {
          schedule: input.schedule,
          itemCount: input.items.length,
        },
        actorUserId: ctx.userId ?? null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'customer',
      action: 'commerce.subscription.created',
      entityType: 'Subscription',
      entityId: sub.id,
      diff: { after: { customerId: input.customerId, status: initialStatus } },
    });

    return sub;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'subscription.created',
    data: {
      subscriptionId: result.id,
      customerId: input.customerId,
      providerSlug: input.paymentProviderSlug,
    },
  });

  return {
    id: result.id,
    nextOccurrenceAt: (result.nextOccurrenceAt ?? nextOccurrenceAt).toISOString(),
  };
}

// ─── Mutations ───────────────────────────────────────────────────────

export async function updateItems(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = UpdateSubscriptionItemsInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const sub = await assertSubscription(tx, input.subscriptionId);
    await tx.subscriptionItem.deleteMany({ where: { subscriptionId: sub.id } });
    await tx.subscriptionItem.createMany({
      data: input.items.map((it) => ({
        tenantId: ctx.tenantId,
        subscriptionId: sub.id,
        variantId: it.variantId,
        quantity: it.quantity,
        unitPriceCents: it.unitPriceCents,
        ...(it.configuration ? { configurationPayload: it.configuration } : {}),
        addonOfId: it.addonOfId ?? null,
      })),
    });
    await recordSubscriptionEvent(tx, ctx, sub.id, 'item_changed', { count: input.items.length });
  });
}

export async function updateSchedule(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = UpdateSubscriptionScheduleInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const sub = await assertSubscription(tx, input.subscriptionId);
    const nextOccurrenceAt = computeNextOccurrence(
      new Date(),
      input.schedule.intervalUnit,
      input.schedule.intervalCount
    );
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        intervalUnit: input.schedule.intervalUnit,
        intervalCount: input.schedule.intervalCount,
        deliveriesPerCycle: input.schedule.deliveriesPerCycle,
        anchorDayOfMonth: input.schedule.anchorDayOfMonth ?? null,
        anchorDayOfWeek: input.schedule.anchorDayOfWeek ?? null,
        endAfterOccurrences: input.schedule.endAfterOccurrences ?? null,
        endOnDate: input.schedule.endOnDate ? new Date(input.schedule.endOnDate) : null,
        nextOccurrenceAt,
      },
    });
    await recordSubscriptionEvent(tx, ctx, sub.id, 'item_changed', {
      reason: 'schedule_changed',
      schedule: input.schedule,
    });
  });
}

export async function changeAddress(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = ChangeSubscriptionAddressInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const sub = await assertSubscription(tx, input.subscriptionId);
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        ...(input.shippingAddress !== undefined ? { shippingAddress: input.shippingAddress } : {}),
        ...(input.billingAddress !== undefined ? { billingAddress: input.billingAddress } : {}),
      },
    });
    await recordSubscriptionEvent(tx, ctx, sub.id, 'address_changed', {
      shipping: input.shippingAddress != null,
      billing: input.billingAddress != null,
    });
  });
}

export async function pause(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = PauseSubscriptionInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const sub = await assertSubscription(tx, input.subscriptionId);
    if (sub.status === 'cancelled') {
      throw new CommerceConflictError('Cannot pause a cancelled subscription');
    }
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'paused',
        pausedUntil: input.until ? new Date(input.until) : null,
      },
    });
    await recordSubscriptionEvent(tx, ctx, sub.id, 'paused', {
      until: input.until,
      reason: input.reason,
    });
  });
  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'subscription.paused',
    data: { subscriptionId: input.subscriptionId, until: input.until },
  });
}

export async function resume(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = ResumeSubscriptionInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const sub = await assertSubscription(tx, input.subscriptionId);
    if (sub.status !== 'paused') {
      throw new CommerceConflictError(`Cannot resume a ${sub.status} subscription`);
    }
    const nextOccurrenceAt = computeNextOccurrence(new Date(), sub.intervalUnit, sub.intervalCount);
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: 'active', pausedUntil: null, nextOccurrenceAt },
    });
    await recordSubscriptionEvent(tx, ctx, sub.id, 'resumed', { nextOccurrenceAt });
  });
  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'subscription.resumed',
    data: { subscriptionId: input.subscriptionId },
  });
}

export async function skipNextOccurrence(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = SkipNextOccurrenceInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const sub = await assertSubscription(tx, input.subscriptionId);
    const baseFrom = sub.nextOccurrenceAt ?? new Date();
    const nextOccurrenceAt = computeNextOccurrence(baseFrom, sub.intervalUnit, sub.intervalCount);
    await tx.subscription.update({
      where: { id: sub.id },
      data: { nextOccurrenceAt },
    });
    await recordSubscriptionEvent(tx, ctx, sub.id, 'skipped', {
      skippedFrom: baseFrom.toISOString(),
      reason: input.reason,
    });
  });
}

export async function cancel(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = CancelSubscriptionInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const sub = await assertSubscription(tx, input.subscriptionId);
    if (sub.status === 'cancelled') return;
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        nextOccurrenceAt: input.atPeriodEnd ? sub.nextOccurrenceAt : null,
      },
    });
    await recordSubscriptionEvent(tx, ctx, sub.id, 'cancelled', {
      atPeriodEnd: input.atPeriodEnd,
      reason: input.reason,
    });
  });
  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'subscription.cancelled',
    data: { subscriptionId: input.subscriptionId, atPeriodEnd: input.atPeriodEnd },
  });
}

// ─── Worker entry points ─────────────────────────────────────────────

export async function findDueOccurrences(
  ctx: ServiceContext,
  asOf: string,
  limit: number
): Promise<string[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.subscription.findMany({
      where: {
        status: { in: ['active', 'trialing'] },
        nextOccurrenceAt: { lte: new Date(asOf) },
      },
      orderBy: { nextOccurrenceAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  });
}

/**
 * Generate a renewal order + advance the schedule. Idempotent on
 * subscriptionId — calling twice for the same overdue tick will only
 * produce one renewal order because nextOccurrenceAt advances inside
 * the same transaction that creates the order.
 */
export async function processOccurrence(
  ctx: ServiceContext,
  subscriptionId: string
): Promise<{ orderId: string | null; nextOccurrenceAt: string | null }> {
  let orderId: string | null = null;
  let nextOccurrenceIso: string | null = null;
  let publishRenewal = false;

  await withTenant(ctx, async (tx) => {
    const sub = await tx.subscription.findFirst({
      where: { id: subscriptionId },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });
    if (!sub) throw new CommerceNotFoundError('Subscription', subscriptionId);
    if (sub.status !== 'active' && sub.status !== 'trialing') {
      return; // nothing to do
    }
    if (!sub.nextOccurrenceAt || sub.nextOccurrenceAt.getTime() > Date.now()) {
      return; // not yet due
    }

    const order = await orderService.create(ctx, {
      customerId: sub.customerId,
      channel: 'storefront',
      source: 'subscription_renewal',
      currency: sub.currency,
      shippingAddress: sub.shippingAddress as Parameters<
        typeof orderService.create
      >[1] extends infer A
        ? A
        : never,
      billingAddress: (sub.billingAddress ?? sub.shippingAddress) as Parameters<
        typeof orderService.create
      >[1] extends infer A
        ? A
        : never,
      items: sub.items.map((it) => ({
        productId: it.variant.productId,
        variantId: it.variantId,
        sku: it.variant.sku,
        name: it.variant.product.title,
        quantity: it.quantity,
        unitPrice: it.unitPriceCents / 100,
      })),
      metadata: {
        commerceSubscriptionId: sub.id,
        renewalAt: sub.nextOccurrenceAt.toISOString(),
        providerSlug: sub.providerSlug,
        providerScheduleRef: sub.providerScheduleRef,
      },
    });

    const nextOccurrenceAt = computeNextOccurrence(
      sub.nextOccurrenceAt,
      sub.intervalUnit,
      sub.intervalCount
    );
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'active', // trial converts to active on first renewal
        currentPeriodStart: sub.nextOccurrenceAt,
        currentPeriodEnd: nextOccurrenceAt,
        nextOccurrenceAt,
      },
    });

    await recordSubscriptionEvent(tx, ctx, sub.id, 'renewed', {
      orderId: order.id,
      orderNumber: order.orderNumber,
    });

    orderId = order.id;
    nextOccurrenceIso = nextOccurrenceAt.toISOString();
    publishRenewal = true;
  });

  if (publishRenewal) {
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'subscription.renewed',
      data: { subscriptionId, orderId, nextOccurrenceAt: nextOccurrenceIso },
    });
  }

  return { orderId, nextOccurrenceAt: nextOccurrenceIso };
}

export async function recordDunningAttempt(
  ctx: ServiceContext,
  input: {
    subscriptionId: string;
    paymentRef: string;
    outcome: 'succeeded' | 'failed' | 'retry_scheduled';
    nextRetryAt?: string;
  }
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const priorCount = await tx.dunningAttempt.count({
      where: { subscriptionId: input.subscriptionId },
    });
    await tx.dunningAttempt.create({
      data: {
        tenantId: ctx.tenantId,
        subscriptionId: input.subscriptionId,
        paymentRef: input.paymentRef,
        attemptNumber: priorCount + 1,
        outcome: input.outcome,
        nextRetryAt: input.nextRetryAt ? new Date(input.nextRetryAt) : null,
      },
    });
    if (input.outcome === 'failed') {
      await tx.subscription.update({
        where: { id: input.subscriptionId },
        data: { status: 'past_due' },
      });
    } else if (input.outcome === 'succeeded') {
      await tx.subscription.update({
        where: { id: input.subscriptionId },
        data: { status: 'active' },
      });
    }
  });

  if (input.outcome === 'failed') {
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'subscription.payment_failed',
      data: {
        subscriptionId: input.subscriptionId,
        paymentRef: input.paymentRef,
        nextRetryAt: input.nextRetryAt,
      },
    });
  }
}

// ─── helpers ─────────────────────────────────────────────────────────

async function assertSubscription(tx: TxClient, subscriptionId: string): Promise<Subscription> {
  const sub = await tx.subscription.findFirst({ where: { id: subscriptionId } });
  if (!sub) throw new CommerceNotFoundError('Subscription', subscriptionId);
  return sub;
}

async function recordSubscriptionEvent(
  tx: TxClient,
  ctx: ServiceContext,
  subscriptionId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  await tx.subscriptionEvent.create({
    data: {
      tenantId: ctx.tenantId,
      subscriptionId,
      event,
      payload: payload as Prisma.InputJsonValue,
      actorUserId: ctx.userId ?? null,
    },
  });
}

function computeNextOccurrence(from: Date, unit: string, count: number): Date {
  const next = new Date(from);
  switch (unit) {
    case 'day':
      next.setUTCDate(next.getUTCDate() + count);
      break;
    case 'week':
      next.setUTCDate(next.getUTCDate() + 7 * count);
      break;
    case 'month':
      next.setUTCMonth(next.getUTCMonth() + count);
      break;
    case 'year':
      next.setUTCFullYear(next.getUTCFullYear() + count);
      break;
    default:
      throw new CommerceValidationError(`Unknown interval unit: ${unit}`);
  }
  return next;
}

function toSummary(row: Subscription & { items: SubscriptionItem[] }): SubscriptionSummary {
  // MRR estimate — sum of (unitPriceCents * quantity * deliveriesPerCycle)
  // normalized to a monthly cadence. Keeps the dashboard's MRR strip honest.
  const perCycleCents = row.items.reduce((sum, it) => sum + it.unitPriceCents * it.quantity, 0);
  const monthlyFactor = monthlyFactorFor(row.intervalUnit, row.intervalCount);
  return {
    id: row.id,
    customerId: row.customerId,
    status: row.status as SubscriptionStatus,
    nextOccurrenceAt: row.nextOccurrenceAt?.toISOString() ?? null,
    itemCount: row.items.length,
    monthlyRecurringRevenueCents: Math.round(
      perCycleCents * row.deliveriesPerCycle * monthlyFactor
    ),
    currency: row.currency,
    providerSlug: row.providerSlug,
  };
}

function monthlyFactorFor(unit: string, count: number): number {
  if (count <= 0) return 0;
  switch (unit) {
    case 'day':
      return 30 / count;
    case 'week':
      return 30 / (7 * count);
    case 'month':
      return 1 / count;
    case 'year':
      return 1 / (12 * count);
    default:
      return 0;
  }
}
