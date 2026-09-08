// cartService — cart CRUD + line management + merge + abandonment.
//
// Storefront and B2B portal write through this service; never directly
// to Prisma. Every mutation goes through:
//
//   1. Validate input via @wizeworks/commerce-schemas
//   2. withTenant() transaction with RLS context
//   3. writeAuditLog inside the same transaction
//   4. Recompute cached totals on the cart row
//   5. (post-commit) publish a cart.* event
//
// Pricing math defers to pricingService.resolve(); discount + gift-card
// + account-credit application defers to discountService. This file is the
// orchestrator only.

import {
  AddCartItemInput,
  type CartItemSnapshot,
  type CartMadeToOrder,
  type CartTotals,
  type CartItemAttributes,
  type ResolvedConfiguration,
  CreateCartInput,
  MergeCartsInput,
  UpdateCartItemInput,
} from '@wizeworks/commerce-schemas';
import { withTenant } from '@wizeworks/db';
import type { Prisma, TxClient } from '@wizeworks/db';
import { inventoryService } from '@wizeworks/inventory';

import { writeAuditLog } from '../audit';
import { CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';
import { isInventoryActive } from '../inventory-gate';
import {
  depositForLine,
  deferredForLine,
  isMadeToOrder,
  noticeDays,
  readyOnDate,
  splitDue,
} from '../made-to-order';

import * as configuratorService from './configurator-service';
import { isDiscountRunning, usageBlock } from './discount-conditions';
import * as pricingService from './pricing-service';
import { businessZone, assertWithinDailyLimits } from './made-to-order-service';
import { CUSTOMER_NAME_SELECT, customerDisplayName } from './customer-name';

const DEFAULT_CART_TTL_MIN = 60 * 24 * 14; // 14 days

export interface CartSnapshot {
  cartId: string;
  customerId: string | null;
  customerName: string | null;
  channel: string;
  currency: string;
  items: CartItemSnapshot[];
  appliedDiscountCodes: string[];
  appliedGiftCardCodes: string[];
  accountCreditAppliedCents: number;
  totals: CartTotals;
  /** Made to order (issue 026) — the earliest day this basket can be handed
   *  over, and how the money splits between now and collection. Always present;
   *  an ordinary basket reads as "no notice, all of it due now", which is what
   *  every screen already assumed silently. */
  madeToOrder: CartMadeToOrder;
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
        // Origin site (docs/58 D1) — carried onto the order at checkout.
        propertyId: input.propertyId ?? null,
        fromDocumentId: input.fromDocumentId ?? null,
        fromSubscriptionId: input.fromSubscriptionId ?? null,
        expiresAt,
      },
      select: { id: true },
    });

    // Bootstrap lines from an accepted quote when carried over (B2B path).
    if (input.fromDocumentId) {
      await bootstrapFromDocument(tx, ctx, cart.id, input.fromDocumentId);
      await recomputeCartTotals(tx, ctx, cart.id);
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

// A guest cart claimed by a customer who signs in mid-session (browsed
// anonymously, then authenticated before adding more items). Idempotent and
// one-way: never overwrites an already-linked cart, so it can't reassign one
// customer's cart to another. Re-prices every existing line on the actual
// link (not just items added afterward) — see repriceItems below.
export async function claim(
  ctx: ServiceContext,
  input: { cartId: string; customerId: string }
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: input.cartId },
      select: { id: true, customerId: true, channel: true, currency: true, propertyId: true },
    });
    if (!cart || cart.customerId) return;
    await tx.cart.update({
      where: { id: input.cartId },
      data: { customerId: input.customerId },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.cart.claimed',
      entityType: 'Cart',
      entityId: input.cartId,
      diff: { after: { customerId: input.customerId } },
    });
    await repriceItems(tx, ctx, { ...cart, customerId: input.customerId });
  });
}

// ─── reads ───────────────────────────────────────────────────────────

export async function get(ctx: ServiceContext, cartId: string): Promise<CartSnapshot | null> {
  return withTenant(ctx, async (tx) => {
    const row = await settleCart(tx, ctx, await loadCart(tx, cartId));
    return row ? serializeCart(row, await businessZone(tx)) : null;
  });
}

