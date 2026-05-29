// Stripe PaymentProvider implementation. Phase 0 stub — Phase 5 wires
// the real `stripe` SDK calls inside each method. The shape is locked
// so consuming code in @sparx/commerce can be written against the
// interface today.

import type {
  CustomerAttachInput,
  PaymentIntent,
  PaymentIntentInput,
  PaymentProvider,
  PaymentResult,
  ProviderCustomerRef,
  ProviderRunContext,
  RefundResult,
  WebhookEvent,
} from '@sparx/integration-framework';
import { ProviderUnsupportedError } from '@sparx/integration-framework';

import { stripeMetadata } from './metadata';

function unimplemented(method: string): Promise<never> {
  return Promise.reject(new ProviderUnsupportedError('stripe', `${method} (Phase 0 stub)`));
}
function unimplementedSync(method: string): never {
  throw new ProviderUnsupportedError('stripe', `${method} (Phase 0 stub)`);
}

export const stripePayment: PaymentProvider = {
  metadata: stripeMetadata,

  createPaymentIntent(
    _ctx: ProviderRunContext,
    _input: PaymentIntentInput
  ): Promise<PaymentIntent> {
    return unimplemented('createPaymentIntent');
  },

  capturePayment(
    _ctx: ProviderRunContext,
    _paymentRef: string,
    _amountCents?: number
  ): Promise<PaymentResult> {
    return unimplemented('capturePayment');
  },

  voidPayment(_ctx: ProviderRunContext, _paymentRef: string): Promise<void> {
    return unimplemented('voidPayment');
  },

  refund(
    _ctx: ProviderRunContext,
    _input: { paymentRef: string; amountCents: number; reason?: string }
  ): Promise<RefundResult> {
    return unimplemented('refund');
  },

  attachCustomer(
    _ctx: ProviderRunContext,
    _input: CustomerAttachInput
  ): Promise<ProviderCustomerRef> {
    return unimplemented('attachCustomer');
  },

  verifyWebhook(_input: { rawBody: string; signature: string; secret: string }): WebhookEvent {
    return unimplementedSync('verifyWebhook');
  },
};
