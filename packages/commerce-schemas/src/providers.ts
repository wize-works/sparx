// Provider installation + webhook event shapes — the marketplace plug-in
// model. Concrete provider packages (provider-stripe, provider-shippo,
// etc.) implement the interfaces in @sparx/integration-framework; this
// module defines the merchant-facing configuration shape.

import { z } from 'zod';

import { Uuid } from '@sparx/crm-schemas';

import { Currency } from './common';

export const ProviderKind = z.enum([
  'payment',
  'tax',
  'shipping',
  'subscription_billing',
  'dropship',
  'identity', // future
]);
export type ProviderKind = z.infer<typeof ProviderKind>;

export const ProviderEnvironment = z.enum(['sandbox', 'production']);
export type ProviderEnvironment = z.infer<typeof ProviderEnvironment>;

export const ProviderInstallStatus = z.enum([
  'pending_configuration',
  'pending_oauth',
  'pending_verification',
  'active',
  'errored',
  'disabled',
]);
export type ProviderInstallStatus = z.infer<typeof ProviderInstallStatus>;

// Public-facing metadata that any provider package exposes via its
// `metadata.ts`. The marketplace UI reads from this registry to render
// the install card.
export const ProviderMetadata = z.object({
  slug: z.string().min(1).max(63),
  displayName: z.string().min(1).max(127),
  description: z.string().max(2000),
  vendor: z.string().min(1).max(127), // "Stripe, Inc." | "Sparx"
  logoMediaUrl: z.string().url().optional(),
  kinds: z.array(ProviderKind).min(1),
  supportedCurrencies: z.array(Currency).default([]),
  supportedCountries: z
    .array(
      z
        .string()
        .length(2)
        .regex(/^[A-Z]{2}$/)
    )
    .default([]),
  sandboxAvailable: z.boolean().default(true),
  // The sparx-branded providers wrap a real provider under the hood;
  // surfacing the white-label flag lets the marketplace show a "powered
  // by Stripe" badge.
  whitelabelOf: z.string().max(63).optional(),
  // JSON Schema for the merchant configuration form. Renders in the
  // dashboard install dialog.
  configSchemaJson: z.string().max(50_000),
  // Webhook URL hint — the marketplace shows this so the merchant can
  // paste it into the provider's dashboard if the provider doesn't
  // support OAuth-driven webhook registration.
  webhookPathTemplate: z.string().max(127), // "/webhooks/providers/stripe/:installationId"
  // Required scopes / permissions the merchant must grant.
  requiredScopes: z.array(z.string().min(1).max(127)).default([]),
});
export type ProviderMetadata = z.infer<typeof ProviderMetadata>;

// ─── Installation ─────────────────────────────────────────────────────

export const InstallProviderInput = z.object({
  providerSlug: z.string().min(1).max(63),
  kind: ProviderKind,
  environment: ProviderEnvironment.default('production'),
  // Configuration values keyed by the JSON Schema's property names; the
  // service validates this against `metadata.configSchemaJson`. Secrets
  // (API keys, OAuth tokens) are stored encrypted via Secret Manager —
  // never in plaintext on the row.
  config: z.record(z.string(), z.unknown()),
  // Display label so a merchant can disambiguate two installs of the
  // same provider (e.g. "Stripe — US Entity" vs "Stripe — EU Entity").
  label: z.string().max(127).optional(),
});
export type InstallProviderInput = z.infer<typeof InstallProviderInput>;

export const UpdateProviderConfigInput = z.object({
  installationId: Uuid,
  config: z.record(z.string(), z.unknown()),
});
export type UpdateProviderConfigInput = z.infer<typeof UpdateProviderConfigInput>;

export const SetProviderEnabledInput = z.object({
  installationId: Uuid,
  enabled: z.boolean(),
});
export type SetProviderEnabledInput = z.infer<typeof SetProviderEnabledInput>;

export const TestProviderInput = z.object({
  installationId: Uuid,
  // Optional payload — for payment providers this triggers a $0 setup
  // intent; for shipping providers it requests a rate quote against a
  // test address; for tax providers it calculates tax for a test cart.
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type TestProviderInput = z.infer<typeof TestProviderInput>;

// ─── Webhook event ────────────────────────────────────────────────────

export const ProviderWebhookEventInput = z.object({
  installationId: Uuid,
  providerSlug: z.string().min(1).max(63),
  // Verified provider event type, e.g. "charge.succeeded".
  providerEventType: z.string().min(1).max(127),
  // Provider's idempotency key (Stripe `id`, Shippo `object_id`, etc.).
  providerEventId: z.string().min(1).max(255),
  signatureVerifiedAt: z.string().datetime(),
  rawPayload: z.record(z.string(), z.unknown()),
});
export type ProviderWebhookEventInput = z.infer<typeof ProviderWebhookEventInput>;
