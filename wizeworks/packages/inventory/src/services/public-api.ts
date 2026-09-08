// The documented public API surface (docs/06 §7) — the headless contract
// external integrators code against, distinct from the dashboard-shaped routes.
//
//   listInventory   → GET   /v1/inventory            (cross-warehouse, enriched)
//   updateLevelCount→ PATCH /v1/inventory/:variant_id (set on-hand or delta)
//   bulkAdjust      → POST  /v1/inventory/adjustments (CSV/JSON, per-row results)
//
// Writes never touch onHand directly — they all route through `applyMovement`
// (the ledger funnel): concurrency-safe, idempotent, attributed, reconcilable.
// A bulk adjustment runs each row in its OWN transaction so one bad row can't
// roll back the rest; the per-row result carries the outcome.

import { BulkAdjustmentInput, UpdateInventoryCountInput } from '@wizeworks/commerce-schemas';
import type { InventoryAdjustReason } from '@wizeworks/commerce-schemas';
// `Prisma` is a VALUE import here, not just a type: the level list builds its
// WHERE/ORDER BY out of `Prisma.sql` fragments (see `listInventory`).
import { Prisma, withTenant } from '@wizeworks/db';
import type { TxClient } from '@wizeworks/db';

import { writeAuditLog } from '../audit';
import type { ServiceContext } from '../errors';

import { ensureVariantExists, ensureWarehouseActive } from './internal';
import {
  applyMovement,
  emitStockEvents,
  resolveActorType,
  type ActorType,
  type MovementResult,
} from './ledger';
import { IN_STOCK_SQL, LOW_STOCK_SQL, OUT_OF_STOCK_SQL, SELLABLE_SQL } from './low-stock';

// ─── List (GET /v1/inventory) ─────────────────────────────────────────

export interface PublicInventoryRow {
  variantId: string;
  sku: string | null;
  productId: string;
  productTitle: string | null;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  onHand: number;
  allocated: number;
  available: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  /** How long a restock takes to arrive, in days — the other half of a reorder
   *  policy. Without it "reorder at 5" is unanswerable: 5 is only a sensible
   *  trigger relative to how long you wait for more. */
  leadTimeDays: number | null;
  /** Units withheld from what a shopper may buy (the oversell cushion). Reported
   *  so a product-scoped view can explain an `available` that is lower than
   *  on-hand minus allocated, instead of looking like an arithmetic bug. */
  safetyBuffer: number;
  /** The standard/manually-set cost. Distinct from `avgCostCents`, which is the
   *  moving average recomputed on costed receipts. */
  unitCostCents: number | null;
  avgCostCents: number | null;
  updatedAt: string;
  /**
   * When the QUANTITY was last established (docs/146 Phase 1).
   *
   * Distinct from `updatedAt`, which moves for any write to the row — editing a
   * reorder point this morning would make a three-week-old count look fresh.
   * The freshness indicator reads this one, and reading the wrong one is a bug
   * that renders as reassurance.
   */
  asOf: string;
  /** Seconds since `asOf`, computed server-side. Served rather than derived by
   *  each client, so a browser with a skewed clock cannot paint half a stock
   *  list as stale. */
  ageSeconds: number;
}

/**
 * How the list is ordered.
 *
 * `available` is the one that matters operationally — "show me what is closest
 * to running out" — and it is also the reason this query selects its keys in
 * SQL rather than through Prisma's `orderBy`. Sellable stock is the EXPRESSION
 * `on_hand - allocated - safety_buffer`, not a column, and Prisma can neither
 * sort nor filter on one.
 */
export type InventorySortKey = 'updatedAt' | 'available' | 'sku' | 'product';
export type InventorySortDirection = 'asc' | 'desc';

