'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE SHIPPING DATA LAYER
//
// Shipping decides what delivery options a shopper sees at checkout and what
// each one costs. Three things make that up:
//
//   • ZONES     — a region you deliver to (a set of countries). A zone holds the
//                 delivery options (rates) offered to anyone whose address falls
//                 in it. An empty country list means "anywhere".
//   • PROFILES  — a group of products that share delivery needs ("Standard
//                 goods", "Freight", "Frozen"). Most shops have exactly one.
//   • RATES     — one delivery option inside a zone: a name, a price, and how
//                 the price is worked out (flat, free over an amount, by weight,
//                 by order value, by item count). A rate belongs to one zone AND
//                 one profile.
//
// The shapes here mirror api-rest's shipping-service row types exactly, and the
// create inputs satisfy the Zod schemas in @wizeworks/commerce-schemas.
//
// ── Key contract ───────────────────────────────────────────────────────────
//   ['commerce','shipping']                     root every read nests under
//   ['commerce','shipping','zones']             the zone list
//   ['commerce','shipping','zones', id]         one zone
//   ['commerce','shipping','zones', id,'rates'] one zone's rates
//   ['commerce','shipping','profiles']          the profile list
//   ['commerce','shipping','profiles', id]      one profile
//
// Every write invalidates the ROOT so the list, the detail and the rate editor
// all refresh together.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import type {
  CreateShippingRateInput,
  ShippingRateType,
  ZoneTargeting,
} from '@wizeworks/commerce-schemas';
import { api } from '../../lib/api/client';

export type { ShippingRateType, ZoneTargeting };

/* ── Shapes (mirror shipping-service.ts row types) ──────────────────────── */

export interface ShippingZone {
  id: string;
  name: string;
  priority: number;
  targeting: ZoneTargeting;
  rateCount: number;
  updatedAt: string;
}

export interface ShippingProfile {
  id: string;
  name: string;
  description: string | null;
  allowedCarrierServices: string[];
  hazmatClassesAllowed: string[];
  requiresSignature: boolean;
  requiresFreight: boolean;
  productCount: number;
  variantCount: number;
  /** True for the ONE group everything not filed elsewhere ships under. Read
   *  this instead of testing for a member count of zero: two empty groups look
   *  identical, and only one of them is the default. */
  isDefault: boolean;
  collectionCount: number;
  updatedAt: string;
}

export interface ShippingRate {
  id: string;
  zoneId: string;
  profileId: string;
  name: string;
  type: string;
  amountCents: number | null;
  freeAboveCents: number | null;
  bands: { min: number; max?: number; amountCents: number }[] | null;
  currency: string;
  carrier: string | null;
  estimatedDeliveryDays: number | null;
}

export interface LiveRateReadiness {
  liveCarrierConnected: boolean;
  carrierSlugs: string[];
  shipFromComplete: boolean;
  shipFromIssue: string | null;
}

export const shippingKeys = {
  root: ['commerce', 'shipping'] as const,
  readiness: ['commerce', 'shipping', 'readiness'] as const,
  zones: ['commerce', 'shipping', 'zones'] as const,
  zone: (id: string) => ['commerce', 'shipping', 'zones', id] as const,
  zoneRates: (id: string) => ['commerce', 'shipping', 'zones', id, 'rates'] as const,
  profiles: ['commerce', 'shipping', 'profiles'] as const,
  profile: (id: string) => ['commerce', 'shipping', 'profiles', id] as const,
};

/* ── Queries ────────────────────────────────────────────────────────────── */

export function useShippingReadiness() {
  return useQuery({
    queryKey: shippingKeys.readiness,
    queryFn: () => api.get<LiveRateReadiness>('/v1/commerce/shipping/readiness'),
  });
}

export function useShippingZones() {
  return useQuery({
    queryKey: shippingKeys.zones,
    queryFn: () => api.list<ShippingZone>('/v1/commerce/shipping/zones', { take: 250 }),
  });
}

