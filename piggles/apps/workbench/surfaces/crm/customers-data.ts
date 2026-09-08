'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE CUSTOMER DATA LAYER
//
// A customer is anyone in the address book: a PROSPECT who has shown interest
// but not bought, a RETAIL buyer, or a B2B contact who belongs to a wholesale
// account. It is one record with a `type`, promoted between the three by editing
// that field — never a separate table. The write shapes mirror the CRM's own
// `CreateCustomerInput` / `UpdateCustomerInput` (Zod in `@wizeworks/crm-schemas`),
// named locally because that package is not a dependency of this app; the server
// runs that Zod on every write and has the final say on anything malformed.
//
// ── The key contract ──────────────────────────────────────────────────────
//
//   ['crm','customers']                 the root every read nests under
//   ['crm','customers','list',{…}]      one list window (search + filters)
//   ['crm','customers', id]             one customer, in full
//   ['crm','customers', id,'addresses'] that customer's postal addresses
//
// Every write invalidates the ROOT prefix, so a new, edited or removed customer
// shows correctly in the list and the detail at once.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import type { CustomerType, LeadStatus, LifecycleStage } from '@wizeworks/crm-schemas';
import { api } from '../../lib/api/client';

// Classification is three orthogonal axes (docs/137), each enum straight from
// `@wizeworks/crm-schemas` (the server's own Zod) so nothing can drift: `type` is the
// RELATIONSHIP (retail/b2b/partner/vendor), `lifecycleStage` is where they are in
// the journey, `leadStatus` is the micro work-state. `CustomerInput` below stays a
// local, narrow write PAYLOAD (only the fields this pane sends) on purpose — the
// same house pattern as `DiscountInput` in commerce.
export type { CustomerType, LifecycleStage, LeadStatus };

/* ── Shapes ─────────────────────────────────────────────────────────────── */

/** One customer in full, as the detail pane edits it. Mirrors the serialized
 *  Prisma `Customer` the CRM customer-service returns — money is a Decimal, so
 *  it arrives as a STRING (coerce with `Number`), and every date is an ISO
 *  string. Only the fields this app reads are named, so a wider row can never
 *  quietly become a dependency. */
export interface Customer {
  id: string;
  type: CustomerType;
  lifecycleStage: LifecycleStage;
  leadStatus: LeadStatus | null;
  propertyId: string | null;
  companyId: string | null;
  assignedRepId: string | null;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  preferredContactMethod: string | null;
  doNotContact: boolean;
  tags: string[];
  /** The extra details this business declared on contacts (docs/144 §3). Its
   *  shape is per-tenant, so it stays an open bag here and is rendered by
   *  reading the tenant's own property schema. */
  customProperties: Record<string, unknown>;
  /** Optional profile photo — a MediaAsset id, resolved to a URL for display. */
  avatarMediaAssetId: string | null;
  /** Money RECEIVED. Serialized Prisma Decimal — a string like `"1234.50"`. */
  totalSpent: string;
  /** What their orders are WORTH, net of refunds — the other half of the same
   *  question, and the one a shop taking manual payment lives on. */
  totalOrdered: string;
  orderCount: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  /** What this business's own scoring rules make of them (docs/144 §10). Zero
   *  until a tenant writes a model, which is why the score panel says so rather
   *  than showing a confident 0. */
  score: number;
  /** When the score was last worked out. Null means it never has been. */
  scoredAt: string | null;
  /** A standing hand adjustment, in points, that survives re-scoring — so the
   *  panel can say "your rules say 50, your +10 makes it 60" rather than
   *  promising the adjustment will be thrown away. Zero for almost everybody. */
  scoreOffset: number;
  createdAt: string;
  updatedAt: string;
}

/** One postal address on a customer. Added, edited and removed from the
 *  customer's Details tab. */
export interface CustomerAddress {
  id: string;
  type: string;
  label: string | null;
  isDefault: boolean;
  recipientName: string | null;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
}

export type CustomerSort =
  'score' | 'lastOrderAt' | 'totalSpent' | 'totalOrdered' | 'updatedAt' | 'createdAt';

export interface CustomerListParams {
  q?: string;
  type?: CustomerType;
  lifecycleStage?: LifecycleStage;
  leadStatus?: LeadStatus;
  sortBy?: CustomerSort;
  assignedRepId?: string;
  companyId?: string;
}

/** One file attached to a customer. The bytes live in the media pipeline; this
 *  is the link + a label. Resolve `mediaAssetId` to a name/URL with the media
 *  hooks. */
export interface CustomerDocument {
  id: string;
  mediaAssetId: string;
  label: string | null;
  createdAt: string;
}

export const customerKeys = {
  all: ['crm', 'customers'] as const,
  list: (params: CustomerListParams) => [...customerKeys.all, 'list', params] as const,
  detail: (id: string) => [...customerKeys.all, id] as const,
  addresses: (id: string) => [...customerKeys.all, id, 'addresses'] as const,
  documents: (id: string) => [...customerKeys.all, id, 'documents'] as const,
};

/* ── Queries ────────────────────────────────────────────────────────────── */

export function useCustomers(params: CustomerListParams) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () =>
      api.list<Customer>('/v1/crm/customers', {
        ...(params.q?.trim() ? { q: params.q.trim() } : {}),
        ...(params.type ? { type: params.type } : {}),
        ...(params.lifecycleStage ? { lifecycle_stage: params.lifecycleStage } : {}),
        ...(params.leadStatus ? { lead_status: params.leadStatus } : {}),
        ...(params.sortBy ? { sort_by: params.sortBy } : {}),
        ...(params.assignedRepId ? { assigned_rep_id: params.assignedRepId } : {}),
        ...(params.companyId ? { b2b_account_id: params.companyId } : {}),
        take: 100,
      }),
    placeholderData: (previous) => previous,
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => api.get<Customer>(`/v1/crm/customers/${id}`),
    enabled: id !== 'new',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

export function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: customerKeys.all });
    if (id) void queryClient.invalidateQueries({ queryKey: customerKeys.detail(id) });
  };
}

/* ── Mutations ──────────────────────────────────────────────────────────── */

/** The exact write payload — a subset of `CreateCustomerInput`. `null` clears a
 *  field; an absent key leaves it untouched on a PATCH. */
export interface CustomerInput {
  type: CustomerType;
  lifecycleStage: LifecycleStage;
  leadStatus?: LeadStatus | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  companyId?: string | null;
  assignedRepId?: string | null;
  preferredContactMethod?: 'email' | 'phone' | 'sms' | null;
  doNotContact?: boolean;
  tags?: string[];
  /** Merged onto what is stored — sending one detail changes only that one. */
  customProperties?: Record<string, unknown>;
  /** A MediaAsset id for the profile photo; `null` clears it. */
  avatarMediaAssetId?: string | null;
}

export function useCreateCustomer() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: (input: CustomerInput) => api.post<Customer>('/v1/crm/customers', input),
    onSuccess: (created) => {
      invalidate(created.id);
    },
  });
}

export function useUpdateCustomer(id: string) {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: (patch: Partial<CustomerInput>) =>
      api.patch<Customer>(`/v1/crm/customers/${id}`, patch),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function useDeleteCustomer(id: string) {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: () => api.delete(`/v1/crm/customers/${id}`),
    onSuccess: () => {
      invalidate();
    },
  });
}

/* ── Errors ─────────────────────────────────────────────────────────────── */

/** The server's own sentence for a 4xx is worth showing verbatim (it names the
 *  exact field); a 5xx has no such sentence, so it falls back to the caller's. */
export function customerErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}
