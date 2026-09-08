// Every combination the choices allow, what is sitting in each one, and the code
// a new one is offered.
//
// Lifted out of the surface so the rules can be TESTED. The console's test seat
// covers pure functions and deliberately renders no React, so a rule living
// inside a .tsx is a rule nothing can check — and this one shipped wrong for
// months (issue 172). Its Piggles twin is
// `surfaces/commerce/product-variants/slots.ts`; the two are kept in step by
// `check:console-parity` and must stay that way.

import type { Product, ProductOption, Variant } from './products-data';

export interface Slot {
  key: string;
  /** One value per axis, in axis order. This is the slot's identity. */
  coordinate: { optionName: string; valueId: string; valueText: string }[];
  variant: Variant | null;
}

/** Every combination the choices allow, in the order they are shown. */
export function slotsOf(options: ProductOption[], live: Variant[]): Slot[] {
  let rows: Slot['coordinate'][] = [[]];
  for (const option of options) {
    const next: Slot['coordinate'][] = [];
    for (const row of rows) {
      for (const value of option.values) {
        next.push([...row, { optionName: option.name, valueId: value.id, valueText: value.value }]);
      }
    }
    rows = next;
  }

  return rows.map((coordinate) => {
    const wanted = [...coordinate.map((point) => point.valueId)].sort();
    const variant =
      live.find((candidate) => {
        if (candidate.optionValueIds.length !== wanted.length) return false;
        const held = [...candidate.optionValueIds].sort();
        return held.every((id, index) => id === wanted[index]);
      }) ?? null;
    return { key: coordinate.map((point) => point.valueId).join('|'), coordinate, variant };
  });
}

export function slotLabel(slot: Slot): string {
  return slot.coordinate.map((point) => point.valueText).join(' · ');
}

/** Code-shaped: upper case, hyphens for anything else, no hyphen at either end. */
function normalize(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** One CHOICE of a code, kept short so a long color name does not run away with
 *  the line. Only the choices are cut: the stem is what makes a code unique
 *  across products, so shortening that is what caused the clash below. */
function token(value: string): string {
  return normalize(value).slice(0, 12);
}

/**
 * The stem every generated code hangs off: **the code this product already
 * carries**, which is the one the owner typed into "Product code" when she added
 * it. It falls back to the product's web address only when there is no version
 * yet to read a code from.
 *
 * Two things this fixes, both issue 172.
 *
 * It used to read the WEB ADDRESS every time. So a shop owner who typed
 * `ASH-OVERSHIRT` on the Add a product form, then pressed "Give them all the
 * same price", got fourteen codes reading `THE-ASH-OVER-…` beside the one she
 * wrote — including the "The" she would never put on a label. One shirt, two
 * naming schemes, and the odd one out was the only one she chose.
 *
 * And the stem is **not truncated**. Cutting it to twelve characters is the only
 * thing that made two different products generate the same code: a shop with
 * twelve products whose names all start "Brushed Terry" had every one of them
 * fall to the stem `SAMPLE-BRUSH`, so the second product to be filled in would
 * ask the server for a code the first already held and the fill would stop
 * partway with nothing to do about it. The stem is what makes a code unique
 * across products, so it is the last thing that may be shortened.
 *
 * The anchor is the version shown first — the same one the bulk fill copies the
 * price from — and its own choices are taken back off the end. A version created
 * by this generator carries its combination (`ASH-OVERSHIRT-XS-CLAY`), and
 * anyone may make that one the version shown first; hanging the next code off it
 * whole would compound into `ASH-OVERSHIRT-XS-CLAY-S-BONE`.
 */
export function skuStem(product: Product, slots: Slot[], live: Variant[]): string {
  const anchor = live.find((variant) => variant.isDefault) ?? live[0] ?? null;
  const address = normalize(product.handle) || 'ITEM';
  if (anchor === null) return address;

  let stem = anchor.sku;
  const home = slots.find((slot) => slot.variant?.id === anchor.id);
  if (home) {
    for (const point of [...home.coordinate].reverse()) {
      const tail = `-${token(point.valueText)}`;
      if (tail.length > 1 && stem.toUpperCase().endsWith(tail)) {
        stem = stem.slice(0, -tail.length);
      }
    }
  }
  return stem === '' ? address : stem;
}

/** A first code for a new version, built from the code the product already
 *  carries and the choices this one sits on, so nobody has to invent one per
 *  cell of a 3×4 grid. Stays fully editable — a business with its own scheme
 *  types theirs over the top.
 *
 *  `stem` comes from `skuStem` and is passed in rather than derived here: the
 *  three places that offer a code all need the same answer, and a stem computed
 *  twice is a stem that drifts. */
export function suggestSlotSku(stem: string, slot: Slot, taken: Set<string>): string {
  const suffix = slot.coordinate.map((point) => token(point.valueText)).filter(Boolean);
  let candidate = [stem, ...suffix].join('-').slice(0, 120);
  let attempt = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${[stem, ...suffix].join('-').slice(0, 116)}-${String(attempt)}`;
    attempt += 1;
  }
  return candidate;
}
