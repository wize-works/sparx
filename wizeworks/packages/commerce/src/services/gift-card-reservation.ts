// Gift cards on a basket — the two decisions, as functions with no database.
//
// A gift card is money that has already been paid. It is not a discount and it
// does not behave like one: a discount reduces what the goods COST, while a card
// pays part of what is owed. That difference decides both answers here.
//
// Applying a card RESERVES it. Nothing is debited until the order is placed, so
// an abandoned basket leaves the balance whole and there is no reversal step to
// get wrong. See `applyGiftCardToCart` and `redeemGiftCard` in discount-service.

/**
 * How much of a card this basket can actually take.
 *
 * Capped at what is OWED for the goods — lines minus discounts — because a card
 * cannot pay more than the bill. The old code capped against the raw line prices
 * instead, which ignores every discount on the basket: a $150 card on a $200
 * basket with $80 off reserved $150 against a $120 bill, and then reported that
 * $150 to its caller while the cart's own recompute quietly trimmed it to $120.
 *
 * Delivery and tax are deliberately OUTSIDE the cap. They are not settled when a
 * card is applied in the basket — a shopper has given no address yet — so
 * reserving against them would be reserving against a number nobody has.
 */
export function giftCardReservation(
  balanceCents: number,
  subtotalCents: number,
  discountTotalCents: number
): number {
  const owed = Math.max(0, subtotalCents - discountTotalCents);
  return Math.max(0, Math.min(balanceCents, owed));
}

/** A gift card reserved against a basket, as recorded in `pricingTrace`. */
export interface ReservedGiftCard {
  id: string;
  code: string;
  appliedCents: number;
}

/**
 * The gift card reserved against a basket, or null.
 *
 * Read out of `pricingTrace`, which is the only place the card's IDENTITY is
 * kept: the cart itself carries an amount and no name, so neither the storefront
 * nor order placement can act on the scalar alone. Placement has to debit one
 * exact card, so a trace entry missing its id or its code is treated as no card
 * at all rather than guessed at — under-charging is recoverable, and taking
 * money off the wrong person's card is not.
 */
export function giftCardOnCart(pricingTrace: unknown): ReservedGiftCard | null {
  const entry = (
    pricingTrace as {
      giftCard?: { id?: unknown; code?: unknown; appliedCents?: unknown };
    } | null
  )?.giftCard;
  if (!entry || typeof entry.id !== 'string' || entry.id === '') return null;
  if (typeof entry.code !== 'string' || entry.code === '') return null;
  const applied = entry.appliedCents;
  return {
    id: entry.id,
    code: entry.code,
    appliedCents:
      typeof applied === 'number' && Number.isFinite(applied) && applied > 0 ? applied : 0,
  };
}
