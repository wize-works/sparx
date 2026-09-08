// discountService — codes, automatic discounts, gift cards, account credit.
// Pricing pipeline applies these on top of the base/price-list resolution
// in pricingService.resolve(); this service owns the CRUD + redemption
// math plus the per-customer / total-usage enforcement.
//
// All writes follow the locked pattern:
//   1. Validate input via @wizeworks/commerce-schemas
//   2. withTenant() transaction with RLS context
//   3. writeAuditLog inside the same transaction
//   4. publishCommerceEvent AFTER commit

import { randomBytes } from 'node:crypto';

import {
  AdjustGiftCardInput,
  CreateDiscountInput,
  type DiscountCondition,
  GrantAccountCreditInput,
  IssueGiftCardInput,
  RedeemDiscountInput,
  RedeemGiftCardInput,
  SpendAccountCreditInput,
  UpdateDiscountInput,
} from '@wizeworks/commerce-schemas';
import { withTenant } from '@wizeworks/db';
import type { Discount, GiftCard, Prisma, TxClient } from '@wizeworks/db';

import { writeAuditLog } from '../audit';
import {
  CommerceConflictError,
  CommerceNotFoundError,
  CommercePricingError,
  CommerceValidationError,
} from '../errors';
import type { ServiceContext } from '../errors';
import { indexCommerceEntity, publishCommerceEvent } from '../events';
import { recomputeCartTotals } from './cart-service';
import { giftCardOnCart, giftCardReservation } from './gift-card-reservation';
import {
  discountWindowState,
  eligibleBaseCents,
  gatherCartFacts,
  refusalReason,
  usageBlock,
} from './discount-conditions';

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
  /** Model B: the sites this offer runs on. EMPTY = every site. */
  propertyIds: string[];
  updatedAt: string;
}

/**
 * Columns the discount list may be ordered by. This is the AUTHORITATIVE
 * whitelist — the api-rest route's Zod enum mirrors it, and nothing outside this
 * set ever reaches an `orderBy`. Sorting lives on the server because the list
 * pages: sorting one loaded page in the client and presenting it as the answer
 * would hand back "the biggest discount" from page 2.
 */
export type DiscountSortField =
  'name' | 'code' | 'status' | 'valueCents' | 'valuePercent' | 'createdAt' | 'updatedAt';

export async function listDiscounts(
  ctx: ServiceContext,
  filter: {
    status?: string;
    q?: string;
    take?: number;
    skip?: number;
    sortBy?: DiscountSortField;
    order?: 'asc' | 'desc';
  } = {}
): Promise<{ items: DiscountRow[]; total: number }> {
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
    // A user sort ends on `id` so paging stays deterministic when the chosen
    // column ties (two discounts of the same value, say). With no sort the list
    // keeps its resolution order — highest priority first, then most recent —
    // which is the order that decides which promotion wins.
    const orderBy: Prisma.DiscountOrderByWithRelationInput[] = filter.sortBy
      ? [{ [filter.sortBy]: filter.order ?? 'asc' }, { id: 'asc' }]
      : [{ priority: 'desc' }, { updatedAt: 'desc' }];
    const [rows, total] = await Promise.all([
      tx.discount.findMany({
        where,
        orderBy,
        include: { siteLinks: { select: { propertyId: true } } },
        take: Math.min(filter.take ?? 50, 250),
        skip: filter.skip ?? 0,
      }),
      tx.discount.count({ where }),
    ]);
    return { items: rows.map(serializeDiscount), total };
  });
}

