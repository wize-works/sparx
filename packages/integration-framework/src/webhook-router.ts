// Webhook router. Single ingress endpoint in services/api-rest
// (`/v1/webhooks/providers/:slug/:installationId`) hands the raw body +
// signature to this router, which resolves the bundle, verifies the
// signature, and emits a typed WebhookEvent the platform consumers
// (provider-webhook-worker) can process.

import type { ProviderRunContext } from './context';
import { WebhookVerificationError } from './errors';
import { getProvider } from './registry';

export interface InboundWebhook {
  providerSlug: string;
  installationId: string;
  rawBody: string;
  signature: string;
  /** Provider webhook signing secret, resolved from secret manager by
   *  the caller (api-rest route or worker) using the installation's
   *  configured secret-ref. */
  signingSecret: string;
}

export interface VerifiedWebhook {
  providerSlug: string;
  installationId: string;
  providerEventId: string;
  providerEventType: string;
  rawPayload: unknown;
}

/**
 * Verify a raw inbound webhook and return the parsed event. Throws
 * WebhookVerificationError when the signature can't be validated, or
 * `ProviderConfigurationError`-equivalent when the bundle doesn't
 * expose any verifier. Only PaymentProvider currently exposes
 * verifyWebhook; tax/shipping verification flows through the kind that
 * sent the event.
 */
export function verifyInboundWebhook(input: InboundWebhook): VerifiedWebhook {
  const bundle = getProvider(input.providerSlug);
  if (!bundle) {
    throw new WebhookVerificationError(input.providerSlug, 'Provider not registered');
  }
  // Payment is the predominant webhook source; fall through to other
  // kinds if a future provider implements verifyWebhook on a non-payment
  // surface.
  const paymentProvider = bundle.payment;
  if (!paymentProvider) {
    throw new WebhookVerificationError(
      input.providerSlug,
      'Provider does not implement verifyWebhook'
    );
  }
  const event = paymentProvider.verifyWebhook({
    rawBody: input.rawBody,
    signature: input.signature,
    secret: input.signingSecret,
  });
  return {
    providerSlug: input.providerSlug,
    installationId: input.installationId,
    providerEventId: event.providerEventId,
    providerEventType: event.providerEventType,
    rawPayload: event.payload,
  };
}

/**
 * Build a ProviderRunContext from an inbound webhook's installation
 * lookup. Callers supply the config + secrets they resolved from
 * commerce_provider_installations. This is the bridge function the
 * provider-webhook-worker uses to invoke downstream provider methods
 * (e.g. retrieve charge details) after verification succeeds.
 */
export function contextForWebhook(input: {
  tenantId: string;
  installationId: string;
  environment: 'sandbox' | 'production';
  config: Record<string, unknown>;
  secrets: ProviderRunContext['secrets'];
}): ProviderRunContext {
  return {
    tenantId: input.tenantId,
    installationId: input.installationId,
    environment: input.environment,
    config: input.config,
    secrets: input.secrets,
  };
}