export interface ListInventoryFilter {
  warehouseId?: string;
  /** Case-insensitive match on variant SKU OR product title. */
  q?: string;
  /**
   * Every level for ONE product, across its variants and every warehouse.
   *
   * Exists so a product-scoped stock view is a SINGLE request. Without it the
   * only way to answer "what stock does this product have" was a request per
   * variant — an N+1 that a 40-variant product turns into 40 round trips, and
   * which the workbench's product-scoped panes would have multiplied again by
   * being dockable side by side. Filtering on `q` is not a substitute: it
   * matches product title as a SUBSTRING, so two products called "Camp Mug" and
   * "Camp Mug XL" cannot be told apart.
   */
  productId?: string;
  /**
   * Every level for ONE variant, across every warehouse.
   *
   * The single read behind a variant-scoped stock view: "this SKU — where is it
   * and how much is there". `levelsForVariant` answers the same question but
   * returns the bare level (no SKU, product title or warehouse NAME), so a
   * caller that wants to NAME what it is showing would have to join three more
   * reads onto it.
   */
  variantId?: string;
  /**
   * Only levels at or below their reorder point.
   *
   * Measured against SELLABLE stock (`on_hand - allocated - safety_buffer`), not
   * against on-hand — deliberately the same arithmetic the surfaces use to badge
   * a level "Running low". A filter that disagreed with the badge beside it
   * would hide rows the operator can see are low, which is worse than no filter.
   * This is the ONE definition (`LOW_STOCK_SQL` in ./low-stock), shared with
   * `listLowStock` and `levelsForWarehouse` so no two surfaces disagree.
   */
  lowStockOnly?: boolean;
  /**
   * Only levels with nothing left to sell.
   *
   * Not a stricter `lowStockOnly`: that one answers "has this crossed the
   * trigger somebody set", and returns nothing at all for a business that set no
   * triggers. This one answers "can a customer buy this", which needs no policy
   * to be true. `OUT_OF_STOCK_SQL` in ./low-stock is the one definition, shared
   * with the badge the stock list renders as "None to sell".
   */
  outOfStockOnly?: boolean;
  /**
   * Drop levels with nothing left to sell.
   *
   * Its use is `lowStockOnly` + `sellableOnly` = "running low but not yet gone",
   * which is what the console badges "Running low" — and which makes low and
   * out-of-stock disjoint, so a caller counting both never counts one level
   * twice. On its own it is simply "what a customer can still buy".
   */
  sellableOnly?: boolean;
  sortBy?: InventorySortKey;
  order?: InventorySortDirection;
  take?: number;
  skip?: number;
}

/** ORDER BY fragments, keyed so the caller can never reach the SQL. */
const SORT_COLUMNS: Record<InventorySortKey, Prisma.Sql> = {
  updatedAt: Prisma.sql`l.updated_at`,
  // "Closest to running out" sorts by sellable stock (the shared definition),
  // not the reported `available`.
  available: SELLABLE_SQL,
  sku: Prisma.sql`v.sku`,
  product: Prisma.sql`p.title`,
};

/**
 * List inventory levels, enriched with the names of what they are about.
 *
 * TWO queries by design. The first selects the matching (variant, warehouse)
 * KEYS in SQL — that is where the filtering, the count and the ordering happen,
 * because both the low-stock predicate and the `available` sort are expressions
 * over three columns and Prisma cannot express either. The second hydrates just
 * that page through Prisma, so the row shape stays one typed `select` rather
 * than a hand-written projection that drifts from the schema.
 */
