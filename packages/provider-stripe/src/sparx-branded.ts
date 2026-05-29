// Sparx Pay — the white-label Stripe install. Same underlying
// implementation; the marketplace surface hides every Stripe-specific
// knob and surfaces just the few fields a merchant must provide. The
// `whitelabelOf` flag in metadata triggers a "powered by Stripe" badge
// on the install card.

import type { ProviderMetadataDescriptor } from '@sparx/integration-framework';

import { STRIPE_SLUG } from './metadata';

export const SPARX_PAY_SLUG = 'sparx-pay';

export const sparxPayMetadata: ProviderMetadataDescriptor = {
  slug: SPARX_PAY_SLUG,
  displayName: 'Sparx Pay',
  description:
    'Accept cards, Apple Pay, Google Pay, and Link with one-click setup. No Stripe account required — Sparx handles connection on your behalf.',
  vendor: 'Sparx',
  kinds: ['payment'],
  supportedCurrencies: ['USD'],
  supportedCountries: ['US'],
  sandboxAvailable: true,
  whitelabelOf: STRIPE_SLUG,
  configSchemaJson: JSON.stringify({
    type: 'object',
    required: ['businessLegalName', 'achRoutingNumberRef', 'achAccountNumberRef'],
    properties: {
      businessLegalName: {
        type: 'string',
        title: 'Legal business name',
        maxLength: 255,
      },
      achRoutingNumberRef: {
        type: 'string',
        title: 'ACH routing number (Secret Manager ref)',
      },
      achAccountNumberRef: {
        type: 'string',
        title: 'ACH account number (Secret Manager ref)',
      },
      ein: {
        type: 'string',
        title: 'Employer Identification Number',
        pattern: '^\\d{2}-\\d{7}$',
      },
    },
  }),
  webhookPathTemplate: '/v1/webhooks/providers/sparx-pay/:installationId',
  requiredScopes: [],
};