export function useShippingZone(id: string) {
  return useQuery({
    queryKey: shippingKeys.zone(id),
    queryFn: () => api.get<ShippingZone>(`/v1/commerce/shipping/zones/${id}`),
    enabled: id !== 'new',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

export function useShippingProfiles() {
  return useQuery({
    queryKey: shippingKeys.profiles,
    queryFn: () => api.list<ShippingProfile>('/v1/commerce/shipping/profiles', { take: 250 }),
  });
}

export function useShippingProfile(id: string) {
  return useQuery({
    queryKey: shippingKeys.profile(id),
    queryFn: () => api.get<ShippingProfile>(`/v1/commerce/shipping/profiles/${id}`),
    enabled: id !== 'new',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

export function useZoneRates(zoneId: string | null) {
  return useQuery({
    queryKey: zoneId ? shippingKeys.zoneRates(zoneId) : ['commerce', 'shipping', 'zones', 'none'],
    queryFn: () => api.get<ShippingRate[]>(`/v1/commerce/shipping/zones/${zoneId ?? ''}/rates`),
    enabled: Boolean(zoneId),
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

function useInvalidateShipping() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: shippingKeys.root });
}

/* ── Zone mutations ─────────────────────────────────────────────────────── */

export interface ZoneInput {
  name: string;
  targeting: ZoneTargeting;
  priority: number;
}

export function useCreateShippingZone() {
  const invalidate = useInvalidateShipping();
  return useMutation({
    mutationFn: (input: ZoneInput) =>
      api.post<{ id: string }>('/v1/commerce/shipping/zones', input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useUpdateShippingZone(id: string) {
  const invalidate = useInvalidateShipping();
  return useMutation({
    mutationFn: (input: ZoneInput) => api.patch(`/v1/commerce/shipping/zones/${id}`, input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useDeleteShippingZone(id: string) {
  const invalidate = useInvalidateShipping();
  return useMutation({
    mutationFn: () => api.delete(`/v1/commerce/shipping/zones/${id}`),
    onSuccess: () => {
      void invalidate();
    },
  });
}

/* ── Profile mutations ──────────────────────────────────────────────────── */

export interface ProfileInput {
  name: string;
  description?: string | null;
  requiresSignature: boolean;
  requiresFreight: boolean;
}

export function useCreateShippingProfile() {
  const invalidate = useInvalidateShipping();
  return useMutation({
    mutationFn: (input: ProfileInput) =>
      api.post<{ id: string }>('/v1/commerce/shipping/profiles', input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useUpdateShippingProfile(id: string) {
  const invalidate = useInvalidateShipping();
  return useMutation({
    mutationFn: (input: ProfileInput) => api.patch(`/v1/commerce/shipping/profiles/${id}`, input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useDeleteShippingProfile(id: string) {
  const invalidate = useInvalidateShipping();
  return useMutation({
    mutationFn: () => api.delete(`/v1/commerce/shipping/profiles/${id}`),
    onSuccess: () => {
      void invalidate();
    },
  });
}

/* ── Rate mutations ─────────────────────────────────────────────────────── */

export function useCreateShippingRate() {
  const invalidate = useInvalidateShipping();
  return useMutation({
    mutationFn: (input: CreateShippingRateInput) =>
      api.post<{ id: string }>('/v1/commerce/shipping/rates', input),
    onSuccess: () => {
      void invalidate();
    },
  });
}

export function useDeleteShippingRate() {
  const invalidate = useInvalidateShipping();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/v1/commerce/shipping/rates/${id}`),
    onSuccess: () => {
      void invalidate();
    },
  });
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

export function shippingErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

const RATE_TYPE_LABEL: Record<string, string> = {
  flat: 'A fixed price',
  free_above_threshold: 'Free over an amount',
  by_weight: 'Priced by weight',
  by_price: 'Priced by order value',
  by_item_count: 'Priced by number of items',
};

export function rateTypeLabel(type: string): string {
  return RATE_TYPE_LABEL[type] ?? type;
}
