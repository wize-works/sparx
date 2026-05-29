// @sparx/provider-easypost — EasyPost ShippingProvider with freight
// support for oversized / palletized shipments.

import type { RateOption, ShipmentRequest } from '@sparx/commerce-schemas';
import { ProviderUnsupportedError, registerProvider } from '@sparx/integration-framework';
import type {
  ProviderBundle,
  ProviderMetadataDescriptor,
  ProviderRunContext,
  ShippingLabel,
  ShippingProvider,
  TrackingStatus,
} from '@sparx/integration-framework';

const EASYPOST_SLUG = 'easypost';

const easypostMetadata: ProviderMetadataDescriptor = {
  slug: EASYPOST_SLUG,
  displayName: 'EasyPost',
  description:
    'Multi-carrier with deep US coverage: USPS, UPS, FedEx, DHL, Lasership, OnTrac, freight (FedEx Freight, ABF, Estes, YRC, Saia). Real-time rates, label printing, scan-based returns.',
  vendor: 'EasyPost, Inc.',
  kinds: ['shipping'],
  supportedCurrencies: ['USD', 'CAD'],
  supportedCountries: ['US', 'CA'],
  sandboxAvailable: true,
  configSchemaJson: JSON.stringify({
    type: 'object',
    required: ['apiKeyRef'],
    properties: {
      apiKeyRef: {
        type: 'string',
        title: 'API key (Secret Manager ref)',
      },
      enabledCarriers: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['usps', 'ups', 'fedex', 'dhl_express', 'ontrac', 'lasership', 'fedex_freight'],
        },
        title: 'Enabled carriers',
      },
      defaultPackageType: {
        type: 'string',
        title: 'Default package type',
        default: 'Parcel',
      },
    },
  }),
  webhookPathTemplate: '/v1/webhooks/providers/easypost/:installationId',
  requiredScopes: [],
};

function unimplemented(method: string): Promise<never> {
  return Promise.reject(new ProviderUnsupportedError('easypost', `${method} (Phase 0 stub)`));
}

const easypostShipping: ShippingProvider = {
  metadata: easypostMetadata,
  rateShipment(_ctx: ProviderRunContext, _r: ShipmentRequest): Promise<RateOption[]> {
    return unimplemented('rateShipment');
  },
  buyLabel(): Promise<ShippingLabel> {
    return unimplemented('buyLabel');
  },
  track(): Promise<TrackingStatus> {
    return unimplemented('track');
  },
  voidLabel(): Promise<void> {
    return unimplemented('voidLabel');
  },
};

export const easypostBundle: ProviderBundle = {
  metadata: easypostMetadata,
  shipping: easypostShipping,
};

export function registerEasypostProviders(): void {
  registerProvider(easypostBundle);
}
