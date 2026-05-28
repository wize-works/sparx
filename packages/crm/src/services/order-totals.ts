// Order/quote total computation.
//
// Subtotal / tax / discount / shipping / total derivation is the same on
// both orders and quotes — extracted here so the rules don't drift between
// services. Line items are the source of truth for subtotal + discount +
// tax; shipping is a header-level add.
//
// All math uses regular JS numbers; persisted as Decimal(12,2). Prisma's
// Decimal type handles the conversion at write time. Inputs are validated
// nonnegative by Zod (see common-commerce.ts).

import type { LineItemInput } from '@sparx/crm-schemas';

export interface ComputedTotals {
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  shippingTotal: number;
  total: number;
}

export interface ComputedLine {
  lineSubtotal: number;
  taxAmount: number;
  discountAmount: number;
  lineTotal: number;
}

/** Per-line numbers. Subtotal = quantity × unitPrice. lineTotal =
 *  subtotal − discount + tax. */
export function computeLine(item: LineItemInput): ComputedLine {
  const lineSubtotal = round2(item.quantity * item.unitPrice);
  const discountAmount = round2(item.discountAmount ?? 0);
  const taxAmount = round2(item.taxAmount ?? 0);
  const lineTotal = round2(lineSubtotal - discountAmount + taxAmount);
  return { lineSubtotal, discountAmount, taxAmount, lineTotal };
}

/** Header totals from a set of line items + header-level shipping. If
 *  taxTotalOverride is supplied it wins over the sum of line taxes — the
 *  service uses this when the caller passed an explicit headerTax (most
 *  tax engines compute at the order level, not per line). */
export function computeTotals(
  items: LineItemInput[],
  shippingTotal: number,
  taxTotalOverride?: number
): ComputedTotals {
  let subtotal = 0;
  let lineTaxSum = 0;
  let discountSum = 0;

  for (const item of items) {
    const line = computeLine(item);
    subtotal += line.lineSubtotal;
    lineTaxSum += line.taxAmount;
    discountSum += line.discountAmount;
  }

  const taxTotal = round2(taxTotalOverride ?? lineTaxSum);
  const shipping = round2(shippingTotal);
  const total = round2(subtotal - discountSum + taxTotal + shipping);

  return {
    subtotal: round2(subtotal),
    taxTotal,
    discountTotal: round2(discountSum),
    shippingTotal: shipping,
    total,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
