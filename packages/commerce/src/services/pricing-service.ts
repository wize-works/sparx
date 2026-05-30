// pricingService — the single deterministic price-resolution engine.
//
// Resolution order is locked:
//   1. Contract price (B2B) — highest priority
//   2. Price list entry (channel + segment + B2B-targeted)
//   3. Bulk price tier (quantity ramp)
//   4. Variant base price (fallback)
// Discounts, gift cards, and store credit stack on top via the discount
// + gift card services — never inline here.
//
// Every resolution produces a `trace` array so the storefront can answer
// "why is this the price?" without recomputing.
//
// All writes follow the locked pattern:
//   1. Validate input via @sparx/commerce-schemas
//   2. withTenant() transaction with RLS context
//   3. writeAuditLog inside the same transaction

import {
  BulkSetPriceListEntriesInput,
  CreateBulkPriceTierInput,
  CreateContractPriceInput,
  CreatePriceListInput,
  PriceListEntryInput,
  PriceResolutionRequest,
  type PricedLine,
  type PriceTraceStep,
  UpdatePriceListInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma, PriceList, TxClient } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';

// ─── Price lists ──────────────────────────────────────────────────────

export interface PriceListRow {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  channel: string | null;
  customerSegmentId: string | null;
  b2bAccountId: string | null;
  collectionId: string | null;
  priority: number;
  validFrom: string | null;
  validTo: string | null;
  status: string;
  entryCount: number;
  updatedAt: string;
}

export async function listPriceLists(
  ctx: ServiceContext,
  filter: { status?: string; channel?: string; b2bAccountId?: string } = {}
): Promise<PriceListRow[]> {
  return withTenant(ctx, async (tx) => {
    const where: Prisma.PriceListWhereInput = {
      deletedAt: null,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.channel ? { channel: filter.channel } : {}),
      ...(filter.b2bAccountId ? { b2bAccountId: filter.b2bAccountId } : {}),
    };
    const rows = await tx.priceList.findMany({
      where,
      include: { _count: { select: { entries: true } } },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });
    return rows.map(serializePriceList);
  });
}

export async function getPriceList(ctx: ServiceContext, id: string): Promise<PriceListRow> {
  const row = await withTenant(ctx, (tx) =>
    tx.priceList.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { entries: true } } },
    })
  );
  if (!row) throw new CommerceNotFoundError('PriceList', id);
  return serializePriceList(row);
}

export async function createPriceList(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = CreatePriceListInput.parse(rawInput);
  if (input.customerSegmentId && input.b2bAccountId) {
    throw new CommerceValidationError(
      'Set at most one of customerSegmentId or b2bAccountId; not both'
    );
  }
  const result = await withTenant(ctx, async (tx) => {
    const created = await tx.priceList.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        description: input.description ?? null,
        currency: input.currency,
        channel: input.channel ?? null,
        customerSegmentId: input.customerSegmentId ?? null,
        b2bAccountId: input.b2bAccountId ?? null,
        priority: input.priority,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validTo: input.validTo ? new Date(input.validTo) : null,
        status: input.status,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.price_list.created',
      entityType: 'PriceList',
      entityId: created.id,
      diff: { after: { name: created.name, currency: created.currency, status: created.status } },
    });
    return created;
  });
  return { id: result.id };
}

export async function updatePriceList(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown
): Promise<void> {
  const input = UpdatePriceListInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const before = await tx.priceList.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new CommerceNotFoundError('PriceList', id);

    await tx.priceList.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.channel !== undefined ? { channel: input.channel } : {}),
        ...(input.customerSegmentId !== undefined
          ? { customerSegmentId: input.customerSegmentId }
          : {}),
        ...(input.b2bAccountId !== undefined ? { b2bAccountId: input.b2bAccountId } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.validFrom !== undefined
          ? { validFrom: input.validFrom ? new Date(input.validFrom) : null }
          : {}),
        ...(input.validTo !== undefined
          ? { validTo: input.validTo ? new Date(input.validTo) : null }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.price_list.updated',
      entityType: 'PriceList',
      entityId: id,
      diff: { before: { status: before.status }, after: { status: input.status ?? before.status } },
    });
  });
}

