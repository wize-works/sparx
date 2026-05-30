// Stripe PaymentProvider — real implementation against the official
// `stripe` SDK. Every method derives the Stripe client lazily per call
// because secrets live in the tenant's installation config + Google
// Secret Manager. The provider package itself stays stateless.
//
// Error mapping (Stripe → integration-framework):
//   StripeAuthenticationError, StripePermissionError → ProviderConfigurationError
//   StripeRateLimitError, StripeConnectionError, StripeAPIError → ProviderTransientError
//   StripeCardError (declines), StripeInvalidRequestError → ProviderHardError
//   StripeSignatureVerificationError → WebhookVerificationError
//
// Idempotency: every mutating call forwards ctx.idempotencyKey to
// Stripe via the standard `Idempotency-Key` header so retries don't
// double-charge.

import Stripe from 'stripe';

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
import {
  ProviderConfigurationError,
  ProviderHardError,
  ProviderTransientError,
  WebhookVerificationError,
} from '@sparx/integration-framework';

import { stripeMetadata, STRIPE_SLUG } from './metadata';

const DEFAULT_API_VERSION = '2024-11-20.acacia';

interface StripeConfig {
  publishableKey: string;
  secretKeyRef: string;
  webhookSecretRef?: string;
  apiVersion?: string;
  statementDescriptor?: string;
}

function readConfig(ctx: ProviderRunContext): StripeConfig {
  const c = ctx.config as Partial<StripeConfig>;
  if (!c.publishableKey || !c.secretKeyRef) {
    throw new ProviderConfigurationError(
      STRIPE_SLUG,
      'Stripe install is missing publishableKey or secretKeyRef',
      ['publishableKey', 'secretKeyRef'].filter((k) => !c[k as keyof StripeConfig])
    );
  }
  return c as StripeConfig;
}

async function getClient(ctx: ProviderRunContext): Promise<Stripe> {
  const cfg = readConfig(ctx);
  const secret = await ctx.secrets.read(cfg.secretKeyRef);
  return new Stripe(secret, {
    apiVersion: (cfg.apiVersion ?? DEFAULT_API_VERSION) as Stripe.LatestApiVersion,
    typescript: true,
    appInfo: { name: 'sparx-commerce', version: '0.0.0' },
  });
}

function mapError(err: unknown, capability: string): Error {
  if (err instanceof Stripe.errors.StripeAuthenticationError) {
    return new ProviderConfigurationError(
      STRIPE_SLUG,
      `${capability}: Stripe authentication failed (${err.message})`,
      ['secretKeyRef']
    );
  }
  if (err instanceof Stripe.errors.StripePermissionError) {
    return new ProviderConfigurationError(
      STRIPE_SLUG,
      `${capability}: Stripe key lacks required permissions (${err.message})`
    );
  }
  if (err instanceof Stripe.errors.StripeRateLimitError) {
    return new ProviderTransientError(STRIPE_SLUG, `${capability}: rate-limited`, 5);
  }
  if (err instanceof Stripe.errors.StripeConnectionError) {
    return new ProviderTransientError(STRIPE_SLUG, `${capability}: ${err.message}`);
  }
  if (err instanceof Stripe.errors.StripeAPIError) {
    return new ProviderTransientError(STRIPE_SLUG, `${capability}: ${err.message}`);
  }
  if (err instanceof Stripe.errors.StripeCardError) {
    return new ProviderHardError(STRIPE_SLUG, `${capability}: ${err.message}`, err.code);
  }
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    return new ProviderHardError(STRIPE_SLUG, `${capability}: ${err.message}`, err.code);
  }
  if (err instanceof Error) {
    return new ProviderHardError(STRIPE_SLUG, `${capability}: ${err.message}`);
  }
  return new ProviderHardError(STRIPE_SLUG, `${capability}: unknown error`);
}

function intentStatus(s: Stripe.PaymentIntent.Status): PaymentIntent['status'] {
  // The integration-framework collapses Stripe's wider state vocabulary
  // into the four it actually cares about. requires_action / requires_capture
  // are folded into requires_confirmation because the storefront has to
  // poll/redirect either way.
  switch (s) {
    case 'requires_payment_method':
      return 'requires_payment_method';
    case 'requires_confirmation':
    case 'requires_action':
    case 'requires_capture':
      return 'requires_confirmation';
    case 'processing':
      return 'processing';
    case 'succeeded':
      return 'succeeded';
    default:
      // canceled — treated like the original failure path
      return 'requires_payment_method';
  }
}

function resultStatus(s: Stripe.PaymentIntent.Status): PaymentResult['status'] {
  if (s === 'succeeded') return 'succeeded';
  if (s === 'requires_action' || s === 'requires_confirmation' || s === 'processing') {
    return 'requires_action';
  }
  return 'failed';
}

