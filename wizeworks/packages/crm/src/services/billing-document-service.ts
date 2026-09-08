// billingDocumentService — authored billing documents (docs/87 §2/§6/§7).
//
// Document header CRUD + total recomputation. Line add/update/remove (and the
// per-line pricing that feeds totals) live in billing-line-service.ts so each
// file stays focused; both share `recomputeTotals` here. A document bills a
// retail Customer OR a Company (the Deal pattern) and sits on a workflow at a
// stage. Totals derive from the lines + the document's taxRate/shipping/surcharge.

import {
  CreateBillingDocumentInput,
  ListBillingDocumentsInput,
  UpdateBillingDocumentInput,
} from '@wizeworks/crm-schemas';
// `Prisma` as a VALUE, not a type-only import: `Prisma.DbNull` is a runtime
// sentinel, and it is the only way to ask a nullable Json column whether a key
// is present.
import { Prisma, withTenant } from '@wizeworks/db';
import type { BillingDocument, BillingDocumentLine } from '@wizeworks/db';

import { writeAuditLog } from '../audit';
import { publishCrmEvent, type CrmTopic } from '../events';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError, CrmValidationError } from '../errors';
import {
  aggregatePayments,
  deriveDocumentStatus,
  bucketAging,
  AGING_BUCKETS,
  type AgingBucketKey,
} from './billing-ar';
import { applyStageEntryEffects } from './billing-document-stage-service';
import { computeBillingTotals } from './billing-totals';

/** The tenant's primary site — the issuer for a document created without one
 *  (docs/131 §3.6). Every tenant has exactly one, seeded at provisioning, so the
 *  throw is a real invariant violation rather than a routine miss. */
async function resolvePrimarySiteId(
  tx: Prisma.TransactionClient,
  tenantId: string
): Promise<string> {
  const row = await tx.property.findFirst({
    where: { tenantId, isPrimary: true },
    select: { id: true },
  });
  if (!row) throw new CrmNotFoundError('Property', `primary for tenant ${tenantId}`);
  return row.id;
}

