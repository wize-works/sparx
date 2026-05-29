// @sparx/provider-paypal — Marketplace listing stub. Surfaces in the
// payments tab with a "Coming soon" badge; install attempts throw
// ProviderUnsupportedError until the full implementation lands.

import { ProviderUnsupportedError, registerProvider } from '@sparx/integration-framework';
import type {
  CustomerAttachInput,
  PaymentIntent,
  PaymentIntentInput,
  PaymentProvider,
  PaymentResult,
  ProviderBundle,
  ProviderCustomerRef,
  ProviderMetadataDescriptor,
  ProviderRunContext,
  RefundResult,
  WebhookEvent,
} from '@sparx/integration-framework';

const PAYPAL_SLUG = 'paypal';

const paypalMetadata: ProviderMetadataDescriptor = {
  slug: PAYPAL_SLUG,
  displayName: 'PayPal',
  description:
    'Accept PayPal balance, Venmo, and Pay Later. Coming soon — full integration scheduled for the next Commerce release.',
  vendor: 'PayPal Holdings, Inc.',
  kinds: ['payment'],
  supportedCurrencies: ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY'],
  supportedCountries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'NL', 'IT', 'ES', 'JP'],
  sandboxAvailable: true,
  configSchemaJson: JSON.stringify({
    type: 'object',
    description: 'PayPal integration is not yet available.',
    properties: {
      clientId: { type: 'string' },
      clientSecretRef: { type: 'string' },
    },
  }),
  webhookPathTemplate: '/v1/webhooks/providers/paypal/:installationId',
  requiredScopes: [],
};

function unimplemented(method: string): Promise<never> {
  return Promise.reject(
    new ProviderUnsupportedError('paypal', `${method} — PayPal integration is not yet available`)
  );
}
function unimplementedSync(method: string): never {
  throw new ProviderUnsupportedError(
    'paypal',
    `${method} — PayPal integration is not yet available`
  );
}

const paypalPayment: PaymentProvider = {
  metadata: paypalMetadata,
  createPaymentIntent(_c: ProviderRunContext, _i: PaymentIntentInput): Promise<PaymentIntent> {
    return unimplemented('createPaymentIntent');
  },
  capturePayment(): Promise<PaymentResult> {
    return unimplemented('capturePayment');
  },
  voidPayment(): Promise<void> {
    return unimplemented('voidPayment');
  },
  refund(): Promise<RefundResult> {
    return unimplemented('refund');
  },
  attachCustomer(_c: ProviderRunContext, _i: CustomerAttachInput): Promise<ProviderCustomerRef> {
    return unimplemented('attachCustomer');
  },
  verifyWebhook(): WebhookEvent {
    return unimplementedSync('verifyWebhook');
  },
};

export const paypalBundle: ProviderBundle = {
  metadata: paypalMetadata,
  payment: paypalPayment,
};

export function registerPaypalProviders(): void {
  registerProvider(paypalBundle);
}
