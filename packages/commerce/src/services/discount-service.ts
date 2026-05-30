// discountService — codes, automatic discounts, gift cards, store credit.
// Pricing pipeline applies these on top of the base/price-list resolution
// in pricingService.resolve(); this service owns the CRUD + redemption
// math plus the per-customer / total-usage enforcement.
//
// All writes follow the locked pattern:
//   1. Validate input via @sparx/commerce-schemas
//   2. withTenant() transaction with RLS context
//   3. writeAuditLog inside the same transaction
//   4. publishCommerceEvent AFTER commit

import { randomBytes } from 'node:crypto';

import {
  AdjustGiftCardInput,
  CreateDiscountInput,
  type DiscountCondition,
  GrantStoreCreditInput,
  IssueGiftCardInput,
  RedeemDiscountInput,
  RedeemGiftCardInput,
  SpendStoreCreditInput,
  UpdateDiscountInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { Discount, GiftCard, Prisma, TxClient } from '@sparx/db';

import { writeAuditLog } from '../audit';
import {
  CommerceConflictError,
  CommerceNotFoundError,
  CommercePricingError,
  CommerceValidationError,
} from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

// ─── Discounts ────────────────────────────────────────────────────────

export interface DiscountRow {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  type: string;
  scope: string;
  valueCents: number | null;
  valuePercent: number | null;
  currency: string | null;
  conditions: DiscountCondition[];
  startAt: string | null;
  endAt: string | null;
  totalUsageLimit: number | null;
  perCustomerLimit: number;
  stacking: string;
  priority: number;
  status: string;
  usageCount: number;
  updatedAt: string;
}

export async function listDiscounts(
  ctx: ServiceContext,
  filter: { status?: string; q?: string } = {}
): Promise<DiscountRow[]> {
  return withTenant(ctx, async (tx) => {
    const where: Prisma.DiscountWhereInput = {
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q
        ? {
            OR: [
              { code: { contains: filter.q, mode: 'insensitive' } },
              { name: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await tx.discount.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });
    return rows.map(serializeDiscount);
  });
}

export async function getDiscount(ctx: ServiceContext, id: string): Promise<DiscountRow> {
  const row = await withTenant(ctx, (tx) =>
    tx.discount.findFirst({ where: { id, deletedAt: null } })
  );
  if (!row) throw new CommerceNotFoundError('Discount', id);
  return serializeDiscount(row);
}

export async function createDiscount(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string; code: string | null }> {
  const input = CreateDiscountInput.parse(rawInput);
  validateDiscountValueFor(input.type, input.valueCents, input.valuePercent);
  const code = input.code ? input.code.toUpperCase() : null;

  const result = await withTenant(ctx, async (tx) => {
    if (code) {
      const collision = await tx.discount.findFirst({
        where: { code, deletedAt: null },
        select: { id: true },
      });
      if (collision) {
        throw new CommerceConflictError(`Discount code "${code}" is already in use`, 'code');
      }
    }
    const created = await tx.discount.create({
      data: {
        tenantId: ctx.tenantId,
        code,
        name: input.name,
        description: input.description ?? null,
        type: input.type,
        scope: input.scope,
        valueCents: input.valueCents ?? null,
        valuePercent: input.valuePercent ?? null,
        currency: input.currency ?? null,
        conditions: input.conditions,
        startAt: input.startAt ? new Date(input.startAt) : null,
        endAt: input.endAt ? new Date(input.endAt) : null,
        totalUsageLimit: input.totalUsageLimit ?? null,
        perCustomerLimit: input.perCustomerLimit,
        stacking: input.stacking,
        priority: input.priority,
        status: 'draft',
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.discount.created',
      entityType: 'Discount',
      entityId: created.id,
      diff: { after: { name: created.name, code: created.code, type: created.type } },
    });
    return created;
  });
  return { id: result.id, code: result.code };
}

export async function updateDiscount(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown
): Promise<void> {
  const input = UpdateDiscountInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const before = await tx.discount.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new CommerceNotFoundError('Discount', id);

    if (input.code !== undefined) {
      const next = input.code ? input.code.toUpperCase() : null;
      if (next && next !== before.code) {
        const collision = await tx.discount.findFirst({
          where: { code: next, deletedAt: null, NOT: { id } },
          select: { id: true },
        });
        if (collision) {
          throw new CommerceConflictError(`Discount code "${next}" is already in use`, 'code');
        }
      }
    }

    if (input.type !== undefined) {
      validateDiscountValueFor(
        input.type,
        input.valueCents ?? before.valueCents,
        input.valuePercent ?? before.valuePercent
      );
    }

    await tx.discount.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code ? input.code.toUpperCase() : null } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.valueCents !== undefined ? { valueCents: input.valueCents } : {}),
        ...(input.valuePercent !== undefined ? { valuePercent: input.valuePercent } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.conditions !== undefined ? { conditions: input.conditions } : {}),
        ...(input.startAt !== undefined
          ? { startAt: input.startAt ? new Date(input.startAt) : null }
          : {}),
        ...(input.endAt !== undefined ? { endAt: input.endAt ? new Date(input.endAt) : null } : {}),
        ...(input.totalUsageLimit !== undefined ? { totalUsageLimit: input.totalUsageLimit } : {}),
        ...(input.perCustomerLimit !== undefined
          ? { perCustomerLimit: input.perCustomerLimit }
          : {}),
        ...(input.stacking !== undefined ? { stacking: input.stacking } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.discount.updated',
      entityType: 'Discount',
      entityId: id,
      diff: {
        before: serializeDiscount(before) as unknown as Record<string, unknown>,
        after: { status: before.status },
      },
    });
  });
}