export async function getDiscount(ctx: ServiceContext, id: string): Promise<DiscountRow> {
  const row = await withTenant(ctx, (tx) =>
    tx.discount.findFirst({
      where: { id, deletedAt: null },
      include: { siteLinks: { select: { propertyId: true } } },
    })
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

    // Model B per-site scoping (docs/131 §4): no rows = the offer runs on every site.
    if (input.propertyIds.length > 0) {
      await tx.discountProperty.createMany({
        data: input.propertyIds.map((propertyId) => ({ propertyId, discountId: created.id })),
        skipDuplicates: true,
      });
    }

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

  await indexCommerceEntity(ctx, 'discount', result.id);

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

    // Model B: the update sends the FULL replacement set — replace when present,
    // leave untouched when omitted.
    if (input.propertyIds !== undefined) {
      await tx.discountProperty.deleteMany({ where: { discountId: id } });
      if (input.propertyIds.length > 0) {
        await tx.discountProperty.createMany({
          data: input.propertyIds.map((propertyId) => ({ propertyId, discountId: id })),
        });
      }
    }

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

  await indexCommerceEntity(ctx, 'discount', id);
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

  await indexCommerceEntity(ctx, 'discount', id, 'delete');
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

  await indexCommerceEntity(ctx, 'discount', id);
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
      // `abandonedAt` deliberately NOT filtered here - see markAbandoned.
      where: { id: input.cartId },
      select: { id: true, customerId: true, channel: true, propertyId: true },
    });
    if (!cart) throw new CommerceNotFoundError('Cart', input.cartId);

    const discount = await tx.discount.findFirst({
      where: {
        code: upper,
        deletedAt: null,
        status: 'active',
        // The promo must be offered ON THIS CART'S SITE (docs/131 §4). No links
        // at all = every site, the ProductProperty convention — so an untargeted
        // discount behaves exactly as it always has. Without this, "20% off
        // donuts" applied at a machine-shop checkout, and the machine shop paid
        // for a promotion it never ran.
        ...(cart.propertyId
          ? {
              OR: [
                { siteLinks: { none: {} } },
                { siteLinks: { some: { propertyId: cart.propertyId } } },
              ],
            }
          : {}),
      },
    });
    if (!discount) {
      // Deliberately the same message as a non-existent code. A code that IS
      // valid on a sibling site must not be distinguishable from one that does
      // not exist, or the error becomes a way to enumerate the other business's
      // active promotions.
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

    // THE CONDITIONS ARE PART OF THE OFFER. They were stored and never read, so
    // "minimum spend $100" applied to a $42 basket and a core-range promotion
    // came off everything. The refusal carries the reason, because a code that
    // just fails tells a shopper nothing about what to do next.
    const conditions = Array.isArray(discount.conditions)
      ? (discount.conditions as unknown as DiscountCondition[])
      : [];
    const facts = await gatherCartFacts(tx, cart, conditions);
    const refusal = refusalReason(conditions, facts);
    if (refusal) throw new CommercePricingError(refusal);

    // Only the qualifying lines, so a restricted offer discounts what it says.
    const appliedDeltaCents = computeDiscountDelta(discount, eligibleBaseCents(conditions, facts));

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

    // Fold it into the cart's money. Without this the row exists, the code
    // shows as accepted, and the shopper is charged the undiscounted total —
    // which is what order O-000006 was: a recorded $6.30 saving, $0.00 off.
    await recomputeCartTotals(tx, ctx, input.cartId);

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
 * Take a code back off a cart, and put the money back.
 *
 * This had no service method at all. The public route deleted the join row
 * directly and left a comment saying "recompute happens lazily on the next cart
 * read" — which nothing does: the serializer returns the STORED
 * `discountTotalCents`. So removing a code made the chip disappear while the
 * saving stayed on the basket, and the shopper checked out still discounted
 * with nothing on screen to say why.
 *
 * Returns how many codes came off, so a caller can tell "removed" from "was
 * not on there".
 */
export async function removeCode(
  ctx: ServiceContext,
  args: { cartId: string; code: string }
): Promise<{ removed: number }> {
  return withTenant(ctx, async (tx) => {
    const { count } = await tx.cartDiscount.deleteMany({
      where: {
        cartId: args.cartId,
        discount: { code: { equals: args.code, mode: 'insensitive' } },
      },
    });
    if (count > 0) await recomputeCartTotals(tx, ctx, args.cartId);
    return { removed: count };
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

/**
 * Give back the code a sale spent, because the sale did not happen.
 *
 * `recordDiscountUsage` above had no counterpart anywhere in the repo — a usage row
 * was written when a cart converted and nothing ever deleted one. So a shopper who
 * cancelled before paying a penny had spent their one use of a sale still running
 * for another month, and were told "You've already used this discount the maximum
 * number of times" about an order that no longer exists (issue 312).
 *
 * WHOLE sales only, and the order's own status is the test rather than anything the
 * caller passes: `cancelled` and `refunded` both mean the shop sold nothing. A
 * PARTIAL refund never reaches either status, so it keeps its usage untouched —
 * that sale stands.
 */
export async function releaseOrderDiscountUsage(
  ctx: ServiceContext,
  input: { orderId: string }
): Promise<{ released: number }> {
  return withTenant(ctx, async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { status: true },
    });
    if (!order) return { released: 0 };
    if (order.status !== 'cancelled' && order.status !== 'refunded') return { released: 0 };

    const rows = await tx.discountUsage.findMany({
      where: { orderId: input.orderId },
      select: { id: true, discountId: true },
    });
    if (rows.length === 0) return { released: 0 };

    await tx.discountUsage.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });

    // Per discount, not per row: one order can carry two codes.
    const perDiscount = new Map<string, number>();
    for (const row of rows) {
      perDiscount.set(row.discountId, (perDiscount.get(row.discountId) ?? 0) + 1);
    }
    for (const [discountId, count] of perDiscount) {
      // Floored, and read-then-set rather than `{ decrement }`: usageCount is a
      // counter kept BESIDE the rows instead of derived from them, so one decrement
      // whose increment went missing would take it negative and lock the code for
      // everybody.
      const current = await tx.discount.findUnique({
        where: { id: discountId },
        select: { usageCount: true },
      });
      await tx.discount.update({
        where: { id: discountId },
        data: { usageCount: Math.max(0, (current?.usageCount ?? 0) - count) },
      });
    }

    return { released: rows.length };
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

/**
 * Columns the gift-card list may be ordered by. The AUTHORITATIVE whitelist,
 * mirrored by the api-rest route's Zod enum. As with discounts, sorting is
 * server-side because the list pages — a client sort of one window is a wrong
 * answer the moment there is a second window.
 */
export type GiftCardSortField =
  'code' | 'balanceCents' | 'initialBalanceCents' | 'status' | 'expiresAt' | 'createdAt';

export async function listGiftCards(
  ctx: ServiceContext,
  filter: {
    status?: string;
    q?: string;
    take?: number;
    skip?: number;
    sortBy?: GiftCardSortField;
    order?: 'asc' | 'desc';
  } = {}
): Promise<{ items: GiftCardSummary[]; total: number }> {
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
    // `id` is the deterministic tiebreaker so a page boundary never repeats or
    // skips a card when the sorted column ties. Default: newest issued first.
    const orderBy: Prisma.GiftCardOrderByWithRelationInput[] = filter.sortBy
      ? [{ [filter.sortBy]: filter.order ?? 'asc' }, { id: 'asc' }]
      : [{ createdAt: 'desc' }, { id: 'asc' }];
    const [rows, total] = await Promise.all([
      tx.giftCard.findMany({
        where,
        orderBy,
        take: Math.min(filter.take ?? 50, 250),
        skip: filter.skip ?? 0,
      }),
      tx.giftCard.count({ where }),
    ]);
    return { items: rows.map(serializeGiftCard), total };
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

export interface GiftCardTransactionRow {
  id: string;
  deltaCents: number;
  reason: string;
  note: string | null;
  orderId: string | null;
  createdAt: string;
}

export interface GiftCardDetail extends GiftCardSummary {
  message: string | null;
  transactions: GiftCardTransactionRow[];
}

/**
 * One gift card in full, WITH its ledger. The balance and every movement are
 * read-only history — a gift card is money, so it is never edited in place; it
 * is adjusted (an audited transaction) through `adjustGiftCard`.
 */
export async function getGiftCard(ctx: ServiceContext, id: string): Promise<GiftCardDetail> {
  const row = await withTenant(ctx, (tx) =>
    tx.giftCard.findFirst({
      where: { id },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 200 } },
    })
  );
  if (!row) throw new CommerceNotFoundError('GiftCard', id);
  return {
    ...serializeGiftCard(row),
    message: row.message,
    transactions: row.transactions.map((t) => ({
      id: t.id,
      deltaCents: t.deltaCents,
      reason: t.reason,
      note: t.note,
      orderId: t.orderId,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

/**
 * Apply a gift card to a basket, so that a shopper can actually spend one.
 *
 * The card is RESERVED here, never debited: `giftCardAppliedCents` on the cart
 * is what the totals subtract, and the balance itself only moves at order
 * placement, through `redeemGiftCard`. That ordering is deliberate — a basket
 * that is abandoned leaves the card whole, so there is no reversal step to get
 * wrong.
 *
 * The reservation is capped at what is actually OWED (lines minus discounts),
 * not at the raw line prices. The old cap read `sumCartLineSubtotals`, which
 * ignores every discount on the basket, so it reserved more of the card than the
 * shopper could possibly spend and then returned that inflated figure to its
 * caller while `recomputeCartTotals` quietly trimmed the stored one.
 */
export async function applyGiftCardToCart(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ code: string; appliedCents: number; remainingBalanceCents: number }> {
  const input = RedeemGiftCardInput.parse(rawInput);
  const upper = input.code.trim().toUpperCase();
  return withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      // `abandonedAt` deliberately NOT filtered here - see markAbandoned.
      where: { id: input.cartId },
      select: { id: true, currency: true },
    });
    if (!cart) throw new CommerceNotFoundError('Cart', input.cartId);

    const card = await tx.giftCard.findFirst({ where: { code: upper } });
    if (!card) throw new CommerceNotFoundError('GiftCard', upper);
    assertGiftCardSpendable(card, cart.currency);

    // Settle the basket first, so the cap below is taken against today's lines
    // and today's discounts rather than whatever was last written.
    await recomputeCartTotals(tx, ctx, input.cartId);
    const settled = await tx.cart.findFirstOrThrow({
      where: { id: input.cartId },
      select: { subtotalCents: true, discountTotalCents: true, pricingTrace: true },
    });

    const appliedCents = giftCardReservation(
      card.balanceCents,
      settled.subtotalCents,
      settled.discountTotalCents
    );
    if (appliedCents <= 0) {
      throw new CommercePricingError('There is nothing left to pay on this basket.');
    }

    // One card per basket (the cart models a single scalar). The id and the code
    // go into pricingTrace because the scalar cannot say WHICH card was used and
    // placement has to debit that exact one. MERGED into the existing trace
    // rather than replacing it — the column belongs to pricing as a whole.
    const trace = (settled.pricingTrace ?? {}) as Prisma.JsonObject;
    await tx.cart.update({
      where: { id: input.cartId },
      data: {
        giftCardAppliedCents: appliedCents,
        pricingTrace: { ...trace, giftCard: { id: card.id, code: card.code, appliedCents } },
      },
    });
    // Fold the reservation into `totalCents`. Without this the scalar moved and
    // nothing added the basket up again, so a shopper applied a card and watched
    // the price not change.
    await recomputeCartTotals(tx, ctx, input.cartId);

    return {
      code: card.code,
      appliedCents,
      remainingBalanceCents: card.balanceCents - appliedCents,
    };
  });
}

/**
 * Take an applied gift card back off a basket.
 *
 * Nothing has been debited at this point, so removing one is only the cart
 * scalar and the trace entry coming off. A shopper who changes their mind has to
 * be able to undo this; a code that can go on and not come off is a trap.
 */
export async function removeGiftCardFromCart(
  ctx: ServiceContext,
  input: { cartId: string }
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: input.cartId },
      select: { id: true, pricingTrace: true },
    });
    if (!cart) throw new CommerceNotFoundError('Cart', input.cartId);
    const trace = { ...((cart.pricingTrace ?? {}) as Prisma.JsonObject) };
    delete trace.giftCard;
    await tx.cart.update({
      where: { id: input.cartId },
      data: { giftCardAppliedCents: 0, pricingTrace: trace },
    });
    await recomputeCartTotals(tx, ctx, input.cartId);
  });
}

