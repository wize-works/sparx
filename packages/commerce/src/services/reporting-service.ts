// reportingService — read-only metrics surfaced in the dashboard home,
// the analytics tab, and the MCP read tools.
//
// Every query runs live against the operational tables (orders, carts,
// subscriptions, inventory). Once a tenant's order volume justifies
// pre-aggregation, the same shapes will be served from a nightly
// rollup table populated by a worker — call sites are stable.
//
// Money: the CRM Order spine carries Decimal totals (dollars); the
// Commerce tables carry integer cents. Reports surface integer cents
// consistently so the dashboard doesn't have to juggle two formats.

import { withTenant } from '@sparx/db';

import type { ServiceContext } from '../errors';

const DEFAULT_CURRENCY = 'USD';

export interface DateRange {
  from: string; // ISO
  to: string; // ISO
}

function bounds(range: DateRange): { from: Date; to: Date } {
  return { from: new Date(range.from), to: new Date(range.to) };
}

function rangeLabel(range: DateRange): string {
  return `${range.from.slice(0, 10)} → ${range.to.slice(0, 10)}`;
}

function decimalToCents(d: { toNumber(): number } | number | null | undefined): number {
  if (d == null) return 0;
  const n = typeof d === 'number' ? d : d.toNumber();
  return Math.round(n * 100);
}

// ─── Revenue ─────────────────────────────────────────────────────────

export interface RevenueSummary {
  rangeLabel: string;
  ordersCount: number;
  grossRevenueCents: number;
  refundedCents: number;
  netRevenueCents: number;
  averageOrderValueCents: number;
  currency: string;
}

export async function revenueSummary(
  ctx: ServiceContext,
  range: DateRange
): Promise<RevenueSummary> {
  const { from, to } = bounds(range);

  return withTenant(ctx, async (tx) => {
    const agg = await tx.order.aggregate({
      where: {
        placedAt: { gte: from, lte: to },
        status: { not: 'cancelled' },
      },
      _count: { _all: true },
      _sum: { total: true, refundTotal: true },
    });

    const gross = decimalToCents(agg._sum.total);
    const refunded = decimalToCents(agg._sum.refundTotal);
    const ordersCount = agg._count._all;

    return {
      rangeLabel: rangeLabel(range),
      ordersCount,
      grossRevenueCents: gross,
      refundedCents: refunded,
      netRevenueCents: gross - refunded,
      averageOrderValueCents: ordersCount > 0 ? Math.round(gross / ordersCount) : 0,
      currency: DEFAULT_CURRENCY,
    };
  });
}

// ─── Top products ────────────────────────────────────────────────────

export interface TopProductRow {
  productId: string;
  productTitle: string;
  unitsSold: number;
  revenueCents: number;
}

export async function topProducts(
  ctx: ServiceContext,
  input: { range: DateRange; limit?: number }
): Promise<TopProductRow[]> {
  const { from, to } = bounds(input.range);
  const limit = input.limit ?? 10;

  return withTenant(ctx, async (tx) => {
    // OrderItem has a nullable productId that points at the Commerce
    // product spine. We group by that, sum units + revenue, then join
    // back to Product for the title.
    const groups = await tx.orderItem.groupBy({
      by: ['productId'],
      where: {
        productId: { not: null },
        order: { placedAt: { gte: from, lte: to }, status: { not: 'cancelled' } },
      },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { lineTotal: 'desc' } },
      take: limit,
    });

    const productIds = groups.map((g) => g.productId).filter((id): id is string => id !== null);
    if (productIds.length === 0) return [];

    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, title: true },
    });
    const titleById = new Map(products.map((p) => [p.id, p.title]));

    return groups.map((g) => ({
      productId: g.productId ?? '',
      productTitle: g.productId ? (titleById.get(g.productId) ?? '—') : '—',
      unitsSold: g._sum?.quantity ?? 0,
      revenueCents: decimalToCents(g._sum?.lineTotal ?? null),
    }));
  });
}

// ─── Top customers ───────────────────────────────────────────────────

export interface TopCustomerRow {
  customerId: string;
  customerName: string;
  ordersCount: number;
  totalSpentCents: number;
}

export async function topCustomers(
  ctx: ServiceContext,
  input: { range: DateRange; limit?: number }
): Promise<TopCustomerRow[]> {
  const { from, to } = bounds(input.range);
  const limit = input.limit ?? 10;

  return withTenant(ctx, async (tx) => {
    const groups = await tx.order.groupBy({
      by: ['customerId'],
      where: {
        placedAt: { gte: from, lte: to },
        status: { not: 'cancelled' },
      },
      _count: { _all: true },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: limit,
    });

    if (groups.length === 0) return [];

    const customerIds = groups.map((g) => g.customerId);
    const customers = await tx.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(customers.map((c) => [c.id, c]));

    return groups.map((g) => {
      const c = byId.get(g.customerId);
      return {
        customerId: g.customerId,
        customerName: c?.name ?? c?.email ?? '—',
        ordersCount: g._count._all,
        totalSpentCents: decimalToCents(g._sum.total),
      };
    });
  });
}

// ─── Conversion funnel ───────────────────────────────────────────────

export interface ConversionFunnel {
  rangeLabel: string;
  sessions: number;
  cartsCreated: number;
  checkoutsStarted: number;
  ordersPlaced: number;
  cartToCheckoutRate: number;
  checkoutToOrderRate: number;
  overallConversion: number;
}

