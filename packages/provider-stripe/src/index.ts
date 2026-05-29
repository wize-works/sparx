// @sparx/provider-stripe — provider bundle export.
//
// Registers two bundles: the explicit `stripe` install and the
// white-label `sparx-pay` install. Both share the same underlying
// implementations; the only difference is metadata (configSchemaJson,
// displayName, vendor).

import { registerProvider } from '@sparx/integration-framework';
import type { ProviderBundle } from '@sparx/integration-framework';

import { stripeMetadata } from './metadata';
import { stripePayment } from './payment';
import { sparxPayMetadata } from './sparx-branded';
import { stripeSubscriptionBilling } from './subscription';
import { stripeTax } from './tax';

export const stripeBundle: ProviderBundle = {
  metadata: stripeMetadata,
  payment: stripePayment,
  tax: stripeTax,
  subscriptionBilling: stripeSubscriptionBilling,
};

export const sparxPayBundle: ProviderBundle = {
  metadata: sparxPayMetadata,
  payment: stripePayment,
};

/** Self-registers both bundles. Called once at boot from
 *  `services/api-rest/src/providers.ts` (alongside every other provider
 *  package's `register*()`). */
export function registerStripeProviders(): void {
  registerProvider(stripeBundle);
  registerProvider(sparxPayBundle);
}

export { stripeMetadata, sparxPayMetadata };
export { stripePayment } from './payment';
export { stripeTax } from './tax';
export { stripeSubscriptionBilling } from './subscription';
