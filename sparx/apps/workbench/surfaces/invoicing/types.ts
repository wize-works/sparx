// Shapes returned by /v1/invoicing/documents. Hand-written rather than pulled
// from @wizeworks/api-client's generated openapi.d.ts because the invoicing routes
// aren't in the published spec yet — swap these for the generated types once
// they are, and the surfaces below won't change.

import { invoiceState, type InvoiceStatus, type InvoiceTone } from '../../lib/invoice-status';

export type ArStatus = InvoiceStatus;

export interface BillingParty {
  name?: string;
  email?: string;
  address?: string;
}

/** The server's frozen record of how a markup/pass-through line was priced. */
export interface LineMarkupSnapshotWire {
  ruleId: string | null;
  ruleName: string | null;
  method: string;
  value: number | null;
  marginPct: number;
  markupPct: number;
  costBasisValueCents: number;
}

export interface BillingDocumentLine {
  id?: string;
  lineTypeId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  /** An absolute money reduction on this line, before document-level tax. */
  discountAmount?: number;
  taxable?: boolean;
  productId?: string | null;
  variantId?: string | null;
  /** Cost basis the server resolved, in cents. */
  costCents?: number | null;
  /** Present on a line priced by cost + markup. */
  appliedMarkup?: LineMarkupSnapshotWire | null;
}

/**
 * A stage in a document workflow (docs/87 §3). `stageType` is the semantic
 * role system logic keys off; `customerLabel` is the tenant's own wording for
 * it, which is what operators see everywhere in the UI.
 */
export type DocumentStageType = 'draft' | 'open' | 'committed' | 'final' | 'paid' | 'void';

export interface DocumentStage {
  id: string;
  name: string;
  customerLabel: string;
  stageType: DocumentStageType;
  /** Entry effects — what happens to the document when it ENTERS this stage. */
  snapshotOnEnter: boolean;
  numberOnEnter: boolean;
  /** Prefix for the number minted on entry ('INV-'). Only meaningful with
   *  `numberOnEnter`; null lets the server fall back to its own default. */
  numberPrefix: string | null;
  locksEditing: boolean;
  sortOrder: number;
}

/**
 * One workflow with its stages, as /v1/invoicing/workflows returns it.
 *
 * This is the WHOLE row, not the subset a document needs, because the workflows
 * surfaces configure it — and a second, narrower copy of this type is how a
 * screen ends up saving a field it never fetched. Consumers that only care
 * about the stage chain (lifecycle.tsx) simply read less of it.
 */
export interface DocumentWorkflowDetail {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
  sortOrder: number;
  archivedAt: string | null;
  stages: DocumentStage[];
}

/**
 * A frozen record captured when the document entered a `snapshotOnEnter` stage.
 * Stage label + number are copied at capture time, so a later stage rename or
 * renumber never rewrites what a record claims about the past. The list route
 * also returns the full frozen substance; the UI only needs the header fields —
 * the substance is what `…/snapshots/:id/pdf` renders.
 */
export interface DocumentSnapshot {
  id: string;
  stageType: DocumentStage['stageType'];
  customerLabel: string;
  documentNumber: string | null;
  createdAt: string;
}

/** Semantic tone for a stage — status is its own color axis (docs/23). */
export function stageTone(
  type: DocumentStage['stageType']
): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (type) {
    case 'paid':
      return 'success';
    case 'final':
      return 'warning'; // billable + awaiting money — the same axis as `unpaid`
    case 'committed':
      return 'info';
    case 'open':
      return 'info';
    case 'void':
      return 'danger';
    default:
      return 'neutral'; // draft — nothing binding yet
  }
}

