'use client';

// One provider connection — connecting a carrier or a tax service, and managing it
// afterwards.
//
// SCOPE. This is the CONNECT/MANAGE half for provider bundles specifically, on
// `/v1/commerce/providers/*`. The CATALOG half — what a business can connect, across
// every category — moved to `./data.ts` and `/v1/integrations`, because a shelf that
// only knew about provider bundles is exactly why the Integrations panel used to show
// two carriers while card processors lived four tabs away under commerce.
//
// The split is on purpose: each category connects differently (an OAuth redirect, a
// key form, a hosted onboarding), so the catalog routes to the surface that owns the
// flow instead of reimplementing five of them. This file owns one of those flows.
//
// Reads are viewer; connecting, changing and disconnecting are admin — mirrored with
// useViewer so a control never appears for someone the server will refuse.

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';

/** The kinds of service a provider can be — mirrors commerce-schemas ProviderKind. */
export type ProviderKind =
  'payment' | 'tax' | 'shipping' | 'subscription_billing' | 'dropship' | 'identity';

export type ProviderEnvironment = 'sandbox' | 'production';

export type ProviderInstallStatus =
  | 'pending_configuration'
  | 'pending_oauth'
  | 'pending_verification'
  | 'active'
  | 'errored'
  | 'disabled';

/** One available service in the catalog (what a business COULD connect). */
export interface ProviderMetadata {
  slug: string;
  displayName: string;
  description: string;
  vendor: string;
  logoMediaUrl?: string;
  kinds: ProviderKind[];
  supportedCurrencies: string[];
  supportedCountries: string[];
  sandboxAvailable: boolean;
  whitelabelOf?: string;
  configSchemaJson: string;
  webhookPathTemplate: string;
  requiredScopes: string[];
  secretFields: string[];
}

/** One of this business's own connections. */
export interface Installation {
  id: string;
  providerSlug: string;
  kind: ProviderKind;
  environment: ProviderEnvironment;
  enabled: boolean;
  status: ProviderInstallStatus;
  label: string | null;
  providerAccountId: string | null;
  lastHealthCheckAt: string | null;
  lastHealthStatus: string | null;
  errorCount: number;
  installedAt: string;
}

// Namespaced away from the catalog's `['integrations']` keys on purpose: connecting a
// carrier must not invalidate the whole shelf, and refetching the shelf must not
// discard a half-filled credentials form's cached metadata.
export const PROVIDER_CONNECTION_KEYS = {
  root: ['provider-connections'] as const,
  available: ['provider-connections', 'available'] as const,
  installations: ['provider-connections', 'installations'] as const,
  installation: (id: string) => ['provider-connections', 'installation', id] as const,
  metadata: (slug: string) => ['provider-connections', 'metadata', slug] as const,
};

/* ── Reads ─────────────────────────────────────────────────────────────────── */

export function useAvailableIntegrations() {
  return useQuery({
    queryKey: PROVIDER_CONNECTION_KEYS.available,
    queryFn: () => api.get<ProviderMetadata[]>('/v1/commerce/providers/available'),
    staleTime: 300_000,
    retry: false,
  });
}

export function useInstallations() {
  return useQuery({
    queryKey: PROVIDER_CONNECTION_KEYS.installations,
    queryFn: () => api.get<Installation[]>('/v1/commerce/providers/installations'),
    staleTime: 30_000,
    retry: false,
  });
}

export function useInstallation(id: string) {
  return useQuery({
    queryKey: PROVIDER_CONNECTION_KEYS.installation(id),
    queryFn: () => api.get<Installation>(`/v1/commerce/providers/installations/${id}`),
    enabled: id !== '' && id !== 'new',
  });
}

export function useProviderMetadata(slug: string | undefined) {
  return useQuery({
    queryKey: PROVIDER_CONNECTION_KEYS.metadata(slug ?? ''),
    queryFn: () => api.get<ProviderMetadata>(`/v1/commerce/providers/metadata/${slug ?? ''}`),
    enabled: !!slug,
    staleTime: 300_000,
  });
}

/* ── Writes ────────────────────────────────────────────────────────────────── */

function useInvalidate() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: PROVIDER_CONNECTION_KEYS.installations });
    if (id)
      void queryClient.invalidateQueries({ queryKey: PROVIDER_CONNECTION_KEYS.installation(id) });
  };
}

export interface InstallInput {
  providerSlug: string;
  kind: ProviderKind;
  environment: ProviderEnvironment;
  config: Record<string, unknown>;
  label?: string;
}

export function useInstallProvider() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: InstallInput) =>
      api.post<{ installationId: string; status: ProviderInstallStatus }>(
        '/v1/commerce/providers/install',
        input
      ),
    onSuccess: (result) => {
      invalidate(result.installationId);
    },
  });
}

