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
  UpdateTaxZoneInput,
} from '@wizeworks/commerce-schemas';
import { withTenant } from '@wizeworks/db';
import type { TaxExemption, TaxRate, TaxZone, TxClient } from '@wizeworks/db';

import { writeAuditLog } from '../audit';
import { CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { coveringExemption } from './tax-exemption';

// ─── Row shapes ──────────────────────────────────────────────────────

export interface TaxZoneRow {
  id: string;
  country: string;
  region: string | null;
  nexusType: string;
  registrationNumber: string | null;
  registeredAt: string | null;
  isActive: boolean;
  /** When a signed-in person switched collection on here, if one ever has.
   *  Paired with `isActive` by `zoneIsCollecting` — see the note on that
   *  function; a place without this charges nothing. */
  activatedAt: string | null;
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
  companyId: string | null;
  jurisdiction: string;
  reason: string;
  certificateNumber: string;
  certificateMediaId: string | null;
  validFrom: string;
  validTo: string | null;
}

// ─── A tax place is created switched OFF, always ─────────────────────
//
// A machine may set tax UP — the places, the rates, ready to go. It may not
// decide that a business is registered somewhere and start taking money from its
// customers on that basis. The `tax-us-sales` preset did exactly that from five
// industry starters, and a Denver studio spent months described as having staff
// in California, Texas and New York (issue 429). It went unnoticed only because
// nothing charged tax at all; the afternoon that was fixed, it became real money.
//
// THE TEST IS THE SHAPE OF THE REQUEST, NOT WHO SIGNED IT. The obvious guard —
// "does this caller have a user id?" — does not work, because an industry
// starter installs during onboarding under the new owner's own session. Her
// actor id is on the write either way, so it cannot tell "she chose to collect
// in California" from "she picked the clothing starter".
//
// What CAN tell them apart is that switching on becomes its own act: a place is
// always created off, and collection starts only on a later update whose whole
// content is "start collecting here". No starter, blueprint, import or template
// makes a call like that; a person clicking a switch makes exactly that call.
// It is also the honest order of work — add the place, put the rate in, look at
// it, then switch it on — and it removes a state that never made sense, a place
// switched on before it has a rate.
//
// Refused out loud rather than quietly downgraded to off: a caller asking to
// collect and silently not collecting is the same class of mistake facing the
// other way. `tax_zones_active_needs_a_person` in the database is the backstop
// for everything that never comes through here at all.

function assertNotCreatedCollecting(wantsToCollect: boolean): void {
  if (!wantsToCollect) return;
  throw new CommerceValidationError(
    'A tax place is always created switched off. Add it, set its rate, then switch it on.'
  );
}

// The update-side guard. Narrower than the one above and aimed at a different
// caller: a background job, a worker or a script has no signed-in person behind
// it, so it has no business starting a shop collecting tax.
function assertAPersonIsSwitchingItOn(ctx: ServiceContext): void {
  if (ctx.userId) return;
  throw new CommerceValidationError('Only a signed-in person can switch tax collection on.');
}

// ─── Zones ───────────────────────────────────────────────────────────

export async function listZones(
  ctx: ServiceContext,
  filter: { take?: number; skip?: number } = {}
): Promise<{ items: TaxZoneRow[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.taxZone.findMany({
        include: { _count: { select: { rates: true } } },
        orderBy: [{ country: 'asc' }, { region: 'asc' }],
        take: Math.min(filter.take ?? 50, 250),
        skip: filter.skip ?? 0,
      }),
      tx.taxZone.count(),
    ]);
    return { items: rows.map(serializeZone), total };
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
  assertNotCreatedCollecting(input.isActive);
  return withTenant(ctx, async (tx) => {
    const created = await tx.taxZone.create({
      data: {
        tenantId: ctx.tenantId,
        country: input.country,
        region: input.region ?? null,
        nexusType: input.nexusType,
        registrationNumber: input.registrationNumber ?? null,
        registeredAt: input.registeredAt ? new Date(input.registeredAt) : null,
        isActive: false,
        activatedAt: null,
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
      diff: { after: { country: input.country, region: input.region, isActive: false } },
    });
    return created;
  });
}

export async function updateZone(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown
): Promise<void> {
  const input = UpdateTaxZoneInput.parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const before = await tx.taxZone.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('TaxZone', id);

    // Starting to collect somewhere is the only change on this form that moves
    // money, so it is the only one that needs a person behind it and a record of
    // when. Switching OFF keeps the stamp — "this shop collected here from
    // March" stays true after it stops, and losing it would make an old place
    // indistinguishable from one nobody ever chose.
    const startingToCollect = input.isActive === true && !before.isActive;
    if (startingToCollect) assertAPersonIsSwitchingItOn(ctx);
    const stoppingCollection = input.isActive === false && before.isActive;

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
        ...(startingToCollect ? { activatedAt: new Date() } : {}),
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
      // Only the money-moving change is worth a diff. Who started collecting
      // where, and when, is the question an accountant asks afterwards.
      diff: startingToCollect
        ? { after: { isActive: true } }
        : stoppingCollection
          ? { after: { isActive: false } }
          : null,
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
  if (!input.customerId && !input.companyId) {
    throw new CommerceValidationError('Either customerId or companyId is required');
  }
  return withTenant(ctx, async (tx) => {
    const created = await tx.taxExemption.create({
      data: {
        tenantId: ctx.tenantId,
        customerId: input.customerId ?? null,
        companyId: input.companyId ?? null,
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

export async function listExemptionsForCompany(
  ctx: ServiceContext,
  companyId: string
): Promise<TaxExemptionRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.taxExemption.findMany({
      where: { companyId },
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

// ─── Activation default (docs/104 L2) ────────────────────────────────
//
// On `module.activated(commerce)`, seed the merchant's home nexus zone so the
// Tax surface is wired with a guided starting point instead of an empty table.
// Tax is deliberately unlike shipping: with no matching zone, `calculate()`
// already returns a $0 breakdown (you only collect where you have nexus), so a
// *live* default rate would be wrong — it would collect tax in a jurisdiction the
// merchant isn't registered for. So the seed is ONE zone for the operating
// country, **inactive and with zero rates**: `calculate()` only matches active
// zones, so not a cent of tax is charged until the merchant fills in their
// registration + rate and flips it active (or installs a TaxProvider, which
// always wins). Find-or-create by "the tenant has any tax zone" — a merchant who
// already configured tax is never touched. Country comes from the operating
// warehouse (fallback 'US', matching the other commerce defaults). `tenantId` is
// scoped explicitly (not just RLS) since the local superuser bypasses RLS
// (docs/104 R1–R4).
export async function bootstrapDefaults(ctx: ServiceContext): Promise<{ created: boolean }> {
  return withTenant(ctx, async (tx) => {
    const zoneCount = await tx.taxZone.count({ where: { tenantId: ctx.tenantId } });
    if (zoneCount > 0) return { created: false };

    const homeWarehouse = await tx.warehouse.findFirst({
      where: { tenantId: ctx.tenantId, isSystem: false, deletedAt: null },
      select: { country: true },
    });
    const country = homeWarehouse?.country ?? 'US';

    const zone = await tx.taxZone.create({
      data: {
        tenantId: ctx.tenantId,
        country,
        region: null,
        nexusType: 'physical',
        isActive: false,
      },
      select: { id: true },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: 'system',
      action: 'commerce.tax.bootstrapped',
      entityType: 'TaxZone',
      entityId: zone.id,
      diff: { after: { country, nexusType: 'physical', isActive: false } },
    });
    return { created: true };
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
        // A place nobody switched on charges nothing, whatever its switch says.
        // `zoneIsCollecting` in @wizeworks/commerce-schemas is this same rule,
        // and it is what both consoles draw their badge from, so no screen can
        // say "Collecting" about a place that takes nothing.
        activatedAt: { not: null },
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

  // A certificate on file, covering THIS place, today. The schema has claimed
  // for a long time that this happens here; it did not — the ids were parsed
  // and never read, so a reseller with a certificate paid tax like anybody
  // else. Nobody noticed while no tax was charged at all.
  if (request.customerExemptionIds.length > 0) {
    const certificates = await withTenant(ctx, (tx) =>
      tx.taxExemption.findMany({
        where: { id: { in: request.customerExemptionIds } },
        select: { jurisdiction: true, validFrom: true, validTo: true },
      })
    );
    if (coveringExemption(zone, certificates, new Date())) {
      return emptyBreakdown(request);
    }
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
    activatedAt: row.activatedAt?.toISOString() ?? null,
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
    companyId: row.companyId,
    jurisdiction: row.jurisdiction,
    reason: row.reason,
    certificateNumber: row.certificateNumber,
    certificateMediaId: row.certificateMediaId,
    validFrom: row.validFrom.toISOString(),
    validTo: row.validTo?.toISOString() ?? null,
  };
}