export async function conversionFunnel(
  ctx: ServiceContext,
  range: DateRange
): Promise<ConversionFunnel> {
  const { from, to } = bounds(range);

  return withTenant(ctx, async (tx) => {
    const [cartsCreated, checkoutsStarted, ordersPlaced] = await Promise.all([
      tx.cart.count({ where: { createdAt: { gte: from, lte: to } } }),
      tx.checkoutSession.count({ where: { createdAt: { gte: from, lte: to } } }),
      tx.order.count({
        where: { placedAt: { gte: from, lte: to }, status: { not: 'cancelled' } },
      }),
    ]);

    // Sessions tracking requires analytics tooling that hasn't landed
    // yet; surface as 0 + the existing funnel stages so the dashboard
    // strip works today and grows seamlessly when sessions arrive.
    const sessions = 0;
    const rate = (a: number, b: number) => (b > 0 ? a / b : 0);

    return {
      rangeLabel: rangeLabel(range),
      sessions,
      cartsCreated,
      checkoutsStarted,
      ordersPlaced,
      cartToCheckoutRate: rate(checkoutsStarted, cartsCreated),
      checkoutToOrderRate: rate(ordersPlaced, checkoutsStarted),
      overallConversion: rate(ordersPlaced, cartsCreated),
    };
  });
}

// ─── Abandoned carts ─────────────────────────────────────────────────

export interface AbandonedCartReport {
  rangeLabel: string;
  abandonedCount: number;
  recoveredCount: number;
  recoveryRate: number;
  recoveredRevenueCents: number;
}

export async function abandonedCarts(
  ctx: ServiceContext,
  range: DateRange
): Promise<AbandonedCartReport> {
  const { from, to } = bounds(range);

  return withTenant(ctx, async (tx) => {
    const [abandonedCount, recoveredAgg] = await Promise.all([
      tx.cart.count({
        where: { abandonedAt: { gte: from, lte: to } },
      }),
      tx.cart.aggregate({
        where: { recoveredAt: { gte: from, lte: to } },
        _count: { _all: true },
        _sum: { totalCents: true },
      }),
    ]);

    const recoveredCount = recoveredAgg._count._all;
    const totalLooked = abandonedCount + recoveredCount;

    return {
      rangeLabel: rangeLabel(range),
      abandonedCount,
      recoveredCount,
      recoveryRate: totalLooked > 0 ? recoveredCount / totalLooked : 0,
      recoveredRevenueCents: recoveredAgg._sum.totalCents ?? 0,
    };
  });
}

// ─── Subscription metrics ────────────────────────────────────────────

export interface SubscriptionMetrics {
  activeCount: number;
  mrrCents: number;
  churnedThisPeriod: number;
  newThisPeriod: number;
  currency: string;
}

export async function subscriptionMetrics(
  ctx: ServiceContext,
  range: DateRange
): Promise<SubscriptionMetrics> {
  const { from, to } = bounds(range);

  return withTenant(ctx, async (tx) => {
    const [active, churned, newInPeriod] = await Promise.all([
      tx.subscription.findMany({
        where: { status: { in: ['active', 'trialing', 'past_due'] } },
        include: { items: true },
      }),
      tx.subscription.count({
        where: { status: 'cancelled', cancelledAt: { gte: from, lte: to } },
      }),
      tx.subscription.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
    ]);

    let mrrCents = 0;
    for (const sub of active) {
      const perCycle = sub.items.reduce((sum, it) => sum + it.unitPriceCents * it.quantity, 0);
      const factor = monthlyFactorFor(sub.intervalUnit, sub.intervalCount);
      mrrCents += Math.round(perCycle * sub.deliveriesPerCycle * factor);
    }

    return {
      activeCount: active.length,
      mrrCents,
      churnedThisPeriod: churned,
      newThisPeriod: newInPeriod,
      currency: active[0]?.currency ?? DEFAULT_CURRENCY,
    };
  });
}

function monthlyFactorFor(unit: string, count: number): number {
  if (count <= 0) return 0;
  switch (unit) {
    case 'day':
      return 30 / count;
    case 'week':
      return 30 / (7 * count);
    case 'month':
      return 1 / count;
    case 'year':
      return 1 / (12 * count);
    default:
      return 0;
  }
}

// ─── Inventory valuation ─────────────────────────────────────────────

export interface InventoryValuation {
  totalUnits: number;
  totalCostCents: number;
  totalRetailCents: number;
  currency: string;
  asOf: string;
}

export async function inventoryValuation(ctx: ServiceContext): Promise<InventoryValuation> {
  return withTenant(ctx, async (tx) => {
    // Sum on-hand units across every warehouse, then join to variant
    // pricing/cost. Done as two queries rather than one wide join so
    // the variant lookup is constant-time and the level scan is
    // straight off the (tenantId, variantId) index.
    const levels = await tx.inventoryLevel.groupBy({
      by: ['variantId'],
      _sum: { onHand: true },
    });

    if (levels.length === 0) {
      return {
        totalUnits: 0,
        totalCostCents: 0,
        totalRetailCents: 0,
        currency: DEFAULT_CURRENCY,
        asOf: new Date().toISOString(),
      };
    }

    const variantIds = levels.map((l) => l.variantId);
    const variants = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, priceCents: true, costCents: true },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    let totalUnits = 0;
    let totalCostCents = 0;
    let totalRetailCents = 0;

    for (const lvl of levels) {
      const v = byId.get(lvl.variantId);
      if (!v) continue;
      const units = lvl._sum.onHand ?? 0;
      totalUnits += units;
      totalCostCents += (v.costCents ?? 0) * units;
      totalRetailCents += v.priceCents * units;
    }

    return {
      totalUnits,
      totalCostCents,
      totalRetailCents,
      currency: DEFAULT_CURRENCY,
      asOf: new Date().toISOString(),
    };
  });
}
