// inventoryService — single entry point for every inventory mutation.
// Cart adds, order placements, fulfillments, returns, and recounts all
// flow through reserve() / release() / commit() / adjust() / transfer()
// so the audit trail is uniform and the inventory.* events fire from
// one place.
//
// Concurrency: reserve() takes a row lock on the InventoryLevel via
// `SELECT … FOR UPDATE` inside the transaction so two concurrent carts
// can't both grab the last unit. The lock releases when the tx commits.
//
// Locked write pattern (same as productService / variantService):
//   1. Validate input via @sparx/commerce-schemas
//   2. withTenant() transaction with RLS context
//   3. writeAuditLog inside the same transaction
//   4. publishCommerceEvent AFTER commit

import {
  AdjustInventoryInput,
  CreateLotBatchInput,
  CreateSerialUnitInput,
  CreateWarehouseInput,
  InitiateRecallInput,
  ReserveInventoryInput,
  SetReorderPolicyInput,
  TransferInventoryInput,
  UpdateWarehouseInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma, TxClient, Warehouse } from '@sparx/db';

import { writeAuditLog } from '../audit';
import {
  CommerceConflictError,
  CommerceNotFoundError,
  CommerceOutOfStockError,
  CommerceValidationError,
} from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

const CART_TTL_SECONDS_DEFAULT = 30 * 60;

// ─── Warehouses ───────────────────────────────────────────────────────

export interface WarehouseRow {
  id: string;
  name: string;
  code: string;
  type: string;
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  defaultForChannel: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listWarehouses(
  ctx: ServiceContext,
  filter: { includeInactive?: boolean } = {}
): Promise<WarehouseRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.warehouse.findMany({
      where: {
        deletedAt: null,
        ...(filter.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
    return rows.map(serializeWarehouse);
  });
}

export async function getWarehouse(
  ctx: ServiceContext,
  warehouseId: string
): Promise<WarehouseRow> {
  const row = await withTenant(ctx, (tx) =>
    tx.warehouse.findFirst({ where: { id: warehouseId, deletedAt: null } })
  );
  if (!row) throw new CommerceNotFoundError('Warehouse', warehouseId);
  return serializeWarehouse(row);
}

export async function createWarehouse(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = CreateWarehouseInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const existing = await tx.warehouse.findFirst({
      where: { code: input.code, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new CommerceConflictError(`Warehouse code "${input.code}" is already in use`, 'code');
    }

    const warehouse = await tx.warehouse.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        code: input.code,
        type: input.type,
        line1: input.address.line1,
        line2: input.address.line2 ?? null,
        city: input.address.city,
        region: input.address.region ?? null,
        postalCode: input.address.postalCode ?? null,
        country: input.address.country,
        phone: input.address.phone ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        defaultForChannel: input.defaultForChannel,
        hoursOfOperation: input.hoursOfOperation ?? [],
        isActive: input.isActive,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.warehouse.created',
      entityType: 'Warehouse',
      entityId: warehouse.id,
      diff: { after: serializeWarehouse(warehouse) as unknown as Record<string, unknown> },
    });

    return warehouse;
  });

  return { id: result.id };
}

export async function updateWarehouse(
  ctx: ServiceContext,
  warehouseId: string,
  rawInput: unknown
): Promise<WarehouseRow> {
  const input = UpdateWarehouseInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.warehouse.findFirst({
      where: { id: warehouseId, deletedAt: null },
    });
    if (!before) throw new CommerceNotFoundError('Warehouse', warehouseId);

    if (input.code !== undefined && input.code !== before.code) {
      const collision = await tx.warehouse.findFirst({
        where: { code: input.code, deletedAt: null, NOT: { id: warehouseId } },
        select: { id: true },
      });
      if (collision) {
        throw new CommerceConflictError(`Warehouse code "${input.code}" is already in use`, 'code');
      }
    }

    const updated = await tx.warehouse.update({
      where: { id: warehouseId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.address
          ? {
              line1: input.address.line1,
              line2: input.address.line2 ?? null,
              city: input.address.city,
              region: input.address.region ?? null,
              postalCode: input.address.postalCode ?? null,
              country: input.address.country,
              phone: input.address.phone ?? null,
            }
          : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        ...(input.defaultForChannel !== undefined
          ? { defaultForChannel: input.defaultForChannel }
          : {}),
        ...(input.hoursOfOperation !== undefined
          ? { hoursOfOperation: input.hoursOfOperation }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.warehouse.updated',
      entityType: 'Warehouse',
      entityId: updated.id,
      diff: {
        before: serializeWarehouse(before) as unknown as Record<string, unknown>,
        after: serializeWarehouse(updated) as unknown as Record<string, unknown>,
      },
    });

    return updated;
  });

  return serializeWarehouse(result);
}

