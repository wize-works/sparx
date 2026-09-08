// billingDocumentStageService — stage advancement, snapshots, and per-stage
// numbering for authored billing documents (docs/87 §3/§4/§9).
//
// Advancing a document to a new stage runs that stage's configured ENTRY
// EFFECTS, in order:
//   1. numberOnEnter   → allocate the stable per-SITE sequence once (docs/131
//      §3.6), then (re)format the visible number with this stage's prefix
//      (EST-… → INV-…).
//   2. open / final     → FREEZE the issuer identity and set the due date: the
//      document has become a bill somebody is handed, so who is billing them
//      and when it is owed both stop moving here.
//   2b. final / void    → stamp finalizedAt / voidedAt + AR status.
//   3. snapshotOnEnter  → freeze an immutable BillingDocumentSnapshot of the
//      document exactly as it stands (lines + totals + party), AFTER numbering
//      so the frozen copy carries the right number.
//   4. locksEditing     → enforced in billing-line-service / header update; the
//      frozen snapshot is what preserves the approved/final state regardless.
//
// `applyStageEntryEffects` is exported so document CREATE can run the initial
// stage's effects too (the default single-stage Invoice mints its INV- number on
// create, §9). Snapshots are append-only — a void/correction adds a new row, it
// never rewrites one.

import { AdvanceBillingDocumentInput } from '@wizeworks/crm-schemas';
import { withTenant } from '@wizeworks/db';
import type {
  BillingDocument,
  BillingDocumentSnapshot,
  DocumentStage,
  Prisma,
} from '@wizeworks/db';

import { writeAuditLog } from '../audit';
import { publishCrmEvent, type CrmTopic } from '../events';
import type { ServiceContext } from '../errors';
import { CrmNotFoundError, CrmValidationError } from '../errors';
import { netTermsDays } from './billing-ar';
import { buildSnapshotPayload } from './billing-snapshot';
import type { DocumentWithLines } from './billing-document-service';
import { formatBillingNumber, nextBillingDocumentSeq } from './record-numbers';

// Fallback when a stage is configured `numberOnEnter` without a prefix — the
// universal invoice prefix. Seeded workflows always set one; this only guards a
// hand-edited stage.
const DEFAULT_NUMBER_PREFIX = 'INV-';

/** The company whose terms apply — the customer's employer, when the document
 *  itself is not addressed to a company. Null for a walk-in with no employer on
 *  file, which is the honest answer: nobody agreed any terms with them. */
async function payerCompanyId(
  tx: Prisma.TransactionClient,
  customerId: string | null
): Promise<string | null> {
  if (!customerId) return null;
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { companyId: true },
  });
  return customer?.companyId ?? null;
}

/**
 * WHEN THIS BILL IS DUE, counted from the day the customer gets it.
 *
 * The payer's employer supplies the window ("net 30" -> 30 days). Nobody on file,
 * or terms that name no number, means ZERO days -- which `netTermsDays` already
 * documents as "due immediately", and is what "due on receipt" means on a paper
 * invoice.
 *
 * `receivedOn` is the anchor, and it is deliberately a parameter, because the two
 * callers know different things. Entering a payable stage only knows when the
 * bill was RAISED, and it may then sit unsent for a week; the send route knows
 * the day the customer actually receives it. Anchoring a zero-day window to the
 * raise date would deliver invoices that were already overdue on arrival.
 */
export async function dueDateFromTerms(
  tx: Prisma.TransactionClient,
  document: { companyId: string | null; customerId: string | null },
  receivedOn: Date
): Promise<Date> {
  const companyId = document.companyId ?? (await payerCompanyId(tx, document.customerId));
  const account = companyId
    ? await tx.company.findUnique({ where: { id: companyId }, select: { paymentTerms: true } })
    : null;
  const due = new Date(receivedOn);
  due.setUTCDate(due.getUTCDate() + netTermsDays(account?.paymentTerms));
  return due;
}

