// @sparx/provider-taxjar — TaxJar TaxProvider. Strong fit for US-focused
// merchants with B2B exemption certificates.

import type { TaxBreakdown, TaxCalculationRequest } from '@sparx/commerce-schemas';
import { ProviderUnsupportedError, registerProvider } from '@sparx/integration-framework';
import type {
  NormalizedAddress,
  ProviderBundle,
  ProviderMetadataDescriptor,
  ProviderRunContext,
  TaxProvider,
} from '@sparx/integration-framework';

const TAXJAR_SLUG = 'taxjar';

const taxjarMetadata: ProviderMetadataDescriptor = {
  slug: TAXJAR_SLUG,
  displayName: 'TaxJar',
  description:
    'Automatic US sales tax calculation across all 50 states plus 30+ countries. Strong exemption-certificate workflow (resale, manufacturing, agricultural) for B2B merchants. AutoFile filing service.',
  vendor: 'Stripe / TaxJar',
  kinds: ['tax'],
  supportedCurrencies: ['USD', 'CAD', 'EUR', 'GBP', 'AUD'],
  supportedCountries: ['US', 'CA', 'GB', 'AU', 'NZ', 'FR', 'DE', 'IT', 'ES'],
  sandboxAvailable: true,
  configSchemaJson: JSON.stringify({
    type: 'object',
    required: ['apiTokenRef'],
    properties: {
      apiTokenRef: { type: 'string', title: 'API token (Secret Manager ref)' },
      defaultShipFromAddress: {
        type: 'object',
        title: 'Default ship-from address',
        properties: {
          street: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string', minLength: 2, maxLength: 2 },
          zip: { type: 'string' },
          country: { type: 'string', minLength: 2, maxLength: 2 },
        },
      },
      enableAutoFile: {
        type: 'boolean',
        title: 'Enable AutoFile (automatic returns filing)',
        default: false,
      },
    },
  }),
  webhookPathTemplate: '/v1/webhooks/providers/taxjar/:installationId',
  requiredScopes: [],
};

function unimplemented(method: string): Promise<never> {
  return Promise.reject(new ProviderUnsupportedError('taxjar', `${method} (Phase 0 stub)`));
}

const taxjarTax: TaxProvider = {
  metadata: taxjarMetadata,
  calculateTax(_ctx: ProviderRunContext, _r: TaxCalculationRequest): Promise<TaxBreakdown> {
    return unimplemented('calculateTax');
  },
  validateAddress(): Promise<NormalizedAddress> {
    return unimplemented('validateAddress');
  },
  recordTransaction(): Promise<void> {
    return unimplemented('recordTransaction');
  },
  reverseTransaction(): Promise<void> {
    return unimplemented('reverseTransaction');
  },
};

export const taxjarBundle: ProviderBundle = {
  metadata: taxjarMetadata,
  tax: taxjarTax,
};

export function registerTaxjarProviders(): void {
  registerProvider(taxjarBundle);
}
