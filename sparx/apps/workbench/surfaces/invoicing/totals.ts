// Line + document totals, mirrored from the server.
//
// The authority is wizeworks/packages/crm/src/services/billing-totals.ts — the server
// recomputes every figure on write and its answer is what gets persisted. This
// exists ONLY so the editor can show a running total while typing, before
// anything is saved.
//
// It is deliberately a mirror rather than an import: @wizeworks/crm pulls in
// @wizeworks/db (Prisma), so it cannot be bundled into a browser app. If the two
// ever disagree the server wins by construction — the moment a save lands, the
// document's real totals replace whatever was on screen.
//
// Rules being mirrored (docs/87 §7): tax is PER LINE against one document-level
// rate, charged on the post-discount amount; resolution order is
// lines → subtotal → discount → tax → shipping → surcharge → total.

import type { LineMarkupInput } from '@wizeworks/commerce-schemas';

/** The server's frozen record of how a markup/pass-through line was priced —
 *  enough to re-seed the editor and show the margin it locked in. */
export interface LineMarkupSnapshot {
  ruleId: string | null;
  ruleName: string | null;
  method: string;
  value: number | null;
  marginPct: number;
  markupPct: number;
  costBasisValueCents: number;
}

export interface DraftLine {
  /**
   * Stable local identity. A line being typed has no server id yet, and index
   * is not identity — deleting row 2 would otherwise re-key every row after it,
   * moving React state (and focus) onto the wrong inputs mid-edit.
   */
  key: string;
  /** Present once the line exists server-side; absent means "create me". */
  id?: string;
  /** Which line type this is — carries the pricing mode + tax default. A line
   *  with a markup directive prices off cost; everything else is a manual price.
   *  Stored as the id the server returns (the write endpoints accept it too). */
  lineTypeId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxable: boolean;
  /** Linked catalog product/variant. Selecting one seeds the description + price
   *  and ties the line back to inventory for cost and reporting. */
  productId?: string | null;
  variantId?: string | null;
  /** A human label for the linked product — LOCAL only, never sent. */
  productLabel?: string | null;
  /** Set on a markup / pass-through line: the cost basis (cents) + the markup
   *  directive to send. While present, `unitPrice` is a LOCAL preview of the
   *  price the server will derive — the server re-prices authoritatively on save. */
  explicitCostCents?: number | null;
  markup?: LineMarkupInput | null;
  /** The server's last-priced snapshot for an existing markup line (read-only). */
  appliedMarkup?: LineMarkupSnapshot | null;
  /** Cost basis the server resolved, in cents (for margin display). */
  costCents?: number | null;
}

/** True when a line prices off a cost basis rather than a typed unit price — its
 *  unit price is derived, so the row shows it read-only and edits go via the modal. */
export function isMarkupPriced(line: DraftLine): boolean {
  return line.markup != null || line.appliedMarkup != null;
}

export interface LineTotals {
  lineSubtotal: number;
  taxAmount: number;
  lineTotal: number;
}

export interface DocumentTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingTotal: number;
  surchargeTotal: number;
  total: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeLine(line: DraftLine, taxRate: number): LineTotals {
  const lineSubtotal = round2(line.quantity * line.unitPrice);
  const taxBase = Math.max(0, lineSubtotal - line.discountAmount);
  const taxAmount = line.taxable ? round2(taxBase * taxRate) : 0;
  return {
    lineSubtotal,
    taxAmount,
    lineTotal: round2(lineSubtotal - line.discountAmount + taxAmount),
  };
}

/**
 * SHIPPING AND SURCHARGE ARE PART OF THE TOTAL, and were named in this file's
 * header long before they were added here. The mirror stopped at tax, so an
 * invoice carrying a delivery charge showed a Total short by exactly that
 * charge -- sitting beside an "Amount due" read straight off the server, which
 * was right. Two figures on one card that could not both be true.
 *
 * It also made the "Not saved yet" warning fire on documents nobody had edited,
 * because that warning is this number compared with the saved one. A warning
 * that goes off when nothing is wrong is one she learns to ignore, and it is
 * the only thing between her and emailing a stale invoice.
 *
 * Both are document-level and pass through untouched: they are not taxed, not
 * discounted, and added last, exactly as `billing-totals.ts` does it.
 */
export function computeTotals(
  lines: DraftLine[],
  taxRate: number,
  shippingTotal = 0,
  surchargeTotal = 0
): DocumentTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;

  for (const line of lines) {
    const computed = computeLine(line, taxRate);
    subtotal += computed.lineSubtotal;
    discountTotal += line.discountAmount;
    taxTotal += computed.taxAmount;
  }

  subtotal = round2(subtotal);
  discountTotal = round2(discountTotal);
  taxTotal = round2(taxTotal);
  const shipping = round2(shippingTotal);
  const surcharge = round2(surchargeTotal);

  return {
    subtotal,
    discountTotal,
    taxTotal,
    shippingTotal: shipping,
    surchargeTotal: surcharge,
    total: round2(subtotal - discountTotal + taxTotal + shipping + surcharge),
  };
}

let seq = 0;

/** Local-only key. Never sent to the server, never persisted. */
export function newLineKey(): string {
  seq += 1;
  return `line-${String(seq)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankLine(): DraftLine {
  return {
    key: newLineKey(),
    description: '',
    quantity: 1,
    unitPrice: 0,
    discountAmount: 0,
    taxable: true,
  };
}

/** A line the operator started but never filled in — dropped silently on save
 *  rather than rejected, because an empty trailing row is how people leave a
 *  table they're done with, not an error they made. */
export function isBlank(line: DraftLine): boolean {
  return !line.description.trim() && line.unitPrice === 0;
}
