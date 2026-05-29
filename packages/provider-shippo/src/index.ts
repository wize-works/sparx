// @sparx/provider-shippo — Shippo ShippingProvider + Sparx Shipping
// white-label. Phase 0 stub: interface contracts in place, real Shippo
// SDK calls land in Phase 5.

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

const SHIPPO_SLUG = 'shippo';
const SPARX_SHIPPING_SLUG = 'sparx-shipping';

const shippoMetadata: ProviderMetadataDescriptor = {
  slug: SHIPPO_SLUG,
  displayName: 'Shippo',
  description:
    'Real-time rates across 85+ carriers (USPS, UPS, FedEx, DHL, Canada Post, Royal Mail). Label printing, tracking, returns.',
  vendor: 'Shippo, Inc.',
  kinds: ['shipping'],
  supportedCurrencies: ['USD', 'CAD', 'EUR', 'GBP'],
  supportedCountries: ['US', 'CA', 'GB', 'IE', 'AU'],
  sandboxAvailable: true,
  configSchemaJson: JSON.stringify({
    type: 'object',
    required: ['apiTokenRef'],
    properties: {
      apiTokenRef: {
        type: 'string',
        title: 'API token (Secret Manager ref)',
      },
      defaultCarrierAccounts: {
        type: 'array',
        items: { type: 'string' },
        title: 'Carrier account IDs to use by default',
      },
    },
  }),
  webhookPathTemplate: '/v1/webhooks/providers/shippo/:installationId',
  requiredScopes: [],
};

const sparxShippingMetadata: ProviderMetadataDescriptor = {
  slug: SPARX_SHIPPING_SLUG,
  displayName: 'Sparx Shipping',
  description:
    'One-click shipping with discounted USPS, UPS, and FedEx rates. No carrier accounts needed.',
  vendor: 'Sparx',
  kinds: ['shipping'],
  supportedCurrencies: ['USD'],
  supportedCountries: ['US'],
  sandboxAvailable: true,
  whitelabelOf: SHIPPO_SLUG,
  configSchemaJson: JSON.stringify({
    type: 'object',
    properties: {
      preferredCarrier: {
        type: 'string',
        enum: ['usps', 'ups', 'fedex'],
        title: 'Preferred carrier',
        default: 'usps',
      },
    },
  }),
  webhookPathTemplate: '/v1/webhooks/providers/sparx-shipping/:installationId',
  requiredScopes: [],
};

function unimplemented(method: string): Promise<never> {
  return Promise.reject(new ProviderUnsupportedError('shippo', `${method} (Phase 0 stub)`));
}

const shippoShipping: ShippingProvider = {
  metadata: shippoMetadata,
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

export const shippoBundle: ProviderBundle = {
  metadata: shippoMetadata,
  shipping: shippoShipping,
};

export const sparxShippingBundle: ProviderBundle = {
  metadata: sparxShippingMetadata,
  shipping: { ...shippoShipping, metadata: sparxShippingMetadata },
};

export function registerShippoProviders(): void {
  registerProvider(shippoBundle);
  registerProvider(sparxShippingBundle);
}