export async function archiveWarehouse(ctx: ServiceContext, warehouseId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.warehouse.findFirst({
      where: { id: warehouseId, deletedAt: null },
    });
    if (!before) throw new CommerceNotFoundError('Warehouse', warehouseId);

    const activeStock = await tx.inventoryLevel.findFirst({
      where: { warehouseId, onHand: { gt: 0 } },
      select: { variantId: true, onHand: true },
    });
    if (activeStock) {
      throw new CommerceValidationError(
        'Cannot archive a warehouse that still holds stock — transfer or zero out levels first'
      );
    }

    await tx.warehouse.update({
      where: { id: warehouseId },
      data: { deletedAt: new Date(), isActive: false },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.warehouse.archived',
      entityType: 'Warehouse',
      entityId: warehouseId,
      diff: { before: serializeWarehouse(before) as unknown as Record<string, unknown> },
    });
  });
}

// ─── Inventory levels ─────────────────────────────────────────────────

export interface InventoryLevelRow {
  variantId: string;
  warehouseId: string;
  warehouseCode: string;
  onHand: number;
  allocated: number;
  available: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  leadTimeDays: number | null;
  unitCostCents: number | null;
  updatedAt: string;
}

export async function getLevel(
  ctx: ServiceContext,
  variantId: string,
  warehouseId: string
): Promise<InventoryLevelRow | null> {
  return withTenant(ctx, async (tx) => {
    const row = await tx.inventoryLevel.findUnique({
      where: { variantId_warehouseId: { variantId, warehouseId } },
      include: { warehouse: { select: { code: true } } },
    });
    return row ? serializeLevel(row) : null;
  });
}

export async function levelsForVariant(
  ctx: ServiceContext,
  variantId: string
): Promise<InventoryLevelRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.inventoryLevel.findMany({
      where: { variantId },
      include: { warehouse: { select: { code: true, isActive: true } } },
      orderBy: { warehouse: { code: 'asc' } },
    });
    return rows.map(serializeLevel);
  });
}

export async function levelsForWarehouse(
  ctx: ServiceContext,
  warehouseId: string,
  filter: { lowStockOnly?: boolean; take?: number; skip?: number } = {}
): Promise<{ items: InventoryLevelRow[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const where: Prisma.InventoryLevelWhereInput = {
      warehouseId,
      ...(filter.lowStockOnly
        ? {
            reorderPoint: { not: null },
            // available = onHand - allocated; can't filter on a derived
            // column directly. Approximate with onHand <= reorderPoint
            // (slight over-report when there are stale allocations; the
            // dashboard re-filters after fetch).
            onHand: { lte: 5 },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      tx.inventoryLevel.findMany({
        where,
        include: { warehouse: { select: { code: true } } },
        orderBy: { onHand: 'asc' },
        take: Math.min(filter.take ?? 100, 500),
        skip: filter.skip ?? 0,
      }),
      tx.inventoryLevel.count({ where }),
    ]);
    return { items: rows.map(serializeLevel), total };
  });
}

