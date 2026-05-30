// shippingService — zones, profiles, fallback rates, rate-shopping
// orchestrator. Real-time carrier rates + label purchases delegate to
// ShippingProvider plugins selected at checkout time. Manual rates are
// the fallback for merchants who haven't connected a carrier API yet.

import {
  type AssignProductsToProfileInput,
  CreateShippingProfileInput,
  CreateShippingRateInput,
  CreateShippingZoneInput,
  type RateOption,
  type ShipmentRequest,
  ZoneTargeting,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { ShippingProfile, ShippingRate, ShippingZone, TxClient } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';

// ─── Row shapes ──────────────────────────────────────────────────────

export interface ShippingZoneRow {
  id: string;
  name: string;
  priority: number;
  targeting: ZoneTargeting;
  rateCount: number;
  updatedAt: string;
}

export interface ShippingProfileRow {
  id: string;
  name: string;
  description: string | null;
  allowedCarrierServices: string[];
  hazmatClassesAllowed: string[];
  requiresSignature: boolean;
  requiresFreight: boolean;
  productCount: number;
  variantCount: number;
  collectionCount: number;
  updatedAt: string;
}

export interface ShippingRateRow {
  id: string;
  zoneId: string;
  profileId: string;
  name: string;
  type: string;
  amountCents: number | null;
  freeAboveCents: number | null;
  bands: { min: number; max?: number; amountCents: number }[] | null;
  currency: string;
  carrier: string | null;
  estimatedDeliveryDays: number | null;
}

// ─── Zones ───────────────────────────────────────────────────────────

export async function listZones(ctx: ServiceContext): Promise<ShippingZoneRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.shippingZone.findMany({
      include: { _count: { select: { rates: true } } },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      take: 250,
    });
    return rows.map(serializeZone);
  });
}

export async function getZone(ctx: ServiceContext, id: string): Promise<ShippingZoneRow> {
  const row = await withTenant(ctx, (tx) =>
    tx.shippingZone.findFirst({
      where: { id },
      include: { _count: { select: { rates: true } } },
    })
  );
  if (!row) throw new CommerceNotFoundError('ShippingZone', id);
  return serializeZone(row);
}

export async function createZone(ctx: ServiceContext, rawInput: unknown): Promise<{ id: string }> {
  const input = CreateShippingZoneInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const created = await tx.shippingZone.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        priority: input.priority,
        targeting: input.targeting,
      },
      select: { id: true },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.shipping_zone.created',
      entityType: 'ShippingZone',
      entityId: created.id,
      diff: { after: { name: input.name, priority: input.priority } },
    });
    return created;
  });
}

export async function updateZone(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown
): Promise<void> {
  const input = CreateShippingZoneInput.partial().parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const before = await tx.shippingZone.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('ShippingZone', id);
    await tx.shippingZone.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.targeting !== undefined ? { targeting: input.targeting } : {}),
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.shipping_zone.updated',
      entityType: 'ShippingZone',
      entityId: id,
      diff: null,
    });
  });
}

export async function deleteZone(ctx: ServiceContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.shippingZone.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('ShippingZone', id);
    await tx.shippingZone.delete({ where: { id } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.shipping_zone.deleted',
      entityType: 'ShippingZone',
      entityId: id,
      diff: null,
    });
  });
}

// ─── Profiles ────────────────────────────────────────────────────────

export async function listProfiles(ctx: ServiceContext): Promise<ShippingProfileRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.shippingProfile.findMany({
      include: {
        _count: {
          select: { productLinks: true, variantLinks: true, collectionLinks: true },
        },
      },
      orderBy: { name: 'asc' },
      take: 250,
    });
    return rows.map(serializeProfile);
  });
}

export async function getProfile(ctx: ServiceContext, id: string): Promise<ShippingProfileRow> {
  const row = await withTenant(ctx, (tx) =>
    tx.shippingProfile.findFirst({
      where: { id },
      include: {
        _count: {
          select: { productLinks: true, variantLinks: true, collectionLinks: true },
        },
      },
    })
  );
  if (!row) throw new CommerceNotFoundError('ShippingProfile', id);
  return serializeProfile(row);
}