/**
 * The seller block, frozen onto a document the moment it becomes payable
 * (docs/131 §3.6) — its trading name, legal entity, address and tax id as they
 * stand right now.
 *
 * Carries BOTH names on purpose. `siteName` is the trading name the customer
 * recognises — the business they think they bought from — while `legalName` and
 * `taxId` identify the entity that is actually liable, and on a multi-brand
 * tenant those are different strings. A document that prints only one of them is
 * either unrecognisable to the customer or unusable to the tax authority.
 *
 * `taxId` is included ONLY when the entity is registered: printing a VAT number
 * a business does not have is a misrepresentation, and `taxRegistered` exists
 * precisely to gate it.
 *
 * Exported because there are TWO writers of a finalized billing document and
 * only one of them went through `applyStageEntryEffects`: the B2B AR ledger
 * constructs its document directly, sets its own `finalizedAt`, and had no
 * issuer at all. A second copy of this would be a second thing to keep in step,
 * so both call this.
 */
export async function snapshotIssuer(
  tx: Prisma.TransactionClient,
  tenantId: string,
  propertyId: string
): Promise<Prisma.InputJsonValue> {
  const [site, business, tenant] = await Promise.all([
    tx.property.findUnique({ where: { id: propertyId }, select: { name: true } }),
    tx.tenantBusiness.findUnique({ where: { tenantId } }),
    tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);
  return {
    siteName: site?.name ?? business?.businessName ?? tenant?.name ?? '',
    legalName: business?.businessName ?? tenant?.name ?? '',
    entityType: business?.entityType ?? null,
    registrationNumber: business?.registrationNumber ?? null,
    taxId: business?.taxRegistered ? (business.taxId ?? null) : null,
    phone: business?.phone ?? null,
    supportEmail: business?.supportEmail ?? null,
    address: {
      line1: business?.addressLine1 ?? null,
      line2: business?.addressLine2 ?? null,
      city: business?.city ?? null,
      region: business?.region ?? null,
      postalCode: business?.postalCode ?? null,
      country: business?.country ?? null,
    },
  };
}

interface PendingDocEvent {
  topic: CrmTopic;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Stage advancement
// ─────────────────────────────────────────────────────────────────────────

export async function advance(
  ctx: ServiceContext,
  documentId: string,
  rawInput: unknown
): Promise<DocumentWithLines> {
  const input = AdvanceBillingDocumentInput.parse(rawInput);
  const events = await withTenant(ctx, async (tx) => {
    const doc = await tx.billingDocument.findUnique({ where: { id: documentId } });
    if (doc?.deletedAt !== null) throw new CrmNotFoundError('BillingDocument', documentId);

    const target = await tx.documentStage.findUnique({ where: { id: input.stageId } });
    if (!target) throw new CrmNotFoundError('DocumentStage', input.stageId);
    // A stage from another workflow is not a valid destination for this document.
    if (target.workflowId !== doc.workflowId) {
      throw new CrmNotFoundError('DocumentStage', input.stageId);
    }
    if (target.id === doc.stageId) {
      throw new CrmValidationError('Document is already at this stage.');
    }
    const fromStageId = doc.stageId;

    // Move first, then re-load so entry effects observe the new stage.
    const moved = await tx.billingDocument.update({
      where: { id: documentId },
      data: { stageId: target.id },
    });
    const { document: afterEffects, events: entryEvents } = await applyStageEntryEffects(
      tx,
      ctx,
      moved,
      target
    );

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'invoicing.document.stage_changed',
      entityType: 'BillingDocument',
      entityId: documentId,
      diff: { before: { stageId: fromStageId }, after: { stageId: target.id } },
    });

    const stageChanged: PendingDocEvent = {
      topic: 'crm.billing_document.stage_changed',
      payload: {
        ...docEventPayload(afterEffects),
        fromStageId,
        toStageId: target.id,
        stageType: target.stageType,
      },
      dedupeKey: `crm.billing_document.stage_changed:${documentId}:${target.id}`,
    };
    return [stageChanged, ...entryEvents];
  });

  // Publish post-commit (the bridge tees crm.* to automation + webhooks).
  for (const e of events) {
    await publishCrmEvent({
      tenantId: ctx.tenantId,
      topic: e.topic,
      payload: e.payload,
      dedupeKey: e.dedupeKey,
    });
  }
  return loadDocumentWithLines(ctx, documentId);
}

/** Apply a stage's entry effects (numbering, lifecycle timestamps, snapshot)
 *  inside the caller's transaction. Returns the updated document plus the
 *  lifecycle events (finalized/voided) the caller publishes post-commit. Shared
 *  by `advance` and document CREATE so the initial stage is treated identically
 *  to any later transition. */