export async function listInventory(
  ctx: ServiceContext,
  filter: ListInventoryFilter = {}
): Promise<{ items: PublicInventoryRow[]; total: number }> {
  const take = Math.min(filter.take ?? 50, 200);
  const skip = filter.skip ?? 0;
  const sortBy = filter.sortBy ?? 'updatedAt';
  // Newest-first for a timestamp, smallest-first for everything else: the
  // useful question about a quantity is "what is nearly gone", and about a name
  // is "where is it in the alphabet".
  const direction = filter.order ?? (sortBy === 'updatedAt' ? 'desc' : 'asc');

  const conditions: Prisma.Sql[] = [
    // Explicit tenant scope: the local superuser bypasses RLS, so a broad-scan
    // read without it leaks other tenants' levels. RLS enforces it in prod; this
    // is defense-in-depth + correct under the superuser-local test role.
    Prisma.sql`l.tenant_id = ${ctx.tenantId}::uuid`,
    Prisma.sql`w.deleted_at IS NULL`,
    Prisma.sql`v.deleted_at IS NULL`,
    Prisma.sql`p.deleted_at IS NULL`,
  ];
  if (filter.warehouseId) {
    conditions.push(Prisma.sql`l.warehouse_id = ${filter.warehouseId}::uuid`);
  }
  if (filter.variantId) conditions.push(Prisma.sql`l.variant_id = ${filter.variantId}::uuid`);
  if (filter.productId) conditions.push(Prisma.sql`v.product_id = ${filter.productId}::uuid`);
  if (filter.q) {
    const needle = `%${filter.q}%`;
    conditions.push(Prisma.sql`(v.sku ILIKE ${needle} OR p.title ILIKE ${needle})`);
  }
  if (filter.lowStockOnly) {
    conditions.push(LOW_STOCK_SQL);
  }
  if (filter.outOfStockOnly) {
    conditions.push(OUT_OF_STOCK_SQL);
  }
  if (filter.sellableOnly) {
    conditions.push(IN_STOCK_SQL);
  }

  const from = Prisma.sql`
    FROM inventory_levels l
    JOIN inventory_warehouses w ON w.id = l.warehouse_id
    JOIN commerce_product_variants v ON v.id = l.variant_id
    JOIN commerce_products p ON p.id = v.product_id
  `;
  const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  // The tiebreaker is what makes paging stable: without it two levels with the
  // same quantity can swap places between page 1 and page 2 and one of them is
  // never seen.
  const orderBy = Prisma.sql`ORDER BY ${SORT_COLUMNS[sortBy]} ${
    direction === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`
  }, l.variant_id ASC, l.warehouse_id ASC`;

  return withTenant(ctx, async (tx) => {
    const [keys, counted] = await Promise.all([
      tx.$queryRaw<{ variantId: string; warehouseId: string }[]>`
        SELECT l.variant_id AS "variantId", l.warehouse_id AS "warehouseId"
        ${from} ${where} ${orderBy}
        LIMIT ${take} OFFSET ${skip}
      `,
      tx.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*)::bigint AS total ${from} ${where}`,
    ]);

    const total = Number(counted[0]?.total ?? 0);
    if (keys.length === 0) return { items: [], total };

    const rows = await tx.inventoryLevel.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: keys.map((k) => ({ variantId: k.variantId, warehouseId: k.warehouseId })),
      },
      select: {
        variantId: true,
        warehouseId: true,
        onHand: true,
        allocated: true,
        reorderPoint: true,
        reorderQuantity: true,
        leadTimeDays: true,
        safetyBuffer: true,
        unitCostCents: true,
        avgCostCents: true,
        updatedAt: true,
        asOf: true,
        warehouse: { select: { code: true, name: true } },
        variant: {
          select: { sku: true, product: { select: { id: true, title: true } } },
        },
      },
    });

    const byKey = new Map(rows.map((r) => [`${r.variantId}:${r.warehouseId}`, r]));
    // Re-ordered to the KEY query's order — `findMany` with an OR set makes no
    // promise about row order, so hydrating would otherwise silently discard the
    // sort the caller asked for.
    const items = keys.flatMap((k) => {
      const r = byKey.get(`${k.variantId}:${k.warehouseId}`);
      if (!r) return [];
      return [
        {
          variantId: r.variantId,
          sku: r.variant.sku,
          productId: r.variant.product.id,
          productTitle: r.variant.product.title,
          warehouseId: r.warehouseId,
          warehouseCode: r.warehouse.code,
          warehouseName: r.warehouse.name,
          onHand: r.onHand,
          allocated: r.allocated,
          available: r.onHand - r.allocated,
          reorderPoint: r.reorderPoint,
          reorderQuantity: r.reorderQuantity,
          leadTimeDays: r.leadTimeDays,
          safetyBuffer: r.safetyBuffer,
          unitCostCents: r.unitCostCents,
          avgCostCents: r.avgCostCents,
          updatedAt: r.updatedAt.toISOString(),
          asOf: r.asOf.toISOString(),
          ageSeconds: Math.max(0, Math.floor((Date.now() - r.asOf.getTime()) / 1000)),
        },
      ];
    });
    return { items, total };
  });
}

// ─── Never counted (GET /v1/inventory/uncounted) ──────────────────────

/**
 * A version somebody sells that has NO level row anywhere.
 *
 * This is not a stock position, which is why it cannot come out of the list
 * above: that query starts `FROM inventory_levels`, so a version nobody has
 * counted is not a row it can return, no matter how it is filtered. It comes
 * from the catalog side instead.
 *
 * It has to be askable because the absence is INVISIBLE and it changes what the
 * shop does. A version becomes stock-managed by being COUNTED, not by existing
 * (availability.ts), so an uncounted one sells WITHOUT LIMIT however its
 * "when you run out" setting reads. The stock list said `Showing 1-15 of 15`
 * about a shirt with twenty versions and nothing anywhere named the other five
 * (issue 444).
 */
export interface UncountedVariantRow {
  variantId: string;
  sku: string;
  variantTitle: string | null;
  productId: string;
  productTitle: string;
  /**
   * What the version says should happen when it runs out.
   *
   * Reported because it is the setting that is NOT being honoured: `deny` means
   * "stop selling it", and while nothing is counted there is nothing to run out
   * of, so it never fires. `continue` versions are uncounted on purpose all the
   * time — that policy means unbounded anyway — and telling those apart is the
   * difference between a warning worth reading and thirty lines of noise.
   */
  inventoryPolicy: string;
}