export interface BillingDocument {
  id: string;
  /** Null until the document reaches a numbering stage. */
  number: string | null;
  currency: string;
  /** The CRM customer being billed. A document must reference this or a B2B
   *  account — see the refine on CreateBillingDocumentInput. */
  customerId: string | null;
  billTo: BillingParty | null;
  shipTo: BillingParty | null;
  /**
   * Who this document bills, resolved SERVER-side for list rows.
   *
   * Present on list responses, absent when fetching one document (the detail
   * view has the full relations). It exists because `billTo` is only written
   * when a document is snapshotted — so reading `billTo.name` alone left the
   * customer column empty for every draft and open document, which is most of
   * a working receivables list.
   */
  billedToName?: string | null;
  /**
   * When the customer was actually emailed this, resolved server-side on LIST
   * rows. Null means the bill is still sitting here.
   */
  sentAt?: string | null;
  /**
   * Where a send would actually go, resolved server-side on the single-document
   * read: the frozen `billTo` address first, else the customer's own.
   *
   * The screen must not resolve this itself. `billTo.email` alone is blank on
   * every document nobody typed an address onto, which is most of them, so a
   * confirm reading it would announce there is no address for an invoice whose
   * customer has one — and the send would then succeed anyway, because the
   * server knows the fallback.
   */
  billedToEmail?: string | null;
  /** Free-form bag on the document. Carries `sentAt` / `sentTo`, which is where
   *  the send route records that the customer has it — there is no column. */
  metadata?: Record<string, unknown> | null;
  taxRate: number;
  subtotal: number;
  taxTotal: number;
  /** Document-level charges carried across from the order: not lines, not taxed,
   *  added last. They were missing from this interface, so the editor's running
   *  total was short by exactly the delivery charge and no screen ever showed
   *  it -- see issue 442. */
  shippingTotal: number;
  surchargeTotal: number;
  total: number;
  balance: number;
  amountPaid: number;
  status: ArStatus;
  /** Net-terms due date. Null for pay-now/retail documents with no terms. */
  dueAt: string | null;
  /**
   * Days past due, computed server-side. The UI never re-derives this — if it
   * did, the list and the AR aging report could disagree about whether the same
   * invoice is late.
   */
  overdueDays: number;
  workflowId: string;
  stageId: string;
  lines?: BillingDocumentLine[];
  /** Set once an accepted quote has been converted — the FK lives on Order, so
   *  the API looks it up and sends it along with the document. */
  convertedOrder?: { id: string; orderNumber: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * api-rest's `paged(items, meta)` helper returns `{ success, data: items, meta }`
 * — `data` IS the array, and the page counts live in the sibling `meta`.
 *
 * SparxClient unwraps to `payload.data` and replaces `meta` with HTTP response
 * metadata (status/headers/etag), so the envelope's pagination meta is dropped
 * on the floor today. List surfaces therefore read the array and can't show a
 * total yet; wiring real pagination means teaching the client to surface the
 * envelope meta, not working around it here.
 */
export interface PaginationMeta {
  total: number;
  skip: number;
  per_page: number;
}

/**
 * Coerce a document off the wire.
 *
 * Every money column on BillingDocument is a Prisma `Decimal`, and Decimal
 * serializes to JSON as a STRING — `"409.44"`, not `409.44`. The types above
 * say `number` because that is what the rest of the app needs to be true, so
 * this is the one place the lie gets corrected.
 *
 * It matters more than it looks. `"9.00" < "100.00"` is true as a string
 * comparison, so a list sorting raw wire values puts $100 above $9 — money
 * sorted alphabetically, which looks like a sort that simply doesn't work.
 * Anything reading these fields must go through here first.
 */
function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeDocument(raw: BillingDocument): BillingDocument {
  return {
    ...raw,
    taxRate: num(raw.taxRate),
    subtotal: num(raw.subtotal),
    taxTotal: num(raw.taxTotal),
    shippingTotal: num(raw.shippingTotal),
    surchargeTotal: num(raw.surchargeTotal),
    total: num(raw.total),
    balance: num(raw.balance),
    amountPaid: num(raw.amountPaid),
    overdueDays: num(raw.overdueDays),
    ...(raw.lines
      ? {
          lines: raw.lines.map((line) => ({
            ...line,
            quantity: num(line.quantity),
            unitPrice: num(line.unitPrice),
            discountAmount: num(line.discountAmount),
          })),
        }
      : {}),
  };
}

/** State is its own color axis, independent of the module hue — see docs/23
 *  Semantic-Status. Both invoice panes read the same words and tones from
 *  lib/invoice-status, which is why this re-exports rather than switching. */
export type ArTone = InvoiceTone;
export { invoiceState };

export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
}

/**
 * Money for the summary band, where space is scarce but precision still matters.
 *
 * Compact notation ONLY above five figures. Below that it actively hurts:
 * $545.30 renders as "$545.3", which reads as a typo rather than a total, and
 * an owner looking at what they're owed wants the real number. Past $10k the
 * exact cents stop being the point and the width does.
 */
const COMPACT_THRESHOLD = 10_000;

export function formatMoneyCompact(amount: number, currency = 'USD'): string {
  if (Math.abs(amount) >= COMPACT_THRESHOLD) {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  }
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
}

export interface AgingBucket {
  key: string;
  label: string;
  balance: number;
  count: number;
}

export interface AgingReport {
  buckets: AgingBucket[];
  totalOutstanding: number;
  totalCount: number;
}

/**
 * Due-date phrasing, in the words an owner would use rather than a raw date.
 * `overdueDays` is computed server-side, so the UI never re-derives "how late is
 * this" and can't disagree with the AR report about it.
 */
export function describeDue(
  dueAt: string | null | undefined,
  overdueDays: number
): { label: string; tone: 'danger' | 'warning' | 'muted'; title: string } {
  if (!dueAt) return { label: 'No due date', tone: 'muted', title: 'No payment terms set' };

  const due = new Date(dueAt);
  const title = due.toLocaleDateString(undefined, { dateStyle: 'medium' });

  if (overdueDays > 0) {
    return {
      label: overdueDays === 1 ? '1 day late' : `${String(overdueDays)} days late`,
      tone: 'danger',
      title: `Was due ${title}`,
    };
  }

  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return { label: 'Due today', tone: 'warning', title: `Due ${title}` };
  if (days === 1) return { label: 'Due tomorrow', tone: 'warning', title: `Due ${title}` };
  if (days <= 7)
    return { label: `Due in ${String(days)} days`, tone: 'warning', title: `Due ${title}` };
  return { label: title, tone: 'muted', title: `Due ${title}` };
}