export async function archivePriceList(ctx: ServiceContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.priceList.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new CommerceNotFoundError('PriceList', id);
    await tx.priceList.update({
      where: { id },
      data: { status: 'archived', deletedAt: new Date() },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.price_list.archived',
      entityType: 'PriceList',
      entityId: id,
      diff: { before: { status: before.status } },
    });
  });
}

// ─── Price list entries ──────────────────────────────────────────────

export interface PriceListEntryRow {
  id: string;
  variantId: string;
  variantSku: string;
  productTitle: string;
  fixedPriceCents: number | null;
  percentOffList: number | null;
  minQuantity: number;
  maxQuantity: number | null;
}

export async function listEntries(
  ctx: ServiceContext,
  priceListId: string
): Promise<PriceListEntryRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.priceListEntry.findMany({
      where: { priceListId },
      include: {
        variant: {
          select: { sku: true, product: { select: { title: true } } },
        },
      },
      orderBy: [{ variant: { sku: 'asc' } }, { minQuantity: 'asc' }],
      take: 1000,
    });
    return rows.map((r) => ({
      id: r.id,
      variantId: r.variantId,
      variantSku: r.variant.sku,
      productTitle: r.variant.product.title,
      fixedPriceCents: r.fixedPriceCents,
      percentOffList: r.percentOffList,
      minQuantity: r.minQuantity,
      maxQuantity: r.maxQuantity,
    }));
  });
}

export async function setPriceListEntry(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = PriceListEntryInput.parse(rawInput);
  const result = await withTenant(ctx, async (tx) => {
    await ensurePriceListExists(tx, input.priceListId);

    // Upsert on the (priceListId, variantId, minQuantity) compound unique.
    const existing = await tx.priceListEntry.findFirst({
      where: {
        priceListId: input.priceListId,
        variantId: input.variantId,
        minQuantity: input.minQuantity,
      },
      select: { id: true },
    });

    if (existing) {
      const updated = await tx.priceListEntry.update({
        where: { id: existing.id },
        data: {
          fixedPriceCents: input.fixedPriceCents ?? null,
          percentOffList: input.percentOffList ?? null,
          maxQuantity: input.maxQuantity ?? null,
        },
      });
      return updated;
    }

    const created = await tx.priceListEntry.create({
      data: {
        tenantId: ctx.tenantId,
        priceListId: input.priceListId,
        variantId: input.variantId,
        fixedPriceCents: input.fixedPriceCents ?? null,
        percentOffList: input.percentOffList ?? null,
        minQuantity: input.minQuantity,
        maxQuantity: input.maxQuantity ?? null,
      },
    });
    return created;
  });
  return { id: result.id };
}

export async function bulkSetEntries(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ written: number }> {
  const input = BulkSetPriceListEntriesInput.parse(rawInput);
  for (const entry of input.entries) {
    if ((entry.fixedPriceCents == null) === (entry.percentOffList == null)) {
      throw new CommerceValidationError(
        'Each entry must set exactly one of fixedPriceCents or percentOffList'
      );
    }
  }

  let written = 0;
  await withTenant(ctx, async (tx) => {
    await ensurePriceListExists(tx, input.priceListId);
    for (const entry of input.entries) {
      const existing = await tx.priceListEntry.findFirst({
        where: {
          priceListId: input.priceListId,
          variantId: entry.variantId,
          minQuantity: entry.minQuantity,
        },
        select: { id: true },
      });
      if (existing) {
        await tx.priceListEntry.update({
          where: { id: existing.id },
          data: {
            fixedPriceCents: entry.fixedPriceCents ?? null,
            percentOffList: entry.percentOffList ?? null,
            maxQuantity: entry.maxQuantity ?? null,
          },
        });
      } else {
        await tx.priceListEntry.create({
          data: {
            tenantId: ctx.tenantId,
            priceListId: input.priceListId,
            variantId: entry.variantId,
            fixedPriceCents: entry.fixedPriceCents ?? null,
            percentOffList: entry.percentOffList ?? null,
            minQuantity: entry.minQuantity,
            maxQuantity: entry.maxQuantity ?? null,
          },
        });
      }
      written += 1;
    }
  });
  return { written };
}

