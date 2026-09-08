// Turning what somebody typed into what the server is asked to save.
//
// Kept apart from the screen because the one judgement in here — that a cost of
// zero is NOT an answer — is the reason the screen exists, and it should be
// readable without wading through a table.

import type { UncostedVariant } from './uncosted-data';

/**
 * Whole cents, or null when the box does not hold a usable number.
 *
 * Zero is deliberately not usable. A genuinely free item exists, but letting one
 * through here would leave every figure downstream unable to tell "this cost
 * nothing" from "nobody has said" — which is the exact confusion this whole
 * screen exists to end.
 */
export function parseCost(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const cents = Math.round(Number(trimmed) * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

export interface CostEntry {
  variantId: string;
  costCents: number;
}

/** Only the boxes that hold a real number. A half-typed row is not an entry. */
export function entriesFrom(items: UncostedVariant[], typed: Record<string, string>): CostEntry[] {
  const out: CostEntry[] = [];
  for (const item of items) {
    const cents = parseCost(typed[item.variantId] ?? '');
    if (cents !== null) out.push({ variantId: item.variantId, costCents: cents });
  }
  return out;
}

/**
 * What the typed costs add up to across everything held.
 *
 * Shown before saving because a slipped decimal is obvious at the total and
 * invisible per unit: 4200 against 62 garments reads as $2,604.00 or $26.04,
 * and only one of those looks like a shop.
 */
export function extendedTotal(items: UncostedVariant[], typed: Record<string, string>): number {
  return items.reduce((sum, item) => {
    const cents = parseCost(typed[item.variantId] ?? '');
    return cents === null ? sum : sum + cents * item.onHand;
  }, 0);
}