export async function createProfile(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = CreateShippingProfileInput.parse(rawInput);
  return withTenant(ctx, async (tx) => {
    const created = await tx.shippingProfile.create({
      data: {
        tenantId: ctx.tenantId,
        name: input.name,
        description: input.description ?? null,
        allowedCarrierServices: input.allowedCarrierServices,
        hazmatClassesAllowed: input.hazmatClassesAllowed,
        requiresSignature: input.requiresSignature,
        requiresFreight: input.requiresFreight,
      },
      select: { id: true },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.shipping_profile.created',
      entityType: 'ShippingProfile',
      entityId: created.id,
      diff: { after: { name: input.name } },
    });
    return created;
  });
}

export async function updateProfile(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown
): Promise<void> {
  const input = CreateShippingProfileInput.partial().parse(rawInput);
  await withTenant(ctx, async (tx) => {
    const before = await tx.shippingProfile.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('ShippingProfile', id);
    await tx.shippingProfile.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.allowedCarrierServices !== undefined
          ? { allowedCarrierServices: input.allowedCarrierServices }
          : {}),
        ...(input.hazmatClassesAllowed !== undefined
          ? { hazmatClassesAllowed: input.hazmatClassesAllowed }
          : {}),
        ...(input.requiresSignature !== undefined
          ? { requiresSignature: input.requiresSignature }
          : {}),
        ...(input.requiresFreight !== undefined ? { requiresFreight: input.requiresFreight } : {}),
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.shipping_profile.updated',
      entityType: 'ShippingProfile',
      entityId: id,
      diff: null,
    });
  });
}

export async function deleteProfile(ctx: ServiceContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.shippingProfile.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('ShippingProfile', id);
    await tx.shippingProfile.delete({ where: { id } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.shipping_profile.deleted',
      entityType: 'ShippingProfile',
      entityId: id,
      diff: null,
    });
  });
}

export async function assignProductsToProfile(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ updated: number }> {
  const input: AssignProductsToProfileInput = rawInput as AssignProductsToProfileInput;
  if (!input?.profileId || !Array.isArray(input.productIds) || input.productIds.length === 0) {
    throw new CommerceValidationError('profileId and at least one productId are required');
  }
  return withTenant(ctx, async (tx) => {
    const profile = await tx.shippingProfile.findFirst({
      where: { id: input.profileId },
      select: { id: true },
    });
    if (!profile) throw new CommerceNotFoundError('ShippingProfile', input.profileId);
    await tx.shippingProfileProduct.createMany({
      data: input.productIds.map((productId) => ({ profileId: input.profileId, productId })),
      skipDuplicates: true,
    });
    return { updated: input.productIds.length };
  });
}

// ─── Manual rates ────────────────────────────────────────────────────

export async function createRate(ctx: ServiceContext, rawInput: unknown): Promise<{ id: string }> {
  const input = CreateShippingRateInput.parse(rawInput);
  assertRateInputCoherent(input);
  return withTenant(ctx, async (tx) => {
    await assertZoneExists(tx, input.zoneId);
    await assertProfileExists(tx, input.profileId);
    const created = await tx.shippingRate.create({
      data: {
        tenantId: ctx.tenantId,
        zoneId: input.zoneId,
        profileId: input.profileId,
        name: input.name,
        type: input.type,
        amountCents: input.amountCents ?? null,
        freeAboveCents: input.freeAboveCents ?? null,
        ...(input.bands !== undefined ? { bands: input.bands } : {}),
        currency: input.currency,
        carrier: input.carrier ?? null,
        estimatedDeliveryDays: input.estimatedDeliveryDays ?? null,
      },
      select: { id: true },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.shipping_rate.created',
      entityType: 'ShippingRate',
      entityId: created.id,
      diff: { after: { type: input.type } },
    });
    return created;
  });
}

export async function listRatesForZone(
  ctx: ServiceContext,
  zoneId: string
): Promise<ShippingRateRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.shippingRate.findMany({
      where: { zoneId },
      orderBy: { name: 'asc' },
      take: 100,
    });
    return rows.map(serializeRate);
  });
}