export async function adjust(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ newOnHand: number; newAvailable: number }> {
  const input = AdjustInventoryInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    await ensureWarehouseActive(tx, input.warehouseId);
    await ensureVariantExists(tx, input.variantId);

    const before = await tx.inventoryLevel.upsert({
      where: {
        variantId_warehouseId: {
          variantId: input.variantId,
          warehouseId: input.warehouseId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        onHand: 0,
        allocated: 0,
      },
      update: {},
    });

    const newOnHand = before.onHand + input.delta;
    if (newOnHand < 0) {
      throw new CommerceValidationError(
        `Adjustment would drive onHand negative (current ${before.onHand}, delta ${input.delta})`
      );
    }

    const updated = await tx.inventoryLevel.update({
      where: {
        variantId_warehouseId: {
          variantId: input.variantId,
          warehouseId: input.warehouseId,
        },
      },
      data: { onHand: newOnHand, asOf: new Date() },
    });

    await tx.inventoryAdjustment.create({
      data: {
        tenantId: ctx.tenantId,
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        delta: input.delta,
        reason: input.reason,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        actorUserId: ctx.userId ?? null,
        note: input.note ?? null,
        unitCostCents: input.unitCostCents ?? null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.inventory.adjusted',
      entityType: 'InventoryLevel',
      entityId: `${input.variantId}:${input.warehouseId}`,
      diff: {
        before: { onHand: before.onHand, allocated: before.allocated },
        after: { onHand: updated.onHand, allocated: updated.allocated },
      },
    });

    await syncProductInStock(tx, input.variantId);

    return {
      onHand: updated.onHand,
      allocated: updated.allocated,
      reorderPoint: updated.reorderPoint,
    };
  });

  const newAvailable = result.onHand - result.allocated;

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'inventory.adjusted',
    data: {
      variantId: input.variantId,
      warehouseId: input.warehouseId,
      delta: input.delta,
      reason: input.reason,
      newOnHand: result.onHand,
      newAvailable,
    },
  });

  // Threshold events. Fire on the transition (was above, now below) so
  // we don't spam subscribers on every adjustment past the line.
  const reorderPoint = result.reorderPoint;
  if (reorderPoint !== null && newAvailable <= reorderPoint) {
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'inventory.low',
      data: {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        available: newAvailable,
        reorderPoint,
      },
    });
  }
  if (newAvailable <= 0) {
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'inventory.depleted',
      data: {
        variantId: input.variantId,
        warehouseId: input.warehouseId,
      },
    });
  }

  return { newOnHand: result.onHand, newAvailable };
}

export async function setReorderPolicy(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = SetReorderPolicyInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    await ensureWarehouseActive(tx, input.warehouseId);
    await ensureVariantExists(tx, input.variantId);

    await tx.inventoryLevel.upsert({
      where: {
        variantId_warehouseId: {
          variantId: input.variantId,
          warehouseId: input.warehouseId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        onHand: 0,
        allocated: 0,
        reorderPoint: input.reorderPoint,
        reorderQuantity: input.reorderQuantity,
        leadTimeDays: input.leadTimeDays ?? null,
      },
      update: {
        reorderPoint: input.reorderPoint,
        reorderQuantity: input.reorderQuantity,
        leadTimeDays: input.leadTimeDays ?? null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.inventory.reorder_policy_set',
      entityType: 'InventoryLevel',
      entityId: `${input.variantId}:${input.warehouseId}`,
      diff: {
        after: {
          reorderPoint: input.reorderPoint,
          reorderQuantity: input.reorderQuantity,
          leadTimeDays: input.leadTimeDays ?? null,
        },
      },
    });
  });
}

