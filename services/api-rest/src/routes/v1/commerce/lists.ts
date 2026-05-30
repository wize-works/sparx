// Commerce list endpoints that the dashboard needs but the service layer
// hasn't yet abstracted: tenant-wide variant catalog, active recalls,
// store-credit balances, cart inbox, checkout-session inbox, tenant-wide
// reviews / questions, question detail, wishlist analytics, plus an
// enriched warehouse-levels view that joins variant + product columns.
//
// These all go through `withRequestTenant` so RLS still enforces tenant
// isolation. Each handler is a thin Prisma query and is a candidate to
// hoist into `@sparx/commerce` once the dashboard's needs settle.

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { withRequestTenant } from '@sparx/api-core/db';
import { ok } from '@sparx/api-core/envelope';
import { requireRole } from '@sparx/api-core/auth';
import { notFound } from '@sparx/api-core/errors';
import { requireCommerceModule } from '../../../lib/commerce-context.js';

const PathId = z.object({ id: z.string().uuid() });
const WarehouseParam = z.object({ warehouseId: z.string().uuid() });

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
          product: { select: { id: true, title: true, handle: true, status: true } },
        },
      })
    );
    return ok(
      rows.map((r) => ({
        id: r.id,
        sku: r.sku,
        title: r.title,
        isDefault: r.isDefault,
        priceCents: r.priceCents,
        currency: r.currency,
        archivedAt: r.deletedAt?.toISOString() ?? null,
        productId: r.product.id,
        productTitle: r.product.title,
        productHandle: r.product.handle,
        productStatus: r.product.status,
      }))
    );
  });

  // ── Enriched warehouse levels (sku + product columns) ────────────
  app.get('/v1/commerce/inventory/levels/warehouse/:warehouseId/enriched', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const { warehouseId } = WarehouseParam.parse(request.params);
    const q = request.query as Record<string, string | undefined>;
    const take = q?.take ? Math.min(Number(q.take), 1000) : 200;
    const skip = q?.skip ? Number(q.skip) : 0;
    const lowStockOnly = q?.low_stock_only === 'true';

    const rows = await withRequestTenant(request, (tx) =>
      tx.inventoryLevel.findMany({
        where: { warehouseId },
        orderBy: [{ updatedAt: 'desc' }],
        take,
        skip,
        select: {
          variantId: true,
          warehouseId: true,
          onHand: true,
          allocated: true,
          reorderPoint: true,
          reorderQuantity: true,
          updatedAt: true,
          variant: {
            select: {
              sku: true,
              title: true,
              product: { select: { id: true, title: true, handle: true } },
            },
          },
        },
      })
    );
    const enriched = rows.map((r) => ({
      variantId: r.variantId,
      warehouseId: r.warehouseId,
      onHand: r.onHand,
      allocated: r.allocated,
      available: r.onHand - r.allocated,
      reorderPoint: r.reorderPoint,
      reorderQuantity: r.reorderQuantity,
      updatedAt: r.updatedAt.toISOString(),
      sku: r.variant.sku,
      variantTitle: r.variant.title,
      productId: r.variant.product.id,
      productTitle: r.variant.product.title,
      productHandle: r.variant.product.handle,
    }));
    // Filter in-process for low-stock since Prisma can't compare two columns.
    const filtered = lowStockOnly
      ? enriched.filter(
          (r) => r.reorderPoint !== null && r.onHand <= (r.reorderPoint ?? 0)
        )
      : enriched;
    return ok(filtered);
  });

  // ── Active recalls ────────────────────────────────────────────────
  app.get('/v1/commerce/inventory/recalls/active', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const rows = await withRequestTenant(request, (tx) =>
      tx.lotBatch.findMany({
        where: { recallStatus: 'active' },
        orderBy: { recalledAt: 'desc' },
        take: 200,
        select: {
          id: true,
          lotNumber: true,
          recallReason: true,
          recalledAt: true,
          warehouse: { select: { id: true, code: true, name: true } },
          variant: {
            select: { id: true, sku: true, product: { select: { id: true, title: true } } },
          },
        },
      })
    );
    return ok(
      rows.map((r) => ({
        id: r.id,
        lotNumber: r.lotNumber,
        recallReason: r.recallReason,
        recalledAt: r.recalledAt?.toISOString() ?? null,
        warehouseId: r.warehouse.id,
        warehouseCode: r.warehouse.code,
        warehouseName: r.warehouse.name,
        variantId: r.variant.id,
        variantSku: r.variant.sku,
        productId: r.variant.product.id,
        productTitle: r.variant.product.title,
      }))
    );
  });

  // ── Store credit balances ─────────────────────────────────────────
  app.get('/v1/commerce/store-credit', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    const take = q?.take ? Math.min(Number(q.take), 500) : 100;
    const minBalance = q?.min_balance_cents ? Number(q.min_balance_cents) : 1;

    const rows = await withRequestTenant(request, (tx) =>
      tx.storeCredit.findMany({
        where: { balanceCents: { gte: minBalance } },
        orderBy: { balanceCents: 'desc' },
        take,
        select: {
          id: true,
          customerId: true,
          balanceCents: true,
          currency: true,
          updatedAt: true,
          customer: {
            select: { id: true, firstName: true, lastName: true, email: true, company: true },
          },
        },
      })
    );
    return ok(
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
              company: r.customer.company,
            }
          : null,
      }))
    );
  });

  // ── Carts inbox ───────────────────────────────────────────────────
  app.get('/v1/commerce/carts', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    const take = q?.take ? Math.min(Number(q.take), 500) : 100;
    const filter = q?.filter ?? 'active';
    const where =
      filter === 'abandoned'
        ? { abandonedAt: { not: null }, recoveredAt: null }
        : filter === 'recovered'
          ? { recoveredAt: { not: null } }
          : { abandonedAt: null, recoveredAt: null };

    const rows = await withRequestTenant(request, (tx) =>
      tx.cart.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take,
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
            select: { id: true, firstName: true, lastName: true, email: true, company: true },
          },
          _count: { select: { items: true } },
        },
      })
    );
    return ok(
      rows.map((r) => ({
        id: r.id,
        channel: r.channel,
        currency: r.currency,
        customerId: r.customerId,
        guestToken: r.guestToken,
        subtotalCents: r.subtotalCents,
        totalCents: r.totalCents,
        itemCount: r._count.items,
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
              company: r.customer.company,
            }
          : null,
      }))
    );
  });

  // ── Checkout sessions inbox ───────────────────────────────────────
  app.get('/v1/commerce/checkout-sessions', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    const take = q?.take ? Math.min(Number(q.take), 500) : 100;

    const rows = await withRequestTenant(request, (tx) =>
      tx.checkoutSession.findMany({
        where: { ...(q?.step ? { step: q.step } : {}) },
        orderBy: { updatedAt: 'desc' },
        take,
        select: {
          id: true,
          step: true,
          channel: true,
          currency: true,
          customerId: true,
          customerEmail: true,
          subtotalCents: true,
          totalCents: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
      })
    );
    return ok(
      rows.map((r) => ({
        ...r,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }))
    );
  });

  // ── Reviews tenant-wide ───────────────────────────────────────────
  app.get('/v1/commerce/reviews', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    const take = q?.take ? Math.min(Number(q.take), 500) : 100;

    const rows = await withRequestTenant(request, (tx) =>
      tx.productReview.findMany({
        where: { ...(q?.status ? { status: q.status } : {}) },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          productId: true,
          rating: true,
          title: true,
          body: true,
          status: true,
          orderId: true,
          createdAt: true,
          customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          product: { select: { id: true, title: true, handle: true } },
        },
      })
    );
    return ok(
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
        customer: r.customer
          ? {
              id: r.customer.id,
              firstName: r.customer.firstName,
              lastName: r.customer.lastName,
              email: r.customer.email,
            }
          : null,
      }))
    );
  });

  // ── Questions tenant-wide ─────────────────────────────────────────
  app.get('/v1/commerce/questions', async (request) => {
    requireRole(request, 'viewer');
    await requireCommerceModule(request);
    const q = request.query as Record<string, string | undefined>;
    const take = q?.take ? Math.min(Number(q.take), 500) : 100;

    const rows = await withRequestTenant(request, (tx) =>
      tx.productQuestion.findMany({
        where: { ...(q?.status ? { status: q.status } : {}) },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          productId: true,
          body: true,
          status: true,
          createdAt: true,
          customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          product: { select: { id: true, title: true, handle: true } },
        },
      })
    );
    return ok(
      rows.map((r) => ({
        id: r.id,
        productId: r.productId,
        body: r.body,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        productTitle: r.product?.title ?? null,
        productHandle: r.product?.handle ?? null,
        customer: r.customer
          ? {
              id: r.customer.id,
              firstName: r.customer.firstName,
              lastName: r.customer.lastName,
              email: r.customer.email,
            }
          : null,
      }))
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
