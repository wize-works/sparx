// fitmentService — vehicle reference data + per-product applicability.
// Drives the auto-parts case (Gillett Diesel) end-to-end: storefront
// filter, B2B catalog visibility, MCP search_fitment tool.
//
// The reference tables (VehicleMake/Model/Engine) are dual-scoped: rows
// with tenant_id IS NULL are platform-seeded baselines visible to every
// tenant; rows with tenant_id = current tenant are per-merchant
// additions. The RLS policy on these tables (migration 20260603000000)
// already encodes the `tenant_id IS NULL OR tenant_id = current` read
// rule with the stricter `tenant_id = current` write check.
//
// ProductFitment rows are pure tenant-scoped — a Gillett-specific
// applicability rule never leaks to another tenant even if the rule
// references a globally-seeded Make.

import {
  BulkAssignFitmentInput,
  CreateVehicleEngineInput,
  CreateVehicleMakeInput,
  CreateVehicleModelInput,
  FitmentLookupQuery,
  ProductFitmentInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma, ProductFitment, VehicleEngine, VehicleMake, VehicleModel } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceConflictError, CommerceNotFoundError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

// ─── Public shapes ────────────────────────────────────────────────────

export interface VehicleMakeRow {
  id: string;
  name: string;
  slug: string;
  countryOfOrigin: string | null;
  logoMediaId: string | null;
  isGlobal: boolean;
  modelCount: number;
}

export interface VehicleModelRow {
  id: string;
  makeId: string;
  name: string;
  slug: string;
  bodyStyle: string | null;
  isGlobal: boolean;
  engineCount: number;
}

export interface VehicleEngineRow {
  id: string;
  modelId: string;
  name: string;
  displacementCc: number | null;
  cylinders: number | null;
  fuelType: string | null;
  aspiration: string | null;
  isGlobal: boolean;
}

export interface ProductFitmentRow {
  id: string;
  productId: string;
  makeId: string;
  makeName: string;
  modelId: string | null;
  modelName: string | null;
  engineId: string | null;
  engineName: string | null;
  yearMin: number | null;
  yearMax: number | null;
  notes: string | null;
}

// ─── Reference reads ──────────────────────────────────────────────────

export async function listMakes(ctx: ServiceContext): Promise<VehicleMakeRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.vehicleMake.findMany({
      orderBy: [{ name: 'asc' }],
      include: { _count: { select: { models: true } } },
    });
    return rows.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      countryOfOrigin: m.countryOfOrigin,
      logoMediaId: m.logoMediaId,
      isGlobal: m.tenantId === null,
      modelCount: m._count.models,
    }));
  });
}

export async function listModels(ctx: ServiceContext, makeId: string): Promise<VehicleModelRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.vehicleModel.findMany({
      where: { makeId },
      orderBy: [{ name: 'asc' }],
      include: { _count: { select: { engines: true } } },
    });
    return rows.map((m) => ({
      id: m.id,
      makeId: m.makeId,
      name: m.name,
      slug: m.slug,
      bodyStyle: m.bodyStyle,
      isGlobal: m.tenantId === null,
      engineCount: m._count.engines,
    }));
  });
}

export async function listEngines(
  ctx: ServiceContext,
  modelId: string
): Promise<VehicleEngineRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.vehicleEngine.findMany({
      where: { modelId },
      orderBy: [{ name: 'asc' }],
    });
    return rows.map(toEngineRow);
  });
}

// ─── Reference writes ─────────────────────────────────────────────────

export async function createMake(ctx: ServiceContext, rawInput: unknown): Promise<{ id: string }> {
  const input = CreateVehicleMakeInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const collision = await tx.vehicleMake.findFirst({
      where: { tenantId: ctx.tenantId, slug: input.slug },
      select: { id: true },
    });
    if (collision) {
      throw new CommerceConflictError(
        `Make "${input.slug}" already exists for this tenant`,
        'slug'
      );
    }

    const created = await tx.vehicleMake.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        slug: input.slug,
        countryOfOrigin: input.countryOfOrigin ?? null,
        logoMediaId: input.logoMediaId ?? null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.fitment.make_created',
      entityType: 'VehicleMake',
      entityId: created.id,
      diff: { after: { name: created.name, slug: created.slug } },
    });

    return created;
  });

  return { id: result.id };
}

