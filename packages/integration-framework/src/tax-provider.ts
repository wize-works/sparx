// TaxProvider — calculates tax at checkout time, records the
// transaction so refunds can reverse it, optionally validates ship-to
// addresses. Stripe Tax, TaxJar, Avalara implement this.

import type { TaxBreakdown, TaxCalculationRequest } from '@sparx/commerce-schemas';

import type { ProviderRunContext } from './context';
import type { ProviderMetadataDescriptor } from './metadata';

export interface NormalizedAddress {
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  country: string;
  isResidential?: boolean;
  validated: boolean;
}

export interface TaxProvider {
  readonly metadata: ProviderMetadataDescriptor;

  calculateTax(ctx: ProviderRunContext, request: TaxCalculationRequest): Promise<TaxBreakdown>;

  /** Optional — providers that support address normalization implement
   *  this; cart/checkout calls it before passing the address downstream. */
  validateAddress?(
    ctx: ProviderRunContext,
    address: TaxCalculationRequest['shipTo']
  ): Promise<NormalizedAddress>;

  /** Record a finalized order's tax transaction in the provider's
   *  ledger (TaxJar `taxes.create`, Avalara `CreateTransaction`).
   *  Called by `orderService` after order.placed commits. */
  recordTransaction(
    ctx: ProviderRunContext,
    input: { orderId: string; breakdown: TaxBreakdown }
  ): Promise<void>;

  /** Reverse a previously recorded transaction on refund. Idempotent on
   *  the original breakdown.breakdownRef. */
  reverseTransaction(
    ctx: ProviderRunContext,
    input: { orderId: string; breakdown: TaxBreakdown }
  ): Promise<void>;
}
