// b2bArService — order-derived B2B net-terms accounts-receivable, materialised as
// BillingDocuments (docs/87 §15).
//
// This is the convergence of the legacy `b2b_invoices` table into the one billing
// engine. When a B2B order is placed on net terms (checkout / approval) or a staff
// member bills an account by hand, the AR header is a BillingDocument on the system
// `net-terms-ar` workflow — NOT a `b2b_invoices` row.
//
// MODULE OWNERSHIP. This path is gated on the `b2b` module, not `invoicing`:
// `billing_documents` is a SHARED AR substrate, the same way `customers` is shared
// across CRM / Commerce / B2B (a tenant running B2B net terms needn't also activate
// Invoicing). The `invoicing` module gates the authoring SURFACE (dashboard editor,
// workflow / template CRUD, MCP authoring tools) — not the substrate. The workflow
// is therefore lazily ensured here rather than seeded on `invoicing` activation.
//
// The order-derived document is built already-finalised at the Invoice stage: the
// charge came from a placed order, so its lines aren't hand-authored and the stage
// is `final` + numbered + locked + snapshot-on-enter. We construct it directly
// (rather than through the authoring create→addLine→advance path) so the locked
// stage never fights the system build. `recomputeTotals` is still the single money
// authority — it derives totals/balance/status AND re-syncs the account's
// `credit_used`, so every AR mutation keeps credit utilisation consistent.

import { NET_TERMS_AR_WORKFLOW, NET_TERMS_AR_WORKFLOW_SLUG } from '@wizeworks/crm-schemas/builtins';
import { withTenant } from '@wizeworks/db';
import type { DocumentStage, Prisma } from '@wizeworks/db';

import { writeAuditLog } from '../audit';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError, CrmValidationError } from '../errors';
import { recomputeTotals, type DocumentWithLines } from './billing-document-service';
import { buildSnapshotPayload } from './billing-snapshot';
import { snapshotIssuer } from './billing-document-stage-service';
import { formatBillingNumber, nextBillingDocumentSeq } from './record-numbers';

export interface NetTermsArStages {
  workflowId: string;
  invoiceStage: DocumentStage;
  paidStage: DocumentStage;
}

/** Resolve the tenant's system `net-terms-ar` workflow, creating it (with its
 *  Invoice + Paid stages) on first use. Idempotent by slug — safe under
 *  concurrent callers (a duplicate create loses the unique race and is re-read).
 *  Runs inside the caller's transaction. */
export async function ensureNetTermsArWorkflow(
  tx: Prisma.TransactionClient,
  tenantId: string
): Promise<NetTermsArStages> {
  const existing = await tx.documentWorkflow.findUnique({
    where: { tenantId_slug: { tenantId, slug: NET_TERMS_AR_WORKFLOW_SLUG } },
    include: { stages: { orderBy: { sortOrder: 'asc' } } },
  });
  const workflow =
    existing ??
    (await tx.documentWorkflow
      .create({
        data: {
          tenantId,
          name: NET_TERMS_AR_WORKFLOW.name,
          slug: NET_TERMS_AR_WORKFLOW.slug,
          isDefault: false,
          sortOrder: NET_TERMS_AR_WORKFLOW.sortOrder,
          stages: {
            create: NET_TERMS_AR_WORKFLOW.stages.map((s) => ({
              tenantId,
              name: s.name,
              customerLabel: s.customerLabel,
              stageType: s.stageType,
              snapshotOnEnter: s.snapshotOnEnter,
              numberOnEnter: s.numberOnEnter,
              numberPrefix: s.numberPrefix ?? null,
              locksEditing: s.locksEditing,
              color: s.color ?? null,
              sortOrder: s.sortOrder,
            })),
          },
        },
        include: { stages: { orderBy: { sortOrder: 'asc' } } },
      })
      .catch(async (err: unknown) => {
        // Lost the unique(tenantId, slug) race — re-read the winner.
        if (isUniqueViolation(err)) {
          const winner = await tx.documentWorkflow.findUnique({
            where: { tenantId_slug: { tenantId, slug: NET_TERMS_AR_WORKFLOW_SLUG } },
            include: { stages: { orderBy: { sortOrder: 'asc' } } },
          });
          if (winner) return winner;
        }
        throw err;
      }));

  const invoiceStage = workflow.stages.find((s) => s.stageType === 'final');
  const paidStage = workflow.stages.find((s) => s.stageType === 'paid');
  if (!invoiceStage || !paidStage) {
    // A tenant hand-edited the system workflow's stage types away — fall back to
    // sort order so AR creation never hard-fails on a misconfigured workflow.
    const ordered = [...workflow.stages].sort((a, b) => a.sortOrder - b.sortOrder);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (!first || !last) throw new CrmNotFoundError('DocumentStage', NET_TERMS_AR_WORKFLOW_SLUG);
    return { workflowId: workflow.id, invoiceStage: first, paidStage: last };
  }
  return { workflowId: workflow.id, invoiceStage, paidStage };
}

