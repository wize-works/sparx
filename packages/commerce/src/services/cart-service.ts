// cartService — cart CRUD + line management + merge + abandonment.
//
// Storefront and B2B portal write through this service; never directly
// to Prisma. Every mutation goes through:
//
//   1. Validate input via @sparx/commerce-schemas
//   2. withTenant() transaction with RLS context
//   3. writeAuditLog inside the same transaction
//   4. Recompute cached totals on the cart row
//   5. (post-commit) publish a cart.* event
//
// Pricing math defers to pricingService.resolve(); discount + gift-card
// + store-credit application defers to discountService. This file is the
// orchestrator only.

import {
  AddCartItemInput,
  type CartItemSnapshot,
  type CartTotals,
  type CartItemAttributes,
  type ResolvedConfiguration,
  CreateCartInput,
  MergeCartsInput,
  UpdateCartItemInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma, TxClient } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

import * as configuratorService from './configurator-service';
import * as pricingService from './pricing-service';

const DEFAULT_CART_TTL_MIN = 60 * 24 * 14; // 14 days

export interface CartSnapshot {
  cartId: string;
  customerId: string | null;
  channel: string;
  currency: string;
  items: CartItemSnapshot[];
  appliedDiscountCodes: string[];
  appliedGiftCardCodes: string[];
  storeCreditAppliedCents: number;
  totals: CartTotals;
  expiresAt: string;
  abandonedAt: string | null;
}

// ─── create ──────────────────────────────────────────────────────────

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<{ cartId: string }> {
  const input = CreateCartInput.parse(rawInput);
  if (!input.customerId && !input.guestToken) {
    throw new CommerceValidationError('Either customerId or guestToken is required');
  }

  const result = await withTenant(ctx, async (tx) => {
    const expiresAt = new Date(Date.now() + DEFAULT_CART_TTL_MIN * 60_000);
    const cart = await tx.cart.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: input.customerId ?? null,
        guestToken: input.guestToken ?? null,
        channel: input.channel,
        currency: input.currency,
        fromQuoteId: input.fromQuoteId ?? null,
        fromSubscriptionId: input.fromSubscriptionId ?? null,
        expiresAt,
      },
      select: { id: true },
    });

    // Bootstrap lines from a quote when carried over (B2B path).
    if (input.fromQuoteId) {
      await bootstrapFromQuote(tx, ctx, cart.id, input.fromQuoteId);
      await recomputeTotals(tx, ctx, cart.id);
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.cart.created',
      entityType: 'Cart',
      entityId: cart.id,
      diff: { after: { channel: input.channel, currency: input.currency } },
    });

    return cart.id;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'cart.created',
    data: { cartId: result, channel: input.channel, currency: input.currency },
  });

  return { cartId: result };
}

// ─── reads ───────────────────────────────────────────────────────────

export async function get(ctx: ServiceContext, cartId: string): Promise<CartSnapshot | null> {
  return withTenant(ctx, async (tx) => {
    const row = await loadCart(tx, cartId);
    return row ? serializeCart(row) : null;
  });
}

export async function getByGuestToken(
  ctx: ServiceContext,
  guestToken: string
): Promise<CartSnapshot | null> {
  return withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { guestToken, abandonedAt: null, customerId: null },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (!cart) return null;
    const full = await loadCart(tx, cart.id);
    return full ? serializeCart(full) : null;
  });
}

// ─── line items ──────────────────────────────────────────────────────

