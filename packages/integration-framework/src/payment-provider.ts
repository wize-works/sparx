// PaymentProvider — the contract every payment integration implements.
// Implementations live in @sparx/provider-stripe, @sparx/provider-paypal,
// etc. Picked at checkout time by `providerService.resolveActive('payment')`.

import type { Currency, MoneyCents } from '@sparx/commerce-schemas';

import type { ProviderRunContext } from './context';
import type { ProviderMetadataDescriptor } from './metadata';

export interface PaymentIntentInput {
  amountCents: MoneyCents;
  currency: Currency;
  /** Provider-specific customer reference; created via attachCustomer. */
  providerCustomerRef?: string;
  /** Stable hash of the cart line items + total, persisted on the
   *  checkout session so the provider can detect tampering. */
  orderHash: string;
  /** Surface a description on the provider's dashboard. */
  description: string;
  /** Free-form metadata: order_id, tenant_id, channel — provider stores
   *  alongside the charge for cross-system correlation. */
  metadata: Record<string, string>;
  /** Whether the provider should require 3DS / SCA. */
  threeDSecurePreference?: 'automatic' | 'always';
  /** When true the provider should set up the payment method for future
   *  off-session charges (subscriptions). */
  setupFutureUsage?: 'on_session' | 'off_session';
  /** Optional capture mode: automatic (default) or manual (authorize
   *  now, capture later via capturePayment). */
  captureMode?: 'automatic' | 'manual';
}

export interface PaymentIntent {
  paymentRef: string; // provider-internal ID
  clientSecret?: string; // for Stripe Elements / Apple Pay sheets
  redirectUrl?: string; // for PayPal / 3DS challenge flows
  status: 'requires_payment_method' | 'requires_confirmation' | 'processing' | 'succeeded';
}

export interface PaymentResult {
  paymentRef: string;
  status: 'succeeded' | 'failed' | 'requires_action';
  amountCapturedCents: MoneyCents;
  providerFee?: MoneyCents;
  failureReason?: string;
}

export interface RefundResult {
  refundRef: string;
  amountRefundedCents: MoneyCents;
  status: 'succeeded' | 'pending' | 'failed';
  failureReason?: string;
}

export interface CustomerAttachInput {
  customerId: string; // Sparx CRM Customer.id
  email: string;
  name?: string;
  phone?: string;
}

export interface ProviderCustomerRef {
  providerCustomerId: string;
  providerSlug: string;
}

export interface WebhookEvent {
  providerEventId: string;
  providerEventType: string;
  payload: unknown;
}

export interface PaymentProvider {
  /** Marketplace metadata — what the install card renders. */
  readonly metadata: ProviderMetadataDescriptor;

  createPaymentIntent(ctx: ProviderRunContext, input: PaymentIntentInput): Promise<PaymentIntent>;

  capturePayment(
    ctx: ProviderRunContext,
    paymentRef: string,
    amountCents?: MoneyCents
  ): Promise<PaymentResult>;

  voidPayment(ctx: ProviderRunContext, paymentRef: string): Promise<void>;

  refund(
    ctx: ProviderRunContext,
    input: { paymentRef: string; amountCents: MoneyCents; reason?: string }
  ): Promise<RefundResult>;

  attachCustomer(ctx: ProviderRunContext, input: CustomerAttachInput): Promise<ProviderCustomerRef>;

  /** Verify + parse a webhook payload. Throws WebhookVerificationError
   *  when the signature can't be validated. */
  verifyWebhook(input: { rawBody: string; signature: string; secret: string }): WebhookEvent;
}