export async function archiveDiscount(ctx: ServiceContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.discount.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new CommerceNotFoundError('Discount', id);
    await tx.discount.update({
      where: { id },
      data: { status: 'archived', deletedAt: new Date() },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.discount.archived',
      entityType: 'Discount',
      entityId: id,
      diff: { before: { status: before.status } },
    });
  });
}

export async function activateDiscount(ctx: ServiceContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.discount.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new CommerceNotFoundError('Discount', id);
    if (before.status === 'active') return;
    await tx.discount.update({
      where: { id },
      data: { status: 'active' },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.discount.activated',
      entityType: 'Discount',
      entityId: id,
      diff: { before: { status: before.status }, after: { status: 'active' } },
    });
  });
}

/**
 * Redeem a discount code against a cart. Validates the code, evaluates
 * conditions, enforces totalUsageLimit + perCustomerLimit, applies the
 * matching CartDiscount row, and returns the delta the storefront should
 * surface ("you saved $5.40"). Idempotent on (cartId, discountId).
 */
export async function redeemCode(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ discountId: string; appliedDeltaCents: number }> {
  const input = RedeemDiscountInput.parse(rawInput);
  const upper = input.code.toUpperCase();
  return withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: input.cartId, abandonedAt: null },
      select: { id: true, customerId: true, channel: true },
    });
    if (!cart) throw new CommerceNotFoundError('Cart', input.cartId);

    const discount = await tx.discount.findFirst({
      where: { code: upper, deletedAt: null, status: 'active' },
    });
    if (!discount) {
      throw new CommercePricingError(`No active discount for code "${upper}"`);
    }

    assertWithinWindow(discount);
    await assertUsageLimit(tx, discount, cart.customerId);

    // Idempotent. Re-applying the same code returns the existing row.
    const existing = await tx.cartDiscount.findFirst({
      where: { cartId: input.cartId, discountId: discount.id },
    });
    if (existing) {
      return { discountId: discount.id, appliedDeltaCents: -existing.appliedCents };
    }

    const cartTotalCents = await sumCartLineSubtotals(tx, input.cartId);
    const appliedDeltaCents = computeDiscountDelta(discount, cartTotalCents);

    await tx.cartDiscount.create({
      data: {
        tenantId: ctx.tenantId,
        cartId: input.cartId,
        discountId: discount.id,
        // Schema stores positive applied-cents; the delta surfaced to
        // the caller is signed (negative = savings).
        appliedCents: Math.abs(appliedDeltaCents),
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.discount.applied_to_cart',
      entityType: 'Cart',
      entityId: input.cartId,
      diff: { after: { discountId: discount.id, code: upper, appliedDeltaCents } },
    });

    return { discountId: discount.id, appliedDeltaCents };
  });
}

/**
 * Commit a discount usage row at order placement. Atomically increments
 * Discount.usageCount and writes the DiscountUsage row so future
 * perCustomerLimit/totalUsageLimit checks are accurate.
 */