export function useUpdateIntegrationConfig(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      api.patch<{ id: string; updated: boolean }>(
        `/v1/commerce/providers/installations/${id}/config`,
        { config }
      ),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function useSetIntegrationEnabled(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      api.post<{ id: string; updated: boolean }>(
        `/v1/commerce/providers/installations/${id}/enabled`,
        { enabled }
      ),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function useTestIntegration(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      api.post<{ ok: boolean; details: string }>(`/v1/commerce/providers/installations/${id}/test`),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function useDisconnectIntegration(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.delete(`/v1/commerce/providers/installations/${id}`),
    onSuccess: () => {
      invalidate();
    },
  });
}

/* ── Error helpers ─────────────────────────────────────────────────────────── */

/** True when the failure is "selling is switched off" rather than a real fault —
 *  the provider endpoints live behind the commerce module. */
export function isSellingDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'MODULE_DISABLED';
}

/** The server's own sentence for a 4xx (an unknown provider, a config field the
 *  provider rejected), worth showing verbatim. A 5xx falls back to the caller's
 *  wording. */
export function integrationErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/* ── Presentation helpers ──────────────────────────────────────────────────── */

/** The kind of service in the owner's words. */
export function kindLabel(kind: ProviderKind): string {
  switch (kind) {
    case 'shipping':
      return 'Shipping & delivery';
    case 'payment':
      return 'Card payments';
    case 'tax':
      return 'Sales tax';
    case 'subscription_billing':
      return 'Subscriptions & recurring payments';
    case 'dropship':
      return 'Dropship suppliers';
    case 'identity':
      return 'Identity checks';
  }
}

/** One line on what connecting a service of this kind does for the business. */
export function kindHint(kind: ProviderKind): string {
  switch (kind) {
    case 'shipping':
      return 'Live delivery prices, printed labels and tracking, straight from the carrier.';
    case 'payment':
      return 'Take card payments at checkout and have the money settled to your account.';
    case 'tax':
      return 'Work out the right sales tax for each order automatically.';
    case 'subscription_billing':
      return 'Charge customers on a repeating schedule for subscriptions and plans.';
    case 'dropship':
      return 'Send orders to a supplier who ships them to your customer for you.';
    case 'identity':
      return 'Confirm a customer is who they say they are before an order goes through.';
  }
}

/** Fixed display order for the kinds — the ones most businesses reach for first. */
export const KIND_ORDER: readonly ProviderKind[] = [
  'shipping',
  'payment',
  'tax',
  'subscription_billing',
  'dropship',
  'identity',
];

/** How a connection is doing, in words. `tone` feeds `<Badge color>` so state
 *  carries its own color. `enabled` overrides the raw status — a paused
 *  connection is paused whatever its last health said. */
export function installationState(installation: Installation): {
  label: string;
  tone: 'success' | 'warning' | 'error' | 'info';
  detail: string;
} {
  if (!installation.enabled) {
    return {
      label: 'Paused',
      tone: 'info',
      detail: 'This connection is switched off. Turn it back on when you want to use it again.',
    };
  }
  switch (installation.status) {
    case 'active':
      return {
        label: 'Connected',
        tone: 'success',
        detail: 'This connection is working and ready to use.',
      };
    case 'errored':
      return {
        label: 'Not working',
        tone: 'error',
        detail:
          'Something went wrong the last time this connection was used. Check your details and test it again.',
      };
    case 'pending_verification':
      return {
        label: 'Needs a quick test',
        tone: 'warning',
        detail: 'Almost there — test the connection once to switch it on.',
      };
    case 'pending_oauth':
      return {
        label: 'Finish connecting',
        tone: 'warning',
        detail: 'This connection still needs you to sign in to the other service and approve it.',
      };
    case 'pending_configuration':
    default:
      return {
        label: 'Needs setup',
        tone: 'warning',
        detail: 'A few details are still needed before this connection can be used.',
      };
  }
}

/* ── Config schema parsing ─────────────────────────────────────────────────── */

export type FieldType = 'text' | 'secret' | 'select' | 'boolean' | 'list';

export interface ConfigField {
  key: string;
  label: string;
  description?: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  defaultValue?: string;
}

interface RawSchemaProperty {
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: { type?: string };
}

/**
 * Turn a provider's JSON-Schema config into a flat list of fields the connect
 * form can render. Secret fields (API keys) become masked inputs; enums become
 * selects; string arrays become a comma-separated list; booleans a switch.
 * Anything unrecognised falls back to a plain text field so nothing goes
 * missing.
 */
export function parseConfigFields(metadata: ProviderMetadata): ConfigField[] {
  let schema: { required?: string[]; properties?: Record<string, RawSchemaProperty> };
  try {
    schema = JSON.parse(metadata.configSchemaJson) as typeof schema;
  } catch {
    return [];
  }
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const secrets = new Set(metadata.secretFields);

  return Object.entries(properties).map(([key, prop]) => {
    let type: FieldType = 'text';
    if (secrets.has(key)) type = 'secret';
    else if (Array.isArray(prop.enum) && prop.enum.length > 0) type = 'select';
    else if (prop.type === 'boolean') type = 'boolean';
    else if (prop.type === 'array') type = 'list';

    return {
      key,
      label: prop.title ?? key,
      description: prop.description,
      type,
      required: required.has(key),
      options: prop.enum,
      defaultValue: typeof prop.default === 'string' ? prop.default : undefined,
    };
  });
}
