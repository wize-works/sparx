// Bridges shippingService's rate/label/tracking calls to whichever
// ShippingProvider a tenant has installed (Commerce → Providers). This is
// the piece that was missing entirely before: shippingService used to
// only compute manual zone/rate-band prices and never consulted the
// provider registry at all.

import type { Carrier } from '@wizeworks/crm-schemas';
import { orderFulfillmentsService } from '@wizeworks/crm';
import type { RateOption, ShipmentRequest } from '@wizeworks/commerce-schemas';
import {
  getProvider,
  ProviderConfigurationError,
  ProviderHardError,
  ProviderTransientError,
  ProviderUnsupportedError,
} from '@wizeworks/integration-framework';
import type {
  ProviderRunContext,
  ShippingLabel,
  ShippingProvider,
} from '@wizeworks/integration-framework';

import { CommerceProviderError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { getSecretReader } from '../lib/secret-reader';
import { markFulfillmentLabelVoided, recordFulfillmentLabel } from './fulfillment-label-store';
import { resolveActiveConfig } from './provider-service';
import { recordReturnLabel } from './return-label-store';
import { uploadShippingLabel } from './shipping-label-media';
import { isAddressUsableForLiveRating } from './shipping-request-resolver';

export interface LabelResult {
  fulfillmentId: string;
  trackingNumber: string;
  trackingUrl: string;
  labelMediaId: string;
  carrier: string;
  costCents: number;
}

/** Resolve the tenant's active shipping installation + the provider
 *  bundle's ShippingProvider implementation + a ready-to-call
 *  ProviderRunContext. Throws a friendly, dashboard-renderable error when
 *  nothing is installed — every buy/void/track caller wants this to be a
 *  hard failure, unlike rate quoting which degrades gracefully instead. */
async function resolveShippingBundle(
  ctx: ServiceContext
): Promise<{ shipping: ShippingProvider; runCtx: ProviderRunContext; providerSlug: string }> {
  let installation;
  try {
    installation = await resolveActiveConfig(ctx, 'shipping');
  } catch {
    throw new CommerceValidationError(
      'No ShippingProvider is installed yet — connect a carrier from Commerce → Providers.'
    );
  }
  const bundle = getProvider(installation.providerSlug);
  if (!bundle?.shipping) {
    throw new CommerceValidationError(
      `Provider "${installation.providerSlug}" is not registered at runtime or does not implement shipping.`
    );
  }
  const runCtx: ProviderRunContext = {
    tenantId: ctx.tenantId,
    installationId: installation.installationId,
    environment: installation.environment,
    config: installation.config,
    secrets: getSecretReader(),
  };
  return { shipping: bundle.shipping, runCtx, providerSlug: installation.providerSlug };
}

function toCommerceProviderError(err: unknown, providerSlug: string): CommerceProviderError {
  if (err instanceof ProviderConfigurationError) {
    return new CommerceProviderError(providerSlug, err.message, { retryable: false });
  }
  if (err instanceof ProviderTransientError) {
    return new CommerceProviderError(providerSlug, err.message, { retryable: true });
  }
  if (err instanceof ProviderHardError) {
    return new CommerceProviderError(providerSlug, err.message, {
      providerErrorCode: err.providerErrorCode,
      retryable: false,
    });
  }
  if (err instanceof ProviderUnsupportedError) {
    return new CommerceProviderError(providerSlug, err.message, { retryable: false });
  }
  return new CommerceProviderError(
    providerSlug,
    err instanceof Error ? err.message : 'Shipping provider call failed unexpectedly',
    { retryable: false }
  );
}

/** Best-effort live rate lookup for rateShipment()'s manual-rate list.
 *  Never throws — a carrier outage, missing installation, or an
 *  unresolvable ship-from address all just mean "no live rates this
 *  time," not a broken checkout. */
export async function tryLiveRates(
  ctx: ServiceContext,
  request: ShipmentRequest
): Promise<RateOption[]> {
  // Both ends need a full street-level address — verified directly against
  // Shippo's API: a placeholder destination (`street1: '—'`) returns zero
  // usable rates even though shipment creation itself "succeeds," because
  // carriers rate off real geocoding, not just ZIP-to-ZIP. The caller is
  // responsible for supplying the shopper's real address at quote time
  // (see checkout.ts's shipping-quote route).
  if (
    !isAddressUsableForLiveRating(request.fromAddress) ||
    !isAddressUsableForLiveRating(request.toAddress)
  ) {
    return [];
  }
  try {
    const { shipping, runCtx } = await resolveShippingBundle(ctx);
    return await shipping.rateShipment(runCtx, request);
  } catch {
    return [];
  }
}

const CARRIER_ALIASES: Record<string, Carrier> = {
  ups: 'ups',
  usps: 'usps',
  fedex: 'fedex',
  dhl: 'dhl',
  'dhl express': 'dhl',
};

function mapCarrier(providerName: string): { carrier: Carrier; carrierOther?: string } {
  const normalized = CARRIER_ALIASES[providerName.toLowerCase()];
  return normalized
    ? { carrier: normalized }
    : { carrier: 'other', carrierOther: providerName.slice(0, 63) };
}

async function persistPurchasedLabel(
  ctx: ServiceContext,
  input: { fulfillmentId: string; providerSlug: string; label: ShippingLabel }
): Promise<LabelResult> {
  const labelMediaId = await uploadShippingLabel(ctx, {
    base64: input.label.labelImageBase64,
    format: input.label.labelImageFormat,
    refId: input.fulfillmentId,
  });

  await recordFulfillmentLabel(ctx, {
    fulfillmentId: input.fulfillmentId,
    providerSlug: input.providerSlug,
    labelRef: input.label.labelRef,
    trackingNumber: input.label.trackingNumber,
    trackingUrl: input.label.trackingUrl,
    labelMediaId,
    costCents: input.label.costCents,
  });

  const { carrier, carrierOther } = mapCarrier(input.label.carrier);
  await orderFulfillmentsService.updateFulfillment(ctx, {
    fulfillmentId: input.fulfillmentId,
    status: 'shipped',
    trackingNumber: input.label.trackingNumber,
    trackingUrl: input.label.trackingUrl || null,
    metadata: {
      carrier,
      carrierOther,
      service: input.label.service,
      providerSlug: input.providerSlug,
    },
  });

  return {
    fulfillmentId: input.fulfillmentId,
    trackingNumber: input.label.trackingNumber,
    trackingUrl: input.label.trackingUrl,
    labelMediaId,
    carrier: input.label.carrier,
    costCents: input.label.costCents,
  };
}

export type BuyLabelInput =
  { rateRef: string } | { request: ShipmentRequest; service: string; carrier: string };

/** Resolve the active provider + call buyLabel — the part outbound
 *  fulfillment labels and return labels both need. Persistence (which
 *  model the result lands in, what else it updates) is caller-specific. */
export async function purchaseLabel(
  ctx: ServiceContext,
  input: BuyLabelInput
): Promise<{ providerSlug: string; label: ShippingLabel }> {
  const { shipping, runCtx, providerSlug } = await resolveShippingBundle(ctx);
  try {
    const label =
      'rateRef' in input
        ? await shipping.buyLabel(runCtx, { rateRef: input.rateRef })
        : await shipping.buyLabel(runCtx, {
            request: input.request,
            service: input.service,
            carrier: input.carrier,
          });
    return { providerSlug, label };
  } catch (err) {
    throw toCommerceProviderError(err, providerSlug);
  }
}

export async function buyOutboundLabel(
  ctx: ServiceContext,
  input: { fulfillmentId: string } & BuyLabelInput
): Promise<LabelResult> {
  const { providerSlug, label } = await purchaseLabel(ctx, input);
  return persistPurchasedLabel(ctx, { fulfillmentId: input.fulfillmentId, providerSlug, label });
}

export interface ReturnLabelResult {
  labelMediaId: string;
  trackingNumber: string;
  trackingUrl: string;
  carrier: string;
  costCents: number;
}

/** Return-direction label purchase — same provider bridge, different
 *  persistence target (ReturnLabel, not FulfillmentLabel/OrderFulfillment).
 *  Never throws by design: return-service.approve() treats a failed label
 *  purchase as "no carrier connected / provider hiccup," not a reason to
 *  block the approval itself — the dashboard falls back to a "print label
 *  manually" CTA (the pre-existing behavior). */
export async function tryBuyReturnLabel(
  ctx: ServiceContext,
  input: { returnId: string } & BuyLabelInput
): Promise<ReturnLabelResult | null> {
  try {
    const { providerSlug, label } = await purchaseLabel(ctx, input);
    const labelMediaId = await uploadShippingLabel(ctx, {
      base64: label.labelImageBase64,
      format: label.labelImageFormat,
      refId: input.returnId,
    });
    await recordReturnLabel(ctx, {
      returnId: input.returnId,
      providerSlug,
      labelRef: label.labelRef,
      trackingNumber: label.trackingNumber,
      trackingUrl: label.trackingUrl,
      labelMediaId,
      costCents: label.costCents,
    });
    return {
      labelMediaId,
      trackingNumber: label.trackingNumber,
      trackingUrl: label.trackingUrl,
      carrier: label.carrier,
      costCents: label.costCents,
    };
  } catch {
    return null;
  }
}

export async function voidOutboundLabel(
  ctx: ServiceContext,
  input: { fulfillmentId: string; labelRef: string }
): Promise<void> {
  const { shipping, runCtx, providerSlug } = await resolveShippingBundle(ctx);
  try {
    await shipping.voidLabel(runCtx, input.labelRef);
  } catch (err) {
    throw toCommerceProviderError(err, providerSlug);
  }
  await markFulfillmentLabelVoided(ctx, input.fulfillmentId, input.labelRef);
}

export async function trackOutboundShipment(
  ctx: ServiceContext,
  input: { trackingNumber: string; carrier: string }
): Promise<{ status: string; lastUpdate: string }> {
  const { shipping, runCtx, providerSlug } = await resolveShippingBundle(ctx);
  try {
    const status = await shipping.track(runCtx, input);
    return { status: status.status, lastUpdate: status.lastEventAt };
  } catch (err) {
    throw toCommerceProviderError(err, providerSlug);
  }
}