export async function getByGuestToken(
  ctx: ServiceContext,
  guestToken: string
): Promise<CartSnapshot | null> {
  return withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      // `abandonedAt` deliberately NOT filtered here - see markAbandoned.
      where: { guestToken, customerId: null },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (!cart) return null;
    const full = await settleCart(tx, ctx, await loadCart(tx, cart.id));
    return full ? serializeCart(full, await businessZone(tx)) : null;
  });
}

// ─── line items ──────────────────────────────────────────────────────

export async function addItem(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ cartItemId: string }> {
  const input = AddCartItemInput.parse(rawInput);
  const inventoryActive = await isInventoryActive(ctx.tenantId);

  const cartItemId = await withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      // `abandonedAt` deliberately NOT filtered here - see markAbandoned.
      where: { id: input.cartId },
      select: {
        id: true,
        channel: true,
        currency: true,
        customerId: true,
        propertyId: true,
        customer: { select: { companyId: true } },
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

    const companyId = await pricingService.resolveActiveB2bAccountId(
      tx,
      cart.customerId ?? undefined,
      cart.customer?.companyId
    );
    const priced = await pricingService.resolve(ctx, {
      variantId,
      quantity: input.quantity,
      channel: cart.channel as 'storefront' | 'b2b_portal' | 'admin' | 'subscription',
      currency: cart.currency,
      customerId: cart.customerId ?? undefined,
      companyId,
      customerSegmentIds: [],
      // Site the cart is on (docs/131 §4) — so a sibling business's price list can't
      // price this line.
      ...(cart.propertyId ? { propertyId: cart.propertyId } : {}),
    });

    // Configurator price adjustments are layered on top of the resolved
    // base variant price. We trust the configurator's adjustment because
    // its rule engine already validated against the option matrix.
    let unitPriceCents = priced.unitPriceCents;
    if (resolvedConfig) {
      unitPriceCents = Math.max(0, unitPriceCents + resolvedConfig.totalAdjustmentCents);
    }
    const attributes = serializeAttributes(input.attributes);

    // A SECOND add of the same thing is MORE OF IT, not another row. Adding a
    // croissant twice used to leave two identical lines of one — the subtotal was
    // right, but a cart that lists the same product twice reads like a shop that
    // lost count.
    //
    // Only a line that is genuinely the same merges. A configured line never does
    // (two personalised builds are two things even at one price); neither does a
    // line carrying attributes, or one bought at a different unit price — merging
    // across a price change would silently reprice what was already in the basket.
    // Candidates are filtered in JS rather than by a Json `equals`, so the rule is
    // legible and does not depend on JSON key order.
    const plainAdd = !resolvedConfig && isEmptyAttributes(attributes);
    const mergeInto = plainAdd
      ? ((
          await tx.cartItem.findMany({
            where: { cartId: input.cartId, variantId, unitPriceCents },
            select: {
              id: true,
              quantity: true,
              inventoryReservationId: true,
              configurationPayload: true,
              attributes: true,
            },
          })
        ).find((l) => l.configurationPayload == null && isEmptyAttributes(l.attributes)) ?? null)
      : null;

    const quantity = (mergeInto?.quantity ?? 0) + input.quantity;
    const subtotalCents = unitPriceCents * quantity;

    // Today's allowance (issue 026) — checked HERE so somebody hears "only four
    // left today" while they can still change their mind, rather than at the
    // end of a checkout. Checkout re-checks, because that is the binding moment
    // and a cart can sit open past midnight.
    await assertWithinDailyLimits(tx, [{ variantId, quantity }]);

    const item = mergeInto
      ? await tx.cartItem.update({
          where: { id: mergeInto.id },
          data: { quantity, subtotalCents, unitPriceTrace: priced.trace },
          select: { id: true },
        })
      : await tx.cartItem.create({
          data: {
            tenantId: ctx.tenantId,
            cartId: input.cartId,
            variantId,
            quantity,
            unitPriceCents,
            subtotalCents,
            ...(configurationPayload ? { configurationPayload } : {}),
            attributes,
            unitPriceTrace: priced.trace,
          },
          select: { id: true },
        });

    // Soft-hold the stock against this line (docs/100 §2.4). Atomic with the
    // line write: a `deny`-policy shortfall throws InventoryOutOfStockError and
    // rolls the whole add back, so a customer can never add more than is
    // available. No-op when inventory is off (untracked = always available) OR
    // the variant is dropship-sourced — the supplier holds the stock, so
    // reserving against a local warehouse would auto-vivify a phantom
    // inventory_levels row for a product the warehouse never actually carries.
    const isDropshipVariant = Boolean(
      (
        await tx.productVariant.findFirst({
          where: { id: variantId },
          select: { dropshipSourceId: true },
        })
      )?.dropshipSourceId
    );
    if (inventoryActive && !isDropshipVariant) {
      // A merged line already holds its PREVIOUS quantity, so release that first and
      // take one hold for the new total — the same release-then-reserve `updateItem`
      // does on a quantity change. A `deny` shortfall throws and rolls the whole add
      // back, so a merge can never hold more than is on the shelf.
      if (mergeInto?.inventoryReservationId) {
        await inventoryService.releaseOnTx(tx, ctx, mergeInto.inventoryReservationId);
      }
      const hold = await inventoryService.reserveOnTx(tx, ctx, {
        variantId,
        quantity,
        holderType: 'cart',
        holderId: input.cartId,
      });
      // Null when the variant has never been counted — untracked, nothing held. The
      // line simply carries no reservation, the same as a dropship line. Written
      // unconditionally because a merge must also CLEAR a stale id it inherited.
      await tx.cartItem.update({
        where: { id: item.id },
        data: { inventoryReservationId: hold?.reservationId ?? null },
      });
    }

    await recomputeCartTotals(tx, ctx, input.cartId);

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
  const inventoryActive = await isInventoryActive(ctx.tenantId);

  const cartId = await withTenant(ctx, async (tx) => {
    const item = await tx.cartItem.findFirst({
      where: { id: input.cartItemId },
      select: {
        id: true,
        cartId: true,
        variantId: true,
        unitPriceCents: true,
        quantity: true,
        inventoryReservationId: true,
        variant: { select: { dropshipSourceId: true } },
      },
    });
    if (!item) throw new CommerceNotFoundError('CartItem', input.cartItemId);
    const isDropshipVariant = Boolean(item.variant.dropshipSourceId);

    if (input.quantity === 0) {
      // Remove — release the soft hold first, then drop the line.
      if (inventoryActive && item.inventoryReservationId) {
        await inventoryService.releaseOnTx(tx, ctx, item.inventoryReservationId);
      }
      await tx.cartItem.delete({ where: { id: input.cartItemId } });
    } else {
      // Today's allowance again (issue 026) — raising the quantity on a line
      // already in the basket is the same request as adding it, and skipping
      // the check here would leave the one way round the limit.
      if (input.quantity > item.quantity) {
        await assertWithinDailyLimits(tx, [
          { variantId: item.variantId, quantity: input.quantity },
        ]);
      }
      // Re-hold on a quantity change: release the prior hold and reserve the new
      // quantity (a `deny` shortfall throws and rolls back the increase). When
      // the quantity is unchanged the existing hold stands. Skipped for
      // dropship-sourced variants (see addItem) — never had a hold to begin with.
      let reservationId = item.inventoryReservationId;
      if (inventoryActive && !isDropshipVariant && item.quantity !== input.quantity) {
        if (item.inventoryReservationId) {
          await inventoryService.releaseOnTx(tx, ctx, item.inventoryReservationId);
        }
        const hold = await inventoryService.reserveOnTx(tx, ctx, {
          variantId: item.variantId,
          quantity: input.quantity,
          holderType: 'cart',
          holderId: item.cartId,
        });
        reservationId = hold?.reservationId ?? null;
      }
      await tx.cartItem.update({
        where: { id: input.cartItemId },
        data: {
          quantity: input.quantity,
          subtotalCents: item.unitPriceCents * input.quantity,
          ...(input.attributes ? { attributes: serializeAttributes(input.attributes) } : {}),
          ...(reservationId !== item.inventoryReservationId
            ? { inventoryReservationId: reservationId }
            : {}),
        },
      });
    }

    await recomputeCartTotals(tx, ctx, item.cartId);

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
  const inventoryActive = await isInventoryActive(ctx.tenantId);
  await withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({ where: { id: cartId }, select: { id: true } });
    if (!cart) throw new CommerceNotFoundError('Cart', cartId);
    // Release each line's soft hold before dropping the lines, so cleared carts
    // don't leak `allocated` until their TTL expires.
    if (inventoryActive) {
      const held = await tx.cartItem.findMany({
        where: { cartId, inventoryReservationId: { not: null } },
        select: { inventoryReservationId: true },
      });
      for (const h of held) {
        if (h.inventoryReservationId) {
          await inventoryService.releaseOnTx(tx, ctx, h.inventoryReservationId);
        }
      }
    }
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
        accountCreditAppliedCents: 0,
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
  const inventoryActive = await isInventoryActive(ctx.tenantId);

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

    // Source cart's items moved; release their soft holds (the merged target
    // lines carry no hold — checkout decrements no-hold lines directly) so the
    // deleted source cart doesn't leak `allocated`, then delete the source so
    // future lookups can't re-merge it.
    if (inventoryActive) {
      for (const srcItem of source.items) {
        if (srcItem.inventoryReservationId) {
          await inventoryService.releaseOnTx(tx, ctx, srcItem.inventoryReservationId);
        }
      }
    }
    await tx.cartItem.deleteMany({ where: { cartId: source.id } });
    await tx.cartDiscount.deleteMany({ where: { cartId: source.id } });
    await tx.cart.delete({ where: { id: source.id } });

    // Re-price every line (both retained and just-merged) against the
    // target's current customer — a merge is typically the moment a guest
    // cart's retail-priced lines should pick up the authenticated
    // customer's B2B rate. Also recomputes totals, so no separate call.
    await repriceItems(tx, ctx, {
      id: target.id,
      channel: target.channel,
      currency: target.currency,
      customerId: target.customerId,
      propertyId: target.propertyId,
    });

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

// ─── repricing ───────────────────────────────────────────────────────

/** Force-reprice an existing cart's lines against its current customer —
 *  for a cart whose B2B eligibility may have changed since it was last
 *  touched (e.g. an account contact was activated/deactivated, or a new
 *  contract price landed) without any claim/merge to trigger a reprice. */
export async function repriceCart(ctx: ServiceContext, cartId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: cartId },
      select: { id: true, channel: true, currency: true, customerId: true, propertyId: true },
    });
    if (!cart) throw new CommerceNotFoundError('Cart', cartId);
    await repriceItems(tx, ctx, cart);
  });
  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'cart.updated',
    data: { cartId, reason: 'repriced' },
  });
}

