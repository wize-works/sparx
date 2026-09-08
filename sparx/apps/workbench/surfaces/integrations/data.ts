'use client';

// Integrations data — every outside service this business can connect, from one
// endpoint.
//
// This used to read `/v1/commerce/providers/*`, which is why the panel showed two
// carriers and nothing else: those endpoints only ever knew about provider bundles.
// Card processors, marketplaces, social accounts, dropship suppliers and AI accounts
// each had their own screen somewhere else, so finding "how do I get paid" meant
// knowing it lived four tabs deep under commerce.
//
// `/v1/integrations` answers with the whole shelf, grouped by what the service DOES,
// with this business's own connections already resolved onto it. It is not behind the
// commerce module: a category the tenant cannot use comes back `unlocked: false` with
// the modules that would unlock it, so the panel explains rather than erroring — and
// an invoicing-only tenant can finally reach the payments catalog.
//
// Reads are viewer. Connecting and disconnecting stay with the surface that owns the
// category, because each one has its own flow (an OAuth redirect, a key form, a
// hosted onboarding) — this panel routes to them rather than reimplementing five
// connect experiences.

import { useQuery } from '@wizeworks/query';
import { api } from '../../lib/api/client';

/** Mirrors @wizeworks/integrations. `subscription_billing` and `identity` are absent
 *  because nothing implements either — see the note on IntegrationCategory there. */
export type IntegrationCategory =
  'payments' | 'shipping' | 'tax' | 'sales_channels' | 'social' | 'dropship' | 'ai';

/** Whether a tenant can connect this today, and if not, whose problem it is.
 *  `needs_platform_setup` is sparx's to finish, never the tenant's — the distinction
 *  is what lets a disabled control explain itself honestly. */
export type IntegrationAvailability = 'available' | 'needs_platform_setup' | 'coming_soon';

export type ConnectMethod = 'oauth' | 'api_keys' | 'sparx_hosted' | 'manual';

export interface CredentialField {
  key: string;
  label: string;
  help?: string;
  placeholder?: string;
  secret: boolean;
  required: boolean;
  type: 'text' | 'password' | 'select' | 'boolean' | 'url';
  options?: string[];
}

export interface ConnectionState {
  id: string | null;
  status: 'connected' | 'paused' | 'needs_setup' | 'not_working';
  label: string | null;
}

export interface Integration {
  category: IntegrationCategory;
  slug: string;
  name: string;
  vendor: string;
  blurb: string;
  /** `sparx` for first-party; an approved contributor's slug for an uploaded one. */
  publisher: string;
  availability: IntegrationAvailability;
  unavailableReason?: string;
  recommended?: boolean;
  connect: ConnectMethod;
  credentialFields: CredentialField[];
  capabilities: string[];
  regions?: string[];
  logoUrl?: string;
  docsUrl?: string;
  connection: ConnectionState | null;
}

export interface IntegrationCategoryView {
  category: IntegrationCategory;
  label: string;
  hint: string;
  unlocked: boolean;
  unlockedBy: string[];
  integrations: Integration[];
  connectedCount: number;
}

interface IntegrationsResponse {
  categories: IntegrationCategoryView[];
  connectedCount: number;
}

export const INTEGRATIONS_KEYS = {
  root: ['integrations'] as const,
  catalog: ['integrations', 'catalog'] as const,
};

export function useIntegrations() {
  return useQuery({
    queryKey: INTEGRATIONS_KEYS.catalog,
    queryFn: () => api.get<IntegrationsResponse>('/v1/integrations'),
    staleTime: 60_000,
  });
}

/* ── Presentation helpers ──────────────────────────────────────────────────── */

/** How a connection is doing, in words, with the tone that carries it. */
export function connectionState(connection: ConnectionState): {
  label: string;
  tone: 'success' | 'warning' | 'error' | 'info';
} {
  switch (connection.status) {
    case 'connected':
      return { label: 'Connected', tone: 'success' };
    case 'paused':
      return { label: 'Paused', tone: 'info' };
    case 'not_working':
      return { label: 'Not working', tone: 'error' };
    case 'needs_setup':
      return { label: 'Needs setup', tone: 'warning' };
  }
}

/** The sentence under a category a tenant has not unlocked. Names the modules in the
 *  owner's words rather than echoing slugs. */
const MODULE_LABEL: Record<string, string> = {
  commerce: 'Selling',
  invoicing: 'Invoicing',
  b2b: 'Wholesale',
  scheduling: 'Bookings',
  social: 'Social posting',
  dropship: 'Dropshipping',
  ai: 'AI',
};

export function lockedReason(view: IntegrationCategoryView): string {
  const names = view.unlockedBy.map((m) => MODULE_LABEL[m] ?? m);
  if (names.length === 0) return 'This is not available on your plan yet.';
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1] ?? ''}`;
  return `Turn on ${String(list)} to connect these.`;
}

/** Whether the connect control should be live. A `coming_soon` or
 *  `needs_platform_setup` entry stays visible and says why, rather than offering a
 *  button that fails. */
export function isConnectable(integration: Integration): boolean {
  return integration.availability === 'available';
}
