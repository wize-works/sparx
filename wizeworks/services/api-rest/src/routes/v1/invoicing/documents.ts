// Invoicing — billing documents + their lines (docs/87 §2/§5/§12).
//
//   GET    /v1/invoicing/documents                       → list (paginated)
//   POST   /v1/invoicing/documents                       → create
//   GET    /v1/invoicing/documents/:id                   → fetch one (with lines)
//   PATCH  /v1/invoicing/documents/:id                   → update header
//   DELETE /v1/invoicing/documents/:id                   → soft-delete
//   POST   /v1/invoicing/documents/:id/lines             → add a line (priced)
//   PATCH  /v1/invoicing/documents/:id/lines/:lineId     → update a line
//   DELETE /v1/invoicing/documents/:id/lines/:lineId     → remove a line
//   POST   /v1/invoicing/documents/:id/advance           → move to a stage (§3)
//   GET    /v1/invoicing/documents/:id/snapshots         → frozen-record history
//   GET    /v1/invoicing/documents/:id/snapshots/:sid    → one frozen record
//   POST   /v1/invoicing/documents/:id/payments          → record a payment (§8)
//   GET    /v1/invoicing/documents/:id/payments          → payment history
//   POST   /v1/invoicing/documents/:id/convert-to-order  → committed → Order created
//   GET    /v1/invoicing/documents/:id/pdf               → branded print-HTML (§10)
//   GET    /v1/invoicing/documents/:id/snapshots/:sid/pdf → print a frozen record
//   POST   /v1/invoicing/documents/preview                → live preview of an
//          UNSAVED draft, so the editor can show the real artifact while typing

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { queryBool } from '@wizeworks/api-core/query';
import { withTenant } from '@wizeworks/db';
import {
  billingDocumentConversionService,
  billingDocumentService,
  billingDocumentStageService,
  billingLineService,
  billingPaymentService,
  billingRenderService,
  buildRenderDataFromDraft,
} from '@wizeworks/crm';
import { GatewayNotFoundError, PaymentConfigError, paymentService } from '@wizeworks/payments';
import { ok, paged } from '@wizeworks/api-core/envelope';
import { ApiError } from '@wizeworks/api-core/errors';
import { requireRole } from '@wizeworks/api-core/auth';
import { requireInvoicingModule, toInvoicingContext } from '../../../lib/invoicing-context.js';
import { reachableSiteIds } from '../../../lib/property.js';
import { renderTenantInvoiceHtml, resolveInvoiceBrand } from '../../../lib/invoice-render.js';
import { sendInvoice, InvoiceSendError } from '../../../lib/invoice-mail.js';

const PathId = z.object({ id: z.string().uuid() });
const LinePathIds = z.object({ id: z.string().uuid(), lineId: z.string().uuid() });

// Offset pagination + the passthrough filters the service understands. `take`/`skip`
// match the platform list convention; they map onto the service's `limit`/`offset`.
const ListDocumentsQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  workflowId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  status: z.string().max(20).optional(),
  // Whether the customer was actually given it. Orthogonal to status: an unpaid
  // invoice nobody sent and an unpaid one sent three weeks ago read the same on
  // the list and are different problems.
  sent: queryBool.optional(),
  includeDeleted: queryBool.optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  // Snake_case to match every other list endpoint's sort parameter. (The
  // camelCase filters above are this route's own long-standing inconsistency;
  // renaming them is a breaking change for existing callers, so new parameters
  // simply stop making it worse.)
  sort_by: z
    .enum(['number', 'customer', 'status', 'dueAt', 'total', 'balance', 'updatedAt', 'createdAt'])
    .optional(),
  // The platform's other list endpoints hardcode 'desc'. A receivables list is
  // read "what is due soonest", which is ascending — so this one takes a real
  // direction, following the precedent in scheduling/bookings.
  order: z.enum(['asc', 'desc']).optional(),
});
const SnapshotPathIds = z.object({ id: z.string().uuid(), snapshotId: z.string().uuid() });

/**
 * The issuer frozen on a document when it was finalized.
 *
 * Read separately from the render data because it is not display substance — it
 * is who the letterhead must say sent this, and the answer has to be the one
 * that was true on the day, not the one that is true now. Without it, renaming a
 * site or editing the legal entity's address rewrites the masthead on invoices
 * already in customers' hands.
 *
 * Null on anything finalized before the column existed; the resolver falls back
 * to the live business, which is the only answer available for those.
 */
async function frozenIssuerOf(ctx: { tenantId: string }, documentId: string): Promise<unknown> {
  const doc = await withTenant(ctx, (tx) =>
    tx.billingDocument.findUnique({ where: { id: documentId }, select: { issuedBy: true } })
  );
  return doc?.issuedBy ?? null;
}