export async function transfer(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = TransferInventoryInput.parse(rawInput);
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new CommerceValidationError('Transfer source and destination must differ');
  }

  // Two adjustments in one tx so the journal records both legs and the
  // total stock count is invariant.
  await withTenant(ctx, async (tx) => {
    await ensureWarehouseActive(tx, input.fromWarehouseId);
    await ensureWarehouseActive(tx, input.toWarehouseId);
    await ensureVariantExists(tx, input.variantId);

    const source = await tx.inventoryLevel.findUnique({
      where: {
        variantId_warehouseId: {
          variantId: input.variantId,
          warehouseId: input.fromWarehouseId,
        },
      },
    });
    if (!source || source.onHand - source.allocated < input.quantity) {
      throw new CommerceOutOfStockError(
        input.variantId,
        input.quantity,
        Math.max(0, (source?.onHand ?? 0) - (source?.allocated ?? 0))
      );
    }

    await tx.inventoryLevel.update({
      where: {
        variantId_warehouseId: {
          variantId: input.variantId,
          warehouseId: input.fromWarehouseId,
        },
      },
      data: { onHand: source.onHand - input.quantity, asOf: new Date() },
    });

    await tx.inventoryLevel.upsert({
      where: {
        variantId_warehouseId: {
          variantId: input.variantId,
          warehouseId: input.toWarehouseId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        variantId: input.variantId,
        warehouseId: input.toWarehouseId,
        onHand: input.quantity,
        allocated: 0,
      },
      update: { onHand: { increment: input.quantity }, asOf: new Date() },
    });

    const noteBase = input.note ?? '';
    await tx.inventoryAdjustment.createMany({
      data: [
        {
          tenantId: ctx.tenantId,
          variantId: input.variantId,
          warehouseId: input.fromWarehouseId,
          delta: -input.quantity,
          reason: 'transfer_out',
          referenceType: 'Warehouse',
          referenceId: input.toWarehouseId,
          actorUserId: ctx.userId ?? null,
          note: noteBase,
        },
        {
          tenantId: ctx.tenantId,
          variantId: input.variantId,
          warehouseId: input.toWarehouseId,
          delta: input.quantity,
          reason: 'transfer_in',
          referenceType: 'Warehouse',
          referenceId: input.fromWarehouseId,
          actorUserId: ctx.userId ?? null,
          note: noteBase,
        },
      ],
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.inventory.transferred',
      entityType: 'InventoryLevel',
      entityId: input.variantId,
      diff: {
        after: {
          from: input.fromWarehouseId,
          to: input.toWarehouseId,
          quantity: input.quantity,
        },
      },
    });

    await syncProductInStock(tx, input.variantId);
  });
}

// ─── Reservations (cart soft / order hard) ────────────────────────────

export interface ReservationResult {
  reservationId: string;
  warehouseId: string;
  expiresAt: string | null;
}

/**
 * Reserve stock for a cart line, order line, or subscription occurrence.
 * Picks a warehouse if not specified (the first active one with enough
 * available stock). Throws CommerceOutOfStockError when stock is short
 * and the variant's inventoryPolicy is `deny`. For `continue` /
 * `preorder` policies, succeeds even when stock is short (allocated may
 * temporarily exceed onHand — surfaces as a negative `available` in the
 * dashboard).
 */
export async function reserve(ctx: ServiceContext, rawInput: unknown): Promise<ReservationResult> {
  const input = ReserveInventoryInput.parse(rawInput);

  return withTenant(ctx, async (tx) => {
    const variant = await tx.productVariant.findFirst({
      where: { id: input.variantId, deletedAt: null },
      select: { id: true, inventoryPolicy: true },
    });
    if (!variant) throw new CommerceNotFoundError('Variant', input.variantId);

    const warehouseId = input.warehouseId ?? (await pickWarehouseFor(tx, input));

    const level = await tx.inventoryLevel.upsert({
      where: {
        variantId_warehouseId: {
          variantId: input.variantId,
          warehouseId,
        },
      },
      create: {
        tenantId: ctx.tenantId,
        variantId: input.variantId,
        warehouseId,
        onHand: 0,
        allocated: 0,
      },
      update: {},
    });

    const available = level.onHand - level.allocated;
    if (available < input.quantity && variant.inventoryPolicy === 'deny') {
      throw new CommerceOutOfStockError(input.variantId, input.quantity, Math.max(0, available));
    }

    await tx.inventoryLevel.update({
      where: {
        variantId_warehouseId: {
          variantId: input.variantId,
          warehouseId,
        },
      },
      data: { allocated: { increment: input.quantity }, asOf: new Date() },
    });

    const ttlSeconds =
      input.holderType === 'cart' ? (input.ttlSeconds ?? CART_TTL_SECONDS_DEFAULT) : null;
    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;

    const reservation = await tx.inventoryReservation.create({
      data: {
        tenantId: ctx.tenantId,
        variantId: input.variantId,
        warehouseId,
        quantity: input.quantity,
        holderType: input.holderType,
        holderId: input.holderId,
        expiresAt,
        status: 'active',
      },
    });

    await syncProductInStock(tx, input.variantId);

    return {
      reservationId: reservation.id,
      warehouseId,
      expiresAt: expiresAt?.toISOString() ?? null,
    };
  });
}