export async function recordDiscountUsage(
  ctx: ServiceContext,
  input: {
    discountId: string;
    customerId?: string;
    orderId: string;
    cartId?: string;
    appliedCents: number;
  }
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    await tx.discountUsage.create({
      data: {
        tenantId: ctx.tenantId,
        discountId: input.discountId,
        customerId: input.customerId ?? null,
        orderId: input.orderId,
        cartId: input.cartId ?? null,
        appliedCents: input.appliedCents,
      },
    });
    await tx.discount.update({
      where: { id: input.discountId },
      data: { usageCount: { increment: 1 } },
    });
  });
}

// ─── Gift cards ───────────────────────────────────────────────────────

export interface GiftCardSummary {
  id: string;
  code: string;
  balanceCents: number;
  initialBalanceCents: number;
  currency: string;
  status: string;
  expiresAt: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  createdAt: string;
}

export async function issueGiftCard(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string; code: string }> {
  const input = IssueGiftCardInput.parse(rawInput);
  const code = input.customCode?.toUpperCase() ?? generateGiftCardCode();

  const result = await withTenant(ctx, async (tx) => {
    const collision = await tx.giftCard.findFirst({
      where: { code },
      select: { id: true },
    });
    if (collision) {
      throw new CommerceConflictError(`Gift card code "${code}" is already in use`, 'code');
    }

    const card = await tx.giftCard.create({
      data: {
        tenantId: ctx.tenantId,
        code,
        initialBalanceCents: input.initialBalanceCents,
        balanceCents: input.initialBalanceCents,
        currency: input.currency,
        recipientEmail: input.recipientEmail ?? null,
        recipientName: input.recipientName ?? null,
        message: input.message ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        purchasingOrderItemId: input.purchasingOrderItemId ?? null,
      },
    });
    await tx.giftCardTransaction.create({
      data: {
        tenantId: ctx.tenantId,
        giftCardId: card.id,
        deltaCents: input.initialBalanceCents,
        reason: 'issue',
        actorUserId: ctx.userId ?? null,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.giftcard.issued',
      entityType: 'GiftCard',
      entityId: card.id,
      diff: { after: { code, initialBalanceCents: input.initialBalanceCents } },
    });
    return card;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'giftcard.issued',
    data: { giftCardId: result.id, code: result.code, balanceCents: result.balanceCents },
  });

  return { id: result.id, code: result.code };
}

export async function listGiftCards(
  ctx: ServiceContext,
  filter: { status?: string; q?: string; take?: number } = {}
): Promise<GiftCardSummary[]> {
  return withTenant(ctx, async (tx) => {
    const where: Prisma.GiftCardWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q
        ? {
            OR: [
              { code: { contains: filter.q.toUpperCase() } },
              { recipientEmail: { contains: filter.q, mode: 'insensitive' } },
              { recipientName: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await tx.giftCard.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.take ?? 100, 500),
    });
    return rows.map(serializeGiftCard);
  });
}

export async function lookupGiftCard(
  ctx: ServiceContext,
  codeOrId: string
): Promise<GiftCardSummary | null> {
  return withTenant(ctx, async (tx) => {
    const upper = codeOrId.toUpperCase();
    const row = await tx.giftCard.findFirst({
      where: { OR: [{ id: codeOrId }, { code: upper }] },
    });
    return row ? serializeGiftCard(row) : null;
  });
}

/**
 * Apply a gift card to a cart. Reserves the lesser of (cart total, gift
 * card balance) as a CartDiscount with code='giftcard:<id>'. Real
 * balance debit happens at order placement via redeemGiftCard.
 */
export async function applyGiftCardToCart(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ appliedCents: number; remainingBalanceCents: number }> {
  const input = RedeemGiftCardInput.parse(rawInput);
  const upper = input.code.toUpperCase();
  return withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: input.cartId, abandonedAt: null },
      select: { id: true, currency: true },
    });
    if (!cart) throw new CommerceNotFoundError('Cart', input.cartId);

    const card = await tx.giftCard.findFirst({ where: { code: upper } });
    if (!card) throw new CommerceNotFoundError('GiftCard', upper);
    assertGiftCardSpendable(card, cart.currency);

    const cartTotal = await sumCartLineSubtotals(tx, input.cartId);
    const appliedCents = Math.min(card.balanceCents, cartTotal);

    // Stored on the cart as a scalar — the Phase 3 cart models one
    // applied gift card. Multi-card support lands when a merchant
    // actually asks for it. The card id is recorded in pricingTrace so
    // the storefront can render it; the actual balance debit happens at
    // order placement via redeemGiftCard.
    await tx.cart.update({
      where: { id: input.cartId },
      data: {
        giftCardAppliedCents: appliedCents,
        pricingTrace: {
          giftCard: { id: card.id, code: card.code, appliedCents },
        },
      },
    });

    return {
      appliedCents,
      remainingBalanceCents: card.balanceCents - appliedCents,
    };
  });
}