export interface CreateOrderArInput {
  companyId: string;
  /** The site ISSUING this invoice (docs/131 §3.6) — decides whose books the
   *  number comes out of and whose letterhead is frozen onto it. Required rather
   *  than optional: an order-derived AR document inherits the order's site, and a
   *  manual one is issued from the site the operator is working in, so there is
   *  always an answer and no correct default to fall back on. */
  propertyId: string;
  /** Originating Commerce order, when order-derived. Null for a manual AR doc. */
  orderId?: string | null;
  /** The receivable amount in dollars (the order total — tax already included). */
  amount: number;
  currency?: string;
  /** Net-terms due date, precomputed from the account's payment terms. */
  dueAt: Date;
  /** The single line's description (e.g. "Order O-000123"). */
  description?: string;
  /** Honour a caller-supplied human number (the manual route passes one); else a
   *  fresh INV- number is allocated from the issuing SITE's document sequence. */
  numberOverride?: string;
  notes?: string | null;
  /** Frozen bill-to party JSON; defaults to the account's company name. */
  billTo?: Prisma.InputJsonValue;
}

/**
 * Create a finalised net-terms AR document for a B2B account. Builds the document
 * at the Invoice stage with one synthetic line carrying the receivable, derives
 * totals/balance/status (→ unpaid, balance = amount), freezes the Invoice
 * snapshot, and re-syncs the account's credit utilisation. Composes into the
 * caller's transaction (`ctx.tx`) so it's atomic with order placement.
 */