export async function deletePriceListEntry(ctx: ServiceContext, entryId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.priceListEntry.findFirst({ where: { id: entryId } });
    if (!before) throw new CommerceNotFoundError('PriceListEntry', entryId);
    await tx.priceListEntry.delete({ where: { id: entryId } });
  });
}

// ─── Bulk price tiers ────────────────────────────────────────────────

export interface BulkPriceTierRow {
  id: string;
  variantId: string | null;
  priceListId: string | null;
  minQuantity: number;
  unitPriceCents: number;
}

export async function createBulkTier(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = CreateBulkPriceTierInput.parse(rawInput);
  const result = await withTenant(ctx, async (tx) => {
    if (input.variantId) await ensureVariantExists(tx, input.variantId);
    if (input.priceListId) await ensurePriceListExists(tx, input.priceListId);

    const created = await tx.bulkPriceTier.create({
      data: {
        tenantId: ctx.tenantId,
        variantId: input.variantId ?? null,
        priceListId: input.priceListId ?? null,
        minQuantity: input.minQuantity,
        unitPriceCents: input.unitPriceCents,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.bulk_tier.created',
      entityType: 'BulkPriceTier',
      entityId: created.id,
      diff: {
        after: {
          variantId: created.variantId,
          priceListId: created.priceListId,
          minQuantity: created.minQuantity,
          unitPriceCents: created.unitPriceCents,
        },
      },
    });
    return created;
  });
  return { id: result.id };
}

export async function listBulkTiers(
  ctx: ServiceContext,
  filter: { variantId?: string; priceListId?: string } = {}
): Promise<BulkPriceTierRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.bulkPriceTier.findMany({
      where: {
        ...(filter.variantId ? { variantId: filter.variantId } : {}),
        ...(filter.priceListId ? { priceListId: filter.priceListId } : {}),
      },
      orderBy: { minQuantity: 'asc' },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      variantId: r.variantId,
      priceListId: r.priceListId,
      minQuantity: r.minQuantity,
      unitPriceCents: r.unitPriceCents,
    }));
  });
}

export async function deleteBulkTier(ctx: ServiceContext, tierId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.bulkPriceTier.findFirst({ where: { id: tierId } });
    if (!before) throw new CommerceNotFoundError('BulkPriceTier', tierId);
    await tx.bulkPriceTier.delete({ where: { id: tierId } });
  });
}

// ─── Contract prices ─────────────────────────────────────────────────

export interface ContractPriceRow {
  id: string;
  b2bAccountId: string;
  variantId: string;
  variantSku: string;
  productTitle: string;
  priceCents: number;
  validFrom: string;
  validTo: string | null;
  notes: string | null;
}

export async function createContractPrice(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = CreateContractPriceInput.parse(rawInput);
  const result = await withTenant(ctx, async (tx) => {
    await ensureVariantExists(tx, input.variantId);

    const collision = await tx.contractPrice.findFirst({
      where: {
        b2bAccountId: input.b2bAccountId,
        variantId: input.variantId,
        validFrom: new Date(input.validFrom),
      },
      select: { id: true },
    });
    if (collision) {
      throw new CommerceConflictError(
        'Contract price for this account/variant/start already exists'
      );
    }

    const created = await tx.contractPrice.create({
      data: {
        tenantId: ctx.tenantId,
        b2bAccountId: input.b2bAccountId,
        variantId: input.variantId,
        priceCents: input.priceCents,
        validFrom: new Date(input.validFrom),
        validTo: input.validTo ? new Date(input.validTo) : null,
        signedAgreementMediaId: input.signedAgreementMediaId ?? null,
        notes: input.notes ?? null,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.contract_price.created',
      entityType: 'ContractPrice',
      entityId: created.id,
      diff: {
        after: {
          b2bAccountId: created.b2bAccountId,
          variantId: created.variantId,
          priceCents: created.priceCents,
        },
      },
    });
    return created;
  });
  return { id: result.id };
}

export async function listContractPricesForAccount(
  ctx: ServiceContext,
  b2bAccountId: string
): Promise<ContractPriceRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.contractPrice.findMany({
      where: { b2bAccountId },
      include: {
        variant: { select: { sku: true, product: { select: { title: true } } } },
      },
      orderBy: { validFrom: 'desc' },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      b2bAccountId: r.b2bAccountId,
      variantId: r.variantId,
      variantSku: r.variant.sku,
      productTitle: r.variant.product.title,
      priceCents: r.priceCents,
      validFrom: r.validFrom.toISOString(),
      validTo: r.validTo?.toISOString() ?? null,
      notes: r.notes,
    }));
  });
}

