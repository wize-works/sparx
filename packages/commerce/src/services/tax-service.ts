// taxService — merchant nexus + exemption configuration, plus the
// calculation pipeline that delegates to the installed TaxProvider plugin
// at checkout time.

import type {
  CreateTaxExemptionInput,
  CreateTaxRateInput,
  CreateTaxZoneInput,
  TaxBreakdown,
  TaxCalculationRequest,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

// ─── Zones ────────────────────────────────────────────────────────────

export function listZones(_ctx: ServiceContext): Promise<unknown[]> {
  return notImplemented('taxService.listZones');
}

export function createZone(
  _ctx: ServiceContext,
  _input: CreateTaxZoneInput
): Promise<{ id: string }> {
  return notImplemented('taxService.createZone');
}

// ─── Manual fallback rates ────────────────────────────────────────────

export function createRate(
  _ctx: ServiceContext,
  _input: CreateTaxRateInput
): Promise<{ id: string }> {
  return notImplemented('taxService.createRate');
}

// ─── Exemptions ───────────────────────────────────────────────────────

export function createExemption(
  _ctx: ServiceContext,
  _input: CreateTaxExemptionInput
): Promise<{ id: string }> {
  return notImplemented('taxService.createExemption');
}

export function listExemptionsForCustomer(
  _ctx: ServiceContext,
  _customerId: string
): Promise<unknown[]> {
  return notImplemented('taxService.listExemptionsForCustomer');
}

export function listExemptionsForB2BAccount(
  _ctx: ServiceContext,
  _b2bAccountId: string
): Promise<unknown[]> {
  return notImplemented('taxService.listExemptionsForB2BAccount');
}

// ─── Calculation ──────────────────────────────────────────────────────
//
// Resolves the installed TaxProvider, calls calculateTax(), persists the
// breakdown so refunds can call reverseTransaction() later.

export function calculate(
  _ctx: ServiceContext,
  _request: TaxCalculationRequest
): Promise<TaxBreakdown> {
  return notImplemented('taxService.calculate');
}

/** Refund-side hook — reverses the provider transaction matching the
 *  given breakdownRef. */
export function reverse(
  _ctx: ServiceContext,
  _input: { providerSlug: string; breakdownRef: string; orderId: string }
): Promise<void> {
  return notImplemented('taxService.reverse');
}
