import { describe, expect, it } from 'vitest';
import { giftCardOnCart, giftCardReservation } from './gift-card-reservation';

describe('giftCardReservation', () => {
  it('takes the whole card when the basket is bigger than it', () => {
    expect(giftCardReservation(15_000, 63_400, 0)).toBe(15_000);
  });

  it('takes only what is owed when the card is bigger than the basket', () => {
    expect(giftCardReservation(15_000, 5_800, 0)).toBe(5_800);
  });

  // The defect this function exists for. The old cap read the raw line prices,
  // so a discount on the basket was invisible to it: a $150 card on a $200
  // basket with $80 off reserved $150 against a $120 bill, reported $150 to its
  // caller, and was then trimmed to $120 by the cart's own recompute. The number
  // the shopper was told and the number the basket used were different.
  it('counts the discount, so the cap is what is actually owed', () => {
    expect(giftCardReservation(15_000, 20_000, 8_000)).toBe(12_000);
  });

  it('reserves nothing against a basket a discount has already cleared', () => {
    expect(giftCardReservation(15_000, 6_000, 6_000)).toBe(0);
  });

  it('never goes negative, however the numbers arrive', () => {
    expect(giftCardReservation(15_000, 4_000, 9_000)).toBe(0);
    expect(giftCardReservation(0, 10_000, 0)).toBe(0);
  });

  it('leaves delivery and tax out of it, because neither is settled yet', () => {
    // A basket in the cart has no address, so there is no delivery charge and no
    // tax to reserve against. $58 of goods is the whole cap even on a card that
    // could have covered postage too.
    expect(giftCardReservation(15_000, 5_800, 0)).toBe(5_800);
  });
});

describe('giftCardOnCart', () => {
  it('reads the card an applied basket recorded', () => {
    expect(
      giftCardOnCart({ giftCard: { id: 'card-1', code: 'QM44-2DTN', appliedCents: 15_000 } })
    ).toEqual({ id: 'card-1', code: 'QM44-2DTN', appliedCents: 15_000 });
  });

  it('reads past anything else pricing has written there', () => {
    expect(
      giftCardOnCart({
        somethingElse: { kept: true },
        giftCard: { id: 'card-1', code: 'QM44', appliedCents: 500 },
      })
    ).toEqual({ id: 'card-1', code: 'QM44', appliedCents: 500 });
  });

  it('says no card for a basket that has none', () => {
    expect(giftCardOnCart(null)).toBeNull();
    expect(giftCardOnCart({})).toBeNull();
    expect(giftCardOnCart({ giftCard: null })).toBeNull();
  });

  // Placement debits ONE exact card off this. A half-written entry must read as
  // no card rather than as a guess: under-charging is recoverable, and taking
  // money off the wrong person's balance is not.
  it('refuses a half-written entry rather than guessing', () => {
    expect(giftCardOnCart({ giftCard: { code: 'QM44', appliedCents: 500 } })).toBeNull();
    expect(giftCardOnCart({ giftCard: { id: 'card-1', appliedCents: 500 } })).toBeNull();
    expect(giftCardOnCart({ giftCard: { id: '', code: 'QM44' } })).toBeNull();
    expect(giftCardOnCart({ giftCard: { id: 'card-1', code: '' } })).toBeNull();
  });

  it('reads a missing or nonsense amount as nothing applied, keeping the card', () => {
    expect(giftCardOnCart({ giftCard: { id: 'card-1', code: 'QM44' } })?.appliedCents).toBe(0);
    expect(
      giftCardOnCart({ giftCard: { id: 'card-1', code: 'QM44', appliedCents: -5 } })?.appliedCents
    ).toBe(0);
    expect(
      giftCardOnCart({ giftCard: { id: 'card-1', code: 'QM44', appliedCents: '500' } })
        ?.appliedCents
    ).toBe(0);
  });
});