interface PendingDocEvent {
  topic: CrmTopic;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

export interface DocumentWithLines extends BillingDocument {
  lines: BillingDocumentLine[];
  /**
   * Where this document would actually be sent, resolved the same way the send
   * route resolves it: the frozen `billTo` address first, else the customer's.
   *
   * It exists because the console could only see `billTo.email`, so the Send
   * dialog told the owner "there is no email address on this invoice" about an
   * invoice whose customer has one — and then sent it anyway when she confirmed,
   * because the server knew the fallback and the screen did not. One rule, read
   * from one place.
   *
   * Optional: only the single-document read resolves it.
   */
  billedToEmail?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────

/** A list row: the document plus the billed party resolved for display. */
export interface BillingDocumentListItem extends BillingDocument {
  billedToName: string | null;
  /** When the customer was actually emailed this, or null. Read off the metadata
   *  bag, which is where the send route records it — there is no column. Lifted
   *  onto the row because "unpaid" and "never sent" look identical otherwise. */
  sentAt: string | null;
}

export async function list(
  ctx: ServiceContext,
  rawFilter: unknown = {}
): Promise<{ items: BillingDocumentListItem[]; total: number }> {
  const filter = ListBillingDocumentsInput.parse(rawFilter);
  return withTenant(ctx, async (tx) => {
    const where: Prisma.BillingDocumentWhereInput = {
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      // Member access ceiling (docs/131 §3.3): only the member's businesses'
      // documents. propertyId is required here, so no null case to admit.
      ...(filter.propertyIds ? { propertyId: { in: filter.propertyIds } } : {}),
      ...(filter.workflowId ? { workflowId: filter.workflowId } : {}),
      ...(filter.stageId ? { stageId: filter.stageId } : {}),
      ...(filter.customerId ? { customerId: filter.customerId } : {}),
      // A COMPANY'S DOCUMENTS INCLUDE ITS PEOPLE'S. Billing a named contact
      // writes `customerId` and leaves `companyId` null — which is correct, that
      // is who the document is made out to — so matching the column alone
      // answered "what has been billed to this company as an entity", not "what
      // does this company owe me". A trade supplier deciding whether to release
      // the next order needs the second one, and the first reads as a company
      // with no debts while somebody there is 60 days late.
      //
      // Wrapped in `AND` so it composes with the `q` search below rather than
      // one `OR` key silently overwriting the other.
      ...(filter.companyId
        ? {
            AND: [
              {
                OR: [
                  { companyId: filter.companyId },
                  { customer: { companyId: filter.companyId } },
                ],
              },
            ],
          }
        : {}),
      ...(filter.status ? { status: filter.status } : {}),
      // WAS IT ACTUALLY SENT? There is no `sent_at` column — the send route
      // records it in the metadata bag — so this asks whether that key is
      // present. `not: Prisma.DbNull` rather than a JSON equality, because the
      // value is a timestamp string nobody knows in advance.
      //
      // Worth filtering to because an unpaid invoice nobody sent and an unpaid
      // invoice sent three weeks ago read identically on this list and are
      // completely different problems, and only one of them is the customer's
      // fault. It is also what makes the dunning ladder's new "was it sent"
      // guard safe: a bill she never sends is no longer chased, so it has to be
      // findable here instead.
      ...(filter.sent === undefined
        ? {}
        : filter.sent
          ? { metadata: { path: ['sentAt'], not: Prisma.DbNull } }
          : { NOT: { metadata: { path: ['sentAt'], not: Prisma.DbNull } } }),
      // No denormalized customer/account name column (bill-to/ship-to are
      // frozen JSON, not queryable) — search the document number directly and
      // fall back to the live customer/B2B-account relations.
      ...(filter.q
        ? {
            OR: [
              { number: { contains: filter.q, mode: 'insensitive' } },
              { customer: { firstName: { contains: filter.q, mode: 'insensitive' } } },
              { customer: { lastName: { contains: filter.q, mode: 'insensitive' } } },
              { customer: { email: { contains: filter.q, mode: 'insensitive' } } },
              { company: { companyName: { contains: filter.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      tx.billingDocument.findMany({
        where,
        orderBy: orderByFor(filter.sortBy, filter.order),
        take: filter.limit,
        skip: filter.offset,
        // The billed party, resolved for the LIST.
        //
        // Without this a list row carries `customerId` and the frozen `billTo`
        // JSON, and nothing else — and `billTo` is only written when a document
        // is snapshotted, so every draft and every open document showed a blank
        // customer column. "INV-000002, unpaid, $100.00" with no name is not a
        // row anyone can act on; identifying who owes you is the entire job of
        // a receivables list.
        include: {
          customer: { select: { firstName: true, lastName: true, companyName: true, email: true } },
          company: { select: { companyName: true } },
        },
      }),
      tx.billingDocument.count({ where }),
    ]);

    const items = rows.map(({ customer, company, ...document }) => ({
      ...document,
      billedToName: billedToName(document.billTo, customer, company),
      sentAt: sentAtOf(document.metadata),
    }));
    return { items, total };
  });
}

/** When the send route last emailed this document. One reader, so the shape of
 *  the metadata bag is decoded in one place rather than at each call site. */
function sentAtOf(metadata: Prisma.JsonValue): string | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>).sentAt;
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

/** The address frozen on the document itself, when there is one. */
function frozenEmail(billTo: Prisma.JsonValue): string | null {
  if (billTo && typeof billTo === 'object' && !Array.isArray(billTo)) {
    const value = (billTo as Record<string, unknown>).email;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** Shape of the two relations the list resolves a name from. */
type BilledCustomer = {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
} | null;
type BilledAccount = { companyName: string } | null;

/**
 * Who this document bills, as one display string.
 *
 * Resolution order matters and is not arbitrary. The FROZEN `billTo` wins when
 * present: once a document is issued it must keep naming whoever it named at
 * the time, even if that customer later changes their name or is deleted — that
 * is the whole reason bill-to is snapshotted rather than joined. The live
 * relations are the fallback for everything not yet frozen, which in practice
 * is every draft and open document.
 */
function billedToName(
  billTo: Prisma.JsonValue,
  customer: BilledCustomer,
  account: BilledAccount
): string | null {
  if (billTo && typeof billTo === 'object' && !Array.isArray(billTo)) {
    const frozen = (billTo as Record<string, unknown>).name;
    if (typeof frozen === 'string' && frozen.trim()) return frozen;
  }
  if (account?.companyName) return account.companyName;
  if (customer) {
    const person = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
    return customer.companyName ?? (person || customer.email) ?? null;
  }
  return null;
}

/**
 * Sort order for a paged list.
 *
 * Two things here are load-bearing for PAGINATION specifically, not just for
 * sorting, and both are invisible until a list is long enough to page:
 *
 * 1. The `id` tiebreaker. `skip`/`take` re-runs the query per page, and rows
 *    that tie on the sort column have no guaranteed order between runs — so a
 *    document can appear on both page 1 and page 2 while another is never
 *    shown at all. Postgres is free to do this; it is not a bug you can rely
 *    on not hitting. A unique final key makes the total order deterministic.
 *
 * 2. NULLS LAST in both directions. `dueAt` is null for a document with no due
 *    date and `numberSeq` is null for an unnumbered draft. Postgres defaults to
 *    NULLS LAST ascending but NULLS FIRST descending, so "newest due date
 *    first" would otherwise open with a block of documents that have no due
 *    date at all — the least useful rows, in the most prominent position.
 */
function orderByFor(
  sortBy: ListBillingDocumentsInput['sortBy'],
  order: ListBillingDocumentsInput['order']
): Prisma.BillingDocumentOrderByWithRelationInput[] {
  const nullable = { sort: order, nulls: 'last' } as const;

  switch (sortBy) {
    // Sorts on the LIVE relation, while the column displays the frozen
    // bill-to name where one exists — so an issued document that was renamed
    // at the customer's end sorts by its current name and displays its
    // historical one. That is the lesser of the two evils: the alternative is
    // no customer sort at all, because the frozen name lives in JSON and
    // cannot be ordered by. Documents billing a B2B account order by company
    // name; the two groups therefore cluster rather than interleave.
    case 'customer':
      return [
        { company: { companyName: order } },
        { customer: { companyName: order } },
        { customer: { lastName: order } },
        { id: order },
      ];
    // URGENCY, not the alphabet. `statusRank` is a generated column
    // (overdue 10 → unpaid 20 → partial 30 → paid 40 → void 50), so ascending
    // is "what needs chasing first" — which is what an operator means when
    // they sort a receivables list by status. Ordering on `status` itself
    // would sort the text and put PAID second.
    case 'status':
      return [{ statusRank: order }, { dueAt: nullable }, { id: order }];
    case 'number':
      return [{ numberSeq: nullable }, { id: order }];
    case 'dueAt':
      return [{ dueAt: nullable }, { id: order }];
    case 'total':
      return [{ total: order }, { id: order }];
    case 'balance':
      return [{ balance: order }, { id: order }];
    case 'createdAt':
      return [{ createdAt: order }, { id: order }];
    case 'updatedAt':
      return [{ updatedAt: order }, { id: order }];
  }
}

export interface AgingBucketOut {
  key: AgingBucketKey;
  label: string;
  count: number;
  balance: number;
}

export interface AgingReport {
  asOf: string;
  buckets: AgingBucketOut[];
  totalOutstanding: number;
  totalCount: number;
}

/** AR aging report (docs/87 §8): open billing documents bucketed by days past
 *  due. Lives on the invoicing surface but is the canonical AR view that B2B /
 *  Commerce dashboards pull from. Scope it to one B2B account (`companyId`) or
 *  to all B2B AR (`b2bOnly`, e.g. the B2B Invoices page) — otherwise it spans every
 *  open document. Reads only `unpaid | partial | overdue` — `paid`/`void` carry no
 *  balance. */
export async function aging(
  ctx: ServiceContext,
  filter: { companyId?: string; b2bOnly?: boolean } = {}
): Promise<AgingReport> {
  const scope: Prisma.BillingDocumentWhereInput = filter.companyId
    ? { companyId: filter.companyId }
    : filter.b2bOnly
      ? { companyId: { not: null } }
      : {};
  return withTenant(ctx, async (tx) => {
    const rows = await tx.billingDocument.findMany({
      where: {
        deletedAt: null,
        status: { in: ['unpaid', 'partial', 'overdue'] },
        ...scope,
      },
      select: { balance: true, dueAt: true },
    });
    const now = new Date();
    const grouped = bucketAging(
      rows.map((r) => ({ balance: Number(r.balance), dueAt: r.dueAt })),
      now
    );
    const buckets: AgingBucketOut[] = AGING_BUCKETS.map(({ key, label }) => ({
      key,
      label,
      count: grouped[key].count,
      balance: grouped[key].balance,
    }));
    return {
      asOf: now.toISOString(),
      buckets,
      totalOutstanding: Math.round(buckets.reduce((s, b) => s + b.balance, 0) * 100) / 100,
      totalCount: buckets.reduce((s, b) => s + b.count, 0),
    };
  });
}

export async function get(ctx: ServiceContext, documentId: string): Promise<DocumentWithLines> {
  const doc = await withTenant(ctx, (tx) =>
    tx.billingDocument.findUnique({
      where: { id: documentId },
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        customer: { select: { email: true } },
      },
    })
  );
  if (doc?.deletedAt !== null) throw new CrmNotFoundError('BillingDocument', documentId);
  const { customer, ...document } = doc;
  return { ...document, billedToEmail: frozenEmail(document.billTo) ?? customer?.email ?? null };
}

// ─────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────

export async function create(ctx: ServiceContext, rawInput: unknown): Promise<DocumentWithLines> {
  const input = CreateBillingDocumentInput.parse(rawInput);
  const { document, events } = await withTenant(ctx, async (tx) => {
    const workflow = await tx.documentWorkflow.findUnique({
      where: { id: input.workflowId },
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
    });
    if (workflow?.archivedAt !== null) {
      throw new CrmNotFoundError('DocumentWorkflow', input.workflowId);
    }
    if (workflow.stages.length === 0) {
      throw new CrmValidationError(
        'This workflow has no stages — add a stage before creating a document.'
      );
    }
    // Resolve the starting stage: the one supplied (must belong to the workflow)
    // or the workflow's first stage.
    const stage = input.stageId
      ? workflow.stages.find((s) => s.id === input.stageId)
      : workflow.stages[0];
    if (!stage) throw new CrmNotFoundError('DocumentStage', input.stageId ?? '(first)');

    await assertPartyExists(tx, input.customerId ?? null, input.companyId ?? null);

    // The ISSUING site (docs/131 §3.6) — set once at create and never changed,
    // because it is what `numberSeq` is allocated against. Re-homing a document
    // after it has a number would take a number out of one business's books and
    // drop it into another's, leaving a gap in the first.
    const propertyId = input.propertyId ?? (await resolvePrimarySiteId(tx, ctx.tenantId));

    const created = await tx.billingDocument.create({
      data: {
        tenantId: ctx.tenantId,
        propertyId,
        workflowId: workflow.id,
        stageId: stage.id,
        customerId: input.customerId ?? null,
        companyId: input.companyId ?? null,
        assignedUserId: input.assignedUserId ?? null,
        currency: input.currency,
        taxRate: input.taxRate,
        billTo: (input.billTo ?? null) as Prisma.InputJsonValue,
        shipTo: (input.shipTo ?? null) as Prisma.InputJsonValue,
        shippingTotal: input.shippingTotal,
        surchargeTotal: input.surchargeTotal,
        notes: input.notes ?? null,
        customerNote: input.customerNote ?? null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    // Run the starting stage's entry effects — the default single-stage Invoice
    // mints its INV- number on create (§9); a snapshot-on-enter first stage would
    // freeze here too. Treated identically to any later transition.
    const { events: entryEvents } = await applyStageEntryEffects(tx, ctx, created, stage);

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'invoicing.document.created',
      entityType: 'BillingDocument',
      entityId: created.id,
      diff: { after: { workflowId: workflow.id, stageId: stage.id } },
    });

    const withLines = await tx.billingDocument.findUniqueOrThrow({
      where: { id: created.id },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
    const createdEvent: PendingDocEvent = {
      topic: 'crm.billing_document.created',
      payload: {
        documentId: withLines.id,
        number: withLines.number,
        customerId: withLines.customerId,
        companyId: withLines.companyId,
        workflowId: withLines.workflowId,
        stageId: withLines.stageId,
        currency: withLines.currency,
      },
      dedupeKey: `crm.billing_document.created:${withLines.id}`,
    };
    return { document: withLines, events: [createdEvent, ...entryEvents] };
  });

  for (const e of events) {
    await publishCrmEvent({
      tenantId: ctx.tenantId,
      topic: e.topic,
      payload: e.payload,
      dedupeKey: e.dedupeKey,
    });
  }
  return document;
}

export async function update(
  ctx: ServiceContext,
  documentId: string,
  rawInput: unknown
): Promise<DocumentWithLines> {
  const input = UpdateBillingDocumentInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const before = await tx.billingDocument.findUnique({
      where: { id: documentId },
      include: { stage: true },
    });
    if (before?.deletedAt !== null) throw new CrmNotFoundError('BillingDocument', documentId);
    // A locked stage (final/paid) freezes the header too — taxRate/shipping edits
    // would otherwise diverge the live totals from the frozen snapshot.
    if (before.stage.locksEditing) {
      throw new CrmValidationError('This document is locked for editing at its current stage.');
    }

    if (input.customerId !== undefined || input.companyId !== undefined) {
      const customerId = input.customerId !== undefined ? input.customerId : before.customerId;
      const companyId = input.companyId !== undefined ? input.companyId : before.companyId;
      if (!customerId && !companyId) {
        throw new CrmValidationError('A billing document must bill a customer or a B2B account.');
      }
      await assertPartyExists(tx, customerId, companyId);
    }

    await tx.billingDocument.update({
      where: { id: documentId },
      data: {
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
        ...(input.assignedUserId !== undefined ? { assignedUserId: input.assignedUserId } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.billTo !== undefined
          ? { billTo: (input.billTo ?? null) as Prisma.InputJsonValue }
          : {}),
        ...(input.shipTo !== undefined
          ? { shipTo: (input.shipTo ?? null) as Prisma.InputJsonValue }
          : {}),
        ...(input.shippingTotal !== undefined ? { shippingTotal: input.shippingTotal } : {}),
        ...(input.surchargeTotal !== undefined ? { surchargeTotal: input.surchargeTotal } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.customerNote !== undefined ? { customerNote: input.customerNote } : {}),
        ...(input.declinedReason !== undefined ? { declinedReason: input.declinedReason } : {}),
        ...(input.validUntil !== undefined
          ? { validUntil: input.validUntil ? new Date(input.validUntil) : null }
          : {}),
        ...(input.dueAt !== undefined ? { dueAt: input.dueAt ? new Date(input.dueAt) : null } : {}),
        ...(input.metadata !== undefined
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'invoicing.document.updated',
      entityType: 'BillingDocument',
      entityId: documentId,
      diff: null,
    });
    // taxRate / shipping / surcharge feed totals — recompute after a header edit.
    const doc = await recomputeTotals(tx, ctx.tenantId, documentId);
    return tx.billingDocument.findUniqueOrThrow({
      where: { id: doc.id },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
  });
}

/** Soft-delete a document (deletedAt). Destructive — the dashboard gates it
 *  behind a confirm. */
export async function remove(ctx: ServiceContext, documentId: string): Promise<{ id: string }> {
  return withTenant(ctx, async (tx) => {
    const before = await tx.billingDocument.findUnique({ where: { id: documentId } });
    if (before?.deletedAt !== null) throw new CrmNotFoundError('BillingDocument', documentId);
    await tx.billingDocument.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'invoicing.document.deleted',
      entityType: 'BillingDocument',
      entityId: documentId,
      diff: { before: { number: before.number } },
    });
    return { id: documentId };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Shared helpers (used by billing-line-service)
// ─────────────────────────────────────────────────────────────────────────

/** Recompute and persist the full money picture from the document's current
 *  lines (subtotal/tax/total), payment rows (amountPaid/depositTotal), and AR
 *  state (balance/status/paidAt). The single authority for the cached totals —
 *  every line, payment, and header edit funnels through here. Runs inside the
 *  caller's transaction. */
export async function recomputeTotals(
  tx: Prisma.TransactionClient,
  tenantId: string,
  documentId: string
): Promise<BillingDocument> {
  const doc = await tx.billingDocument.findUnique({
    where: { id: documentId },
    include: { lines: true, payments: true },
  });
  if (!doc) throw new CrmNotFoundError('BillingDocument', documentId);

  const totals = computeBillingTotals(
    doc.lines.map((l) => ({
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      discountAmount: Number(l.discountAmount),
      taxable: l.taxable,
    })),
    Number(doc.taxRate),
    Number(doc.shippingTotal),
    Number(doc.surchargeTotal)
  );
  const { amountPaid, depositTotal } = aggregatePayments(
    doc.payments.map((p) => ({ kind: p.kind, amount: Number(p.amount) }))
  );
  const balance = round2(totals.total - amountPaid);
  const now = new Date();
  const status = deriveDocumentStatus({
    total: totals.total,
    amountPaid,
    dueAt: doc.dueAt,
    voided: doc.voidedAt !== null,
    now,
  });
  const paidAt = status === 'paid' ? (doc.paidAt ?? now) : null;

  const updated = await tx.billingDocument.update({
    where: { id: documentId },
    data: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      amountPaid,
      depositTotal,
      balance,
      status,
      paidAt,
    },
  });

  // A B2B document's open balance IS the account's net-terms AR (docs/87 §15), so
  // this single money chokepoint is also where credit utilisation re-syncs — every
  // create / line / payment / void funnels through here, so `credit_used` can never
  // drift from open AR regardless of which surface mutated the document. Retail
  // documents (no account) skip it. The function sums open `billing_documents`
  // balances and is RLS-safe (runs under the caller's tenant GUC).
  if (updated.companyId) {
    await tx.$executeRaw`SELECT sync_b2b_credit_used(${updated.companyId}::uuid)`;
  }

  return updated;
}

/** Throw a clean NOT_FOUND if a referenced party doesn't exist for this tenant,
 *  instead of letting an FK violation surface. */
async function assertPartyExists(
  tx: Prisma.TransactionClient,
  customerId: string | null,
  companyId: string | null
): Promise<void> {
  if (customerId) {
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (customer?.deletedAt !== null) throw new CrmNotFoundError('Customer', customerId);
  }
  if (companyId) {
    const account = await tx.company.findUnique({ where: { id: companyId } });
    if (!account) throw new CrmNotFoundError('Company', companyId);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