export async function deleteRate(ctx: ServiceContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.shippingRate.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('ShippingRate', id);
    await tx.shippingRate.delete({ where: { id } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.shipping_rate.deleted',
      entityType: 'ShippingRate',
      entityId: id,
      diff: null,
    });
  });
}

// ─── Real-time rate shopping ─────────────────────────────────────────
//
// Real-time provider integration is wired through the provider
// marketplace; this entry point will iterate active ShippingProvider
// installations once that bridge lands. Until then it returns the
// matching manual rates for the destination + cart subtotal so the
// checkout flow has something to render.

export async function rateShipment(
  ctx: ServiceContext,
  request: ShipmentRequest
): Promise<RateOption[]> {
  if (!request?.toAddress?.country) {
    throw new CommerceValidationError('toAddress.country is required');
  }
  const totalWeightGrams = request.packages.reduce((s, p) => s + p.weight, 0);
  const totalItemValueCents = request.packages.reduce((s, p) => s + (p.declaredValueCents ?? 0), 0);

  const matchingZones = await withTenant(ctx, async (tx) => {
    const zones = await tx.shippingZone.findMany({
      include: { rates: true },
      orderBy: { priority: 'desc' },
    });
    return zones.filter((z) => zoneMatchesAddress(z.targeting, request.toAddress.country));
  });

  const out: RateOption[] = [];
  for (const zone of matchingZones) {
    for (const rate of zone.rates) {
      if (rate.currency !== request.currency) continue;
      const amount = computeManualRate(rate, {
        weightGrams: totalWeightGrams,
        subtotalCents: totalItemValueCents,
        itemCount: request.packages.length,
      });
      if (amount == null) continue;
      out.push({
        rateRef: `manual:${rate.id}`,
        providerSlug: 'sparx-manual',
        carrier: rate.carrier ?? 'Standard',
        service: rate.name,
        amountCents: amount,
        currency: rate.currency,
        estimatedDeliveryDays: rate.estimatedDeliveryDays ?? undefined,
        isFreight: false,
      });
    }
  }

  return out.sort((a, b) => a.amountCents - b.amountCents);
}

// ─── Label purchase (provider-bridged) ───────────────────────────────

export interface LabelResult {
  fulfillmentId: string;
  trackingNumber: string;
  trackingUrl: string;
  labelMediaId: string;
  carrier: string;
  costCents: number;
}

export function buyLabel(
  _ctx: ServiceContext,
  _input: {
    orderId: string;
    fulfillmentId: string;
    providerSlug: string;
    rateRef: string;
  }
): Promise<LabelResult> {
  // Provider integration lands together with the marketplace UI.
  // Reject with a typed validation error rather than NOT_IMPLEMENTED so
  // dashboards can render a clean "configure a carrier first" message.
  return Promise.reject(
    new CommerceValidationError(
      'No ShippingProvider is installed yet — connect a carrier from Commerce → Providers to buy labels.'
    )
  );
}

export function voidLabel(
  _ctx: ServiceContext,
  _input: { fulfillmentId: string; providerSlug: string; labelRef: string }
): Promise<void> {
  return Promise.reject(
    new CommerceValidationError(
      'No ShippingProvider is installed yet — void labels via the carrier dashboard for now.'
    )
  );
}

export function trackShipment(
  _ctx: ServiceContext,
  _input: { providerSlug: string; trackingNumber: string; carrier: string }
): Promise<{ status: string; lastUpdate: string }> {
  return Promise.reject(
    new CommerceValidationError(
      'No ShippingProvider is installed yet — tracking lookup will activate after install.'
    )
  );
}

// ─── helpers ─────────────────────────────────────────────────────────

