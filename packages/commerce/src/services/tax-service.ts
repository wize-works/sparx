// taxService — merchant nexus configuration, exemption certificates,
// and the calculation pipeline. The TaxProvider plugin (Stripe Tax /
// TaxJar / Avalara) produces breakdowns at checkout time when installed;
// the manual fallback rates here power the calculator otherwise so a
// merchant can transact before plugging in a provider.

import {
  CreateTaxExemptionInput,
  CreateTaxRateInput,
  CreateTaxZoneInput,
  type TaxBreakdown,
  TaxCalculationRequest,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { TaxExemption, TaxRate, TaxZone, TxClient } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';

// ─── Row shapes ──────────────────────────────────────────────────────

export interface TaxZoneRow {
  id: string;
  country: string;
  region: string | null;
  nexusType: string;
  registrationNumber: string | null;
  registeredAt: string | null;
  isActive: boolean;
  rateCount: number;
}

export interface TaxRateRow {
  id: string;
  zoneId: string;
  name: string;
  rateBasisPoints: number;
  appliesToShipping: boolean;
  productTaxClass: string | null;
}

export interface TaxExemptionRow {
  id: string;
  customerId: string | null;
  b2bAccountId: string | null;
  jurisdiction: string;
  reason: string;
  certificateNumber: string;
  certificateMediaId: string | null;
  validFrom: string;
  validTo: string | null;
}

// ─── Zones ───────────────────────────────────────────────────────────

export async function listZones(ctx: ServiceContext): Promise<TaxZoneRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.taxZone.findMany({
      include: { _count: { select: { rates: true } } },
      orderBy: [{ country: 'asc' }, { region: 'asc' }],
      take: 500,
    });
    return rows.map(serializeZone);
  });
}

export async function getZone(ctx: ServiceContext, id: string): Promise<TaxZoneRow> {
  const row = await withTenant(ctx, (tx) =>
    tx.taxZone.findFirst({
      where: { id },
      include: { _count: { select: { rates: true } } },
    })
  );
  if (!row) throw new CommerceNotFoundError('TaxZone', id);
  return serializeZone(row);
}

export async function createZone(ctx: ServiceContext, rawInput: unknown): Promise<{ id: string }> {
  const input = CreateTaxZoneInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const created = await tx.taxZone.create({
      data: {
        tenantId: ctx.tenantId,
        country: input.country,
        region: input.region ?? null,
        nexusType: input.nexusType,
        registrationNumber: input.registrationNumber ?? null,
        registeredAt: input.registeredAt ? new Date(input.registeredAt) : null,
        isActive: input.isActive,
      },
      select: { id: true },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.tax_zone.created',
      entityType: 'TaxZone',
      entityId: created.id,
      diff: { after: { country: input.country, region: input.region } },
    });
    return created;
  });
}

export async function updateZone(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown
): Promise<void> {
  const input = CreateTaxZoneInput.partial().parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const before = await tx.taxZone.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('TaxZone', id);
    await tx.taxZone.update({
      where: { id },
      data: {
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.region !== undefined ? { region: input.region ?? null } : {}),
        ...(input.nexusType !== undefined ? { nexusType: input.nexusType } : {}),
        ...(input.registrationNumber !== undefined
          ? { registrationNumber: input.registrationNumber ?? null }
          : {}),
        ...(input.registeredAt !== undefined
          ? { registeredAt: input.registeredAt ? new Date(input.registeredAt) : null }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.tax_zone.updated',
      entityType: 'TaxZone',
      entityId: id,
      diff: null,
    });
  });
}

export async function deleteZone(ctx: ServiceContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.taxZone.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('TaxZone', id);
    await tx.taxZone.delete({ where: { id } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.tax_zone.deleted',
      entityType: 'TaxZone',
      entityId: id,
      diff: null,
    });
  });
}

// ─── Manual fallback rates ───────────────────────────────────────────