/**
 * Debit a gift card. Called from checkout on order placement (NOT from
 * cart application). Atomically decrements balanceCents, writes a
 * redeem transaction, and updates status='spent' when balance hits 0.
 */
export async function redeemGiftCard(
  ctx: ServiceContext,
  input: { giftCardId: string; deltaCents: number; orderId: string }
): Promise<{ remainingBalanceCents: number }> {
  if (input.deltaCents <= 0) {
    throw new CommerceValidationError('redeemGiftCard delta must be positive');
  }
  return withTenant(ctx, async (tx) => {
    const card = await tx.giftCard.findFirst({ where: { id: input.giftCardId } });
    if (!card) throw new CommerceNotFoundError('GiftCard', input.giftCardId);
    assertGiftCardSpendable(card, card.currency);
    if (card.balanceCents < input.deltaCents) {
      throw new CommercePricingError(
        `Gift card balance (${card.balanceCents}) is less than requested (${input.deltaCents})`
      );
    }
    const newBalance = card.balanceCents - input.deltaCents;
    await tx.giftCard.update({
      where: { id: input.giftCardId },
      data: {
        balanceCents: newBalance,
        status: newBalance === 0 ? 'spent' : card.status,
      },
    });
    await tx.giftCardTransaction.create({
      data: {
        tenantId: ctx.tenantId,
        giftCardId: input.giftCardId,
        deltaCents: -input.deltaCents,
        reason: 'redeem',
        orderId: input.orderId,
        actorUserId: ctx.userId ?? null,
      },
    });
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'giftcard.redeemed',
      data: {
        giftCardId: input.giftCardId,
        orderId: input.orderId,
        appliedCents: input.deltaCents,
        remainingBalanceCents: newBalance,
      },
    });
    return { remainingBalanceCents: newBalance };
  });
}

export async function adjustGiftCard(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ newBalanceCents: number }> {
  const input = AdjustGiftCardInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const card = await tx.giftCard.findFirst({ where: { id: input.giftCardId } });
    if (!card) throw new CommerceNotFoundError('GiftCard', input.giftCardId);
    const newBalance = card.balanceCents + input.deltaCents;
    if (newBalance < 0) {
      throw new CommerceValidationError('Adjustment would drive gift card balance below zero');
    }
    await tx.giftCard.update({
      where: { id: input.giftCardId },
      data: {
        balanceCents: newBalance,
        status: newBalance === 0 ? 'spent' : card.status === 'spent' ? 'active' : card.status,
      },
    });
    await tx.giftCardTransaction.create({
      data: {
        tenantId: ctx.tenantId,
        giftCardId: input.giftCardId,
        deltaCents: input.deltaCents,
        reason: 'adjust',
        note: input.reason,
        actorUserId: ctx.userId ?? null,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.giftcard.adjusted',
      entityType: 'GiftCard',
      entityId: input.giftCardId,
      diff: {
        before: { balanceCents: card.balanceCents },
        after: { balanceCents: newBalance, reason: input.reason },
      },
    });
    return { newBalanceCents: newBalance };
  });
}

// ─── Store credit ─────────────────────────────────────────────────────

export interface StoreCreditBalance {
  customerId: string;
  balanceCents: number;
  currency: string;
}

export async function getStoreCreditBalance(
  ctx: ServiceContext,
  customerId: string,
  currency = 'USD'
): Promise<StoreCreditBalance | null> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.storeCredit.findFirst({
      where: { customerId, currency },
    });
    return row
      ? { customerId: row.customerId, balanceCents: row.balanceCents, currency: row.currency }
      : null;
  });
}

