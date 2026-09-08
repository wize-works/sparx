// Commerce list endpoints that the dashboard needs but the service layer
// hasn't yet abstracted: tenant-wide variant catalog, account-credit balances,
// cart inbox, checkout-session inbox, tenant-wide reviews / questions, question
// detail, and wishlist analytics. (Inventory's enriched-levels + active-recalls
// reads moved to the inventory module's own namespace — see routes/v1/inventory/
// stock.ts + lots.ts — docs/100 P1e.)
//
// These all go through `withRequestTenant` so RLS still enforces tenant
// isolation. Each handler is a thin Prisma query and is a candidate to
// hoist into `@wizeworks/commerce` once the dashboard's needs settle.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@wizeworks/db';
import { depositFromColumns } from '@wizeworks/commerce';
import { withRequestTenant } from '@wizeworks/api-core/db';
import { ok, paged } from '@wizeworks/api-core/envelope';
import { requireRole } from '@wizeworks/api-core/auth';
import { notFound } from '@wizeworks/api-core/errors';
import { requireCommerceModule } from '../../../lib/commerce-context.js';
import { cartContacts } from './cart-contact.js';

const PathId = z.object({ id: z.string().uuid() });

// Sort columns are a server-side WHITELIST (mirrors the discount/gift-card
// services). A client-supplied column not on this list is rejected by the enum
// with a 422, never interpolated into an orderBy. `firstName`/`lastName`/`email`
// order on the customer relation; `balanceCents`/`updatedAt` on the row itself.
// Sorting lives on the server because this list pages.
const AccountCreditSort = z.enum(['balanceCents', 'updatedAt', 'firstName', 'lastName', 'email']);
const AccountCreditSortOrder = z.enum(['asc', 'desc']);

const AccountCreditQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  currency: z.string().optional(),
  min_balance_cents: z.coerce.number().int().optional(),
  take: z.coerce.number().int().min(1).max(500).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  sort_by: AccountCreditSort.optional(),
  order: AccountCreditSortOrder.optional(),
});

/** Whitelisted `sort_by` → Prisma orderBy. Default (no `sort_by`) keeps the
 *  historic `balanceCents desc` so existing callers are unchanged. */
function accountCreditOrderBy(
  sortBy: z.infer<typeof AccountCreditSort> | undefined,
  order: 'asc' | 'desc' | undefined
): Prisma.AccountCreditOrderByWithRelationInput {
  const dir = order ?? 'asc';
  switch (sortBy) {
    case 'updatedAt':
      return { updatedAt: dir };
    case 'balanceCents':
      return { balanceCents: dir };
    case 'firstName':
      return { customer: { firstName: dir } };
    case 'lastName':
      return { customer: { lastName: dir } };
    case 'email':
      return { customer: { email: dir } };
    default:
      return { balanceCents: 'desc' };
  }
}