export interface CartHandoff {
  cartId: string;
  guestToken: string;
}

/**
 * Called right after a customer authenticates (login/register) with a
 * possible guest cart in hand (`x-cart-token`). Consolidates the guest cart
 * into whichever cart the customer should now be using — merges into an
 * existing customer cart if one already exists (claim/merge both reprice
 * internally, see below), otherwise claims the guest cart outright. Falls
 * back to a plain reprice of the customer's existing cart when there's no
 * guest cart to reconcile, so a cart from an earlier session also picks up
 * any B2B eligibility change since it was last priced. This is what fixes
 * items added while anonymous — priced at retail — showing the customer's
 * B2B rate once they sign in, not just on their next new add-to-cart.
 *
 * Returns the resulting cart's {cartId, guestToken} whenever the caller's
 * cached cart identity might now be stale or missing — a merge deletes the
 * guest cart the client had cached (its id+token 404 on the next request:
 * cart ownership is token-only, see assertCartToken, with no fallback to
 * "the signed-in customer owns this cart"), and a fresh browser/device may
 * not have any cached cart at all even though one already exists server-side.
 * Callers MUST relay this to the client so it can adopt the new identity —
 * returns null only when the client's own cached identity is still valid
 * (the claim case: same cart row, same guestToken) or there's truly nothing
 * to hand off.
 */
