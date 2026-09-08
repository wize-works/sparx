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
  UpdateShippingProfileInput,
  UpdateShippingZoneInput,
  ZoneTargeting,
} from '@wizeworks/commerce-schemas';
import { withTenant } from '@wizeworks/db';
import type { ShippingProfile, ShippingRate, ShippingZone, TxClient } from '@wizeworks/db';

import { writeAuditLog } from '../audit';
import { CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import {
  buyOutboundLabel,
  trackOutboundShipment,
  tryLiveRates,
  voidOutboundLabel,
} from './shipping-provider-bridge';
import type { LabelResult } from './shipping-provider-bridge';
import { offerableRates, profilePresenceFor } from './shipping-profile-match';
import type { ItemProfileLinks, ProfilePresence } from './shipping-profile-match';
// Imported (not just re-exported) because `quoteForCart` below composes them.
import { resolvePackageForItems, resolveShipFromAddress } from './shipping-request-resolver';
import { listInstallations } from './provider-service';
import { collectionOption } from './collection-option';

export {
  isAddressUsableForLiveRating,
  resolvePackageForItems,
  resolveShipFromAddress,
} from './shipping-request-resolver';
export type { PackagingItem } from './shipping-request-resolver';
export type { LabelResult } from './shipping-provider-bridge';

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
  /** True for the ONE group everything not filed elsewhere ships under — the
   *  shop's oldest. The console labels it "All other products" and everything
   *  else by its member count, and both read this rather than guessing from a
   *  count of zero: two empty groups look identical, and calling the newer one
   *  a default priced a basket of scarves as coats (issue 427). */
  isDefault: boolean;
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

export async function listZones(
  ctx: ServiceContext,
  filter: { take?: number; skip?: number } = {}
): Promise<{ items: ShippingZoneRow[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.shippingZone.findMany({
        include: { _count: { select: { rates: true } } },
        orderBy: [{ priority: 'desc' }, { name: 'asc' }],
        take: Math.min(filter.take ?? 50, 250),
        skip: filter.skip ?? 0,
      }),
      tx.shippingZone.count(),
    ]);
    return { items: rows.map(serializeZone), total };
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
  const input = UpdateShippingZoneInput.parse(rawInput);
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

export async function listProfiles(
  ctx: ServiceContext,
  filter: { take?: number; skip?: number } = {}
): Promise<{ items: ShippingProfileRow[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const [rows, total, defaultId] = await Promise.all([
      tx.shippingProfile.findMany({
        include: {
          _count: {
            select: { productLinks: true, variantLinks: true, collectionLinks: true },
          },
        },
        orderBy: { name: 'asc' },
        take: Math.min(filter.take ?? 50, 250),
        skip: filter.skip ?? 0,
      }),
      tx.shippingProfile.count(),
      defaultProfileId(tx),
    ]);
    return { items: rows.map((row) => serializeProfile(row, defaultId)), total };
  });
}