const ListCartsQuery = z.object({
  filter: z.string().optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

const ListCheckoutSessionsQuery = z.object({
  step: z.string().optional(),
  // "The ones that did not finish" is the question this list exists to answer,
  // and it is not one step — it is every step except the two that ended. Asking
  // for it a step at a time makes the caller page three lists and add them up,
  // so the server answers it directly. Ignored when an exact `step` is given.
  unfinished: z.coerce.boolean().optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});

// The moderation queues page and sort server-side, so `sort_by` is a WHITELIST
// exactly like account credit above. An off-list column is rejected by the enum
// with a 422 rather than interpolated into an orderBy. Real columns only:
// questions carry no rating, so theirs is createdAt/status; reviews add rating.
const QuestionSort = z.enum(['createdAt', 'status']);
const ReviewSort = z.enum(['createdAt', 'rating', 'status']);
const ListSortOrder = z.enum(['asc', 'desc']);

/** Whitelisted question `sort_by` → Prisma orderBy. Default (no `sort_by`) keeps
 *  the historic `createdAt desc`, so existing callers are unchanged. */
function questionOrderBy(
  sortBy: z.infer<typeof QuestionSort> | undefined,
  order: 'asc' | 'desc' | undefined
): Prisma.ProductQuestionOrderByWithRelationInput {
  const dir = order ?? 'desc';
  switch (sortBy) {
    case 'status':
      return { status: dir };
    case 'createdAt':
      return { createdAt: dir };
    default:
      return { createdAt: 'desc' };
  }
}

/** Whitelisted review `sort_by` → Prisma orderBy. Default keeps `createdAt desc`. */
function reviewOrderBy(
  sortBy: z.infer<typeof ReviewSort> | undefined,
  order: 'asc' | 'desc' | undefined
): Prisma.ProductReviewOrderByWithRelationInput {
  const dir = order ?? 'desc';
  switch (sortBy) {
    case 'rating':
      return { rating: dir };
    case 'status':
      return { status: dir };
    case 'createdAt':
      return { createdAt: dir };
    default:
      return { createdAt: 'desc' };
  }
}

const ListQuestionsQuery = z.object({
  status: z.string().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  sort_by: QuestionSort.optional(),
  order: ListSortOrder.optional(),
});

const ListReviewsQuery = z.object({
  status: z.string().optional(),
  q: z.string().trim().min(1).max(200).optional(),
  take: z.coerce.number().int().min(1).max(250).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  sort_by: ReviewSort.optional(),
  order: ListSortOrder.optional(),
});

// eslint-disable-next-line @typescript-eslint/require-await -- FastifyPluginAsync type demands async; no top-level await needed because route registration is sync.
const commerceListRoutes: FastifyPluginAsync = async (app) => {
  // ── Variants tenant-wide ──────────────────────────────────────────
  app.get('/v1/commerce/variants', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    const take = q?.take ? Math.min(Number(q.take), 1000) : 500;
    const includeArchived = q?.include_archived === 'true';

    const rows = await withRequestTenant(request, (tx) =>
      tx.productVariant.findMany({
        where: { ...(includeArchived ? {} : { deletedAt: null }) },
        orderBy: [{ product: { title: 'asc' } }, { sku: 'asc' }],
        take,
        select: {
          id: true,
          sku: true,
          title: true,
          isDefault: true,
          priceCents: true,
          currency: true,
          deletedAt: true,
          // What actually tells two versions of one garment apart (issue 182).
          // `title` is documented as "computed from options when omitted" and is
          // empty on every seeded variant, so a till reading only `title` shows
          // ten identical rows for one product's sizes. The lattice point is the
          // real answer and it is one join away.
          optionAssignments: {
            select: {
              optionValue: {
                select: {
                  value: true,
                  position: true,
                  option: { select: { name: true, position: true } },
                },
              },
            },
          },
          product: {
            select: {
              id: true,
              title: true,
              handle: true,
              status: true,
              // Made to order (issue 026) — the till builds a sale from this
              // list, so it has to know which lines need notice before it can
              // tell somebody at the counter which day theirs is due.
              orderAheadDays: true,
              depositType: true,
              depositAmountCents: true,
              depositPercent: true,
            },
          },
        },
      })
    );
    return ok(
      rows.map((r) => ({
        id: r.id,
        sku: r.sku,
        title: r.title,
        // Ordered the way the shop authored its options, so every variant of a
        // product reads its axes in the same order ("L · Oat", never "Oat · L").
        options: r.optionAssignments
          .map((a) => a.optionValue)
          .sort((a, b) => a.option.position - b.option.position || a.position - b.position)
          .map((v) => ({ name: v.option.name, value: v.value })),
        isDefault: r.isDefault,
        priceCents: r.priceCents,
        currency: r.currency,
        archivedAt: r.deletedAt?.toISOString() ?? null,
        productId: r.product.id,
        productTitle: r.product.title,
        productHandle: r.product.handle,
        productStatus: r.product.status,
        orderAheadDays: r.product.orderAheadDays,
        deposit: depositFromColumns(r.product),
      }))
    );
  });

  // ── Account credit balances ─────────────────────────────────────────
  app.get('/v1/commerce/account-credit', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = AccountCreditQuery.parse(request.query);
    const take = Math.min(q.take ?? 100, 500);
    const skip = q.skip ?? 0;
    const minBalance = q.min_balance_cents ?? 1;
    const where: Prisma.AccountCreditWhereInput = {
      balanceCents: { gte: minBalance },
      ...(q.currency ? { currency: q.currency } : {}),
      ...(q.q
        ? {
            customer: {
              OR: [
                { firstName: { contains: q.q, mode: 'insensitive' } },
                { lastName: { contains: q.q, mode: 'insensitive' } },
                { email: { contains: q.q, mode: 'insensitive' } },
                { companyName: { contains: q.q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const { rows, total } = await withRequestTenant(request, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.accountCredit.findMany({
          where,
          orderBy: accountCreditOrderBy(q.sort_by, q.order),
          take,
          skip,
          select: {
            id: true,
            customerId: true,
            balanceCents: true,
            currency: true,
            updatedAt: true,
            customer: {
              select: { id: true, firstName: true, lastName: true, email: true, companyName: true },
            },
          },
        }),
        tx.accountCredit.count({ where }),
      ]);
      return { rows, total };
    });
    return paged(
      rows.map((r) => ({
        id: r.id,
        customerId: r.customerId,
        balanceCents: r.balanceCents,
        currency: r.currency,
        updatedAt: r.updatedAt.toISOString(),
        customer: r.customer
          ? {
              id: r.customer.id,
              firstName: r.customer.firstName,
              lastName: r.customer.lastName,
              email: r.customer.email,
              company: r.customer.companyName,
            }
          : null,
      })),
      { total, per_page: take }
    );
  });

  // ── Carts inbox ───────────────────────────────────────────────────
  app.get('/v1/commerce/carts', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = ListCartsQuery.parse(request.query);
    const take = q.take ?? 100;
    const skip = q.skip ?? 0;
    const filter = q.filter ?? 'active';
    // The three tabs are about a basket's state RIGHT NOW, and `abandonedAt` is
    // the only column that says it: `markRecovered` clears it when a shopper
    // comes back, `markAbandoned` sets it again if they go quiet again.
    // `recoveredAt` is history — "came back at least once" — so it separates a
    // basket she won back from one that never left, and never contradicts the
    // first question. A basket already PAID for belongs in none of the three,
    // which is a completed checkout session rather than a column (issue 289).
    const live = { checkoutSessions: { none: { step: 'completed' } } };
    const where =
      filter === 'abandoned'
        ? { abandonedAt: { not: null }, ...live }
        : filter === 'recovered'
          ? { abandonedAt: null, recoveredAt: { not: null }, ...live }
          : { abandonedAt: null, recoveredAt: null, ...live };

    const { rows, total, contacts } = await withRequestTenant(request, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.cart.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          take,
          skip,
          select: {
            id: true,
            channel: true,
            currency: true,
            customerId: true,
            guestToken: true,
            subtotalCents: true,
            totalCents: true,
            abandonedAt: true,
            recoveredAt: true,
            expiresAt: true,
            updatedAt: true,
            customer: {
              select: { id: true, firstName: true, lastName: true, email: true, companyName: true },
            },
            _count: { select: { items: true } },
          },
        }),
        tx.cart.count({ where }),
      ]);
      // Most shoppers are not signed in, so the `customer` join above answers
      // "guest" for somebody who typed their name into checkout (issue 216).
      return {
        rows,
        total,
        contacts: await cartContacts(
          tx,
          rows.map((r) => r.id)
        ),
      };
    });
    return paged(
      rows.map((r) => ({
        id: r.id,
        channel: r.channel,
        currency: r.currency,
        customerId: r.customerId,
        guestToken: r.guestToken,
        subtotalCents: r.subtotalCents,
        totalCents: r.totalCents,
        itemCount: r._count.items,
        contact: contacts.get(r.id) ?? null,
        abandonedAt: r.abandonedAt?.toISOString() ?? null,
        recoveredAt: r.recoveredAt?.toISOString() ?? null,
        expiresAt: r.expiresAt?.toISOString() ?? null,
        updatedAt: r.updatedAt.toISOString(),
        customer: r.customer
          ? {
              id: r.customer.id,
              firstName: r.customer.firstName,
              lastName: r.customer.lastName,
              email: r.customer.email,
              company: r.customer.companyName,
            }
          : null,
      })),
      { total, per_page: take }
    );
  });

  // ── Checkout sessions inbox ───────────────────────────────────────
  app.get('/v1/commerce/checkout-sessions', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = ListCheckoutSessionsQuery.parse(request.query);
    const take = q.take ?? 100;
    const skip = q.skip ?? 0;
    const where = q.step
      ? { step: q.step }
      : q.unfinished
        ? { step: { notIn: ['completed', 'expired'] } }
        : {};

    const { rows, total } = await withRequestTenant(request, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.checkoutSession.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          take,
          skip,
          select: {
            id: true,
            step: true,
            channel: true,
            currency: true,
            customerId: true,
            customerEmail: true,
            // The shopper's NAME, not only the address they typed in. It is a
            // COLUMN ON THIS TABLE, written at the till beside the email, and it
            // was simply never selected — so a list of people showed raw email
            // addresses where every other list in the console shows a person.
            // Taken from the session rather than the linked customer on purpose:
            // it is the name this checkout was made under, and a guest has one
            // too.
            customerName: true,
            subtotalCents: true,
            totalCents: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        tx.checkoutSession.count({ where }),
      ]);
      return { rows, total };
    });
    return paged(
      rows.map((r) => ({
        ...r,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      { total, per_page: take }
    );
  });

  // ── Reviews tenant-wide ───────────────────────────────────────────
  app.get('/v1/commerce/reviews', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = ListReviewsQuery.parse(request.query);
    const where: Prisma.ProductReviewWhereInput = {
      deletedAt: null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: 'insensitive' } },
              { body: { contains: q.q, mode: 'insensitive' } },
              { displayName: { contains: q.q, mode: 'insensitive' } },
              { product: { is: { title: { contains: q.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const { rows, total } = await withRequestTenant(request, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.productReview.findMany({
          where,
          orderBy: reviewOrderBy(q.sort_by, q.order),
          take: q.take ?? 50,
          skip: q.skip ?? 0,
          select: {
            id: true,
            productId: true,
            rating: true,
            title: true,
            body: true,
            status: true,
            orderId: true,
            createdAt: true,
            // Searched by the WHERE clause above, so it was already half-present:
            // an owner could FIND a review by the name on it and then read
            // "A guest" in the table (issue 257).
            displayName: true,
            customer: { select: { id: true, firstName: true, lastName: true, email: true } },
            product: { select: { id: true, title: true, handle: true } },
          },
        }),
        tx.productReview.count({ where }),
      ]);
      return { rows, total };
    });
    return paged(
      rows.map((r) => ({
        id: r.id,
        productId: r.productId,
        rating: r.rating,
        title: r.title,
        body: r.body,
        status: r.status,
        verifiedPurchase: r.orderId !== null,
        createdAt: r.createdAt.toISOString(),
        productTitle: r.product?.title ?? null,
        productHandle: r.product?.handle ?? null,
        displayName: r.displayName,
        customer: r.customer
          ? {
              id: r.customer.id,
              firstName: r.customer.firstName,
              lastName: r.customer.lastName,
              email: r.customer.email,
            }
          : null,
      })),
      { total, per_page: q.take ?? 50 }
    );
  });

  // ── Questions tenant-wide ─────────────────────────────────────────
  app.get('/v1/commerce/questions', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = ListQuestionsQuery.parse(request.query);
    const take = q.take ?? 100;
    const skip = q.skip ?? 0;
    const where: Prisma.ProductQuestionWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.q
        ? {
            OR: [
              { body: { contains: q.q, mode: 'insensitive' } },
              { displayName: { contains: q.q, mode: 'insensitive' } },
              { product: { is: { title: { contains: q.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const { rows, total } = await withRequestTenant(request, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.productQuestion.findMany({
          where,
          orderBy: questionOrderBy(q.sort_by, q.order),
          take,
          skip,
          select: {
            id: true,
            productId: true,
            body: true,
            status: true,
            createdAt: true,
            // Searched by the WHERE clause above, so it was already half-present:
            // an owner could FIND a review by the name on it and then read
            // "A guest" in the table (issue 257).
            displayName: true,
            customer: { select: { id: true, firstName: true, lastName: true, email: true } },
            product: { select: { id: true, title: true, handle: true } },
          },
        }),
        tx.productQuestion.count({ where }),
      ]);
      return { rows, total };
    });
    return paged(
      rows.map((r) => ({
        id: r.id,
        productId: r.productId,
        body: r.body,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        productTitle: r.product?.title ?? null,
        productHandle: r.product?.handle ?? null,
        displayName: r.displayName,
        customer: r.customer
          ? {
              id: r.customer.id,
              firstName: r.customer.firstName,
              lastName: r.customer.lastName,
              email: r.customer.email,
            }
          : null,
      })),
      { total, per_page: take }
    );
  });

  // ── Question detail ───────────────────────────────────────────────
  app.get('/v1/commerce/questions/:id', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { id } = PathId.parse(request.params);

    const row = await withRequestTenant(request, (tx) =>
      tx.productQuestion.findFirst({
        where: { id },
        select: {
          id: true,
          productId: true,
          body: true,
          status: true,
          displayName: true,
          helpfulCount: true,
          createdAt: true,
          customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          product: { select: { id: true, title: true, handle: true } },
          answers: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              body: true,
              isOfficial: true,
              authorCustomerId: true,
              authorUserId: true,
              createdAt: true,
            },
          },
        },
      })
    );
    if (!row) throw notFound('Question', id);
    return ok({
      id: row.id,
      productId: row.productId,
      body: row.body,
      status: row.status,
      displayName: row.displayName,
      helpfulCount: row.helpfulCount,
      createdAt: row.createdAt.toISOString(),
      productTitle: row.product?.title ?? null,
      productHandle: row.product?.handle ?? null,
      customer: row.customer
        ? {
            id: row.customer.id,
            firstName: row.customer.firstName,
            lastName: row.customer.lastName,
            email: row.customer.email,
          }
        : null,
      answers: row.answers.map((a) => ({
        id: a.id,
        body: a.body,
        isOfficial: a.isOfficial,
        authorCustomerId: a.authorCustomerId,
        authorUserId: a.authorUserId,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  });

  // ── Wishlist analytics ────────────────────────────────────────────
  app.get('/v1/commerce/wishlists/analytics', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    const take = q?.take ? Math.min(Number(q.take), 100) : 20;

    const result = await withRequestTenant(request, async (tx) => {
      const [wishlistCount, itemCount, topVariantRows] = await Promise.all([
        tx.wishlist.count(),
        tx.wishlistItem.count(),
        tx.wishlistItem.groupBy({
          by: ['variantId'],
          _count: { variantId: true },
          orderBy: { _count: { variantId: 'desc' } },
          take,
        }),
      ]);
      const variantIds = topVariantRows.map((r) => r.variantId);
      const variants = variantIds.length
        ? await tx.productVariant.findMany({
            where: { id: { in: variantIds } },
            select: {
              id: true,
              sku: true,
              title: true,
              product: { select: { id: true, title: true, handle: true } },
            },
          })
        : [];
      const byId = new Map(variants.map((v) => [v.id, v]));
      const topVariants = topVariantRows
        .map((row) => {
          const v = byId.get(row.variantId);
          if (!v) return null;
          return {
            variantId: v.id,
            sku: v.sku,
            variantTitle: v.title,
            productId: v.product.id,
            productTitle: v.product.title,
            productHandle: v.product.handle,
            saveCount: row._count.variantId,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      return { wishlistCount, itemCount, topVariants };
    });

    return ok(result);
  });
};

export default commerceListRoutes;
