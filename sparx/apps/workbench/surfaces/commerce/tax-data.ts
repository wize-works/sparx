'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE TAX DATA LAYER
//
// Tax settings decide how much tax is added at checkout, and where. Two things
// make that up:
//
//   • ZONES — a place you are registered to collect tax (a country, optionally
//             narrowed to one state/province). A zone is only charged when it is
//             switched ON **by a person** — see `zoneIsCollecting`, which is the
//             server's own rule imported rather than repeated. "Nexus" is the
//             legal word for "somewhere you have to collect tax" — usually
//             because you have a shop, an office, staff, or enough sales there.
//   • RATES — inside a zone, a named percentage ("California Sales Tax", 8.25%).
//             A zone can carry several (state + county, say); they add together.
//
// If an automatic-tax service (Avalara, TaxJar) is connected, it works the tax
// out for you and these manual rates are the fallback. Automatic status is read
// from the provider installations endpoint, so the surface tells the truth about
// which one is in charge.
//
// Shapes mirror api-rest's tax-service row types; inputs satisfy the Zod schemas
// in @wizeworks/commerce-schemas.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { zoneIsCollecting, type NexusType } from '@wizeworks/commerce-schemas';
import { api } from '../../lib/api/client';

export type { NexusType };
// The one definition of "is this place actually charging anything", shared with
// the checkout calculator. Drawing a badge from `isActive` alone is how a screen
// comes to say "Collecting" about a place that takes nothing.
export { zoneIsCollecting };

/* ── Shapes ─────────────────────────────────────────────────────────────── */

export interface TaxZone {
  id: string;
  country: string;
  region: string | null;
  nexusType: string;
  registrationNumber: string | null;
  registeredAt: string | null;
  isActive: boolean;
  /** When a signed-in person switched collection on here, if one ever did.
   *  Set by the server, never sent up. A place without it charges nothing. */
  activatedAt: string | null;
  rateCount: number;
}

export interface TaxRate {
  id: string;
  zoneId: string;
  name: string;
  rateBasisPoints: number;
  appliesToShipping: boolean;
  productTaxClass: string | null;
}

/** One connected integration, as api-rest's providerService serialises it. Used
 *  here only to answer "is automatic tax switched on?". */
export interface ProviderInstallation {
  id: string;
  providerSlug: string;
  kind: string;
  enabled: boolean;
  status: string;
  label: string | null;
}

export const taxKeys = {
  root: ['commerce', 'tax'] as const,
  zones: ['commerce', 'tax', 'zones'] as const,
  zone: (id: string) => ['commerce', 'tax', 'zones', id] as const,
  zoneRates: (id: string) => ['commerce', 'tax', 'zones', id, 'rates'] as const,
};

/* ── Queries ────────────────────────────────────────────────────────────── */

export function useTaxZones() {
  return useQuery({
    queryKey: taxKeys.zones,
    queryFn: () => api.list<TaxZone>('/v1/commerce/tax/zones', { take: 250 }),
  });
}

export function useTaxZone(id: string) {
  return useQuery({
    queryKey: taxKeys.zone(id),
    queryFn: () => api.get<TaxZone>(`/v1/commerce/tax/zones/${id}`),
    enabled: id !== 'new',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

export function useZoneTaxRates(zoneId: string | null) {
  return useQuery({
    queryKey: zoneId ? taxKeys.zoneRates(zoneId) : ['commerce', 'tax', 'zones', 'none'],
    queryFn: () => api.get<TaxRate[]>(`/v1/commerce/tax/zones/${zoneId ?? ''}/rates`),
    enabled: Boolean(zoneId),
  });
}

/** The connected tax integration (Avalara / TaxJar), if any is active. Shared
 *  with the payment providers surface's underlying endpoint but filtered to the
 *  tax kind. A failure here is non-fatal — the surface still shows manual zones. */
export function useAutomaticTaxProvider() {
  return useQuery({
    queryKey: ['commerce', 'providers', 'installations'],
    queryFn: () => api.get<ProviderInstallation[]>('/v1/commerce/providers/installations'),
    retry: false,
    select: (rows) =>
      rows.find((r) => r.kind === 'tax' && r.enabled && r.status === 'active') ?? null,
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

function useInvalidateTax() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: taxKeys.root });
}

/* ── Zone mutations ─────────────────────────────────────────────────────── */

export interface TaxZoneInput {
  country: string;
  region?: string;
  nexusType: NexusType;
  registrationNumber?: string;
  isActive: boolean;
}

export function useCreateTaxZone() {
  const invalidate = useInvalidateTax();
  return useMutation({
    mutationFn: (input: TaxZoneInput) => api.post<{ id: string }>('/v1/commerce/tax/zones', input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useUpdateTaxZone(id: string) {
  const invalidate = useInvalidateTax();
  return useMutation({
    mutationFn: (input: TaxZoneInput) => api.patch(`/v1/commerce/tax/zones/${id}`, input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useDeleteTaxZone(id: string) {
  const invalidate = useInvalidateTax();
  return useMutation({
    mutationFn: () => api.delete(`/v1/commerce/tax/zones/${id}`),
    onSuccess: () => {
      void invalidate();
    },
  });
}

/* ── Rate mutations ─────────────────────────────────────────────────────── */

export interface TaxRateInput {
  zoneId: string;
  name: string;
  rateBasisPoints: number;
  appliesToShipping: boolean;
}

export function useCreateTaxRate() {
  const invalidate = useInvalidateTax();
  return useMutation({
    mutationFn: (input: TaxRateInput) => api.post<{ id: string }>('/v1/commerce/tax/rates', input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useDeleteTaxRate() {
  const invalidate = useInvalidateTax();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/commerce/tax/rates/${id}`),
    onSuccess: () => {
      void invalidate();
    },
  });
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

export function taxErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/** A percentage from stored basis points: 825 → "8.25%". */
export function formatBasisPoints(bp: number): string {
  return `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;
}

/** A percentage a shop owner types ("8.25") → basis points (825). */
export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

const NEXUS_LABEL: Record<string, string> = {
  physical: 'You have a presence here',
  economic: 'Enough sales to owe tax here',
  voluntary: 'You chose to collect here',
};

export function nexusLabel(nexusType: string): string {
  return NEXUS_LABEL[nexusType] ?? nexusType;
}

/** A stored date as a day a shop owner would say out loud: "5 September 2026".
 *  Deliberately not a timestamp — the minute a switch was flipped is not a fact
 *  anybody running a shop needs. */
export function formatDay(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString(undefined, { dateStyle: 'long' });
}