export async function addItem(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ cartItemId: string }> {
  const input = AddCartItemInput.parse(rawInput);

  const cartItemId = await withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: input.cartId, abandonedAt: null },
      select: {
        id: true,
        channel: true,
        currency: true,
        customerId: true,
        customer: { select: { b2bAccountId: true } },
      },
    });
    if (!cart) throw new CommerceNotFoundError('Cart', input.cartId);

    let variantId = input.variantId;
    let resolvedConfig: ResolvedConfiguration | null = null;
    let configurationPayload: Prisma.InputJsonValue | undefined;

    if (input.configuration) {
      // Re-resolve through the configurator engine so we trust the
      // server's view of price + add-ons, never the client's payload.
      const resolved = await configuratorService.resolve(ctx, {
        templateId: input.configuration.templateId,
        selections: input.configuration.selections,
      });
      if (resolved.errors.length > 0) {
        throw new CommerceValidationError(
          `Configurator rejected the selection: ${resolved.errors.join('; ')}`
        );
      }
      resolvedConfig = resolved;
      if (resolved.resolvedVariantId) {
        variantId = resolved.resolvedVariantId;
      }
      configurationPayload = {
        templateId: resolved.templateId,
        resolvedSku: resolved.resolvedSku,
        resolvedVariantId: resolved.resolvedVariantId,
        resolvedComponentVariantIds: resolved.resolvedComponentVariantIds,
        addOnLines: resolved.addOnLines,
        basePriceCents: resolved.basePriceCents,
        totalAdjustmentCents: resolved.totalAdjustmentCents,
        selectionsEcho: input.configuration.selections,
      };
    }

    const priced = await pricingService.resolve(ctx, {
      variantId,
      quantity: input.quantity,
      channel: cart.channel as 'storefront' | 'b2b_portal' | 'admin' | 'subscription',
      currency: cart.currency,
      customerId: cart.customerId ?? undefined,
      b2bAccountId: cart.customer?.b2bAccountId ?? undefined,
      customerSegmentIds: [],
    });

    // Configurator price adjustments are layered on top of the resolved
    // base variant price. We trust the configurator's adjustment because
    // its rule engine already validated against the option matrix.
    let unitPriceCents = priced.unitPriceCents;
    if (resolvedConfig) {
      unitPriceCents = Math.max(0, unitPriceCents + resolvedConfig.totalAdjustmentCents);
    }
    const subtotalCents = unitPriceCents * input.quantity;

    const item = await tx.cartItem.create({
      data: {
        tenantId: ctx.tenantId,
        cartId: input.cartId,
        variantId,
        quantity: input.quantity,
        unitPriceCents,
        subtotalCents,
        ...(configurationPayload ? { configurationPayload } : {}),
        attributes: serializeAttributes(input.attributes),
        unitPriceTrace: priced.trace,
      },
      select: { id: true },
    });

    await recomputeTotals(tx, ctx, input.cartId);

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'customer',
      action: 'commerce.cart.item_added',
      entityType: 'Cart',
      entityId: input.cartId,
      diff: { after: { cartItemId: item.id, variantId, quantity: input.quantity } },
    });

    return item.id;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'cart.updated',
    data: { cartId: input.cartId, reason: 'item_added', cartItemId },
  });

  return { cartItemId };
}

export async function updateItem(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = UpdateCartItemInput.parse(rawInput);

  const cartId = await withTenant(ctx, async (tx) => {
    const item = await tx.cartItem.findFirst({
      where: { id: input.cartItemId },
      select: { id: true, cartId: true, variantId: true, unitPriceCents: true },
    });
    if (!item) throw new CommerceNotFoundError('CartItem', input.cartItemId);

    if (input.quantity === 0) {
      await tx.cartItem.delete({ where: { id: input.cartItemId } });
    } else {
      await tx.cartItem.update({
        where: { id: input.cartItemId },
        data: {
          quantity: input.quantity,
          subtotalCents: item.unitPriceCents * input.quantity,
          ...(input.attributes ? { attributes: serializeAttributes(input.attributes) } : {}),
        },
      });
    }

    await recomputeTotals(tx, ctx, item.cartId);

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'customer',
      action: input.quantity === 0 ? 'commerce.cart.item_removed' : 'commerce.cart.item_updated',
      entityType: 'Cart',
      entityId: item.cartId,
      diff: { after: { cartItemId: input.cartItemId, quantity: input.quantity } },
    });

    return item.cartId;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'cart.updated',
    data: { cartId, reason: 'item_updated', cartItemId: input.cartItemId },
  });
}

export async function removeItem(ctx: ServiceContext, cartItemId: string): Promise<void> {
  await updateItem(ctx, { cartItemId, quantity: 0 });
}