export async function createModel(ctx: ServiceContext, rawInput: unknown): Promise<{ id: string }> {
  const input = CreateVehicleModelInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    // Make existence — accept platform-seeded (tenant_id NULL) or
    // tenant-owned. RLS reads already permit both, so a findFirst is
    // sufficient.
    const make = await tx.vehicleMake.findFirst({
      where: { id: input.makeId },
      select: { id: true },
    });
    if (!make) throw new CommerceNotFoundError('VehicleMake', input.makeId);

    const collision = await tx.vehicleModel.findFirst({
      where: { makeId: input.makeId, slug: input.slug },
      select: { id: true },
    });
    if (collision) {
      throw new CommerceConflictError(
        `Model "${input.slug}" already exists under this make`,
        'slug'
      );
    }

    const created = await tx.vehicleModel.create({
      data: {
        tenantId: ctx.tenantId,
        makeId: input.makeId,
        name: input.name,
        slug: input.slug,
        bodyStyle: input.bodyStyle ?? null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.fitment.model_created',
      entityType: 'VehicleModel',
      entityId: created.id,
      diff: { after: { name: created.name, slug: created.slug, makeId: created.makeId } },
    });

    return created;
  });

  return { id: result.id };
}

export async function createEngine(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = CreateVehicleEngineInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const model = await tx.vehicleModel.findFirst({
      where: { id: input.modelId },
      select: { id: true },
    });
    if (!model) throw new CommerceNotFoundError('VehicleModel', input.modelId);

    const created = await tx.vehicleEngine.create({
      data: {
        tenantId: ctx.tenantId,
        modelId: input.modelId,
        name: input.name,
        displacementCc: input.displacementCc ?? null,
        cylinders: input.cylinders ?? null,
        fuelType: input.fuelType ?? null,
        aspiration: input.aspiration ?? null,
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.fitment.engine_created',
      entityType: 'VehicleEngine',
      entityId: created.id,
      diff: { after: { name: created.name, modelId: created.modelId } },
    });

    return created;
  });

  return { id: result.id };
}

// ─── Per-product fitment ──────────────────────────────────────────────

export async function listForProduct(
  ctx: ServiceContext,
  productId: string
): Promise<ProductFitmentRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.productFitment.findMany({
      where: { productId },
      orderBy: [{ yearMin: 'asc' }, { id: 'asc' }],
      include: {
        make: { select: { name: true } },
        model: { select: { name: true } },
        engine: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      productId: r.productId,
      makeId: r.makeId,
      makeName: r.make.name,
      modelId: r.modelId,
      modelName: r.model?.name ?? null,
      engineId: r.engineId,
      engineName: r.engine?.name ?? null,
      yearMin: r.yearMin,
      yearMax: r.yearMax,
      notes: r.notes,
    }));
  });
}

/**
 * Replace all fitment rows for a product. Atomic: existing rows wiped
 * inside the same transaction the new rows insert in, so the catalog
 * never observes a half-written state.
 */
export async function setForProduct(
  ctx: ServiceContext,
  productId: string,
  fitments: Omit<ProductFitmentInput, 'productId'>[]
): Promise<void> {
  // Validate each entry against the schema (omitting productId — set
  // server-side from the path parameter).
  const validated = fitments.map((f) => ProductFitmentInput.omit({ productId: true }).parse(f));

  await withTenant(ctx, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new CommerceNotFoundError('Product', productId);

    await tx.productFitment.deleteMany({ where: { productId } });
    if (validated.length > 0) {
      await tx.productFitment.createMany({
        data: validated.map((f) => ({
          tenantId: ctx.tenantId,
          productId,
          makeId: f.makeId,
          modelId: f.modelId ?? null,
          engineId: f.engineId ?? null,
          yearMin: f.yearMin ?? null,
          yearMax: f.yearMax ?? null,
          notes: f.notes ?? null,
        })),
      });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.fitment.product_set',
      entityType: 'Product',
      entityId: productId,
      diff: { after: { fitmentCount: validated.length } },
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { productId, change: 'fitment' },
  });
}

/**
 * Bulk-apply the same fitment set to a batch of products. Used when
 * importing an AAIA catalog or a supplier feed — the importer slices
 * the feed into "this set of products fits these vehicles" buckets and
 * fans out one call per bucket.
 *
 * Per-product audit rows are written so undo / forensics has the same
 * granularity as the single-product `setForProduct` path.
 */
