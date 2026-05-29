// @sparx/provider-avalara — Avalara AvaTax TaxProvider. Enterprise tier
// with global jurisdiction coverage and detailed audit trails.

import type { TaxBreakdown, TaxCalculationRequest } from '@sparx/commerce-schemas';
import { ProviderUnsupportedError, registerProvider } from '@sparx/integration-framework';
import type {
  NormalizedAddress,
  ProviderBundle,
  ProviderMetadataDescriptor,
  ProviderRunContext,
  TaxProvider,
} from '@sparx/integration-framework';

const AVALARA_SLUG = 'avalara';

const avalaraMetadata: ProviderMetadataDescriptor = {
  slug: AVALARA_SLUG,
  displayName: 'Avalara AvaTax',
  description:
    'Enterprise-grade tax compliance: AvaTax for calculation, CertCapture for exemption certificates, Returns for filing. 12,000+ tax jurisdictions globally.',
  vendor: 'Avalara, Inc.',
  kinds: ['tax'],
  supportedCurrencies: ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'NZD', 'JPY'],
  supportedCountries: [
    'US',
    'CA',
    'GB',
    'AU',
    'NZ',
    'FR',
    'DE',
    'IT',
    'ES',
    'NL',
    'BE',
    'PT',
    'JP',
    'BR',
    'MX',
  ],
  sandboxAvailable: true,
  configSchemaJson: JSON.stringify({
    type: 'object',
    required: ['accountId', 'licenseKeyRef', 'companyCode'],
    properties: {
      accountId: { type: 'string', title: 'Avalara account ID' },
      licenseKeyRef: { type: 'string', title: 'License key (Secret Manager ref)' },
      companyCode: { type: 'string', title: 'Company code in AvaTax' },
      environment: {
        type: 'string',
        enum: ['production', 'sandbox'],
        default: 'sandbox',
      },
      enableCertCapture: { type: 'boolean', default: false },
    },
  }),
  webhookPathTemplate: '/v1/webhooks/providers/avalara/:installationId',
  requiredScopes: [],
};

function unimplemented(method: string): Promise<never> {
  return Promise.reject(new ProviderUnsupportedError('avalara', `${method} (Phase 0 stub)`));
}

const avalaraTax: TaxProvider = {
  metadata: avalaraMetadata,
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

export const avalaraBundle: ProviderBundle = {
  metadata: avalaraMetadata,
  tax: avalaraTax,
};

export function registerAvalaraProviders(): void {
  registerProvider(avalaraBundle);
}