export async function getProfile(ctx: ServiceContext, id: string): Promise<ShippingProfileRow> {
  const found = await withTenant(ctx, async (tx) => {
    const [row, defaultId] = await Promise.all([
      tx.shippingProfile.findFirst({
        where: { id },
        include: {
          _count: {
            select: { productLinks: true, variantLinks: true, collectionLinks: true },
          },
        },
      }),
      defaultProfileId(tx),
    ]);
    return row ? serializeProfile(row, defaultId) : null;
  });
  if (!found) throw new CommerceNotFoundError('ShippingProfile', id);
  return found;
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
  const input = UpdateShippingProfileInput.parse(rawInput);
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

/**
 * Has this business said how it delivers?
 *
 * Answered from CONFIGURATION, never from an empty rate list, and that
 * distinction is the whole point. Checkout wants to know BEFORE it asks a
 * shopper for anything whether an address is going to be used, and the obvious
 * way to find out — quote with a placeholder destination and see if anything
 * comes back — gives the wrong answer for a shop with a connected carrier and
 * no manual zones: a carrier geocodes the destination to rate, so a placeholder
 * street returns nothing, and checkout would conclude "collection only" and
 * hide USPS from every one of that shop's customers.
 *
 * The two things that actually mean "we deliver" are a delivery zone and a
 * connected carrier. Both are knowable with nobody's address in hand.
 *
 * The zone scoping matches `rateShipment` exactly (docs/131 §4): a zone with no
 * property belongs to every site, so a per-site answer must include those too.
 */
export async function deliveryIsConfigured(
  ctx: ServiceContext,
  input: { cartId: string }
): Promise<boolean> {
  const [zones, carriers] = await Promise.all([
    withTenant(ctx, async (tx) => {
      const cart = await tx.cart.findFirst({
        where: { id: input.cartId },
        select: { propertyId: true },
      });
      return tx.shippingZone.count({
        where: cart?.propertyId
          ? { OR: [{ propertyId: cart.propertyId }, { propertyId: null }] }
          : {},
      });
    }),
    listInstallations(ctx, { kind: 'shipping', enabled: true }).catch(() => []),
  ]);
  return zones > 0 || carriers.length > 0;
}

// ─── Real-time rate shopping ─────────────────────────────────────────
//
// Manual zone/rate-band rates are always computed as the guaranteed
// fallback. When a tenant has an active ShippingProvider installation
// AND the request carries a real (non-placeholder) fromAddress/toAddress,
// live carrier rates are fetched and merged in too — tagged with the
// real provider slug instead of 'sparx-manual'. A carrier outage or an
// unconfigured warehouse address just means fewer rates, never a broken
// checkout (see tryLiveRates).

/**
 * Which PRODUCT GROUPS a shipment's contents belong to, read from the variants
 * in it. Pass it to `rateShipment` so a group's delivery options only reach a
 * basket that group covers — see shipping-profile-match.ts for the rule.
 */
export async function shipmentContents(
  ctx: ServiceContext,
  variantIds: readonly string[]
): Promise<ProfilePresence> {
  if (variantIds.length === 0) return profilePresenceFor([]);
  const unique = [...new Set(variantIds)];
  const rows = await withTenant(ctx, (tx) =>
    tx.productVariant.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        shippingProfileLinks: { select: { profileId: true } },
        product: {
          select: {
            shippingProfileLinks: { select: { profileId: true } },
            collectionLinks: {
              select: {
                collection: { select: { shippingProfileLinks: { select: { profileId: true } } } },
              },
            },
          },
        },
      },
    })
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const links: ItemProfileLinks[] = unique.map((id) => {
    const row = byId.get(id);
    // A variant the catalog no longer has still occupies the basket, and it is
    // in no group — which is the honest answer, and the one that keeps a
    // deleted line from silently pulling in a freight surcharge.
    if (!row) return {};
    return {
      variantProfileId: row.shippingProfileLinks[0]?.profileId ?? null,
      productProfileId: row.product.shippingProfileLinks[0]?.profileId ?? null,
      collectionProfileIds: row.product.collectionLinks.flatMap((link) =>
        link.collection.shippingProfileLinks.map((l) => l.profileId)
      ),
    };
  });
  return profilePresenceFor(links);
}

export async function rateShipment(
  ctx: ServiceContext,
  request: ShipmentRequest,
  /** What is in the parcel, in product-group terms. OMITTED means the caller
   *  could not say, and the shipment is then priced as ordinary goods rather
   *  than being offered every group's price — see applicableProfileIds. */
  contents?: ProfilePresence
): Promise<RateOption[]> {
  if (!request?.toAddress?.country) {
    throw new CommerceValidationError('toAddress.country is required');
  }
  const totalWeightGrams = request.packages.reduce((s, p) => s + p.weight, 0);
  const totalItemValueCents = request.packages.reduce((s, p) => s + (p.declaredValueCents ?? 0), 0);

  const [zoneRead, liveRates] = await Promise.all([
    withTenant(ctx, async (tx) => {
      const zones = await tx.shippingZone.findMany({
        // Only zones this SITE delivers from (docs/131 §4); a null property_id
        // zone belongs to every site, which is what every pre-existing zone is.
        // Without this the donut shop's 15-mile delivery rates were quoted on a
        // freight parts order — a price nobody could honour.
        where: request.propertyId
          ? { OR: [{ propertyId: request.propertyId }, { propertyId: null }] }
          : {},
        include: { rates: true },
        orderBy: { priority: 'desc' },
      });
      // Both counts matter, and they mean different things. NONE AT ALL is a
      // business that has never said how it delivers; SOME BUT NONE MATCHING is
      // a business that has said, and this address is outside it. Only the first
      // gets answered on their behalf — see collection-option.ts.
      // The group everything not filed elsewhere ships under. Same function
      // the two screens read, so checkout and the shipping list cannot end up
      // calling different groups the default. See shipping-profile-match.ts,
      // rule 2, for why it is age and not emptiness.
      return {
        anyConfigured: zones.length > 0,
        matching: zones.filter((z) => zoneMatchesAddress(z.targeting, request.toAddress.country)),
        fallbackProfileId: await defaultProfileId(tx, request.propertyId),
      };
    }),
    tryLiveRates(ctx, request),
  ]);
  const matchingZones = zoneRead.matching;

  // Manual rates are priced FIRST and filtered second, because the rule that
  // picks between product groups compares what each group would actually cost.
  // Live carrier rates are left alone: they price the physical parcel, and a
  // carrier has no opinion about which group a shop filed a product under.
  const priced: { profileId: string; amountCents: number; option: RateOption }[] = [];
  for (const zone of matchingZones) {
    for (const rate of zone.rates) {
      if (rate.currency !== request.currency) continue;
      const amount = computeManualRate(rate, {
        weightGrams: totalWeightGrams,
        subtotalCents: totalItemValueCents,
        itemCount: request.packages.length,
      });
      if (amount == null) continue;
      priced.push({
        profileId: rate.profileId,
        amountCents: amount,
        option: {
          rateRef: `manual:${rate.id}`,
          providerSlug: 'sparx-manual',
          carrier: rate.carrier ?? 'Standard',
          service: rate.name,
          amountCents: amount,
          currency: rate.currency,
          estimatedDeliveryDays: rate.estimatedDeliveryDays ?? undefined,
          isFreight: false,
        },
      });
    }
  }

  const out: RateOption[] = [...liveRates];
  for (const row of offerableRates(priced, contents, zoneRead.fallbackProfileId)) {
    out.push(row.option);
  }

  // Delivery was never set up here, and no carrier answered. Rather than invent
  // one — which is what the old activation bootstrap did, and how a
  // collection-only bakery came to offer worldwide postage (issue #031) — offer
  // the thing every business with a counter can actually do.
  if (out.length === 0 && !zoneRead.anyConfigured) {
    return [collectionOption(request.currency)];
  }

  return out.sort((a, b) => a.amountCents - b.amountCents);
}

