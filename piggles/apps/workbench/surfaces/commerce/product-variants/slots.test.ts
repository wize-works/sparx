// Where a generated product code comes from.
//
// This file exists because it came from the wrong place. The generator read the
// product's WEB ADDRESS, so an owner who typed `ASH-OVERSHIRT` into "Product
// code" and then pressed "Give them all the same price" got fourteen codes
// reading `THE-ASH-OVER-…` beside the one she wrote. One shirt, two naming
// schemes, and the odd one out was the only one she chose (issue 172).
//
// The address was also cut to twelve characters, which is the only thing that
// let two different products generate the same code. A shop with twelve
// products all named "Brushed Terry <something>" had every one of them fall to
// the stem `SAMPLE-BRUSH`, so filling in the second one would ask the server for
// a code the first already held and stop partway.

import { describe, expect, it } from 'vitest';

import { skuStem, slotsOf, suggestSlotSku } from './slots';
import type { Product, ProductOption, Variant } from '../products-data';

const size: ProductOption = {
  id: 'opt-size',
  name: 'Size',
  position: 0,
  values: [
    { id: 'xs', value: 'XS', position: 0 },
    { id: 's', value: 'S', position: 1 },
  ],
} as unknown as ProductOption;

const color: ProductOption = {
  id: 'opt-color',
  name: 'Color',
  position: 1,
  values: [
    { id: 'clay', value: 'Clay', position: 0 },
    { id: 'slate', value: 'Slate', position: 1 },
  ],
} as unknown as ProductOption;

const product = (over: Partial<Product> = {}): Product =>
  ({ id: 'p1', title: 'The Ash Overshirt', handle: 'the-ash-overshirt', ...over }) as Product;

const variant = (over: Partial<Variant> = {}): Variant =>
  ({
    id: 'v1',
    productId: 'p1',
    sku: 'ASH-OVERSHIRT',
    isDefault: true,
    optionValueIds: [],
    deletedAt: null,
    ...over,
  }) as unknown as Variant;

describe('skuStem', () => {
  it('takes the code the owner typed, not the name she never put on a label', () => {
    const live = [variant({ optionValueIds: ['xs', 'clay'] })];
    const slots = slotsOf([size, color], live);
    expect(skuStem(product(), slots, live)).toBe('ASH-OVERSHIRT');
  });

  it('falls back to the web address when the product has no version yet', () => {
    expect(skuStem(product(), [], [])).toBe('THE-ASH-OVERSHIRT');
  });

  it('does not cut the stem short, so two near-named products stay apart', () => {
    const dress = product({ title: 'The Linen Shirtdress', handle: 'the-linen-shirtdress' });
    const shirt = product({ title: 'The Linen Shirt', handle: 'the-linen-shirt' });
    expect(skuStem(dress, [], [])).not.toBe(skuStem(shirt, [], []));
  });

  it('takes the anchor version’s own choices back off, so codes cannot compound', () => {
    // Anyone may make a generated version the one shown first. Hanging the next
    // code off it whole would give ASH-OVERSHIRT-XS-CLAY-S-SLATE.
    const live = [variant({ sku: 'ASH-OVERSHIRT-XS-CLAY', optionValueIds: ['xs', 'clay'] })];
    const slots = slotsOf([size, color], live);
    expect(skuStem(product(), slots, live)).toBe('ASH-OVERSHIRT');
  });
});

describe('suggestSlotSku', () => {
  it('hangs the choices off the stem in the order they are shown', () => {
    const slots = slotsOf([size, color], []);
    const slate = slots.find((slot) => slot.key === 's|slate');
    expect(slate).toBeDefined();
    expect(suggestSlotSku('ASH-OVERSHIRT', slate!, new Set())).toBe('ASH-OVERSHIRT-S-SLATE');
  });

  it('steps past a code that is already held rather than offering it again', () => {
    const slots = slotsOf([size, color], []);
    const slate = slots.find((slot) => slot.key === 's|slate');
    expect(suggestSlotSku('ASH-OVERSHIRT', slate!, new Set(['ash-overshirt-s-slate']))).toBe(
      'ASH-OVERSHIRT-S-SLATE-2'
    );
  });
});