export async function listStoreCreditTransactions(
  ctx: ServiceContext,
  customerId: string,
  currency = 'USD'
): Promise<
  {
    id: string;
    deltaCents: number;
    reason: string;
    referenceType: string | null;
    referenceId: string | null;
    note: string | null;
    createdAt: string;
  }[]
> {
  return withTenant(ctx, async (tx) => {
    const credit = await tx.storeCredit.findFirst({
      where: { customerId, currency },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 200,
        },
      },
    });
    if (!credit) return [];
    return credit.transactions.map((t) => ({
      id: t.id,
      deltaCents: t.deltaCents,
      reason: t.reason,
      referenceType: t.referenceType,
      referenceId: t.referenceId,
      note: t.note,
      createdAt: t.createdAt.toISOString(),
    }));
  });
}

export async function grantStoreCredit(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ newBalanceCents: number }> {
  const input = GrantStoreCreditInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const credit = await tx.storeCredit.upsert({
      where: {
        tenantId_customerId_currency: {
          tenantId: ctx.tenantId,
          customerId: input.customerId,
          currency: input.currency,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        customerId: input.customerId,
        currency: input.currency,
        balanceCents: input.amountCents,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
      update: {
        balanceCents: { increment: input.amountCents },
        ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}),
      },
    });
    await tx.storeCreditTransaction.create({
      data: {
        tenantId: ctx.tenantId,
        storeCreditId: credit.id,
        deltaCents: input.amountCents,
        reason: input.reason,
        note: input.note ?? null,
        actorUserId: ctx.userId ?? null,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.storecredit.granted',
      entityType: 'Customer',
      entityId: input.customerId,
      diff: { after: { amountCents: input.amountCents, reason: input.reason } },
    });
    return credit;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'storecredit.granted',
    data: {
      customerId: input.customerId,
      amountCents: input.amountCents,
      newBalanceCents: result.balanceCents,
    },
  });

  return { newBalanceCents: result.balanceCents };
}

export async function spendStoreCredit(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ spentCents: number; remainingBalanceCents: number }> {
  const input = SpendStoreCreditInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: input.cartId, abandonedAt: null },
      select: { id: true, currency: true },
    });
    if (!cart) throw new CommerceNotFoundError('Cart', input.cartId);

    const credit = await tx.storeCredit.findFirst({
      where: { customerId: input.customerId, currency: cart.currency },
    });
    if (!credit || credit.balanceCents <= 0) {
      throw new CommercePricingError('No spendable store credit for this customer/currency');
    }

    const cartTotal = await sumCartLineSubtotals(tx, input.cartId);
    const spent = Math.min(credit.balanceCents, input.amountCents, cartTotal);
    if (spent <= 0) return { spentCents: 0, remainingBalanceCents: credit.balanceCents };

    await tx.storeCredit.update({
      where: { id: credit.id },
      data: { balanceCents: { decrement: spent } },
    });
    await tx.storeCreditTransaction.create({
      data: {
        tenantId: ctx.tenantId,
        storeCreditId: credit.id,
        deltaCents: -spent,
        reason: 'spend',
        referenceType: 'Cart',
        referenceId: input.cartId,
        actorUserId: ctx.userId ?? null,
      },
    });
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'storecredit.spent',
      data: {
        customerId: input.customerId,
        cartId: input.cartId,
        spentCents: spent,
        remainingBalanceCents: credit.balanceCents - spent,
      },
    });
    return { spentCents: spent, remainingBalanceCents: credit.balanceCents - spent };
  });
}

// ─── Validation + condition evaluation ────────────────────────────────

function validateDiscountValueFor(
  type: string,
  valueCents: number | null | undefined,
  valuePercent: number | null | undefined
): void {
  if (type === 'percent' && (valuePercent === null || valuePercent === undefined)) {
    throw new CommerceValidationError('percent discount requires valuePercent', [
      { field: 'valuePercent', message: 'Required when type=percent' },
    ]);
  }
  if (type === 'fixed' && (valueCents === null || valueCents === undefined)) {
    throw new CommerceValidationError('fixed discount requires valueCents', [
      { field: 'valueCents', message: 'Required when type=fixed' },
    ]);
  }
}

