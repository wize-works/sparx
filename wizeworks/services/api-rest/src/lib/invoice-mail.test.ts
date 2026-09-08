// The rows on the bill the customer receives.
//
// A bill has one job beyond asking for money: letting the person who got it
// check the arithmetic. `invoiceSummaryRows` listed subtotal, tax and already
// paid, and omitted the delivery charge and any surcharge -- so an invoice whose
// lines added to $58.00 asked for $67.00 and explained nine dollars of it
// nowhere. The printed PDF carried both rows from the start, which is exactly
// why nobody caught it.

import { describe, expect, it } from 'vitest';

import { invoiceSummaryRows, type InvoiceMoney } from './invoice-mail.js';

const money = (over: Partial<InvoiceMoney> = {}): InvoiceMoney => ({
  subtotal: 58,
  discountTotal: 0,
  taxTotal: 0,
  shippingTotal: 0,
  surchargeTotal: 0,
  amountPaid: 0,
  ...over,
});

/** Read the rows back as numbers and add them the way a customer would. */
function addsUpTo(rows: { label: string; value: string }[]): number {
  // The minus survives the strip, so a deduction subtracts itself.
  const sum = rows.reduce((acc, row) => acc + Number(row.value.replace(/[^0-9.-]/g, '')), 0);
  return Math.round(sum * 100) / 100;
}

describe('invoiceSummaryRows', () => {
  it('shows the delivery charge, so the total can be checked', () => {
    const rows = invoiceSummaryRows(money({ shippingTotal: 9 }), 'USD');
    expect(rows.map((r) => r.label)).toEqual(['Subtotal', 'Delivery']);
    expect(addsUpTo(rows)).toBe(67);
  });

  it('shows a surcharge too', () => {
    const rows = invoiceSummaryRows(money({ surchargeTotal: 2.5 }), 'USD');
    expect(rows.map((r) => r.label)).toContain('Surcharge');
    expect(addsUpTo(rows)).toBe(60.5);
  });

  it('adds up to what is still owed, with everything on at once', () => {
    // The whole invariant in one case: what the rows come to IS the number the
    // email asks for. This is the assertion the missing rows broke.
    const m = money({
      subtotal: 200,
      discountTotal: 15,
      taxTotal: 12,
      shippingTotal: 9,
      surchargeTotal: 3,
      amountPaid: 50,
    });
    const balance =
      m.subtotal - m.discountTotal + m.taxTotal + m.shippingTotal + m.surchargeTotal - m.amountPaid;
    expect(addsUpTo(invoiceSummaryRows(m, 'USD'))).toBe(balance);
  });

  it('says nothing about figures this document does not have', () => {
    // The green twin, and why this shipped: on a shop that charges no tax, no
    // delivery and has taken no money, the rows were already right. Ten of the
    // sixteen orders on the persona tenant have no delivery charge.
    const rows = invoiceSummaryRows(money(), 'USD');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe('Subtotal');
  });

  it('shows money already handed over as a deduction', () => {
    const rows = invoiceSummaryRows(money({ amountPaid: 40 }), 'USD');
    expect(rows.at(-1)).toEqual({ label: 'Already paid', value: '-$40.00' });
    expect(addsUpTo(rows)).toBe(18);
  });
});