export async function reconcileCartOnAuth(
  ctx: ServiceContext,
  input: {
    guestToken?: string;
    customerId: string;
    channel: 'storefront' | 'b2b_portal' | 'admin' | 'subscription';
  }
): Promise<CartHandoff | null> {
  const guestCart = input.guestToken
    ? await withTenant(ctx, (tx) =>
        tx.cart.findFirst({
          where: {
            guestToken: input.guestToken,
            channel: input.channel,
            customerId: null,
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true },
        })
      )
    : null;

  const existingCart = await withTenant(ctx, (tx) =>
    tx.cart.findFirst({
      where: {
        customerId: input.customerId,
        channel: input.channel,
        ...(guestCart ? { id: { not: guestCart.id } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, guestToken: true },
    })
  );

  if (guestCart && existingCart) {
    await merge(ctx, { sourceCartId: guestCart.id, targetCartId: existingCart.id });
    return existingCart.guestToken
      ? { cartId: existingCart.id, guestToken: existingCart.guestToken }
      : null;
  }
  if (guestCart) {
    await claim(ctx, { cartId: guestCart.id, customerId: input.customerId });
    return null;
  }
  if (existingCart) {
    await repriceCart(ctx, existingCart.id);
    return existingCart.guestToken
      ? { cartId: existingCart.id, guestToken: existingCart.guestToken }
      : null;
  }
  return null;
}

// ─── abandonment lifecycle ───────────────────────────────────────────

/**
 * "This basket has not been bought yet" — the one place that question is asked.
 *
 * The fact already exists: a basket that became an order has a checkout session
 * at `completed`, written by the transaction that placed the order, indexed on
 * `(tenant_id, cart_id)`. Nothing has to be stored to answer this.
 *
 * It used to be asked as `recoveredAt: null`, because checkout stamped
 * `recoveredAt` to freeze a converted basket. That made one column mean two
 * unrelated things, and the reading that lost was the one on the tin: the
 * console filed five of Devi's completed orders under "Came back", and the
 * recovery rate in the abandonment report counted every sale as a basket won
 * back (persona issue 289). `recovered_at` now means only what it says.
 */
export const NOT_BOUGHT_YET = {
  checkoutSessions: { none: { step: 'completed' } },
} as const;

/**
 * Flag a basket as having gone quiet.
 *
 * This is a SIGNAL, never a lifecycle state. The basket stays completely usable
 * to the shopper, because the entire point of recording it is that they come
 * back and buy it. So every shopper-facing lookup ignores `abandonedAt`, and any
 * shopper WRITE clears it back through `markRecovered` - which is what "came
 * back" means and the only way that tab can fill from a real shopper.
 *
 * It used to read as a state, with `abandonedAt: null` on the guest-token
 * lookup, add-item, sign-in handoff, checkout and all three discount paths. A
 * marked basket vanished from the shopper's own browser and 404'd on add, on a
 * code and on checkout, while remove-item had no such filter - so they could
 * empty the basket but never buy it. Nothing had ever set the column, so none of
 * it was reachable until the abandonment sweep shipped and set it on every quiet
 * basket on the platform.
 */
export async function markAbandoned(ctx: ServiceContext, cartId: string): Promise<void> {
  const now = new Date();
  await withTenant(ctx, async (tx) => {
    const cart = await tx.cart.findFirst({
      where: { id: cartId, abandonedAt: null },
      select: { id: true, updatedAt: true },
    });
    if (!cart) return;
    // `updatedAt` is written back UNCHANGED, deliberately. It is `@updatedAt`,
    // so a plain update stamps it with the sweep's own clock, and the console
    // reads it as "Last active" - the one fact that says whether this shopper
    // walked away twenty minutes ago or three days ago. A system write is not
    // the shopper being active, and `findIdleCarts` reads the same column.
    await tx.cart.update({
      where: { id: cartId },
      data: { abandonedAt: now, updatedAt: cart.updatedAt },
    });
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

/**
 * Every site a live basket currently belongs to, including `null` for baskets
 * with no site on them at all.
 *
 * The sweep needs this because `cartAbandonmentMinutes` is a PER-SITE setting,
 * so "which baskets have gone quiet" has a different answer per site and cannot
 * be asked once for a tenant. `null` is in the list deliberately: 19 of the 34
 * baskets in the database carry no property, and a sweep that enumerated
 * properties instead would have skipped every one of them while reporting
 * success — the scan-nothing-and-print-green shape.
 */
export async function listCartSiteScopes(ctx: ServiceContext): Promise<(string | null)[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.cart.findMany({
      where: { abandonedAt: null, ...NOT_BOUGHT_YET, items: { some: {} } },
      distinct: ['propertyId'],
      select: { propertyId: true },
    });
    return rows.map((r) => r.propertyId);
  });
}

/** Worker sweep — returns cart ids in one SITE that have been idle longer than
 *  `cutoffMinutes` and are eligible to be marked abandoned. `propertyId: null`
 *  scopes to baskets carrying no site, which inherit the primary site's
 *  setting. */
export async function findIdleCarts(
  ctx: ServiceContext,
  cutoffMinutes: number,
  propertyId: string | null,
  now: Date = new Date()
): Promise<string[]> {
  if (cutoffMinutes <= 0) return [];
  const cutoff = new Date(now.getTime() - cutoffMinutes * 60_000);
  return withTenant(ctx, async (tx) => {
    const rows = await tx.cart.findMany({
      where: {
        propertyId,
        abandonedAt: null,
        // `recoveredAt` deliberately NOT filtered. A shopper who came back,
        // added something and left again has gone quiet a second time, and a
        // follow-up queue that offers each basket once is a queue that gives up
        // on the people most likely to buy. What must be excluded is a basket
        // already PAID for, which is a different question with its own answer.
        ...NOT_BOUGHT_YET,
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
    discounts: {
      include: {
        discount: {
          select: {
            code: true;
            status: true;
            startAt: true;
            endAt: true;
            deletedAt: true;
          };
        };
      };
    };
    customer: { select: typeof CUSTOMER_NAME_SELECT };
  };
}>;

async function loadCart(tx: TxClient, cartId: string): Promise<CartWithRelations | null> {
  return tx.cart.findFirst({
    where: { id: cartId },
    include: {
      items: { include: { variant: { include: { product: true } } } },
      // The offer's own dates and switch ride along with the code, so a read can
      // tell a live saving from a lapsed one without a second query (issue 300).
      discounts: {
        include: {
          discount: {
            select: {
              code: true,
              status: true,
              startAt: true,
              endAt: true,
              deletedAt: true,
            },
          },
        },
      },
      customer: { select: CUSTOMER_NAME_SELECT },
    },
  });
}

/**
 * A cart as it stands NOW, with any saving whose sale has ended already gone.
 *
 * Derived money going stale is corrected when it is read, the same way a stale
 * site frame is repaired on load. Without it a lapsed code stays on screen until
 * the shopper happens to touch the basket, and the one number a cart has to get
 * right is the one it says it will charge (issue 300).
 */
async function settleCart(
  tx: TxClient,
  ctx: ServiceContext,
  row: CartWithRelations | null
): Promise<CartWithRelations | null> {
  if (!row) return null;
  const now = new Date();
  if (row.discounts.every((applied) => isDiscountRunning(applied.discount, now))) return row;
  await recomputeCartTotals(tx, ctx, row.id);
  return loadCart(tx, row.id);
}

/**
 * Recompute every line's unitPriceCents/subtotalCents/unitPriceTrace against
 * the cart's CURRENT customerId, then refresh cached totals. Called by
 * claim()/merge()/repriceCart() whenever a cart's customer identity changes
 * (or might have — repriceCart) so lines added while anonymous — priced at
 * retail — pick up B2B contract/price-list rates immediately, not just on
 * the next new item add (addItem already resolves per-item on its own).
 */
async function repriceItems(
  tx: TxClient,
  ctx: ServiceContext,
  cart: {
    id: string;
    channel: string;
    currency: string;
    customerId: string | null;
    propertyId: string | null;
  }
): Promise<void> {
  const items = await tx.cartItem.findMany({
    where: { cartId: cart.id },
    select: { id: true, variantId: true, quantity: true, configurationPayload: true },
  });
  if (items.length === 0) return;

  const customer = cart.customerId
    ? await tx.customer.findFirst({
        where: { id: cart.customerId },
        select: { companyId: true },
      })
    : null;
  const companyId = await pricingService.resolveActiveB2bAccountId(
    tx,
    cart.customerId ?? undefined,
    customer?.companyId
  );

  for (const item of items) {
    const priced = await pricingService.resolve(ctx, {
      variantId: item.variantId,
      quantity: item.quantity,
      channel: cart.channel as 'storefront' | 'b2b_portal' | 'admin' | 'subscription',
      currency: cart.currency,
      customerId: cart.customerId ?? undefined,
      companyId,
      customerSegmentIds: [],
      // Site the cart is on (docs/131 §4) — scopes the eligible price lists.
      ...(cart.propertyId ? { propertyId: cart.propertyId } : {}),
    });
    // Configurator lines layer a fixed add-on adjustment on top of the
    // resolved base price (see addItem) — preserve it across a reprice.
    const config =
      item.configurationPayload && typeof item.configurationPayload === 'object'
        ? (item.configurationPayload as { totalAdjustmentCents?: number })
        : null;
    const unitPriceCents = Math.max(0, priced.unitPriceCents + (config?.totalAdjustmentCents ?? 0));
    await tx.cartItem.update({
      where: { id: item.id },
      data: {
        unitPriceCents,
        subtotalCents: unitPriceCents * item.quantity,
        unitPriceTrace: priced.trace,
      },
    });
  }

  await recomputeCartTotals(tx, ctx, cart.id);
}

/**
 * The savings on this cart that are still real, with the lapsed ones removed.
 *
 * A code's terms are checked when it is TYPED, and a basket outlives that moment
 * — it can sit for a week. So the offer behind each saving is read again here and
 * anything that no longer holds is deleted rather than left to be honored:
 * a sale that ended went on being given away right through checkout and onto the
 * order, while the owner's own list showed it as Ended (issue 300).
 *
 * BOTH halves of that sentence, not just the dates. Issue 300 was found through
 * the window and only the window was re-read here, so a shopper who had spent
 * their one use kept the saving on the basket and carried it through checkout —
 * while typing the same code into the box beside it was refused. Which way it
 * fell depended on nothing but whether they touched the chip (issue 312).
 *
 * Deleted, not zeroed, so the code chip and the saving disappear together — a
 * chip still sitting there worth nothing is its own confusion.
 */
async function foldRunningDiscounts(tx: TxClient, cartId: string): Promise<number> {
  const applied = await tx.cartDiscount.findMany({
    where: { cartId },
    select: {
      id: true,
      appliedCents: true,
      discountId: true,
      discount: {
        select: {
          status: true,
          startAt: true,
          endAt: true,
          deletedAt: true,
          perCustomerLimit: true,
          totalUsageLimit: true,
          usageCount: true,
        },
      },
    },
  });
  if (applied.length === 0) return 0;

  // A guest basket has nobody to count uses against, so only the shop-wide limit
  // can be asked — which is what `usageBlock` does with a null count.
  const cart = await tx.cart.findUnique({ where: { id: cartId }, select: { customerId: true } });
  const customerId = cart?.customerId ?? null;

  const now = new Date();
  const lapsed: string[] = [];
  let total = 0;
  for (const row of applied) {
    const spent = isDiscountRunning(row.discount, now)
      ? usageBlock(
          row.discount,
          customerId === null
            ? null
            : await tx.discountUsage.count({ where: { discountId: row.discountId, customerId } })
        ) !== null
      : true;
    if (spent) lapsed.push(row.id);
    else total += row.appliedCents;
  }
  if (lapsed.length > 0) {
    await tx.cartDiscount.deleteMany({ where: { id: { in: lapsed } } });
  }
  return total;
}

/**
 * Re-derive a cart's money from its lines and its applied discounts.
 *
 * Exported because discount-service writes CartDiscount rows and must call it:
 * a discount that is stored but never folded into `discountTotalCents` is one
 * the shopper is told they have and is then charged in full for.
 */
export async function recomputeCartTotals(
  tx: TxClient,
  _ctx: ServiceContext,
  cartId: string
): Promise<void> {
  const items = await tx.cartItem.findMany({
    where: { cartId },
    select: { subtotalCents: true },
  });
  const subtotal = items.reduce((sum, i) => sum + i.subtotalCents, 0);

  const discountTotal = await foldRunningDiscounts(tx, cartId);

  // Gift card + account credit applied amounts are owned by the discount
  // service; we only re-cap them against the new subtotal so a cart
  // shrink can't leave an over-applied balance dangling.
  const current = await tx.cart.findFirstOrThrow({
    where: { id: cartId },
    select: {
      giftCardAppliedCents: true,
      accountCreditAppliedCents: true,
      shippingTotalCents: true,
      taxTotalCents: true,
    },
  });

  const postDiscount = Math.max(0, subtotal - discountTotal);
  const giftCardApplied = Math.min(current.giftCardAppliedCents, postDiscount);
  const afterGc = Math.max(0, postDiscount - giftCardApplied);
  const accountCreditApplied = Math.min(current.accountCreditAppliedCents, afterGc);

  const total = Math.max(
    0,
    postDiscount -
      giftCardApplied -
      accountCreditApplied +
      current.shippingTotalCents +
      current.taxTotalCents
  );

  await tx.cart.update({
    where: { id: cartId },
    data: {
      subtotalCents: subtotal,
      discountTotalCents: discountTotal,
      giftCardAppliedCents: giftCardApplied,
      accountCreditAppliedCents: accountCreditApplied,
      totalCents: total,
    },
  });
}

async function bootstrapFromDocument(
  tx: TxClient,
  ctx: ServiceContext,
  cartId: string,
  documentId: string
): Promise<void> {
  const document = await tx.billingDocument.findFirst({
    where: { id: documentId },
    include: { lines: true },
  });
  if (!document) throw new CommerceNotFoundError('BillingDocument', documentId);

  for (const line of document.lines) {
    if (!line.variantId) continue;
    // BillingDocumentLine stores prices as Decimal(12,2); convert to integer
    // cents so the cart contract (always integer cents) stays consistent.
    const unitPriceCents = Math.round(line.unitPrice.toNumber() * 100);
    const quantity = Math.round(line.quantity.toNumber());
    await tx.cartItem.create({
      data: {
        tenantId: ctx.tenantId,
        cartId,
        variantId: line.variantId,
        quantity,
        unitPriceCents,
        subtotalCents: unitPriceCents * quantity,
        attributes: {},
      },
    });
  }
}

function serializeAttributes(attributes: CartItemAttributes | undefined): Prisma.InputJsonValue {
  if (!attributes) return {};
  return attributes;
}

/** No attributes worth distinguishing — `null`, or an object with no keys. The
 *  column defaults to `{}`, so both spellings of "none" occur in real rows. */
function isEmptyAttributes(value: unknown): boolean {
  if (value == null) return true;
  return typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}

/** The code of the gift card reserved against this basket, as a list because
 *  `appliedDiscountCodes` beside it is one and the two read together. The cart
 *  models a single card; pricingTrace is where its code is kept. */
function giftCardCodesOnCart(pricingTrace: unknown): string[] {
  const code = (pricingTrace as { giftCard?: { code?: unknown } } | null)?.giftCard?.code;
  return typeof code === 'string' && code !== '' ? [code] : [];
}

function serializeCart(row: CartWithRelations, zone: string): CartSnapshot {
  // Made to order (issue 026) — read off the product rows already joined here,
  // so a basket of ordinary things costs no extra query and says nothing.
  const ruled = row.items.map((it) => ({
    quantity: it.quantity,
    subtotalCents: it.subtotalCents,
    rule: {
      orderAheadDays: it.variant.product.orderAheadDays,
      depositType: it.variant.product.depositType,
      depositAmountCents: it.variant.product.depositAmountCents,
      depositPercent: it.variant.product.depositPercent,
      dailyLimit: it.variant.product.dailyLimit,
    },
  }));
  const notice = noticeDays(ruled);
  const split = splitDue(ruled, row.totalCents);

  const items: CartItemSnapshot[] = row.items.map((it, i) => ({
    cartItemId: it.id,
    variantId: it.variantId,
    productId: it.variant.productId,
    sku: it.variant.sku,
    name: it.variant.product.title,
    quantity: it.quantity,
    unitPriceCents: it.unitPriceCents,
    subtotalCents: it.subtotalCents,
    madeToOrder: isMadeToOrder(ruled[i]!.rule)
      ? {
          orderAheadDays: ruled[i]!.rule.orderAheadDays,
          depositCents: depositForLine(ruled[i]!),
          balanceCents: deferredForLine(ruled[i]!),
        }
      : null,
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
    customerName: customerDisplayName(row.customer),
    channel: row.channel,
    currency: row.currency,
    items,
    appliedDiscountCodes: row.discounts.map((d) => d.discount.code ?? '').filter(Boolean),
    // Read from pricingTrace, which is where the applied card's identity lives —
    // the cart carries an amount and no name. This was hardcoded `[]`, so a
    // basket with a gift card on it reported none, and every screen downstream
    // showed a total that had been reduced by something it could not name.
    appliedGiftCardCodes: giftCardCodesOnCart(row.pricingTrace),
    accountCreditAppliedCents: row.accountCreditAppliedCents,
    totals: {
      subtotalCents: row.subtotalCents,
      discountTotalCents: row.discountTotalCents,
      shippingTotalCents: row.shippingTotalCents,
      taxTotalCents: row.taxTotalCents,
      giftCardAppliedCents: row.giftCardAppliedCents,
      accountCreditAppliedCents: row.accountCreditAppliedCents,
      totalCents: row.totalCents,
    },
    madeToOrder: {
      readyOn: readyOnDate(new Date(), notice, zone),
      noticeDays: notice,
      ...split,
    },
    expiresAt: row.expiresAt?.toISOString() ?? '',
    abandonedAt: row.abandonedAt?.toISOString() ?? null,
  };
}