export async function applyStageEntryEffects(
  tx: Prisma.TransactionClient,
  ctx: ServiceContext,
  document: BillingDocument,
  stage: DocumentStage
): Promise<{ document: BillingDocument; events: PendingDocEvent[] }> {
  const events: PendingDocEvent[] = [];
  const data: Prisma.BillingDocumentUpdateInput = {};

  // 1. Numbering — allocate the stable sequence once; later stages only swap the
  //    prefix while keeping the suffix (EST-000123 → INV-000123).
  if (stage.numberOnEnter) {
    let seq = document.numberSeq;
    if (seq === null) {
      // The ISSUING site's sequence (docs/131 §3.6), read off the document
      // itself — never re-resolved from the request, because a document numbered
      // while the operator happened to have another site selected would take a
      // number out of the wrong business's books.
      seq = await nextBillingDocumentSeq(tx, ctx.tenantId, document.propertyId);
      data.numberSeq = seq;
    }
    data.number = formatBillingNumber(stage.numberPrefix ?? DEFAULT_NUMBER_PREFIX, seq);
  }

  // 2. Lifecycle timestamps + AR status driven by the semantic stage type.
  const enteringFinal = stage.stageType === 'final' && document.finalizedAt === null;
  if (enteringFinal) {
    const finalizedAt = new Date();
    data.finalizedAt = finalizedAt;
  }

  // ── When is it due? ───────────────────────────────────────────────────────
  //
  // On entering a stage that means THE MONEY IS NOW OWED. That is `open` for the
  // default Invoice workflow every tenant starts on, and `final` for the
  // workflows that issue after an approval step. Both mean the same thing to the
  // customer: here is the bill.
  //
  // This used to live inside the `final`-only block above, bundled with
  // `finalizedAt` and `issuedBy`. The consequence was that the DEFAULT workflow,
  // whose Invoice stage is `open`, could never produce one: every invoice a new
  // tenant ever raised read "No due date", sat outside every aging bucket, and
  // could never be chased. The terms were recorded, agreed and displayed, and
  // reached nothing.
  //
  // `issuedBy` HAS NOW BEEN MOVED HERE FOR THE SAME REASON, and the two are one
  // rule rather than two: this is the moment the document becomes a bill the
  // customer is handed, so it is the moment both "when is it due" and "who is
  // billing you" must stop moving. Left in the `final`-only block it never fired
  // on the default workflow at all -- 0 of 90 documents on this database carried
  // an issuer, 52 of them finalized -- so the letterhead every tenant prints was
  // resolved live, which is exactly what freezing it exists to prevent.
  //
  // The fix and its own bug shipped in the same function: one field was moved
  // out of the wrong block and its neighbour was left behind.
  //
  // THE TERMS FOLLOW THE PAYER'S EMPLOYER, not only a document addressed to the
  // company. It used to read `document.companyId` alone, and nothing sets that
  // from the console -- an invoice is raised against a PERSON. The company screen
  // already states the rule this follows: "everything billed to this company OR
  // TO ANYONE WHO WORKS HERE, because a contact's unpaid invoice is still this
  // company's debt".
  //
  // `dueAt === null` is the idempotence guard: a date already set by hand, or on
  // an earlier entry, is never overwritten.
  const becomingPayable = stage.stageType === 'open' || stage.stageType === 'final';

  // Freeze WHO ISSUED THIS (docs/131 §3.6, docs/130 §2.7). `billTo`/`shipTo` were
  // already snapshotted and the seller was not, so renaming a site — or editing
  // the legal entity's address — rewrote the letterhead on invoices already in
  // customers' hands. `issuedBy === null` is the idempotence guard: a document
  // re-entering a payable stage keeps the issuer it was first sent under.
  if (becomingPayable && document.issuedBy === null) {
    data.issuedBy = await snapshotIssuer(tx, ctx.tenantId, document.propertyId);
  }

  if (becomingPayable && document.dueAt === null) {
    // A REAL WINDOW ONLY. `dueDateFromTerms` answers for everyone, including a
    // walk-in with no terms, but a zero-day answer anchored HERE would be wrong:
    // raising a bill is not handing it over, and an invoice that sits unsent for
    // a week would reach the customer already a week overdue. So a payer with no
    // agreed window is left with no date until the send route sets one from the
    // day it actually goes out. Anyone on terms gets theirs now, so the deadline
    // is on screen before she sends it.
    const raisedAt = new Date();
    const due = await dueDateFromTerms(tx, document, raisedAt);
    if (due.getTime() > raisedAt.getTime()) {
      data.dueAt = due;
    }
  }
  if (stage.stageType === 'void') {
    data.voidedAt = document.voidedAt ?? new Date();
    data.status = 'void';
  }

  let updated = document;
  if (Object.keys(data).length > 0) {
    updated = await tx.billingDocument.update({ where: { id: document.id }, data });
  }

  // 3. Snapshot AFTER numbering, so the frozen copy carries the right number.
  if (stage.snapshotOnEnter) {
    await freezeSnapshot(tx, ctx, updated, stage);
  }

  // 4. Lifecycle events (collected for the caller to publish post-commit).
  if (enteringFinal) {
    events.push({
      topic: 'crm.billing_document.finalized',
      payload: docEventPayload(updated),
      dedupeKey: `crm.billing_document.finalized:${updated.id}`,
    });
  }
  if (stage.stageType === 'void') {
    events.push({
      topic: 'crm.billing_document.voided',
      payload: docEventPayload(updated),
      dedupeKey: `crm.billing_document.voided:${updated.id}`,
    });
  }
  return { document: updated, events };
}