export async function clear(ctx: ServiceContext, cartId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({ where: { id: cartId }, select: { id: true } });
    if (!cart) throw new CommerceNotFoundError('Cart', cartId);
    await tx.cartItem.deleteMany({ where: { cartId } });
    await tx.cartDiscount.deleteMany({ where: { cartId } });
    await tx.cart.update({
      where: { id: cartId },
      data: {
        subtotalCents: 0,
        discountTotalCents: 0,
        shippingTotalCents: 0,
        taxTotalCents: 0,
        giftCardAppliedCents: 0,
        storeCreditAppliedCents: 0,
        totalCents: 0,
        pricingTrace: {},
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'customer',
      action: 'commerce.cart.cleared',
      entityType: 'Cart',
      entityId: cartId,
      diff: null,
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'cart.updated',
    data: { cartId, reason: 'cleared' },
  });
}

// ─── merge ───────────────────────────────────────────────────────────

export async function merge(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ mergedCartId: string }> {
  const input = MergeCartsInput.parse(rawInput);
  if (input.sourceCartId === input.targetCartId) {
    throw new CommerceValidationError('sourceCartId and targetCartId must differ');
  }

  await withTenant(ctx, async (tx) => {
    const [source, target] = await Promise.all([
      tx.cart.findFirst({
        where: { id: input.sourceCartId },
        include: { items: true },
      }),
      tx.cart.findFirst({
        where: { id: input.targetCartId },
        include: { items: true },
      }),
    ]);
    if (!source) throw new CommerceNotFoundError('Cart', input.sourceCartId);
    if (!target) throw new CommerceNotFoundError('Cart', input.targetCartId);
    if (source.currency !== target.currency) {
      throw new CommerceValidationError(
        `Cannot merge carts in different currencies (${source.currency} vs ${target.currency})`
      );
    }

    const targetByVariant = new Map(target.items.map((it) => [it.variantId, it]));

    for (const srcItem of source.items) {
      const existing = targetByVariant.get(srcItem.variantId);
      if (!existing) {
        await tx.cartItem.create({
          data: {
            tenantId: ctx.tenantId,
            cartId: target.id,
            variantId: srcItem.variantId,
            quantity: srcItem.quantity,
            unitPriceCents: srcItem.unitPriceCents,
            subtotalCents: srcItem.subtotalCents,
            ...(srcItem.configurationPayload !== null
              ? {
                  configurationPayload: srcItem.configurationPayload,
                }
              : {}),
            attributes: srcItem.attributes as Prisma.InputJsonValue,
            unitPriceTrace: srcItem.unitPriceTrace as Prisma.InputJsonValue,
          },
        });
        continue;
      }
      let nextQty = existing.quantity;
      if (input.conflictPolicy === 'sum_quantities') nextQty = existing.quantity + srcItem.quantity;
      else if (input.conflictPolicy === 'prefer_source') nextQty = srcItem.quantity;
      // 'prefer_target' keeps existing.quantity unchanged.
      await tx.cartItem.update({
        where: { id: existing.id },
        data: {
          quantity: nextQty,
          subtotalCents: existing.unitPriceCents * nextQty,
        },
      });
    }

    // Source cart's items moved; delete the source so future lookups
    // can't re-merge it.
    await tx.cartItem.deleteMany({ where: { cartId: source.id } });
    await tx.cartDiscount.deleteMany({ where: { cartId: source.id } });
    await tx.cart.delete({ where: { id: source.id } });

    await recomputeTotals(tx, ctx, target.id);

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.cart.merged',
      entityType: 'Cart',
      entityId: target.id,
      diff: {
        after: {
          sourceCartId: source.id,
          conflictPolicy: input.conflictPolicy,
          itemsMoved: source.items.length,
        },
      },
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'cart.updated',
    data: { cartId: input.targetCartId, reason: 'merged', sourceCartId: input.sourceCartId },
  });

  return { mergedCartId: input.targetCartId };
}

// ─── abandonment lifecycle ───────────────────────────────────────────

export async function markAbandoned(ctx: ServiceContext, cartId: string): Promise<void> {
  const now = new Date();
  await withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: cartId, abandonedAt: null },
      select: { id: true },
    });
    if (!cart) return;
    await tx.cart.update({ where: { id: cartId }, data: { abandonedAt: now } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'system',
      action: 'commerce.cart.abandoned',
      entityType: 'Cart',
      entityId: cartId,
      diff: null,
    });
  });
  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'cart.abandoned',
    data: { cartId, abandonedAt: now.toISOString() },
  });
}

export async function markRecovered(ctx: ServiceContext, cartId: string): Promise<void> {
  const now = new Date();
  await withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: cartId },
      select: { id: true, abandonedAt: true },
    });
    if (!cart?.abandonedAt) return;
    await tx.cart.update({
      where: { id: cartId },
      data: { recoveredAt: now, abandonedAt: null },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'customer',
      action: 'commerce.cart.recovered',
      entityType: 'Cart',
      entityId: cartId,
      diff: null,
    });
  });
  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'cart.recovered',
    data: { cartId, recoveredAt: now.toISOString() },
  });
}

/** Worker sweep — returns cart ids that have been idle longer than
 *  `cutoffMinutes` and are eligible to be marked abandoned. */