/** The unsaved draft the editor previews. Everything is optional on purpose — the
 *  editor posts on every keystroke, so a half-typed document must render rather
 *  than 400. Money fields are coerced because number inputs hand back strings. */
const DraftLineBody = z.object({
  lineTypeId: z.string().uuid().nullish(),
  description: z.string().nullish(),
  quantity: z.coerce.number().nullish(),
  unitPrice: z.coerce.number().nullish(),
  discountAmount: z.coerce.number().nullish(),
  taxable: z.boolean().nullish(),
});

const DraftPreviewBody = z.object({
  stageId: z.string().uuid().nullish(),
  title: z.string().nullish(),
  number: z.string().nullish(),
  status: z.string().nullish(),
  currency: z.string().nullish(),
  customerId: z.string().uuid().nullish(),
  companyId: z.string().uuid().nullish(),
  billTo: z.unknown().nullish(),
  shipTo: z.unknown().nullish(),
  issuedAt: z.string().nullish(),
  dueAt: z.string().nullish(),
  validUntil: z.string().nullish(),
  notes: z.string().nullish(),
  taxRate: z.coerce.number().nullish(),
  shippingTotal: z.coerce.number().nullish(),
  surchargeTotal: z.coerce.number().nullish(),
  depositTotal: z.coerce.number().nullish(),
  amountPaid: z.coerce.number().nullish(),
  lines: z.array(DraftLineBody).nullish(),
});
const PaymentLinkBody = z.object({
  successUrl: z.string().url(),
  expiresAt: z.string().datetime().optional(),
});