function assertRateInputCoherent(input: CreateShippingRateInput): void {
  if (input.type === 'flat' && input.amountCents == null) {
    throw new CommerceValidationError('Flat rate requires amountCents');
  }
  if (
    input.type === 'free_above_threshold' &&
    (input.freeAboveCents == null || input.amountCents == null)
  ) {
    throw new CommerceValidationError(
      'free_above_threshold requires both freeAboveCents and amountCents'
    );
  }
  if (
    (input.type === 'by_weight' || input.type === 'by_price' || input.type === 'by_item_count') &&
    (!input.bands || input.bands.length === 0)
  ) {
    throw new CommerceValidationError(`${input.type} requires at least one band`);
  }
}

async function assertZoneExists(tx: TxClient, id: string): Promise<void> {
  const row = await tx.shippingZone.findFirst({ where: { id }, select: { id: true } });
  if (!row) throw new CommerceNotFoundError('ShippingZone', id);
}

async function assertProfileExists(tx: TxClient, id: string): Promise<void> {
  const row = await tx.shippingProfile.findFirst({ where: { id }, select: { id: true } });
  if (!row) throw new CommerceNotFoundError('ShippingProfile', id);
}

function zoneMatchesAddress(targetingJson: unknown, country: string): boolean {
  if (!targetingJson || typeof targetingJson !== 'object') return false;
  const parsed = ZoneTargeting.safeParse(targetingJson);
  if (!parsed.success) return false;
  const t = parsed.data;
  if (t.countries.length === 0) return true; // unconstrained
  return t.countries.includes(country.toUpperCase());
}

function computeManualRate(
  rate: ShippingRate,
  ctx: { weightGrams: number; subtotalCents: number; itemCount: number }
): number | null {
  switch (rate.type) {
    case 'flat':
      return rate.amountCents ?? null;
    case 'free_above_threshold':
      if (rate.freeAboveCents != null && ctx.subtotalCents >= rate.freeAboveCents) return 0;
      return rate.amountCents ?? null;
    case 'by_weight':
      return pickBand(rate.bands, ctx.weightGrams);
    case 'by_price':
      return pickBand(rate.bands, ctx.subtotalCents);
    case 'by_item_count':
      return pickBand(rate.bands, ctx.itemCount);
    default:
      return null;
  }
}

function pickBand(bandsJson: unknown, value: number): number | null {
  if (!Array.isArray(bandsJson)) return null;
  for (const raw of bandsJson) {
    if (!raw || typeof raw !== 'object') continue;
    const band = raw as { min?: number; max?: number; amountCents?: number };
    if (typeof band.min !== 'number' || typeof band.amountCents !== 'number') continue;
    if (value < band.min) continue;
    if (band.max != null && value >= band.max) continue;
    return band.amountCents;
  }
  return null;
}

function serializeZone(row: ShippingZone & { _count: { rates: number } }): ShippingZoneRow {
  const parsed = ZoneTargeting.safeParse(row.targeting);
  return {
    id: row.id,
    name: row.name,
    priority: row.priority,
    targeting: parsed.success ? parsed.data : { countries: [], regions: [], postalCodeRanges: [] },
    rateCount: row._count.rates,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeProfile(
  row: ShippingProfile & {
    _count: { productLinks: number; variantLinks: number; collectionLinks: number };
  }
): ShippingProfileRow {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    allowedCarrierServices: Array.isArray(row.allowedCarrierServices)
      ? (row.allowedCarrierServices as string[])
      : [],
    hazmatClassesAllowed: Array.isArray(row.hazmatClassesAllowed)
      ? (row.hazmatClassesAllowed as string[])
      : ['none'],
    requiresSignature: row.requiresSignature,
    requiresFreight: row.requiresFreight,
    productCount: row._count.productLinks,
    variantCount: row._count.variantLinks,
    collectionCount: row._count.collectionLinks,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeRate(row: ShippingRate): ShippingRateRow {
  return {
    id: row.id,
    zoneId: row.zoneId,
    profileId: row.profileId,
    name: row.name,
    type: row.type,
    amountCents: row.amountCents,
    freeAboveCents: row.freeAboveCents,
    bands: Array.isArray(row.bands) ? (row.bands as ShippingRateRow['bands']) : null,
    currency: row.currency,
    carrier: row.carrier,
    estimatedDeliveryDays: row.estimatedDeliveryDays,
  };
}
