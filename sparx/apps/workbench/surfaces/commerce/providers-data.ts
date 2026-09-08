'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE PAYMENT PROVIDERS DATA LAYER
//
// A payment provider is the service that actually takes a customer's money and
// passes it to you. sparx supports several, described in a data-driven catalog
// the server owns (@wizeworks/payments GATEWAY_CATALOG). A shop:
//
//   • picks ONE active gateway (which one checkout uses);
//   • for "bring your own" gateways, saves their API keys, encrypted at rest —
//     the surface only ever sees whether keys are on file, never the keys;
//   • for sparx Pay, runs a Stripe-hosted onboarding and comes back connected.
//
// This is a REAL surface backed by /v1/commerce/payments/*. Nothing here is
// faked: selecting a gateway, saving keys, and launching onboarding all hit
// live endpoints. The one thing this surface cannot do is complete the hosted
// onboarding itself — that is Stripe's page — so it hands off to it honestly.
//
// ── Key contract ───────────────────────────────────────────────────────────
//   ['commerce','payments']                root every read nests under
//   ['commerce','payments','config']       active gateway + onboarding status
//   ['commerce','payments','catalog']      the gateway catalog (static per build)
//   ['commerce','payments','credentials']  the tenant's saved (masked) keys
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';

/* ── Shapes (mirror api-rest payments lib) ──────────────────────────────── */

export type GatewayOnboarding = 'sparx_hosted' | 'api_keys' | 'manual';
export type GatewayCheckout = 'inline' | 'redirect' | 'none';

export interface CredentialField {
  key: string;
  label: string;
  placeholder?: string;
  secret: boolean;
  help?: string;
  optional?: boolean;
}

export interface GatewayDescriptor {
  id: string;
  name: string;
  /** The company whose account and dashboard the owner actually has. The SHELF
   *  name has a different job — it has to distinguish "Your own Stripe" from the
   *  platform's own gateway — and putting that in a possessive produced "your
   *  Your own Stripe account" on screen. Absent means the shelf name reads
   *  correctly on its own (Square, PayPal). */
  processor?: string;
  tagline?: string;
  blurb: string;
  /** Whether a tenant can switch this on today. Absent means yes — a gateway that
   *  works does not declare it. `coming_soon` is a catalogued processor whose adapter
   *  is unwritten: it is listed so the shelf is honest, and every control for it stays
   *  inert. */
  availability?: 'available' | 'coming_soon';
  recommended?: boolean;
  onboarding: GatewayOnboarding;
  checkout: GatewayCheckout;
  capabilities: { refunds: boolean; capture: boolean; paymentLinks: boolean; webhooks: boolean };
  credentialFields: CredentialField[];
  environments: boolean;
  sparxFee: boolean;
  feeNote: string;
  regions: string[];
  docsUrl?: string;
}

export interface SparxPayStatus {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

export interface PaymentConfig {
  gatewayId: string;
  isActive: boolean;
  onboardedAt: string | null;
  sparxPay: SparxPayStatus;
  /** gatewayId → the URL this tenant must register in their OWN processor dashboard.
   *  Only bring-your-own gateways have one (sparx Pay's webhook is sparx's). */
  webhookUrls?: Record<string, string>;
}

export interface MaskedGatewayCredential {
  gatewayId: string;
  environment: 'sandbox' | 'production';
  status: string;
  publicMeta: Record<string, string>;
  hasSecrets: boolean;
  configuredAt: string;
}

export const paymentsKeys = {
  root: ['commerce', 'payments'] as const,
  config: ['commerce', 'payments', 'config'] as const,
  catalog: ['commerce', 'payments', 'catalog'] as const,
  credentials: ['commerce', 'payments', 'credentials'] as const,
};

/* ── Queries ────────────────────────────────────────────────────────────── */

export function usePaymentConfig() {
  return useQuery({
    queryKey: paymentsKeys.config,
    queryFn: () => api.get<PaymentConfig>('/v1/commerce/payments/config'),
  });
}

export function useGatewayCatalog() {
  return useQuery({
    queryKey: paymentsKeys.catalog,
    queryFn: () => api.get<GatewayDescriptor[]>('/v1/commerce/payments/catalog'),
    staleTime: 600_000,
  });
}

export function useGatewayCredentials() {
  return useQuery({
    queryKey: paymentsKeys.credentials,
    queryFn: () => api.get<MaskedGatewayCredential[]>('/v1/commerce/payments/credentials'),
  });
}

/* ── Mutations ──────────────────────────────────────────────────────────── */

function useInvalidatePayments() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: paymentsKeys.root });
}