// ─────────────────────────────────────────────────────────────────────────
// Snapshots (append-only history)
// ─────────────────────────────────────────────────────────────────────────

export async function listSnapshots(
  ctx: ServiceContext,
  documentId: string
): Promise<BillingDocumentSnapshot[]> {
  return withTenant(ctx, async (tx) => {
    const doc = await tx.billingDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new CrmNotFoundError('BillingDocument', documentId);
    return tx.billingDocumentSnapshot.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });
  });
}

export async function getSnapshot(
  ctx: ServiceContext,
  snapshotId: string
): Promise<BillingDocumentSnapshot> {
  const snap = await withTenant(ctx, (tx) =>
    tx.billingDocumentSnapshot.findUnique({ where: { id: snapshotId } })
  );
  if (!snap) throw new CrmNotFoundError('BillingDocumentSnapshot', snapshotId);
  return snap;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/** Freeze an immutable snapshot of the document + its lines at this stage. */
async function freezeSnapshot(
  tx: Prisma.TransactionClient,
  ctx: ServiceContext,
  document: BillingDocument,
  stage: DocumentStage
): Promise<BillingDocumentSnapshot> {
  const lines = await tx.billingDocumentLine.findMany({
    where: { documentId: document.id },
    orderBy: { sortOrder: 'asc' },
  });
  const payload = buildSnapshotPayload(document, lines, stage);
  const snapshot = await tx.billingDocumentSnapshot.create({
    data: {
      tenantId: ctx.tenantId,
      documentId: document.id,
      stageId: stage.id,
      stageType: stage.stageType,
      customerLabel: stage.customerLabel,
      documentNumber: document.number,
      snapshot: payload as unknown as Prisma.InputJsonValue,
      createdById: ctx.userId ?? null,
    },
  });
  await writeAuditLog({
    tx,
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    actorType: ctx.userId ? 'user' : 'system',
    action: 'invoicing.document.snapshot_frozen',
    entityType: 'BillingDocumentSnapshot',
    entityId: snapshot.id,
    diff: { after: { stageId: stage.id, documentNumber: document.number } },
  });
  return snapshot;
}

function docEventPayload(doc: BillingDocument): Record<string, unknown> {
  return {
    documentId: doc.id,
    number: doc.number,
    customerId: doc.customerId,
    companyId: doc.companyId,
    stageId: doc.stageId,
    total: Number(doc.total),
    currency: doc.currency,
  };
}

async function loadDocumentWithLines(
  ctx: ServiceContext,
  documentId: string
): Promise<DocumentWithLines> {
  return withTenant(ctx, (tx) =>
    tx.billingDocument.findUniqueOrThrow({
      where: { id: documentId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    })
  );
}