export async function deleteContractPrice(ctx: ServiceContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.contractPrice.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('ContractPrice', id);
    await tx.contractPrice.delete({ where: { id } });
  });
}

// ─── Price resolution ────────────────────────────────────────────────

/**
 * Resolve a single line. Walks the locked priority chain and returns a
 * fully-traced PricedLine. The cart pricing pipeline calls this for
 * every line; storefront PDP uses it for "your price" display when the
 * shopper is a known B2B account.
 */
export async function resolve(ctx: ServiceContext, rawInput: unknown): Promise<PricedLine> {
  const input = PriceResolutionRequest.parse(rawInput);
  const asOf = input.asOf ? new Date(input.asOf) : new Date();

  return withTenant(ctx, async (tx) => {
    const variant = await tx.productVariant.findFirst({
      where: { id: input.variantId, deletedAt: null },
      select: { id: true, priceCents: true, currency: true },
    });
    if (!variant) throw new CommerceNotFoundError('Variant', input.variantId);
    if (variant.currency !== input.currency) {
      throw new CommerceValidationError(
        `Currency mismatch: variant is ${variant.currency}, request is ${input.currency}`
      );
    }

    const trace: PriceTraceStep[] = [];
    let unitPriceCents = variant.priceCents;
    trace.push({
      source: 'variant_base',
      sourceId: variant.id,
      deltaCents: variant.priceCents,
      resultingUnitPriceCents: unitPriceCents,
    });

    // 1. Contract price (B2B-only, highest priority)
    if (input.b2bAccountId) {
      const contract = await tx.contractPrice.findFirst({
        where: {
          b2bAccountId: input.b2bAccountId,
          variantId: input.variantId,
          validFrom: { lte: asOf },
          OR: [{ validTo: null }, { validTo: { gte: asOf } }],
        },
        orderBy: { validFrom: 'desc' },
      });
      if (contract) {
        const delta = contract.priceCents - unitPriceCents;
        unitPriceCents = contract.priceCents;
        trace.push({
          source: 'contract_price',
          sourceId: contract.id,
          deltaCents: delta,
          resultingUnitPriceCents: unitPriceCents,
          note: 'B2B contract price',
        });
        return finishLine(input, unitPriceCents, trace);
      }
    }

    // 2. Price list — highest-priority eligible list that has an entry
    // for this variant + quantity tier.
    const priceList = await pickEligiblePriceList(tx, {
      channel: input.channel,
      currency: input.currency,
      customerSegmentIds: input.customerSegmentIds,
      b2bAccountId: input.b2bAccountId,
      asOf,
    });
    if (priceList) {
      const entry = await tx.priceListEntry.findFirst({
        where: {
          priceListId: priceList.id,
          variantId: input.variantId,
          minQuantity: { lte: input.quantity },
          OR: [{ maxQuantity: null }, { maxQuantity: { gte: input.quantity } }],
        },
        orderBy: { minQuantity: 'desc' },
      });
      if (entry) {
        const proposed =
          entry.fixedPriceCents ??
          Math.round(unitPriceCents * (1 - (entry.percentOffList ?? 0) / 100));
        const delta = proposed - unitPriceCents;
        unitPriceCents = proposed;
        trace.push({
          source: 'price_list',
          sourceId: entry.id,
          deltaCents: delta,
          resultingUnitPriceCents: unitPriceCents,
          note: priceList.name,
        });
      }
    }

    // 3. Bulk tier — variant-scoped overrides list-scoped. Only applies
    // when it beats the current price (a list might already be lower).
    const variantTier = await tx.bulkPriceTier.findFirst({
      where: { variantId: input.variantId, minQuantity: { lte: input.quantity } },
      orderBy: { minQuantity: 'desc' },
    });
    const listTier = priceList
      ? await tx.bulkPriceTier.findFirst({
          where: { priceListId: priceList.id, minQuantity: { lte: input.quantity } },
          orderBy: { minQuantity: 'desc' },
        })
      : null;
    const bulkTier = variantTier ?? listTier;
    if (bulkTier && bulkTier.unitPriceCents < unitPriceCents) {
      const delta = bulkTier.unitPriceCents - unitPriceCents;
      unitPriceCents = bulkTier.unitPriceCents;
      trace.push({
        source: 'bulk_tier',
        sourceId: bulkTier.id,
        deltaCents: delta,
        resultingUnitPriceCents: unitPriceCents,
        note: `${bulkTier.minQuantity}+ at unit price`,
      });
    }

    return finishLine(input, unitPriceCents, trace);
  });
}

