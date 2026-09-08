// AR (accounts-receivable) derivation for billing documents (docs/87 §8). Pure +
// DB-free so the status machine and payment aggregation are unit-testable. The
// document's status is PAYMENT-derived and independent of the workflow stage:
// moving a card to a "Paid" stage doesn't mark money received — recording a
// payment does.

export type DocumentStatus = 'unpaid' | 'partial' | 'paid' | 'overdue' | 'void';

export interface DeriveStatusArgs {
  total: number;
  amountPaid: number;
  dueAt: Date | null;
  voided: boolean;
  now: Date;
}

/** The AR status machine. Precedence: void > paid > overdue > partial > unpaid.
 *  `overdue` is a past-due balance (any unpaid/partial amount past `dueAt`); a
 *  fully-paid document is never overdue. */
export function deriveDocumentStatus(args: DeriveStatusArgs): DocumentStatus {
  const { total, amountPaid, dueAt, voided, now } = args;
  if (voided) return 'void';
  const pastDue = dueAt !== null && dueAt.getTime() < now.getTime();
  if (amountPaid <= 0) {
    // Nothing paid: overdue only if something is actually owed past the due date.
    return pastDue && total > 0 ? 'overdue' : 'unpaid';
  }
  if (amountPaid >= total) return 'paid';
  return pastDue ? 'overdue' : 'partial';
}

export interface PaymentRow {
  kind: string;
  amount: number;
}

/** Aggregate payment rows into the document's cached money fields. A `refund`
 *  reduces amountPaid; a `deposit` counts toward both amountPaid and the deposit
 *  subtotal; anything else is treated as a regular payment. */
export function aggregatePayments(rows: PaymentRow[]): {
  amountPaid: number;
  depositTotal: number;
} {
  let payments = 0;
  let deposits = 0;
  let refunds = 0;
  for (const r of rows) {
    if (r.kind === 'refund') refunds += r.amount;
    else if (r.kind === 'deposit') deposits += r.amount;
    else payments += r.amount;
  }
  return {
    amountPaid: round2(payments + deposits - refunds),
    depositTotal: round2(deposits),
  };
}

/** The agreed window, in days, from a company's payment terms. `CreateCompanyInput`
 *  admits exactly two shapes -- "prepay" or "net" + 1-365 -- so this reads the
 *  digits out of "net30" and answers 0 for everything else. Zero is not "no
 *  answer": it means DUE IMMEDIATELY, which is what "prepay" and a walk-in with
 *  no company both come to. Callers must date that from the day the customer
 *  receives the bill, never from the day it was raised -- see `dueDateFromTerms`. */
export function netTermsDays(paymentTerms: string | null | undefined): number {
  if (!paymentTerms) return 0;
  const match = /(\d+)/.exec(paymentTerms);
  return match ? Number(match[1]) : 0;
}

// ─────────────────────────────────────────────────────────────────────────
// AR aging — bucket open balances by how far past due they are (docs/87 §8).
// Pure so the bucketing rules are unit-testable independent of the DB query.
// ─────────────────────────────────────────────────────────────────────────

export type AgingBucketKey = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export const AGING_BUCKETS: { key: AgingBucketKey; label: string }[] = [
  { key: 'current', label: 'Current' },
  { key: 'd1_30', label: '1–30 days' },
  { key: 'd31_60', label: '31–60 days' },
  { key: 'd61_90', label: '61–90 days' },
  { key: 'd90_plus', label: '90+ days' },
];

export interface AgingInputRow {
  balance: number;
  dueAt: Date | null;
}

/** Bucket open balances by days past `dueAt`. A row with no `dueAt` (a pay-now
 *  retail document, not on terms) counts as `current`; a non-positive balance is
 *  skipped. `current` also holds anything not yet past due. */
export function bucketAging(
  rows: AgingInputRow[],
  now: Date
): Record<AgingBucketKey, { count: number; balance: number }> {
  const out: Record<AgingBucketKey, { count: number; balance: number }> = {
    current: { count: 0, balance: 0 },
    d1_30: { count: 0, balance: 0 },
    d31_60: { count: 0, balance: 0 },
    d61_90: { count: 0, balance: 0 },
    d90_plus: { count: 0, balance: 0 },
  };
  const DAY = 86_400_000;
  for (const r of rows) {
    if (r.balance <= 0) continue;
    const daysPast = r.dueAt ? Math.floor((now.getTime() - r.dueAt.getTime()) / DAY) : 0;
    const key: AgingBucketKey =
      daysPast <= 0
        ? 'current'
        : daysPast <= 30
          ? 'd1_30'
          : daysPast <= 60
            ? 'd31_60'
            : daysPast <= 90
              ? 'd61_90'
              : 'd90_plus';
    out[key].count += 1;
    out[key].balance = round2(out[key].balance + r.balance);
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
