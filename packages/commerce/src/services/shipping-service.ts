// shippingService — zones, profiles, fallback rates. Real-time carrier
// rates and label purchases delegate to the ShippingProvider plugin
// chosen at checkout time.

import type {
  AssignProductsToProfileInput,
  CreateShippingProfileInput,
  CreateShippingRateInput,
  CreateShippingZoneInput,
  RateOption,
  ShipmentRequest,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

// ─── Zones ────────────────────────────────────────────────────────────

export function listZones(_ctx: ServiceContext): Promise<unknown[]> {
  return notImplemented('shippingService.listZones');
}

export function createZone(
  _ctx: ServiceContext,
  _input: CreateShippingZoneInput
): Promise<{ id: string }> {
  return notImplemented('shippingService.createZone');
}

// ─── Profiles ─────────────────────────────────────────────────────────

export function listProfiles(_ctx: ServiceContext): Promise<unknown[]> {
  return notImplemented('shippingService.listProfiles');
}

export function createProfile(
  _ctx: ServiceContext,
  _input: CreateShippingProfileInput
): Promise<{ id: string }> {
  return notImplemented('shippingService.createProfile');
}

export function assignProductsToProfile(
  _ctx: ServiceContext,
  _input: AssignProductsToProfileInput
): Promise<{ updated: number }> {
  return notImplemented('shippingService.assignProductsToProfile');
}

// ─── Fallback rates (manual) ──────────────────────────────────────────

export function createRate(
  _ctx: ServiceContext,
  _input: CreateShippingRateInput
): Promise<{ id: string }> {
  return notImplemented('shippingService.createRate');
}

export function listRatesForZone(_ctx: ServiceContext, _zoneId: string): Promise<unknown[]> {
  return notImplemented('shippingService.listRatesForZone');
}

// ─── Real-time rate shopping ──────────────────────────────────────────
//
// Iterates every active ShippingProvider installation, calls
// ShippingProvider.rateShipment(), aggregates the results, applies
// merchant rules (preferred carrier, hide-above-X, etc.), and returns
// a deduped + sorted RateOption[] for the storefront to render.

export function rateShipment(
  _ctx: ServiceContext,
  _request: ShipmentRequest
): Promise<RateOption[]> {
  return notImplemented('shippingService.rateShipment');
}

// ─── Label purchase ───────────────────────────────────────────────────

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
  return notImplemented('shippingService.buyLabel');
}

export function voidLabel(
  _ctx: ServiceContext,
  _input: { fulfillmentId: string; providerSlug: string; labelRef: string }
): Promise<void> {
  return notImplemented('shippingService.voidLabel');
}

export function trackShipment(
  _ctx: ServiceContext,
  _input: { providerSlug: string; trackingNumber: string; carrier: string }
): Promise<{ status: string; lastUpdate: string }> {
  return notImplemented('shippingService.trackShipment');
}