/** Enough to match a zone and nothing more. A real carrier returns no rates
 *  against it, which is correct: it cannot rate a shipment to nowhere. */
const UNKNOWN_DESTINATION = { line1: '—', city: '—', country: 'US' } as const;

/**
 * Rate a CART for a destination — the single server-authoritative quote shared by
 * the public shipping-quote endpoint and checkout's `submitShipping`.
 *
 * `submitShipping` must re-derive the chosen rate's PRICE here rather than trust a
 * client-supplied amount, so this composition can't live only in the route: the cart's
 * lines become one package, the tenant's ship-from warehouse is resolved, and rating
 * runs against the cart's own site + currency. (Before this existed, submitShipping
 * stored only the rate REF and never priced it, so every order shipped free — BUG-005.)
 */
export async function quoteForCart(
  ctx: ServiceContext,
  input: { cartId: string; toAddress?: ShipmentRequest['toAddress'] }
): Promise<RateOption[]> {
  // No destination is a legitimate question — "what can this shop do with this
  // cart, before anybody has typed anything?" — and it is the question checkout
  // opens the shipping step with. Zone matching reads only `country`, and the
  // collection option ignores the destination entirely, so a stand-in answers
  // both. It exists ONLY to be rated against and is never stored: an order that
  // is collected records no address at all (issue 064).
  const toAddress = input.toAddress ?? UNKNOWN_DESTINATION;
  const cart = await withTenant(ctx, (tx) =>
    tx.cart.findFirst({
      where: { id: input.cartId },
      select: {
        currency: true,
        // The site this cart is on (docs/131 §4) — bounds which zones may quote.
        propertyId: true,
        items: {
          select: {
            quantity: true,
            subtotalCents: true,
            variant: {
              select: {
                id: true,
                weightGrams: true,
                lengthMm: true,
                widthMm: true,
                heightMm: true,
                product: {
                  select: {
                    weightGrams: true,
                    lengthMm: true,
                    widthMm: true,
                    heightMm: true,
                  },
                },
              },
            },
          },
        },
      },
    })
  );
  if (!cart) throw new CommerceNotFoundError('Cart', input.cartId);

  const shipmentPackage = resolvePackageForItems(
    cart.items.map((it) => ({
      quantity: it.quantity,
      weightGrams: it.variant.weightGrams,
      lengthMm: it.variant.lengthMm,
      widthMm: it.variant.widthMm,
      heightMm: it.variant.heightMm,
      productWeightGrams: it.variant.product.weightGrams,
      productLengthMm: it.variant.product.lengthMm,
      productWidthMm: it.variant.product.widthMm,
      productHeightMm: it.variant.product.heightMm,
    }))
  );
  shipmentPackage.declaredValueCents = cart.items.reduce((sum, it) => sum + it.subtotalCents, 0);

  // What is actually in the basket, in product-group terms. Without this every
  // group's delivery options were offered to every basket: a shop that priced
  // coats at $25 offered $25 to somebody buying a scarf (issue 427).
  const contents = await shipmentContents(
    ctx,
    cart.items.map((it) => it.variant.id)
  );

  // A missing/placeholder warehouse address only costs LIVE rates — manual zone
  // rates still quote, so checkout is never blocked by an unconfigured ship-from.
  const fromAddress = await resolveShipFromAddress(ctx).catch(() => ({
    line1: '—',
    city: '—',
    country: 'US',
  }));

  return rateShipment(
    ctx,
    {
      ...(cart.propertyId ? { propertyId: cart.propertyId } : {}),
      fromAddress,
      toAddress,
      currency: cart.currency,
      signatureRequired: false,
      saturdayDelivery: false,
      packages: [shipmentPackage],
    },
    contents
  );
}

