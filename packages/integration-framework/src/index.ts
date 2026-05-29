// @sparx/integration-framework — provider plug-in SDK.
//
// Concrete provider packages (@sparx/provider-stripe, @sparx/provider-shippo,
// etc.) implement the interfaces below; the platform discovers them via
// the registry and calls them through providerService at request time.

export * from './context';
export * from './errors';
export * from './metadata';
export * from './registry';
export * from './webhook-router';
export * from './oauth';

export type {
  PaymentProvider,
  PaymentIntent,
  PaymentIntentInput,
  PaymentResult,
  RefundResult,
  CustomerAttachInput,
  ProviderCustomerRef,
  WebhookEvent,
} from './payment-provider';

export type { TaxProvider, NormalizedAddress } from './tax-provider';

export type { ShippingProvider, ShippingLabel, TrackingStatus } from './shipping-provider';

export type {
  SubscriptionBilling,
  SubscriptionPlanInput,
  ScheduleRef,
} from './subscription-billing';

export type {
  DropshipProvider,
  SupplierProduct,
  SupplierCatalogQuery,
  DropshipSubmitInput,
  DropshipSubmitResult,
} from './dropship-provider';
