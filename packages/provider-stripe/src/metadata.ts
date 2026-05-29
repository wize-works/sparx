// Stripe marketplace metadata. Two install cards share this package:
// "Stripe" (the explicit install) and "Sparx Pay" (the white-label,
// declared in ./sparx-branded.ts).

import type { ProviderMetadataDescriptor } from '@sparx/integration-framework';

export const STRIPE_SLUG = 'stripe';

export const stripeMetadata: ProviderMetadataDescriptor = {
  slug: STRIPE_SLUG,
  displayName: 'Stripe',
  description:
    'Cards (Visa/Mastercard/Amex/Discover), Apple Pay, Google Pay, Link, ACH, SEPA. Optional Stripe Tax for automatic sales tax in 40+ countries. Stripe Subscriptions for recurring billing.',
  vendor: 'Stripe, Inc.',
  kinds: ['payment', 'tax', 'subscription_billing'],
  supportedCurrencies: ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'NZD', 'JPY', 'SGD', 'HKD', 'CHF'],
  supportedCountries: [
    'US',
    'CA',
    'GB',
    'IE',
    'FR',
    'DE',
    'NL',
    'BE',
    'ES',
    'IT',
    'PT',
    'AU',
    'NZ',
    'SG',
    'HK',
    'JP',
    'CH',
    'SE',
    'NO',
    'DK',
    'FI',
  ],
  sandboxAvailable: true,
  configSchemaJson: JSON.stringify({
    type: 'object',
    required: ['publishableKey', 'secretKeyRef'],
    properties: {
      publishableKey: {
        type: 'string',
        title: 'Publishable key',
        pattern: '^pk_(test|live)_[A-Za-z0-9]+$',
      },
      secretKeyRef: {
        type: 'string',
        title: 'Secret key (stored in Secret Manager)',
        description:
          'Reference to a Secret Manager secret containing the Stripe secret key. Format: projects/PROJECT/secrets/NAME/versions/latest',
      },
      webhookSecretRef: {
        type: 'string',
        title: 'Webhook signing secret reference',
      },
      enableStripeTax: {
        type: 'boolean',
        title: 'Enable Stripe Tax',
        default: false,
      },
      apiVersion: {
        type: 'string',
        title: 'API version',
        default: '2024-11-20.acacia',
      },
      statementDescriptor: {
        type: 'string',
        title: 'Statement descriptor (charge card-statement label)',
        maxLength: 22,
      },
    },
  }),
  webhookPathTemplate: '/v1/webhooks/providers/stripe/:installationId',
  requiredScopes: ['read_charges', 'write_charges', 'read_customers', 'write_customers'],
};