/** Release an active reservation. Returns the freed quantity to allocated. */
export async function release(ctx: ServiceContext, reservationId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const reservation = await tx.inventoryReservation.findFirst({
      where: { id: reservationId },
    });
    if (!reservation) throw new CommerceNotFoundError('InventoryReservation', reservationId);
    if (reservation.status !== 'active') return; // idempotent

    await tx.inventoryReservation.update({
      where: { id: reservationId },
      data: { status: 'released', releasedAt: new Date() },
    });
    await tx.inventoryLevel.update({
      where: {
        variantId_warehouseId: {
          variantId: reservation.variantId,
          warehouseId: reservation.warehouseId,
        },
      },
      data: { allocated: { decrement: reservation.quantity }, asOf: new Date() },
    });

    await syncProductInStock(tx, reservation.variantId);
  });
}

/**
 * Commit an active reservation — the goods have left the building. Drops
 * both `allocated` and `onHand` and writes a sale adjustment row so the
 * journal reflects "stock left this warehouse for {orderId}".
 */
export async function commit(ctx: ServiceContext, reservationId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const reservation = await tx.inventoryReservation.findFirst({
      where: { id: reservationId },
    });
    if (!reservation) throw new CommerceNotFoundError('InventoryReservation', reservationId);
    if (reservation.status !== 'active') return;

    await tx.inventoryReservation.update({
      where: { id: reservationId },
      data: { status: 'committed', releasedAt: new Date() },
    });
    await tx.inventoryLevel.update({
      where: {
        variantId_warehouseId: {
          variantId: reservation.variantId,
          warehouseId: reservation.warehouseId,
        },
      },
      data: {
        allocated: { decrement: reservation.quantity },
        onHand: { decrement: reservation.quantity },
        asOf: new Date(),
      },
    });
    await tx.inventoryAdjustment.create({
      data: {
        tenantId: ctx.tenantId,
        variantId: reservation.variantId,
        warehouseId: reservation.warehouseId,
        delta: -reservation.quantity,
        reason: 'sale',
        referenceType: reservation.holderType === 'order' ? 'Order' : reservation.holderType,
        referenceId: reservation.holderId,
        actorUserId: ctx.userId ?? null,
      },
    });

    await syncProductInStock(tx, reservation.variantId);
  });
}

/**
 * Release expired cart reservations. Called by the inventory-reaper
 * worker on a schedule. Returns the count released so the worker can log.
 */
export async function expireDueReservations(ctx: ServiceContext): Promise<{ released: number }> {
  let released = 0;
  await withTenant(ctx, async (tx) => {
    const due = await tx.inventoryReservation.findMany({
      where: {
        status: 'active',
        expiresAt: { lte: new Date() },
      },
      take: 500,
    });
    for (const r of due) {
      await tx.inventoryReservation.update({
        where: { id: r.id },
        data: { status: 'expired', releasedAt: new Date() },
      });
      await tx.inventoryLevel.update({
        where: {
          variantId_warehouseId: {
            variantId: r.variantId,
            warehouseId: r.warehouseId,
          },
        },
        data: { allocated: { decrement: r.quantity }, asOf: new Date() },
      });
      released += 1;
    }
  });
  return { released };
}

// ─── Lot batches + serial units ───────────────────────────────────────