export function useSelectGateway() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: (gatewayId: string) =>
      api.post<PaymentConfig>('/v1/commerce/payments/gateway', { gatewayId }),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export interface CaptureCredentialsInput {
  gatewayId: string;
  environment: 'sandbox' | 'production';
  fields: Record<string, string>;
}

export function useCaptureCredentials() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: (input: CaptureCredentialsInput) =>
      api.put<MaskedGatewayCredential>('/v1/commerce/payments/credentials', input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useDeleteCredentials() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: (gatewayId: string) => api.delete(`/v1/commerce/payments/credentials/${gatewayId}`),
    onSuccess: () => {
      void invalidate();
    },
  });
}

/** Start (or resume) sparx Pay's Stripe-hosted onboarding. Returns the URL the
 *  browser should send the merchant to; the flow completes on Stripe's page and
 *  returns to `returnUrl`. */
export function useStartSparxPayOnboarding() {
  return useMutation({
    mutationFn: (urls: { returnUrl: string; refreshUrl: string }) =>
      api.post<{ url: string; accountId: string }>('/v1/commerce/payments/sparx-pay/onboard', urls),
  });
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

export function paymentsErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

export interface GatewayState {
  /** success = live and charging cards; info = a state that is not money moving
   *  (chosen but not ready, live but charging nothing, not built yet); warning =
   *  keys saved on a provider checkout is not using.
   *
   *  ABSENT means colorless — a bare `.badge` resolving to base-content, which is
   *  the right ink for a row that carries no state at all. It used to say
   *  `neutral`, which named a color for "nothing has happened here" and made
   *  "Available" and "Coming soon" the same grey pill (root RULE #4: if an
   *  element distinguishes A from B, its color carries the distinction). */
  tone?: 'success' | 'info' | 'warning';
  label: string;
}

/**
 * How ONE gateway stands, from the config + its saved credentials. This is the
 * single place the surface reads status from, so the list row, the detail
 * heading and the action buttons never disagree.
 */
export function gatewayState(
  gateway: GatewayDescriptor,
  config: PaymentConfig | undefined,
  credential: MaskedGatewayCredential | undefined
): GatewayState {
  const isSelected = config?.gatewayId === gateway.id;

  // An UNBUILT gateway is never "Available", whatever else is true of it. The catalog
  // now carries entries whose adapter does not exist yet (PayPal), so that the shelf
  // can say sparx will support them instead of hiding them — and this is the surface
  // that must not then offer a control which would throw. Checked first: a tenant can
  // neither select nor save keys for something that cannot charge a card.
  if (gateway.availability === 'coming_soon') {
    return { tone: 'info', label: 'Coming soon' };
  }

  if (isSelected && config?.isActive) {
    // ACTIVE and CHARGING are two different facts, and this badge used to report
    // the first while claiming the second. A gateway whose checkout is 'none' is
    // switched on and takes no money: the row said "Active — taking payments" in
    // green, two lines under the pane's own sentence "nothing is charged online".
    // An online-only shop reading the badge would take every order unpaid.
    if (gateway.checkout === 'none') {
      return { tone: 'info', label: 'Active — no card payments' };
    }
    return { tone: 'success', label: 'Active — taking payments' };
  }
  if (isSelected) {
    // Selected as the active gateway, but not able to charge yet.
    if (gateway.onboarding === 'sparx_hosted') {
      return { tone: 'info', label: 'Chosen — finish setup to go live' };
    }
    if (gateway.onboarding === 'api_keys') {
      return { tone: 'info', label: 'Chosen — add your keys to go live' };
    }
    return { tone: 'info', label: 'Chosen' };
  }
  if (credential?.hasSecrets) {
    return { tone: 'warning', label: 'Keys saved — not your active provider' };
  }
  // Nothing has happened to this one. That is the absence of state, so the
  // badge wears no color rather than the color named "no color".
  return { label: 'Available' };
}

/**
 * The one-badge answer to "is my checkout charging cards?", for the shelf
 * header. It reads the same fact as {@link gatewayState}, so the header and the
 * row it summarises cannot end up saying different things.
 */
export function checkoutSummary(
  active: GatewayDescriptor | undefined,
  isActive: boolean
): GatewayState | null {
  if (!active || !isActive) return null;
  return active.checkout === 'none'
    ? { tone: 'info', label: 'No card payments' }
    : { tone: 'success', label: 'Taking payments' };
}