export async function findIdleCarts(ctx: ServiceContext, cutoffMinutes: number): Promise<string[]> {
  if (cutoffMinutes <= 0) return [];
  const cutoff = new Date(Date.now() - cutoffMinutes * 60_000);
  return withTenant(ctx, async (tx) => {
    const rows = await tx.cart.findMany({
      where: {
        abandonedAt: null,
        recoveredAt: null,
        updatedAt: { lt: cutoff },
        items: { some: {} },
      },
      orderBy: { updatedAt: 'asc' },
      take: 500,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  });
}

// ─── helpers ─────────────────────────────────────────────────────────

type CartWithRelations = Prisma.CartGetPayload<{
  include: {
    items: { include: { variant: { include: { product: true } } } };
    discounts: { include: { discount: { select: { code: true } } } };
  };
}>;

async function loadCart(tx: TxClient, cartId: string): Promise<CartWithRelations | null> {
  return tx.cart.findFirst({
    where: { id: cartId },
    include: {
      items: { include: { variant: { include: { product: true } } } },
      discounts: { include: { discount: { select: { code: true } } } },
    },
  });
}

async function recomputeTotals(tx: TxClient, _ctx: ServiceContext, cartId: string): Promise<void> {
  const items = await tx.cartItem.findMany({
    where: { cartId },
    select: { subtotalCents: true },
  });
  const subtotal = items.reduce((sum, i) => sum + i.subtotalCents, 0);

  const discounts = await tx.cartDiscount.findMany({
    where: { cartId },
    select: { appliedCents: true },
  });
  const discountTotal = discounts.reduce((sum, d) => sum + d.appliedCents, 0);

  // Gift card + store credit applied amounts are owned by the discount
  // service; we only re-cap them against the new subtotal so a cart
  // shrink can't leave an over-applied balance dangling.
  const current = await tx.cart.findFirstOrThrow({
    where: { id: cartId },
    select: {
      giftCardAppliedCents: true,
      storeCreditAppliedCents: true,
      shippingTotalCents: true,
      taxTotalCents: true,
    },
  });

  const postDiscount = Math.max(0, subtotal - discountTotal);
  const giftCardApplied = Math.min(current.giftCardAppliedCents, postDiscount);
  const afterGc = Math.max(0, postDiscount - giftCardApplied);
  const storeCreditApplied = Math.min(current.storeCreditAppliedCents, afterGc);

  const total = Math.max(
    0,
    postDiscount -
      giftCardApplied -
      storeCreditApplied +
      current.shippingTotalCents +
      current.taxTotalCents
  );

  await tx.cart.update({
    where: { id: cartId },
    data: {
      subtotalCents: subtotal,
      discountTotalCents: discountTotal,
      giftCardAppliedCents: giftCardApplied,
      storeCreditAppliedCents: storeCreditApplied,
      totalCents: total,
    },
  });
}

async function bootstrapFromQuote(
  tx: TxClient,
  ctx: ServiceContext,
  cartId: string,
  quoteId: string
): Promise<void> {
  const quote = await tx.quote.findFirst({
    where: { id: quoteId },
    include: { items: true },
  });
  if (!quote) throw new CommerceNotFoundError('Quote', quoteId);

  for (const line of quote.items) {
    if (!line.variantId) continue;
    // Quote stores prices as Decimal(12,2); convert to integer cents
    // so the cart contract (always integer cents) stays consistent.
    const unitPriceCents = Math.round(line.unitPrice.toNumber() * 100);
    await tx.cartItem.create({
      data: {
        tenantId: ctx.tenantId,
        cartId,
        variantId: line.variantId,
        quantity: line.quantity,
        unitPriceCents,
        subtotalCents: unitPriceCents * line.quantity,
        attributes: {},
      },
    });
  }
}

function serializeAttributes(attributes: CartItemAttributes | undefined): Prisma.InputJsonValue {
  if (!attributes) return {};
  return attributes;
}

function serializeCart(row: CartWithRelations): CartSnapshot {
  const items: CartItemSnapshot[] = row.items.map((it) => ({
    cartItemId: it.id,
    variantId: it.variantId,
    productId: it.variant.productId,
    sku: it.variant.sku,
    name: it.variant.product.title,
    quantity: it.quantity,
    unitPriceCents: it.unitPriceCents,
    subtotalCents: it.subtotalCents,
    configuration:
      it.configurationPayload && typeof it.configurationPayload === 'object'
        ? (it.configurationPayload as unknown as ResolvedConfiguration)
        : undefined,
    attributes:
      it.attributes && typeof it.attributes === 'object'
        ? (it.attributes as unknown as CartItemAttributes)
        : undefined,
    unitPriceTrace: Array.isArray(it.unitPriceTrace)
      ? (it.unitPriceTrace as CartItemSnapshot['unitPriceTrace'])
      : [],
  }));

  return {
    cartId: row.id,
    customerId: row.customerId,
    channel: row.channel,
    currency: row.currency,
    items,
    appliedDiscountCodes: row.discounts.map((d) => d.discount.code ?? '').filter(Boolean),
    appliedGiftCardCodes: [],
    storeCreditAppliedCents: row.storeCreditAppliedCents,
    totals: {
      subtotalCents: row.subtotalCents,
      discountTotalCents: row.discountTotalCents,
      shippingTotalCents: row.shippingTotalCents,
      taxTotalCents: row.taxTotalCents,
      giftCardAppliedCents: row.giftCardAppliedCents,
      storeCreditAppliedCents: row.storeCreditAppliedCents,
      totalCents: row.totalCents,
    },
    expiresAt: row.expiresAt?.toISOString() ?? '',
    abandonedAt: row.abandonedAt?.toISOString() ?? null,
  };
}