// The cap and the trace reader live in ./gift-card-reservation, where they can
// be tested without a database. Re-exported here because this service is where
// callers look for anything to do with a gift card.
export { giftCardOnCart, giftCardReservation };
export type { ReservedGiftCard } from './gift-card-reservation';

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

// ─── Account credit ─────────────────────────────────────────────────────

export interface AccountCreditBalance {
  customerId: string;
  balanceCents: number;
  currency: string;
}

export async function getAccountCreditBalance(
  ctx: ServiceContext,
  customerId: string,
  currency = 'USD'
): Promise<AccountCreditBalance | null> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.accountCredit.findFirst({
      where: { customerId, currency },
    });
    return row
      ? { customerId: row.customerId, balanceCents: row.balanceCents, currency: row.currency }
      : null;
  });
}

export async function listAccountCreditTransactions(
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
    const credit = await tx.accountCredit.findFirst({
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

export async function grantAccountCredit(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ newBalanceCents: number }> {
  const input = GrantAccountCreditInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const credit = await tx.accountCredit.upsert({
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
    await tx.accountCreditTransaction.create({
      data: {
        tenantId: ctx.tenantId,
        accountCreditId: credit.id,
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
      action: 'commerce.accountcredit.granted',
      entityType: 'Customer',
      entityId: input.customerId,
      diff: { after: { amountCents: input.amountCents, reason: input.reason } },
    });
    return credit;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'accountcredit.granted',
    data: {
      customerId: input.customerId,
      amountCents: input.amountCents,
      newBalanceCents: result.balanceCents,
    },
  });

  return { newBalanceCents: result.balanceCents };
}

export async function spendAccountCredit(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ spentCents: number; remainingBalanceCents: number }> {
  const input = SpendAccountCreditInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      // `abandonedAt` deliberately NOT filtered here - see markAbandoned.
      where: { id: input.cartId },
      select: { id: true, currency: true },
    });
    if (!cart) throw new CommerceNotFoundError('Cart', input.cartId);

    const credit = await tx.accountCredit.findFirst({
      where: { customerId: input.customerId, currency: cart.currency },
    });
    if (!credit || credit.balanceCents <= 0) {
      throw new CommercePricingError('No spendable account credit for this customer/currency');
    }

    const cartTotal = await sumCartLineSubtotals(tx, input.cartId);
    const spent = Math.min(credit.balanceCents, input.amountCents, cartTotal);
    if (spent <= 0) return { spentCents: 0, remainingBalanceCents: credit.balanceCents };

    await tx.accountCredit.update({
      where: { id: credit.id },
      data: { balanceCents: { decrement: spent } },
    });
    await tx.accountCreditTransaction.create({
      data: {
        tenantId: ctx.tenantId,
        accountCreditId: credit.id,
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
      topic: 'accountcredit.spent',
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
  // The comparison itself lives in `discountWindowState`, because the cart has to
  // ask the same question again later and the two answers must be one answer.
  const state = discountWindowState(discount, new Date());
  // Said the way `refusalReason` says the others. A shopper who is told a code
  // "is not yet active" has been handed the shop's word for it; she wants to know
  // whether to try again later or give up.
  if (state === 'before') {
    throw new CommercePricingError(
      'This code has not started yet. Try it again once the sale opens.'
    );
  }
  if (state === 'after') {
    throw new CommercePricingError('This sale has ended, so this code no longer works.');
  }
}

async function assertUsageLimit(
  tx: TxClient,
  discount: Discount,
  customerId: string | null
): Promise<void> {
  // The comparison itself is `usageBlock`, shared with the basket, which has to
  // ask the same question every time it is read rather than only when the code
  // was typed. Counted here because this is where the transaction is.
  const used = customerId
    ? await tx.discountUsage.count({ where: { discountId: discount.id, customerId } })
    : null;

  const blocked = usageBlock(discount, used);
  if (blocked === 'total') {
    throw new CommercePricingError(
      `Discount "${discount.code ?? discount.name}" has reached its total usage limit`
    );
  }
  if (blocked === 'customer') {
    throw new CommercePricingError(`You've already used this discount the maximum number of times`);
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

function serializeDiscount(row: Discount & { siteLinks?: { propertyId: string }[] }): DiscountRow {
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
    propertyIds: row.siteLinks?.map((l) => l.propertyId) ?? [],
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