export async function createRate(ctx: ServiceContext, rawInput: unknown): Promise<{ id: string }> {
  const input = CreateTaxRateInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    await assertZoneExists(tx, input.zoneId);
    const created = await tx.taxRate.create({
      data: {
        tenantId: ctx.tenantId,
        zoneId: input.zoneId,
        name: input.name,
        rateBasisPoints: input.rateBasisPoints,
        appliesToShipping: input.appliesToShipping,
        productTaxClass: input.productTaxClass ?? null,
      },
      select: { id: true },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.tax_rate.created',
      entityType: 'TaxRate',
      entityId: created.id,
      diff: {
        after: { name: input.name, rateBasisPoints: input.rateBasisPoints },
      },
    });
    return created;
  });
}

export async function listRatesForZone(ctx: ServiceContext, zoneId: string): Promise<TaxRateRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.taxRate.findMany({
      where: { zoneId },
      orderBy: { name: 'asc' },
      take: 200,
    });
    return rows.map(serializeRate);
  });
}

export async function deleteRate(ctx: ServiceContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.taxRate.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('TaxRate', id);
    await tx.taxRate.delete({ where: { id } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.tax_rate.deleted',
      entityType: 'TaxRate',
      entityId: id,
      diff: null,
    });
  });
}

// ─── Exemptions ──────────────────────────────────────────────────────

export async function createExemption(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = CreateTaxExemptionInput.parse(rawInput);
  if (!input.customerId && !input.b2bAccountId) {
    throw new CommerceValidationError('Either customerId or b2bAccountId is required');
  }
  return withTenant(ctx, async (tx) => {
    const created = await tx.taxExemption.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: input.customerId ?? null,
        b2bAccountId: input.b2bAccountId ?? null,
        jurisdiction: input.jurisdiction,
        reason: input.reason,
        certificateNumber: input.certificateNumber,
        certificateMediaId: input.certificateMediaId ?? null,
        validFrom: new Date(input.validFrom),
        validTo: input.validTo ? new Date(input.validTo) : null,
      },
      select: { id: true },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.tax_exemption.created',
      entityType: 'TaxExemption',
      entityId: created.id,
      diff: { after: { jurisdiction: input.jurisdiction, reason: input.reason } },
    });
    return created;
  });
}

export async function listExemptionsForCustomer(
  ctx: ServiceContext,
  customerId: string
): Promise<TaxExemptionRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.taxExemption.findMany({
      where: { customerId },
      orderBy: { validFrom: 'desc' },
      take: 100,
    });
    return rows.map(serializeExemption);
  });
}

export async function listExemptionsForB2BAccount(
  ctx: ServiceContext,
  b2bAccountId: string
): Promise<TaxExemptionRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.taxExemption.findMany({
      where: { b2bAccountId },
      orderBy: { validFrom: 'desc' },
      take: 100,
    });
    return rows.map(serializeExemption);
  });
}

export async function deleteExemption(ctx: ServiceContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.taxExemption.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('TaxExemption', id);
    await tx.taxExemption.delete({ where: { id } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.tax_exemption.deleted',
      entityType: 'TaxExemption',
      entityId: id,
      diff: null,
    });
  });
}

// ─── Calculation ─────────────────────────────────────────────────────
//
// When a TaxProvider plugin is installed it always wins. Until then,
// the manual fallback rates here drive the calculation so storefront +
// B2B checkouts can quote tax from the first onboarding session.