const documentRoutes: FastifyPluginAsync = (app) => {
  app.get('/v1/invoicing/documents', async (request) => {
    const auth = requireRole(request, 'viewer');
    await requireInvoicingModule(request);
    const q = ListDocumentsQuery.parse(request.query);
    const { items, total } = await billingDocumentService.list(toInvoicingContext(request), {
      q: q.q,
      workflowId: q.workflowId,
      stageId: q.stageId,
      customerId: q.customerId,
      companyId: q.companyId,
      // Bound to the member's reachable sites (docs/131 §3.3) — invoices are
      // among the most sensitive per-business records.
      propertyIds: reachableSiteIds(auth),
      status: q.status,
      sent: q.sent,
      includeDeleted: q.includeDeleted,
      // The service speaks limit/offset; `default(50)`/`default(0)` apply when omitted.
      ...(q.take !== undefined ? { limit: q.take } : {}),
      ...(q.skip !== undefined ? { offset: q.skip } : {}),
      ...(q.sort_by !== undefined ? { sortBy: q.sort_by } : {}),
      ...(q.order !== undefined ? { order: q.order } : {}),
    });
    // `total` is what makes a client able to say "50 of 214" and to offer a
    // jump straight to the last page rather than only "load more" — without it
    // a long list can only be walked forwards.
    return paged(items, { total, skip: q.skip ?? 0, per_page: q.take ?? 50 });
  });

  app.get('/v1/invoicing/documents/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireInvoicingModule(request);
    const ctx = toInvoicingContext(request);
    const { id } = PathId.parse(request.params);
    const doc = await billingDocumentService.get(ctx, id);
    // A quote's conversion to an Order has no column on the document itself —
    // the FK lives on Order (docs/87 §15 convergence) — so the dashboard needs
    // this looked up alongside the document to show "Convert to order" vs.
    // "View order".
    const convertedOrder = await withTenant(ctx, (tx) =>
      tx.order.findFirst({
        where: { convertedFromDocumentId: id },
        select: { id: true, orderNumber: true },
      })
    );
    return ok({ ...doc, convertedOrder });
  });

  app.post('/v1/invoicing/documents', async (request, reply) => {
    requireRole(request, 'editor');
    await requireInvoicingModule(request);
    const doc = await billingDocumentService.create(toInvoicingContext(request), request.body);
    reply.code(201);
    return ok(doc);
  });

  app.patch('/v1/invoicing/documents/:id', async (request) => {
    requireRole(request, 'editor');
    await requireInvoicingModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await billingDocumentService.update(toInvoicingContext(request), id, request.body));
  });

  // Give the document to the person who owes the money. Was the one thing
  // invoicing could not do: create, number, total, snapshot, print and collect,
  // but never send.
  app.post('/v1/invoicing/documents/:id/send', async (request, reply) => {
    requireRole(request, 'editor');
    await requireInvoicingModule(request);
    const { id } = PathId.parse(request.params);
    try {
      return ok(await sendInvoice(request, id));
    } catch (error) {
      // The refusals this raises are sentences the operator can act on ("add an
      // email address under Bill to"), so they go back verbatim rather than as a
      // 500 that tells them nothing.
      if (error instanceof InvoiceSendError) {
        reply.code(400);
        return { success: false, error: { message: error.message } };
      }
      throw error;
    }
  });

  app.delete('/v1/invoicing/documents/:id', async (request, reply) => {
    requireRole(request, 'editor');
    await requireInvoicingModule(request);
    const { id } = PathId.parse(request.params);
    await billingDocumentService.remove(toInvoicingContext(request), id);
    reply.code(204);
  });

  // ── Lines ────────────────────────────────────────────────────────────────
  app.post('/v1/invoicing/documents/:id/lines', async (request, reply) => {
    requireRole(request, 'editor');
    await requireInvoicingModule(request);
    const { id } = PathId.parse(request.params);
    const doc = await billingLineService.addLine(toInvoicingContext(request), id, request.body);
    reply.code(201);
    return ok(doc);
  });

  app.patch('/v1/invoicing/documents/:id/lines/:lineId', async (request) => {
    requireRole(request, 'editor');
    await requireInvoicingModule(request);
    const { lineId } = LinePathIds.parse(request.params);
    return ok(
      await billingLineService.updateLine(toInvoicingContext(request), lineId, request.body)
    );
  });

  app.delete('/v1/invoicing/documents/:id/lines/:lineId', async (request) => {
    requireRole(request, 'editor');
    await requireInvoicingModule(request);
    const { lineId } = LinePathIds.parse(request.params);
    return ok(await billingLineService.removeLine(toInvoicingContext(request), lineId));
  });

  // ── Stage advance ──────────────────────────────────────────────────────────
  // Moves the document to a stage in its workflow; entering the stage runs its
  // configured effects (number / snapshot / finalize / lock).
  app.post('/v1/invoicing/documents/:id/advance', async (request) => {
    requireRole(request, 'editor');
    await requireInvoicingModule(request);
    const { id } = PathId.parse(request.params);
    return ok(
      await billingDocumentStageService.advance(toInvoicingContext(request), id, request.body)
    );
  });

  // ── Snapshots (append-only frozen records) ───────────────────────────────────
  app.get('/v1/invoicing/documents/:id/snapshots', async (request) => {
    requireRole(request, 'viewer');
    await requireInvoicingModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await billingDocumentStageService.listSnapshots(toInvoicingContext(request), id));
  });

  app.get('/v1/invoicing/documents/:id/snapshots/:snapshotId', async (request) => {
    requireRole(request, 'viewer');
    await requireInvoicingModule(request);
    const { snapshotId } = SnapshotPathIds.parse(request.params);
    return ok(
      await billingDocumentStageService.getSnapshot(toInvoicingContext(request), snapshotId)
    );
  });

  // ── Payments / AR (§8) ───────────────────────────────────────────────────────
  // A payment is allowed on a locked/finalized document — locking freezes lines,
  // not the act of paying.
  app.post('/v1/invoicing/documents/:id/payments', async (request, reply) => {
    requireRole(request, 'editor');
    await requireInvoicingModule(request);
    const { id } = PathId.parse(request.params);
    const result = await billingPaymentService.recordPayment(
      toInvoicingContext(request),
      id,
      request.body
    );
    reply.code(201);
    return ok(result);
  });

  app.get('/v1/invoicing/documents/:id/payments', async (request) => {
    requireRole(request, 'viewer');
    await requireInvoicingModule(request);
    const { id } = PathId.parse(request.params);
    return ok(await billingPaymentService.listPayments(toInvoicingContext(request), id));
  });

  // Convert an accepted quote (a `committed`-stage document) into a real
  // commerce Order, for fulfillment/shipping/inventory (docs/87 §15
  // convergence). The document itself stays in its `committed` stage.
  app.post('/v1/invoicing/documents/:id/convert-to-order', async (request, reply) => {
    requireRole(request, 'editor');
    await requireInvoicingModule(request);
    const { id } = PathId.parse(request.params);
    const result = await billingDocumentConversionService.convertToOrder(
      toInvoicingContext(request),
      id,
      request.body
    );
    reply.code(201);
    return ok(result);
  });

  // Hosted pay-link for the outstanding balance (docs/94 ADR §8). Routes through
  // PaymentService → the tenant's gateway (sparx Pay = 0.5% fee; others = $0). The
  // resulting payment_intent carries metadata.invoiceId, so the payment webhook records
  // the payment against this document on success. Manual / unconfigured tenants get a
  // clean validation error (they collect by hand instead).
  app.post('/v1/invoicing/documents/:id/payment-link', async (request, reply) => {
    requireRole(request, 'editor');
    await requireInvoicingModule(request);
    const { id } = PathId.parse(request.params);
    const body = PaymentLinkBody.parse(request.body ?? {});
    const ctx = toInvoicingContext(request);

    const doc = await billingDocumentService.get(ctx, id);
    const balanceCents = Math.round(Number(doc.balance) * 100);
    if (balanceCents <= 0) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'This document has no outstanding balance to collect.'
      );
    }

    let url: string | null;
    try {
      url = await paymentService.createPaymentLink({
        tenantId: ctx.tenantId,
        amount: balanceCents,
        currency: doc.currency.toLowerCase(),
        invoiceId: doc.id,
        description: doc.number ? `Invoice ${doc.number}` : 'Invoice payment',
        successUrl: body.successUrl,
        ...(body.expiresAt ? { expiresAt: new Date(body.expiresAt) } : {}),
      });
    } catch (err) {
      if (err instanceof PaymentConfigError || err instanceof GatewayNotFoundError) {
        throw new ApiError(
          'VALIDATION_ERROR',
          'No payment gateway is configured. Set one up in Settings → Payments.'
        );
      }
      throw err;
    }
    if (!url) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'The active payment gateway does not support hosted payment links.'
      );
    }

    reply.code(201);
    return ok({ url });
  });

  // ── PDF / print (§10) ────────────────────────────────────────────────────────
  // v1 returns branded print-styled HTML (the browser's Print → PDF path); a
  // server-side PDF byte stream is the documented fast-follow. Render data + the
  // tenant brand are assembled, then routed through the tenant's ACTIVE published
  // template (the builder-authored path) or the built-in default renderer.
  app.get('/v1/invoicing/documents/:id/pdf', async (request, reply) => {
    requireRole(request, 'viewer');
    await requireInvoicingModule(request);
    const ctx = toInvoicingContext(request);
    const { id } = PathId.parse(request.params);
    const [data, brand] = await Promise.all([
      billingRenderService.buildRenderData(ctx, id),
      frozenIssuerOf(ctx, id).then((issuedBy) => resolveInvoiceBrand(ctx, issuedBy)),
    ]);
    const html = await renderTenantInvoiceHtml(ctx, data, brand);
    void reply.header('Content-Type', 'text/html; charset=utf-8');
    void reply.header(
      'Content-Disposition',
      `inline; filename="${data.number ?? 'document'}.html"`
    );
    return reply.send(html);
  });

  // Print a frozen snapshot — the approved estimate / final invoice exactly as it
  // stood when captured (§4). Renders the frozen substance, under the frozen
  // ISSUER: this route is the customer's copy, so it is the one place where the
  // masthead reading today's business name instead of the one that signed the
  // document is most obviously wrong. Only the visual brand resolves live.
  app.get('/v1/invoicing/documents/:id/snapshots/:snapshotId/pdf', async (request, reply) => {
    requireRole(request, 'viewer');
    await requireInvoicingModule(request);
    const ctx = toInvoicingContext(request);
    const { id, snapshotId } = SnapshotPathIds.parse(request.params);
    const [data, brand] = await Promise.all([
      billingRenderService.buildRenderDataFromSnapshot(ctx, snapshotId),
      frozenIssuerOf(ctx, id).then((issuedBy) => resolveInvoiceBrand(ctx, issuedBy)),
    ]);
    const html = await renderTenantInvoiceHtml(ctx, data, brand);
    void reply.header('Content-Type', 'text/html; charset=utf-8');
    void reply.header(
      'Content-Disposition',
      `inline; filename="${data.number ?? 'document'}.html"`
    );
    return reply.send(html);
  });

  // Live preview of an UNSAVED draft — the editor POSTs whatever it currently
  // holds and gets back the real branded artifact, routed through the same
  // template/default resolution the `…/pdf` routes use. POST, not GET: the body
  // is the whole document, and this must never be cached or bookmarked.
  //
  // Read-only by construction — it writes nothing, so `viewer` is the right role
  // and an in-progress draft never touches the database.
  app.post('/v1/invoicing/documents/preview', async (request, reply) => {
    requireRole(request, 'viewer');
    await requireInvoicingModule(request);
    const ctx = toInvoicingContext(request);
    const draft = DraftPreviewBody.parse(request.body ?? {});
    const [data, brand] = await Promise.all([
      buildRenderDataFromDraft(ctx, draft),
      resolveInvoiceBrand(ctx),
    ]);
    const html = await renderTenantInvoiceHtml(ctx, data, brand);
    void reply.header('Content-Type', 'text/html; charset=utf-8');
    // The editor embeds this in an iframe on every keystroke — never store it.
    void reply.header('Cache-Control', 'no-store');
    return reply.send(html);
  });

  return Promise.resolve();
};

export default documentRoutes;