export async function createLotBatch(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = CreateLotBatchInput.parse(rawInput);
  const result = await withTenant(ctx, async (tx) => {
    await ensureWarehouseActive(tx, input.warehouseId);
    await ensureVariantExists(tx, input.variantId);

    const existing = await tx.lotBatch.findFirst({
      where: { variantId: input.variantId, lotNumber: input.lotNumber },
      select: { id: true },
    });
    if (existing) {
      throw new CommerceConflictError(
        `Lot number "${input.lotNumber}" already exists for this variant`,
        'lotNumber'
      );
    }

    const batch = await tx.lotBatch.create({
      data: {
        tenantId: ctx.tenantId,
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        lotNumber: input.lotNumber,
        manufacturedAt: input.manufacturedAt ? new Date(input.manufacturedAt) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        quantity: input.quantity,
        hazmatClass: input.hazmatClass,
        supplierBatchRef: input.supplierBatchRef ?? null,
        certificateOfAnalysisMediaId: input.certificateOfAnalysisMediaId ?? null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.lot.created',
      entityType: 'LotBatch',
      entityId: batch.id,
      diff: {
        after: {
          lotNumber: batch.lotNumber,
          variantId: batch.variantId,
          warehouseId: batch.warehouseId,
          quantity: batch.quantity,
        },
      },
    });

    return batch;
  });
  return { id: result.id };
}

export interface LotBatchRow {
  id: string;
  variantId: string;
  warehouseId: string;
  warehouseCode: string;
  lotNumber: string;
  manufacturedAt: string | null;
  expiresAt: string | null;
  quantity: number;
  hazmatClass: string;
  recallStatus: string | null;
  supplierBatchRef: string | null;
}

export async function listLotsExpiringBefore(
  ctx: ServiceContext,
  beforeIso: string
): Promise<LotBatchRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.lotBatch.findMany({
      where: { expiresAt: { lte: new Date(beforeIso), not: null } },
      include: { warehouse: { select: { code: true } } },
      orderBy: { expiresAt: 'asc' },
      take: 500,
    });
    return rows.map(serializeLot);
  });
}

export async function listLotsForVariant(
  ctx: ServiceContext,
  variantId: string
): Promise<LotBatchRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.lotBatch.findMany({
      where: { variantId },
      include: { warehouse: { select: { code: true } } },
      orderBy: { expiresAt: 'asc' },
    });
    return rows.map(serializeLot);
  });
}