export async function createOrderArDocument(
  ctx: ServiceContext,
  input: CreateOrderArInput
): Promise<DocumentWithLines> {
  return withTenant(ctx, async (tx) => {
    const account = await tx.company.findUnique({
      where: { id: input.companyId },
      select: { id: true, companyName: true },
    });
    if (!account) throw new CrmNotFoundError('Company', input.companyId);

    const { workflowId, invoiceStage } = await ensureNetTermsArWorkflow(tx, ctx.tenantId);
    // The issuing site's own sequence (docs/131 §3.6) — this AR invoice lands in
    // that business's books, not in a tenant-wide run shared with a sibling.
    const seq = await nextBillingDocumentSeq(tx, ctx.tenantId, input.propertyId);
    const number = input.numberOverride ?? formatBillingNumber('INV-', seq);
    const amount = round2(input.amount);
    const now = new Date();

    const doc = await tx.billingDocument.create({
      data: {
        tenantId: ctx.tenantId,
        propertyId: input.propertyId,
        workflowId,
        stageId: invoiceStage.id,
        companyId: input.companyId,
        currency: input.currency ?? 'USD',
        number,
        numberSeq: seq,
        dueAt: input.dueAt,
        finalizedAt: now,
        // This document is finalized the moment it is written, so its issuer is
        // frozen here for the same reason `applyStageEntryEffects` freezes one:
        // renaming a site, or editing the legal entity address, would otherwise
        // rewrite the letterhead on AR invoices already in accounts' hands.
        // This path constructs directly rather than going through that helper,
        // which is exactly how it came to be the one finalized document with no
        // issuer on it at all.
        issuedBy: await snapshotIssuer(tx, ctx.tenantId, input.propertyId),
        notes: input.notes ?? null,
        billTo: input.billTo ?? { name: account.companyName },
        metadata: input.orderId
          ? { source: 'b2b_order', orderId: input.orderId }
          : { source: 'b2b_manual' },
      },
    });

    // One synthetic line carrying the order total. Flat + non-taxable: the order
    // already computed and included tax, so the AR amount is authoritative as-is.
    await tx.billingDocumentLine.create({
      data: {
        tenantId: ctx.tenantId,
        documentId: doc.id,
        lineTypeId: null,
        description: input.description ?? (input.orderId ? 'Order charge' : 'Invoice'),
        quantity: 1,
        unitPrice: amount,
        taxable: false,
        lineSubtotal: amount,
        lineTotal: amount,
        sortOrder: 0,
      },
    });

    // Single money authority — derives subtotal/total/balance/status (→ unpaid)
    // and re-syncs the account's credit_used from open AR.
    await recomputeTotals(tx, ctx.tenantId, doc.id);

    // Freeze the immutable Invoice snapshot (the stage is snapshotOnEnter; we
    // construct directly, so freeze here).
    const finalDoc = await tx.billingDocument.findUniqueOrThrow({ where: { id: doc.id } });
    const lines = await tx.billingDocumentLine.findMany({
      where: { documentId: doc.id },
      orderBy: { sortOrder: 'asc' },
    });
    await tx.billingDocumentSnapshot.create({
      data: {
        tenantId: ctx.tenantId,
        documentId: doc.id,
        stageId: invoiceStage.id,
        stageType: invoiceStage.stageType,
        customerLabel: invoiceStage.customerLabel,
        documentNumber: finalDoc.number,
        snapshot: buildSnapshotPayload(
          finalDoc,
          lines,
          invoiceStage
        ) as unknown as Prisma.InputJsonValue,
        createdById: ctx.userId ?? null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'invoicing.b2b_ar.created',
      entityType: 'BillingDocument',
      entityId: doc.id,
      diff: { after: { number, amount, orderId: input.orderId ?? null } },
    });

    return tx.billingDocument.findUniqueOrThrow({
      where: { id: doc.id },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
  });
}

/** Edit an OPEN net-terms AR document's due date / notes (the legacy unpaid-only
 *  PATCH). The order-derived document sits on a locked stage, so this bypasses the
 *  authoring header-update lock — but only for the two safe fields, and never on a
 *  paid/void document. `recomputeTotals` re-derives the overdue status from the new
 *  due date and re-syncs credit. */
export async function updateArDocument(
  ctx: ServiceContext,
  documentId: string,
  patch: { dueAt?: Date; notes?: string }
): Promise<DocumentWithLines> {
  return withTenant(ctx, async (tx) => {
    const before = await tx.billingDocument.findUnique({ where: { id: documentId } });
    if (before?.deletedAt !== null) throw new CrmNotFoundError('BillingDocument', documentId);
    if (before.status === 'paid' || before.status === 'void') {
      throw new CrmValidationError(`Cannot edit a ${before.status} invoice.`);
    }
    await tx.billingDocument.update({
      where: { id: documentId },
      data: {
        ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      },
    });
    await recomputeTotals(tx, ctx.tenantId, documentId);
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'invoicing.b2b_ar.updated',
      entityType: 'BillingDocument',
      entityId: documentId,
      diff: null,
    });
    return tx.billingDocument.findUniqueOrThrow({
      where: { id: documentId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
  });
}

/** Void a net-terms AR document (the legacy "write off"). Stamps `voidedAt` and
 *  recomputes — status → void, balance drops out of the account's open AR so
 *  `credit_used` is released. Append-only history is preserved (the Invoice
 *  snapshot stays); voiding never deletes. */
export async function voidArDocument(
  ctx: ServiceContext,
  documentId: string,
  opts: { note?: string } = {}
): Promise<DocumentWithLines> {
  return withTenant(ctx, async (tx) => {
    const before = await tx.billingDocument.findUnique({ where: { id: documentId } });
    if (before?.deletedAt !== null) throw new CrmNotFoundError('BillingDocument', documentId);
    await tx.billingDocument.update({
      where: { id: documentId },
      data: {
        voidedAt: before.voidedAt ?? new Date(),
        ...(opts.note !== undefined ? { notes: opts.note } : {}),
      },
    });
    // recomputeTotals derives status 'void' from voidedAt and re-syncs credit.
    await recomputeTotals(tx, ctx.tenantId, documentId);
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'invoicing.b2b_ar.voided',
      entityType: 'BillingDocument',
      entityId: documentId,
      diff: { before: { number: before.number, status: before.status } },
    });
    return tx.billingDocument.findUniqueOrThrow({
      where: { id: documentId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
  });
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