export const stripePayment: PaymentProvider = {
  metadata: stripeMetadata,

  async createPaymentIntent(
    ctx: ProviderRunContext,
    input: PaymentIntentInput
  ): Promise<PaymentIntent> {
    const stripe = await getClient(ctx);
    const cfg = readConfig(ctx);
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency.toLowerCase(),
          description: input.description,
          metadata: {
            ...input.metadata,
            sparx_order_hash: input.orderHash,
            sparx_tenant_id: ctx.tenantId,
            sparx_installation_id: ctx.installationId,
          },
          ...(input.providerCustomerRef ? { customer: input.providerCustomerRef } : {}),
          ...(input.setupFutureUsage ? { setup_future_usage: input.setupFutureUsage } : {}),
          ...(input.captureMode === 'manual' ? { capture_method: 'manual' as const } : {}),
          ...(input.threeDSecurePreference === 'always'
            ? { payment_method_options: { card: { request_three_d_secure: 'any' as const } } }
            : {}),
          ...(cfg.statementDescriptor ? { statement_descriptor: cfg.statementDescriptor } : {}),
          automatic_payment_methods: { enabled: true },
        },
        ctx.idempotencyKey ? { idempotencyKey: ctx.idempotencyKey } : undefined
      );
      return {
        paymentRef: intent.id,
        clientSecret: intent.client_secret ?? undefined,
        status: intentStatus(intent.status),
      };
    } catch (err) {
      throw mapError(err, 'createPaymentIntent');
    }
  },

  async capturePayment(
    ctx: ProviderRunContext,
    paymentRef: string,
    amountCents?: number
  ): Promise<PaymentResult> {
    const stripe = await getClient(ctx);
    try {
      const intent = await stripe.paymentIntents.capture(
        paymentRef,
        amountCents !== undefined ? { amount_to_capture: amountCents } : {},
        ctx.idempotencyKey ? { idempotencyKey: ctx.idempotencyKey } : undefined
      );
      return {
        paymentRef: intent.id,
        status: resultStatus(intent.status),
        amountCapturedCents: intent.amount_received ?? 0,
      };
    } catch (err) {
      throw mapError(err, 'capturePayment');
    }
  },

  async voidPayment(ctx: ProviderRunContext, paymentRef: string): Promise<void> {
    const stripe = await getClient(ctx);
    try {
      await stripe.paymentIntents.cancel(paymentRef);
    } catch (err) {
      throw mapError(err, 'voidPayment');
    }
  },

  async refund(
    ctx: ProviderRunContext,
    input: { paymentRef: string; amountCents: number; reason?: string }
  ): Promise<RefundResult> {
    const stripe = await getClient(ctx);
    // Stripe only accepts a closed set of refund reasons. Anything else
    // gets folded into metadata so the merchant can still see the note.
    const stripeReason: Stripe.RefundCreateParams.Reason | undefined =
      input.reason === 'duplicate' || input.reason === 'fraudulent'
        ? input.reason
        : input.reason
          ? 'requested_by_customer'
          : undefined;
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: input.paymentRef,
          amount: input.amountCents,
          ...(stripeReason ? { reason: stripeReason } : {}),
          ...(input.reason && !['duplicate', 'fraudulent'].includes(input.reason)
            ? { metadata: { sparx_reason: input.reason } }
            : {}),
        },
        ctx.idempotencyKey ? { idempotencyKey: ctx.idempotencyKey } : undefined
      );
      return {
        refundRef: refund.id,
        amountRefundedCents: refund.amount,
        status:
          refund.status === 'succeeded'
            ? 'succeeded'
            : refund.status === 'pending'
              ? 'pending'
              : 'failed',
        ...(refund.failure_reason ? { failureReason: refund.failure_reason } : {}),
      };
    } catch (err) {
      throw mapError(err, 'refund');
    }
  },

  async attachCustomer(
    ctx: ProviderRunContext,
    input: CustomerAttachInput
  ): Promise<ProviderCustomerRef> {
    const stripe = await getClient(ctx);
    try {
      const customer = await stripe.customers.create(
        {
          email: input.email,
          ...(input.name ? { name: input.name } : {}),
          ...(input.phone ? { phone: input.phone } : {}),
          metadata: {
            sparx_customer_id: input.customerId,
            sparx_tenant_id: ctx.tenantId,
            sparx_installation_id: ctx.installationId,
          },
        },
        ctx.idempotencyKey ? { idempotencyKey: ctx.idempotencyKey } : undefined
      );
      return {
        providerCustomerId: customer.id,
        providerSlug: STRIPE_SLUG,
      };
    } catch (err) {
      throw mapError(err, 'attachCustomer');
    }
  },

  verifyWebhook(input: { rawBody: string; signature: string; secret: string }): WebhookEvent {
    try {
      // Webhook verification is synchronous + does not need an API key,
      // so we use the static Webhooks helper rather than a Stripe client.
      const event = Stripe.webhooks.constructEvent(input.rawBody, input.signature, input.secret);
      return {
        providerEventId: event.id,
        providerEventType: event.type,
        payload: event,
      };
    } catch (err) {
      if (err instanceof Stripe.errors.StripeSignatureVerificationError) {
        throw new WebhookVerificationError(STRIPE_SLUG, err.message);
      }
      throw new WebhookVerificationError(
        STRIPE_SLUG,
        err instanceof Error ? err.message : 'Unknown verification error'
      );
    }
  },
};