export interface LiveRateReadiness {
  /** A live carrier (Shippo, …) is installed AND enabled. */
  liveCarrierConnected: boolean;
  /** Slugs of the connected+enabled shipping providers, for display. */
  carrierSlugs: string[];
  /** The ship-from warehouse address is complete enough to rate a live shipment. */
  shipFromComplete: boolean;
  /** When `shipFromComplete` is false, the already-merchant-friendly reason from
   *  `resolveShipFromAddress` ("…incomplete (missing city, postal code) — finish
   *  it under Inventory → Warehouses…"). Null when complete. */
  shipFromIssue: string | null;
}

/**
 * Is this tenant set up to show LIVE carrier rates at checkout?
 *
 * Live rating silently degrades to manual rates when the ship-from is missing
 * (`tryLiveRates` swallows the error by design, so checkout never breaks). That
 * is correct for the shopper but leaves the MERCHANT in the dark — they connect
 * a carrier, expect USPS/UPS to appear, and never learn the warehouse address is
 * the reason it doesn't. This is the signal the Shipping surface uses to warn
 * them: a carrier is connected but the ship-from is incomplete. It never throws —
 * a readiness probe must not fail the page it informs.
 */
export async function getLiveRateReadiness(ctx: ServiceContext): Promise<LiveRateReadiness> {
  const carriers = await listInstallations(ctx, { kind: 'shipping', enabled: true }).catch(
    () => []
  );

  let shipFromComplete = false;
  let shipFromIssue: string | null = null;
  try {
    // Reuse the exact same resolver checkout uses, so "ready" here can never
    // disagree with what actually happens at rating time. It throws a
    // merchant-facing, actionable message when the ship-from can't be built.
    await resolveShipFromAddress(ctx, { channel: 'storefront' });
    shipFromComplete = true;
  } catch (err) {
    shipFromIssue =
      err instanceof Error
        ? err.message
        : 'Your ship-from address is not set up yet, so live carrier rates cannot be calculated.';
  }

  return {
    liveCarrierConnected: carriers.length > 0,
    carrierSlugs: carriers.map((c) => c.providerSlug),
    shipFromComplete,
    shipFromIssue: shipFromComplete ? null : shipFromIssue,
  };
}

// ─── Label purchase / void / tracking (provider-bridged) ─────────────
//
// Delegates to shipping-provider-bridge.ts, which resolves the tenant's
// active ShippingProvider installation and calls it. Unlike rate
// quoting, these are hard failures when no provider is installed — a
// merchant explicitly asked to buy/void/track a specific label.

export function buyLabel(
  ctx: ServiceContext,
  input:
    | { fulfillmentId: string; rateRef: string }
    | { fulfillmentId: string; request: ShipmentRequest; service: string; carrier: string }
): Promise<LabelResult> {
  return buyOutboundLabel(ctx, input);
}

export function voidLabel(
  ctx: ServiceContext,
  input: { fulfillmentId: string; labelRef: string }
): Promise<void> {
  return voidOutboundLabel(ctx, input);
}

export function trackShipment(
  ctx: ServiceContext,
  input: { trackingNumber: string; carrier: string }
): Promise<{ status: string; lastUpdate: string }> {
  return trackOutboundShipment(ctx, input);
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

/**
 * The ONE group everything not filed elsewhere ships under: the shop's oldest.
 *
 * The single definition, read by the rate matcher and by both screens, so a
 * merchant can never be told one thing by the list and another by checkout.
 * `id` breaks a tie, since two rows created in the same seed transaction can
 * share a timestamp and the default must not swap between reloads.
 */
export async function defaultProfileId(tx: TxClient, propertyId?: string): Promise<string | null> {
  const row = await tx.shippingProfile.findFirst({
    where: propertyId ? { OR: [{ propertyId }, { propertyId: null }] } : {},
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  return row?.id ?? null;
}

function serializeProfile(
  row: ShippingProfile & {
    _count: { productLinks: number; variantLinks: number; collectionLinks: number };
  },
  defaultId: string | null
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
    isDefault: row.id === defaultId,
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