function assertWithinWindow(discount: Discount): void {
  const now = new Date();
  if (discount.startAt && discount.startAt > now) {
    throw new CommercePricingError(
      `Discount "${discount.code ?? discount.name}" is not yet active`
    );
  }
  if (discount.endAt && discount.endAt < now) {
    throw new CommercePricingError(`Discount "${discount.code ?? discount.name}" has expired`);
  }
}

async function assertUsageLimit(
  tx: TxClient,
  discount: Discount,
  customerId: string | null
): Promise<void> {
  if (discount.totalUsageLimit !== null && discount.usageCount >= discount.totalUsageLimit) {
    throw new CommercePricingError(
      `Discount "${discount.code ?? discount.name}" has reached its total usage limit`
    );
  }
  if (customerId) {
    const used = await tx.discountUsage.count({
      where: { discountId: discount.id, customerId },
    });
    if (used >= discount.perCustomerLimit) {
      throw new CommercePricingError(
        `You've already used this discount the maximum number of times`
      );
    }
  }
}

function computeDiscountDelta(discount: Discount, baseCents: number): number {
  if (discount.type === 'percent' && discount.valuePercent !== null) {
    return -Math.round(baseCents * (discount.valuePercent / 100));
  }
  if (discount.type === 'fixed' && discount.valueCents !== null) {
    return -Math.min(discount.valueCents, baseCents);
  }
  if (discount.type === 'free_shipping') {
    // Storefront/checkout pipeline knows to zero shipping when this row
    // is present. We record a 0 delta here; the actual savings appear in
    // the shipping line.
    return 0;
  }
  // buy_x_get_y and bundle are evaluated by the cart pricing pipeline
  // because they need per-line context.
  return 0;
}

async function sumCartLineSubtotals(tx: TxClient, cartId: string): Promise<number> {
  const items = await tx.cartItem.findMany({
    where: { cartId },
    select: { quantity: true, variant: { select: { priceCents: true } } },
  });
  return items.reduce((acc, i) => acc + i.quantity * i.variant.priceCents, 0);
}

function assertGiftCardSpendable(card: GiftCard, expectedCurrency: string): void {
  if (card.status !== 'active') {
    throw new CommercePricingError(`Gift card is ${card.status}`);
  }
  if (card.expiresAt && card.expiresAt < new Date()) {
    throw new CommercePricingError('Gift card has expired');
  }
  if (card.currency !== expectedCurrency) {
    throw new CommercePricingError(
      `Gift card currency (${card.currency}) does not match cart (${expectedCurrency})`
    );
  }
  if (card.balanceCents <= 0) {
    throw new CommercePricingError('Gift card has no remaining balance');
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function generateGiftCardCode(): string {
  // 16-char alphanumeric, hyphen-separated for readability ("ABCD-EFGH-IJKL-MNOP").
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(16);
  const chars: string[] = [];
  for (let i = 0; i < 16; i++) {
    chars.push(ALPHABET[bytes[i]! % ALPHABET.length]!);
  }
  return [
    chars.slice(0, 4).join(''),
    chars.slice(4, 8).join(''),
    chars.slice(8, 12).join(''),
    chars.slice(12, 16).join(''),
  ].join('-');
}

function serializeDiscount(row: Discount): DiscountRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    type: row.type,
    scope: row.scope,
    valueCents: row.valueCents,
    valuePercent: row.valuePercent,
    currency: row.currency,
    conditions: Array.isArray(row.conditions)
      ? (row.conditions as unknown as DiscountCondition[])
      : [],
    startAt: row.startAt?.toISOString() ?? null,
    endAt: row.endAt?.toISOString() ?? null,
    totalUsageLimit: row.totalUsageLimit,
    perCustomerLimit: row.perCustomerLimit,
    stacking: row.stacking,
    priority: row.priority,
    status: row.status,
    usageCount: row.usageCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeGiftCard(row: GiftCard): GiftCardSummary {
  return {
    id: row.id,
    code: row.code,
    balanceCents: row.balanceCents,
    initialBalanceCents: row.initialBalanceCents,
    currency: row.currency,
    status: row.status,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    recipientEmail: row.recipientEmail,
    recipientName: row.recipientName,
    createdAt: row.createdAt.toISOString(),
  };
}