export interface ListUncountedFilter {
  /** Case-insensitive match on variant SKU OR product title — the same needle
   *  the level list takes, so one search box can ask both. */
  q?: string;
  productId?: string;
  take?: number;
  skip?: number;
}

export async function listUncounted(
  ctx: ServiceContext,
  filter: ListUncountedFilter = {}
): Promise<{ items: UncountedVariantRow[]; total: number }> {
  const take = Math.min(filter.take ?? 50, 200);
  const skip = filter.skip ?? 0;
  const needle = filter.q?.trim();

  const where: Prisma.ProductVariantWhereInput = {
    tenantId: ctx.tenantId,
    deletedAt: null,
    // ON SALE only. A draft product is not being sold, so an uncounted version
    // of one is not a promise anybody can take up — listing it would bury the
    // versions that are.
    product: { deletedAt: null, status: 'active' },
    // The whole definition: no level row, at any location.
    inventoryLevels: { none: {} },
    // ONLY the ones where a setting is going unhonoured. `deny` means "stop
    // selling it when it runs out", and it cannot fire while nothing has ever
    // been counted — that broken promise is the news. `continue` means "keep
    // selling when out", so an uncounted one is unlimited exactly as asked and
    // there is nothing to report. Both are deliberate: the column defaults to
    // `deny`, so `continue` was always written by somebody.
    //
    // This filter was missing on the first cut and it mattered: on 2026-09-08
    // the platform held 1,664 uncounted `continue` versions against 55 `deny`
    // ones, so the band told a shop to go and count 33 memberships, reports and
    // made-to-order perfumes that are unlimited on purpose (issue 445).
    inventoryPolicy: 'deny',
    // A version that is not posted cannot be on a shelf, so it cannot be
    // counted and must never be named as something to go and count.
    requiresShipping: true,
    ...(filter.productId ? { productId: filter.productId } : {}),
    ...(needle
      ? {
          OR: [
            { sku: { contains: needle, mode: 'insensitive' as const } },
            { product: { title: { contains: needle, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  return withTenant(ctx, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.productVariant.findMany({
        where,
        select: {
          id: true,
          sku: true,
          title: true,
          inventoryPolicy: true,
          product: { select: { id: true, title: true } },
        },
        // Alphabetical by code, with the id as the tiebreaker that makes paging
        // stable — two versions can share a null-ish code and one would
        // otherwise never be seen.
        orderBy: [{ sku: 'asc' }, { id: 'asc' }],
        take,
        skip,
      }),
      tx.productVariant.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        variantId: r.id,
        sku: r.sku,
        variantTitle: r.title,
        productId: r.product.id,
        productTitle: r.product.title,
        inventoryPolicy: r.inventoryPolicy,
      })),
      total,
    };
  });
}

// ─── Count update (PATCH) + bulk adjustment (POST) ────────────────────

interface LevelChange {
  variantId: string;
  warehouseId: string;
  /** Absolute on-hand target (reconciled to a corrective delta under the lock). */
  onHand?: number;
  /** Signed change to on-hand. Exactly one of onHand/delta is set. */
  delta?: number;
  reason: InventoryAdjustReason;
  note?: string | null;
  actorType: ActorType;
  idempotencyKey?: string | null;
}

/** Apply one level change through the ledger inside the caller's tx + audit it. */
async function applyLevelChangeOnTx(
  tx: TxClient,
  ctx: ServiceContext,
  change: LevelChange
): Promise<MovementResult> {
  await ensureWarehouseActive(tx, change.warehouseId);
  await ensureVariantExists(tx, change.variantId);

  const r = await applyMovement(tx, {
    tenantId: ctx.tenantId,
    variantId: change.variantId,
    warehouseId: change.warehouseId,
    delta: change.delta ?? 0,
    ...(change.onHand !== undefined ? { setOnHand: change.onHand } : {}),
    reason: change.reason,
    note: change.note ?? null,
    actorType: change.actorType,
    actorId: ctx.userId ?? null,
    idempotencyKey: change.idempotencyKey ?? null,
  });

  if (!r.deduped) {
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'inventory.adjusted',
      entityType: 'InventoryLevel',
      entityId: change.variantId,
      diff: {
        before: { onHand: r.onHand - r.appliedDelta },
        after: { onHand: r.onHand, allocated: r.allocated, warehouseId: change.warehouseId },
      },
    });
  }
  return r;
}

