// The editor's running total, checked against the rule it says it mirrors.
//
// This file exists because the mirror stopped at tax. `billing-totals.ts` on the
// server resolves lines -> subtotal -> discount -> tax -> shipping -> surcharge
// -> total, and the browser copy's own header said so while its code added only
// the first four. An invoice carrying a $9 delivery charge showed a Total $9
// short, sat beside an "Amount due" read straight off the server, and tripped
// the "Not saved yet" warning on a document nobody had edited.
//
// The server always recomputes on write, so no wrong number was ever SAVED. The
// whole defect lived in what the owner was shown, which is where a totals bug
// does its damage.

import { describe, expect, it } from 'vitest';

import { computeTotals, type DraftLine } from './totals';

const line = (over: Partial<DraftLine> = {}): DraftLine => ({
  key: 'k',
  description: 'Wool throw',
  quantity: 1,
  unitPrice: 58,
  discountAmount: 0,
  taxable: true,
  ...over,
});

describe('computeTotals', () => {
  it('adds the delivery charge, which is what the customer is asked for', () => {
    const totals = computeTotals([line()], 0, 9);
    expect(totals.subtotal).toBe(58);
    expect(totals.shippingTotal).toBe(9);
    expect(totals.total).toBe(67);
  });

  it('adds a surcharge as well, and both together', () => {
    const totals = computeTotals([line()], 0, 9, 2.5);
    expect(totals.surchargeTotal).toBe(2.5);
    expect(totals.total).toBe(69.5);
  });

  it('does not tax either of them', () => {
    // Both are document-level and pass through untouched. Taxing the delivery
    // charge here while the server does not would put the editor and the saved
    // document a few cents apart on every invoice that has one, which reads as
    // a rounding fault nobody can find.
    const totals = computeTotals([line()], 0.1, 9, 3);
    expect(totals.taxTotal).toBe(5.8);
    expect(totals.total).toBe(58 + 5.8 + 9 + 3);
  });

  it('leaves a document with neither exactly as it was', () => {
    // The green twin. Ten of the sixteen orders on the persona tenant carry no
    // delivery charge, which is why the first nine invoices raised on this
    // platform were all correct by accident.
    const totals = computeTotals([line({ unitPrice: 100 }), line({ unitPrice: 20 })], 0.05);
    expect(totals.subtotal).toBe(120);
    expect(totals.taxTotal).toBe(6);
    expect(totals.shippingTotal).toBe(0);
    expect(totals.surchargeTotal).toBe(0);
    expect(totals.total).toBe(126);
  });

  it('still takes the discount off before tax', () => {
    const totals = computeTotals([line({ unitPrice: 100, discountAmount: 20 })], 0.1, 5);
    expect(totals.discountTotal).toBe(20);
    expect(totals.taxTotal).toBe(8);
    expect(totals.total).toBe(100 - 20 + 8 + 5);
  });
});