export async function calculate(ctx: ServiceContext, rawRequest: unknown): Promise<TaxBreakdown> {
  const request = TaxCalculationRequest.parse(rawRequest);

  // Find the most-specific matching zone (region > country) that's
  // active for this tenant + ship-to country.
  const zones = await withTenant(ctx, async (tx) => {
    return tx.taxZone.findMany({
      where: {
        isActive: true,
        country: request.shipTo.country,
      },
      include: { rates: true },
    });
  });

  const zone =
    zones.find((z) => z.region && z.region === request.shipTo.region) ??
    zones.find((z) => !z.region) ??
    null;

  // If we have no zone, the merchant has no nexus configured here —
  // return a zero breakdown so checkout can continue.
  if (!zone) {
    return emptyBreakdown(request);
  }

  const lines = request.lines.map((line, idx) => {
    const taxable = Math.max(0, line.unitPriceCents * line.quantity - line.discountAmountCents);
    const applicableRates = zone.rates.filter(
      (r) => !r.productTaxClass || r.productTaxClass === line.productTaxClass
    );
    const totalRate = applicableRates.reduce((sum, r) => sum + r.rateBasisPoints, 0);
    const taxCents = Math.round((taxable * totalRate) / 10_000);
    return {
      lineRef: idx,
      taxableAmountCents: taxable,
      taxAmountCents: taxCents,
      jurisdictions: applicableRates.map((r) => ({
        name: r.name,
        type: regionScope(zone.region) as 'state' | 'country',
        rateBasisPoints: r.rateBasisPoints,
        amountCents: Math.round((taxable * r.rateBasisPoints) / 10_000),
      })),
    };
  });

  const shippingRates = zone.rates.filter((r) => r.appliesToShipping);
  const shippingRateBp = shippingRates.reduce((s, r) => s + r.rateBasisPoints, 0);
  const shippingTaxCents = Math.round((request.shippingAmountCents * shippingRateBp) / 10_000);
  const totalTaxCents = lines.reduce((s, l) => s + l.taxAmountCents, 0) + shippingTaxCents;

  return {
    providerSlug: 'sparx-manual',
    breakdownRef: `manual:${ctx.tenantId}:${Date.now()}`,
    totalTaxCents,
    shippingTaxCents,
    lines,
    calculatedAt: new Date().toISOString(),
  };
}

/** Refund-side hook — reverses the provider transaction tied to the
 *  given breakdownRef. Manual breakdowns have nothing to reverse
 *  (no remote transaction to roll back), so the call is a no-op. */
export function reverse(
  _ctx: ServiceContext,
  input: { providerSlug: string; breakdownRef: string; orderId: string }
): Promise<void> {
  if (input.providerSlug === 'sparx-manual') return Promise.resolve();
  // Real provider reversal lands with the provider integration bridge.
  return Promise.reject(
    new CommerceValidationError(
      `No tax provider installed for slug "${input.providerSlug}"; cannot reverse breakdown.`
    )
  );
}

// ─── helpers ─────────────────────────────────────────────────────────

async function assertZoneExists(tx: TxClient, id: string): Promise<void> {
  const row = await tx.taxZone.findFirst({ where: { id }, select: { id: true } });
  if (!row) throw new CommerceNotFoundError('TaxZone', id);
}

function regionScope(region: string | null): string {
  return region ? 'state' : 'country';
}

function emptyBreakdown(request: TaxCalculationRequest): TaxBreakdown {
  return {
    providerSlug: 'sparx-manual',
    breakdownRef: `manual:no-nexus:${Date.now()}`,
    totalTaxCents: 0,
    shippingTaxCents: 0,
    lines: request.lines.map((line, idx) => ({
      lineRef: idx,
      taxableAmountCents: Math.max(
        0,
        line.unitPriceCents * line.quantity - line.discountAmountCents
      ),
      taxAmountCents: 0,
      jurisdictions: [],
    })),
    calculatedAt: new Date().toISOString(),
  };
}

function serializeZone(row: TaxZone & { _count: { rates: number } }): TaxZoneRow {
  return {
    id: row.id,
    country: row.country,
    region: row.region,
    nexusType: row.nexusType,
    registrationNumber: row.registrationNumber,
    registeredAt: row.registeredAt?.toISOString() ?? null,
    isActive: row.isActive,
    rateCount: row._count.rates,
  };
}

function serializeRate(row: TaxRate): TaxRateRow {
  return {
    id: row.id,
    zoneId: row.zoneId,
    name: row.name,
    rateBasisPoints: row.rateBasisPoints,
    appliesToShipping: row.appliesToShipping,
    productTaxClass: row.productTaxClass,
  };
}

function serializeExemption(row: TaxExemption): TaxExemptionRow {
  return {
    id: row.id,
    customerId: row.customerId,
    b2bAccountId: row.b2bAccountId,
    jurisdiction: row.jurisdiction,
    reason: row.reason,
    certificateNumber: row.certificateNumber,
    certificateMediaId: row.certificateMediaId,
    validFrom: row.validFrom.toISOString(),
    validTo: row.validTo?.toISOString() ?? null,
  };
}