export async function createSerialUnit(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = CreateSerialUnitInput.parse(rawInput);
  const result = await withTenant(ctx, async (tx) => {
    await ensureWarehouseActive(tx, input.warehouseId);
    await ensureVariantExists(tx, input.variantId);

    const existing = await tx.serialUnit.findFirst({
      where: { variantId: input.variantId, serial: input.serial },
      select: { id: true },
    });
    if (existing) {
      throw new CommerceConflictError(
        `Serial number "${input.serial}" already exists for this variant`,
        'serial'
      );
    }

    if (input.lotBatchId) {
      const lot = await tx.lotBatch.findFirst({
        where: { id: input.lotBatchId, variantId: input.variantId },
        select: { id: true },
      });
      if (!lot) {
        throw new CommerceValidationError('Lot batch does not belong to this variant', [
          { field: 'lotBatchId', message: 'Mismatched variant' },
        ]);
      }
    }

    const unit = await tx.serialUnit.create({
      data: {
        tenantId: ctx.tenantId,
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        lotBatchId: input.lotBatchId ?? null,
        serial: input.serial,
        status: input.status,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.serial.created',
      entityType: 'SerialUnit',
      entityId: unit.id,
      diff: { after: { serial: unit.serial, status: unit.status } },
    });

    return unit;
  });
  return { id: result.id };
}

/**
 * Mark every unsold serial in the named lots as recalled, flip the lots
 * themselves to `recalled`, and return the count of affected sold units
 * so the dashboard can drive a notification list. Customer email goes
 * through @sparx/events → email-worker via a separate publisher.
 */
export async function initiateRecall(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ affectedSerialUnits: number; affectedLotBatches: number }> {
  const input = InitiateRecallInput.parse(rawInput);

  return withTenant(ctx, async (tx) => {
    const lots = await tx.lotBatch.findMany({
      where: { id: { in: input.lotBatchIds } },
      select: { id: true, lotNumber: true },
    });
    if (lots.length !== input.lotBatchIds.length) {
      throw new CommerceValidationError('One or more lot batches were not found in this tenant', [
        { field: 'lotBatchIds', message: `Found ${lots.length} of ${input.lotBatchIds.length}` },
      ]);
    }

    const sold = await tx.serialUnit.count({
      where: { lotBatchId: { in: input.lotBatchIds }, status: 'sold' },
    });

    await tx.lotBatch.updateMany({
      where: { id: { in: input.lotBatchIds } },
      data: {
        recallStatus: 'active',
        recallReason: input.reason,
        recalledAt: new Date(),
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.lot.recalled',
      entityType: 'LotBatch',
      entityId: input.lotBatchIds[0]!,
      diff: {
        after: {
          lotBatchIds: input.lotBatchIds,
          reason: input.reason,
          affectedSerialUnits: sold,
        },
      },
    });

    return { affectedSerialUnits: sold, affectedLotBatches: lots.length };
  });
}

// ─── Low-stock + reorder report ───────────────────────────────────────

export interface LowStockRow {
  variantId: string;
  productId: string;
  sku: string;
  title: string;
  warehouseId: string;
  warehouseCode: string;
  available: number;
  reorderPoint: number;
  reorderQuantity: number | null;
  leadTimeDays: number | null;
}

export async function listLowStock(
  ctx: ServiceContext,
  filter: { warehouseId?: string; take?: number } = {}
): Promise<LowStockRow[]> {
  return withTenant(ctx, async (tx) => {
    // Postgres can do the available calculation as `onHand - allocated`.
    // Use a raw query so we filter on the derived value cleanly.
    const take = Math.min(filter.take ?? 100, 500);
    const warehouseFilter = filter.warehouseId ?? null;
    const rows = await tx.$queryRaw<LowStockRow[]>`
      SELECT
        l.variant_id AS "variantId",
        l.warehouse_id AS "warehouseId",
        w.code AS "warehouseCode",
        l.on_hand - l.allocated AS "available",
        l.reorder_point AS "reorderPoint",
        l.reorder_quantity AS "reorderQuantity",
        l.lead_time_days AS "leadTimeDays",
        v.sku AS "sku",
        v.product_id AS "productId",
        p.title AS "title"
      FROM commerce_inventory_levels l
      JOIN commerce_warehouses w ON w.id = l.warehouse_id
      JOIN commerce_product_variants v ON v.id = l.variant_id
      JOIN commerce_products p ON p.id = v.product_id
      WHERE l.reorder_point IS NOT NULL
        AND l.on_hand - l.allocated <= l.reorder_point
        AND (${warehouseFilter}::uuid IS NULL OR l.warehouse_id = ${warehouseFilter}::uuid)
        AND w.deleted_at IS NULL
        AND v.deleted_at IS NULL
        AND p.deleted_at IS NULL
      ORDER BY (l.on_hand - l.allocated) ASC
      LIMIT ${take}
    `;
    return rows;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function ensureWarehouseActive(tx: TxClient, warehouseId: string): Promise<void> {
  const w = await tx.warehouse.findFirst({
    where: { id: warehouseId, deletedAt: null, isActive: true },
    select: { id: true },
  });
  if (!w) throw new CommerceNotFoundError('Warehouse', warehouseId);
}

async function ensureVariantExists(tx: TxClient, variantId: string): Promise<void> {
  const v = await tx.productVariant.findFirst({
    where: { id: variantId, deletedAt: null },
    select: { id: true },
  });
  if (!v) throw new CommerceNotFoundError('Variant', variantId);
}

async function pickWarehouseFor(
  tx: TxClient,
  input: { quantity: number; holderType: string }
): Promise<string> {
  // Phase 2 picker: first active warehouse with sufficient available
  // stock; falls back to the first active warehouse if no one has it
  // (the variant's inventoryPolicy decides whether that's an error).
  // Channel-aware routing comes in Phase 5 once Checkout passes channel.
  const channel =
    input.holderType === 'cart'
      ? 'storefront'
      : input.holderType === 'subscription'
        ? 'subscription'
        : 'admin';

  const candidates = await tx.warehouse.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, defaultForChannel: true },
  });

  const matchingChannel = candidates.filter((w) => {
    const list = Array.isArray(w.defaultForChannel) ? (w.defaultForChannel as string[]) : [];
    return list.includes(channel);
  });
  const ordered = matchingChannel.length > 0 ? matchingChannel : candidates;

  if (ordered.length === 0) {
    throw new CommerceValidationError(
      'No active warehouses exist — create one before reserving stock'
    );
  }

  return ordered[0]!.id;
}

/**
 * Recompute the product's denormalized `inStock` flag from current
 * available across all warehouses. Cheap, runs inside the same tx so
 * the storefront's PLP grid stays consistent with the inventory state.
 */
async function syncProductInStock(tx: TxClient, variantId: string): Promise<void> {
  const variant = await tx.productVariant.findFirst({
    where: { id: variantId },
    select: { productId: true },
  });
  if (!variant) return;

  const levels = await tx.inventoryLevel.findMany({
    where: {
      variant: { productId: variant.productId, deletedAt: null },
    },
    select: { onHand: true, allocated: true },
  });
  const total = levels.reduce((acc, l) => acc + (l.onHand - l.allocated), 0);
  await tx.product.update({
    where: { id: variant.productId },
    data: { inStock: total > 0 },
  });
}

function serializeWarehouse(w: Warehouse): WarehouseRow {
  return {
    id: w.id,
    name: w.name,
    code: w.code,
    type: w.type,
    line1: w.line1,
    line2: w.line2,
    city: w.city,
    region: w.region,
    postalCode: w.postalCode,
    country: w.country,
    phone: w.phone,
    latitude: w.latitude,
    longitude: w.longitude,
    defaultForChannel: Array.isArray(w.defaultForChannel) ? (w.defaultForChannel as string[]) : [],
    isActive: w.isActive,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

interface LevelWithWarehouse {
  variantId: string;
  warehouseId: string;
  warehouse: { code: string };
  onHand: number;
  allocated: number;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  leadTimeDays: number | null;
  unitCostCents: number | null;
  updatedAt: Date;
}

function serializeLevel(l: LevelWithWarehouse): InventoryLevelRow {
  return {
    variantId: l.variantId,
    warehouseId: l.warehouseId,
    warehouseCode: l.warehouse.code,
    onHand: l.onHand,
    allocated: l.allocated,
    available: l.onHand - l.allocated,
    reorderPoint: l.reorderPoint,
    reorderQuantity: l.reorderQuantity,
    leadTimeDays: l.leadTimeDays,
    unitCostCents: l.unitCostCents,
    updatedAt: l.updatedAt.toISOString(),
  };
}

interface LotWithWarehouse {
  id: string;
  variantId: string;
  warehouseId: string;
  warehouse: { code: string };
  lotNumber: string;
  manufacturedAt: Date | null;
  expiresAt: Date | null;
  quantity: number;
  hazmatClass: string;
  recallStatus: string | null;
  supplierBatchRef: string | null;
}

function serializeLot(l: LotWithWarehouse): LotBatchRow {
  return {
    id: l.id,
    variantId: l.variantId,
    warehouseId: l.warehouseId,
    warehouseCode: l.warehouse.code,
    lotNumber: l.lotNumber,
    manufacturedAt: l.manufacturedAt?.toISOString() ?? null,
    expiresAt: l.expiresAt?.toISOString() ?? null,
    quantity: l.quantity,
    hazmatClass: l.hazmatClass,
    recallStatus: l.recallStatus,
    supplierBatchRef: l.supplierBatchRef,
  };
}