export async function bulkAssign(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ rowsAffected: number }> {
  const input = BulkAssignFitmentInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const existingProductCount = await tx.product.count({
      where: { id: { in: input.productIds }, deletedAt: null },
    });
    if (existingProductCount !== input.productIds.length) {
      throw new CommerceNotFoundError(
        'Product',
        `${input.productIds.length - existingProductCount} of ${input.productIds.length}`
      );
    }

    let rowsAffected = 0;
    for (const productId of input.productIds) {
      await tx.productFitment.deleteMany({ where: { productId } });
      if (input.fitments.length > 0) {
        const inserted = await tx.productFitment.createMany({
          data: input.fitments.map((f) => ({
            tenantId: ctx.tenantId,
            productId,
            makeId: f.makeId,
            modelId: f.modelId ?? null,
            engineId: f.engineId ?? null,
            yearMin: f.yearMin ?? null,
            yearMax: f.yearMax ?? null,
            notes: f.notes ?? null,
          })),
        });
        rowsAffected += inserted.count;
      }
      await writeAuditLog({
        tx,
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        actorType: ctx.userId ? 'user' : 'system',
        action: 'commerce.fitment.bulk_assigned',
        entityType: 'Product',
        entityId: productId,
        diff: { after: { fitmentCount: input.fitments.length } },
      });
    }

    return { rowsAffected };
  });

  // One event per touched product so consumers (storefront search index,
  // B2B catalog visibility) can re-project per-row instead of guessing
  // the affected set.
  await Promise.all(
    input.productIds.map((productId) =>
      publishCommerceEvent({
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        topic: 'product.updated',
        data: { productId, change: 'fitment' },
      })
    )
  );

  return result;
}

export async function deleteFitment(ctx: ServiceContext, fitmentId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.productFitment.findFirst({ where: { id: fitmentId } });
    if (!before) throw new CommerceNotFoundError('ProductFitment', fitmentId);

    await tx.productFitment.delete({ where: { id: fitmentId } });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.fitment.row_deleted',
      entityType: 'ProductFitment',
      entityId: fitmentId,
      diff: { before: serializeFitment(before) },
    });

    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'product.updated',
      data: { productId: before.productId, change: 'fitment' },
    });
  });
}

// ─── Catalog filter ───────────────────────────────────────────────────

export interface FitmentLookupResult {
  productIds: string[];
  total: number;
}

/**
 * Resolve "what fits this vehicle?" — returns the set of product IDs
 * that have at least one fitment row matching the query. Make is
 * required; model/engine/year narrow further. Year matches when the
 * fitment's [yearMin, yearMax] range (or open ends) contains the
 * queried year.
 *
 * For Phase 1.4, runs as a single SQL JOIN. Storefront search filtering
 * uses Typesense once the indexer lands (Phase 1.5) — this lookup
 * remains the source of truth for "show me everything" queries the
 * dashboard runs without the search index.
 */
export async function lookup(ctx: ServiceContext, rawQuery: unknown): Promise<FitmentLookupResult> {
  const query = FitmentLookupQuery.parse(rawQuery);

  return withTenant(ctx, async (tx) => {
    const where: Prisma.ProductFitmentWhereInput = {
      ...(query.makeId ? { makeId: query.makeId } : {}),
      ...(query.modelId ? { OR: [{ modelId: query.modelId }, { modelId: null }] } : {}),
      ...(query.engineId ? { OR: [{ engineId: query.engineId }, { engineId: null }] } : {}),
      ...(query.year !== undefined
        ? {
            AND: [
              { OR: [{ yearMin: { lte: query.year } }, { yearMin: null }] },
              { OR: [{ yearMax: { gte: query.year } }, { yearMax: null }] },
            ],
          }
        : {}),
      product: { deletedAt: null, status: 'active' },
    };

    const rows = await tx.productFitment.findMany({
      where,
      select: { productId: true },
      distinct: ['productId'],
      take: 5000,
    });

    return { productIds: rows.map((r) => r.productId), total: rows.length };
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────

function toEngineRow(e: VehicleEngine): VehicleEngineRow {
  return {
    id: e.id,
    modelId: e.modelId,
    name: e.name,
    displacementCc: e.displacementCc,
    cylinders: e.cylinders,
    fuelType: e.fuelType,
    aspiration: e.aspiration,
    isGlobal: e.tenantId === null,
  };
}

function serializeFitment(f: ProductFitment): Record<string, unknown> {
  return {
    id: f.id,
    productId: f.productId,
    makeId: f.makeId,
    modelId: f.modelId,
    engineId: f.engineId,
    yearMin: f.yearMin,
    yearMax: f.yearMax,
  };
}

// Suppress unused-import warnings for types only used by callers; keeping
// these imports stable lets TS surface narrowed Prisma payload types
// without consumers needing parallel imports.
export type { VehicleMake, VehicleModel };