export interface LevelCountResult {
  variantId: string;
  warehouseId: string;
  onHand: number;
  available: number;
  appliedDelta: number;
  deduped: boolean;
}

/** PATCH /v1/inventory/:variant_id — set an absolute on-hand or apply a delta. */
export async function updateLevelCount(
  ctx: ServiceContext,
  variantId: string,
  rawInput: unknown
): Promise<LevelCountResult> {
  const input = UpdateInventoryCountInput.parse(rawInput);

  const result = await withTenant(ctx, (tx) =>
    applyLevelChangeOnTx(tx, ctx, {
      variantId,
      warehouseId: input.warehouseId,
      ...(input.onHand !== undefined ? { onHand: input.onHand } : {}),
      ...(input.delta !== undefined ? { delta: input.delta } : {}),
      reason: input.reason,
      note: input.note ?? null,
      actorType: resolveActorType(ctx),
      idempotencyKey: input.idempotencyKey ?? null,
    })
  );

  if (!result.deduped) {
    await emitStockEvents(
      ctx,
      variantId,
      input.warehouseId,
      result,
      result.appliedDelta,
      input.reason
    );
  }

  return {
    variantId,
    warehouseId: input.warehouseId,
    onHand: result.onHand,
    available: result.available,
    appliedDelta: result.appliedDelta,
    deduped: result.deduped,
  };
}

export interface BulkAdjustResultRow {
  index: number;
  sku: string | null;
  variantId: string | null;
  warehouseId: string;
  status: 'applied' | 'skipped' | 'error';
  onHand?: number;
  available?: number;
  appliedDelta?: number;
  error?: string;
}

export interface BulkAdjustResult {
  applied: number;
  skipped: number;
  failed: number;
  results: BulkAdjustResultRow[];
}

/**
 * POST /v1/inventory/adjustments — apply many level changes. Each row resolves a
 * variant by `sku` (batch-resolved up front) or `variantId`, then runs in its
 * own transaction so one failure can't roll back the batch. The per-row result
 * reports applied / skipped (idempotent no-op) / error with the reason.
 */
export async function bulkAdjust(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<BulkAdjustResult> {
  const input = BulkAdjustmentInput.parse(rawInput);

  // One query resolves every distinct SKU → variant id.
  const skus = [...new Set(input.adjustments.flatMap((r) => (r.sku ? [r.sku] : [])))];
  const bySku = new Map<string, string>();
  if (skus.length > 0) {
    const variants = await withTenant(ctx, (tx) =>
      tx.productVariant.findMany({
        // Explicit tenant scope — the superuser-local role bypasses RLS, and a
        // SKU can collide across tenants; never resolve to another tenant's variant.
        where: { tenantId: ctx.tenantId, sku: { in: skus }, deletedAt: null },
        select: { id: true, sku: true },
      })
    );
    for (const v of variants) if (v.sku) bySku.set(v.sku, v.id);
  }

  const results: BulkAdjustResultRow[] = [];
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, row] of input.adjustments.entries()) {
    const variantId = row.variantId ?? (row.sku ? bySku.get(row.sku) : undefined);
    if (!variantId) {
      failed++;
      results.push({
        index: i,
        sku: row.sku ?? null,
        variantId: null,
        warehouseId: row.warehouseId,
        status: 'error',
        error: `No active variant found for sku "${row.sku ?? ''}".`,
      });
      continue;
    }

    try {
      const r = await withTenant(ctx, (tx) =>
        applyLevelChangeOnTx(tx, ctx, {
          variantId,
          warehouseId: row.warehouseId,
          ...(row.onHand !== undefined ? { onHand: row.onHand } : {}),
          ...(row.delta !== undefined ? { delta: row.delta } : {}),
          reason: row.reason,
          note: row.note ?? null,
          actorType: resolveActorType(ctx),
        })
      );
      if (!r.deduped) {
        await emitStockEvents(ctx, variantId, row.warehouseId, r, r.appliedDelta, row.reason);
        applied++;
      } else {
        skipped++;
      }
      results.push({
        index: i,
        sku: row.sku ?? null,
        variantId,
        warehouseId: row.warehouseId,
        status: r.deduped ? 'skipped' : 'applied',
        onHand: r.onHand,
        available: r.available,
        appliedDelta: r.appliedDelta,
      });
    } catch (err) {
      failed++;
      results.push({
        index: i,
        sku: row.sku ?? null,
        variantId,
        warehouseId: row.warehouseId,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { applied, skipped, failed, results };
}
