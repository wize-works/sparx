// Stripe Tax — uses the Stripe Tax API on the same account as Stripe
// payments, so a tenant that turned on `enableStripeTax` in config gets
// tax calculation for free.

import type { TaxBreakdown, TaxCalculationRequest } from '@sparx/commerce-schemas';
import type { ProviderRunContext, TaxProvider } from '@sparx/integration-framework';
import { ProviderUnsupportedError } from '@sparx/integration-framework';

import { stripeMetadata } from './metadata';

function unimplemented(method: string): Promise<never> {
  return Promise.reject(new ProviderUnsupportedError('stripe', `${method} (Phase 0 stub)`));
}

export const stripeTax: TaxProvider = {
  metadata: stripeMetadata,

  calculateTax(_ctx: ProviderRunContext, _request: TaxCalculationRequest): Promise<TaxBreakdown> {
    return unimplemented('calculateTax');
  },

  recordTransaction(
    _ctx: ProviderRunContext,
    _input: { orderId: string; breakdown: TaxBreakdown }
  ): Promise<void> {
    return unimplemented('recordTransaction');
  },

  reverseTransaction(
    _ctx: ProviderRunContext,
    _input: { orderId: string; breakdown: TaxBreakdown }
  ): Promise<void> {
    return unimplemented('reverseTransaction');
  },
};