function finishLine(
  input: PriceResolutionRequest,
  unitPriceCents: number,
  trace: PriceTraceStep[]
): PricedLine {
  return {
    variantId: input.variantId,
    quantity: input.quantity,
    currency: input.currency,
    unitPriceCents,
    subtotalCents: unitPriceCents * input.quantity,
    trace,
  };
}

/**
 * Convenience for the cart pipeline — resolve every line in one
 * round-trip per line. Sequential rather than parallel because the
 * typical cart is small (<20 lines) and each call already issues 2-4
 * indexed queries; running them concurrently saturates the Postgres
 * pool faster than it speeds up the response.
 */
export async function resolveCart(
  ctx: ServiceContext,
  input: {
    channel: 'storefront' | 'b2b_portal' | 'admin' | 'subscription';
    currency: string;
    customerId?: string;
    b2bAccountId?: string;
    customerSegmentIds?: string[];
    lines: { variantId: string; quantity: number }[];
  }
): Promise<PricedLine[]> {
  const out: PricedLine[] = [];
  for (const line of input.lines) {
    out.push(
      await resolve(ctx, {
        ...line,
        channel: input.channel,
        currency: input.currency,
        customerId: input.customerId,
        b2bAccountId: input.b2bAccountId,
        customerSegmentIds: input.customerSegmentIds ?? [],
      })
    );
  }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function pickEligiblePriceList(
  tx: TxClient,
  filter: {
    channel: string;
    currency: string;
    customerSegmentIds: string[];
    b2bAccountId?: string;
    asOf: Date;
  }
): Promise<PriceList | null> {
  return tx.priceList.findFirst({
    where: {
      status: 'active',
      currency: filter.currency,
      deletedAt: null,
      AND: [
        { OR: [{ channel: null }, { channel: filter.channel }] },
        { OR: [{ validFrom: null }, { validFrom: { lte: filter.asOf } }] },
        { OR: [{ validTo: null }, { validTo: { gte: filter.asOf } }] },
        {
          OR: [
            ...(filter.b2bAccountId ? [{ b2bAccountId: filter.b2bAccountId }] : []),
            ...(filter.customerSegmentIds.length > 0
              ? [{ customerSegmentId: { in: filter.customerSegmentIds } }]
              : []),
            { customerSegmentId: null, b2bAccountId: null },
          ],
        },
      ],
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
  });
}

async function ensurePriceListExists(tx: TxClient, id: string): Promise<void> {
  const row = await tx.priceList.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!row) throw new CommerceNotFoundError('PriceList', id);
}

async function ensureVariantExists(tx: TxClient, id: string): Promise<void> {
  const row = await tx.productVariant.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!row) throw new CommerceNotFoundError('Variant', id);
}

function serializePriceList(row: PriceList & { _count: { entries: number } }): PriceListRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    currency: row.currency,
    channel: row.channel,
    customerSegmentId: row.customerSegmentId,
    b2bAccountId: row.b2bAccountId,
    collectionId: row.collectionId,
    priority: row.priority,
    validFrom: row.validFrom?.toISOString() ?? null,
    validTo: row.validTo?.toISOString() ?? null,
    status: row.status,
    entryCount: row._count.entries,
    updatedAt: row.updatedAt.toISOString(),
  };
}
