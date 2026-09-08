'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE DROPSHIP DATA LAYER
//
// Dropshipping is when another business — a SUPPLIER — holds the stock and posts
// it to your customer for you. This layer talks to the dropship API in api-rest
// and hands every dropship surface the same typed shapes and cache keys.
//
// Four things live under dropshipping, and this file is the one door to each:
//   • SUPPLIERS      — the connections you hold, their health, and their pricing.
//   • CATALOG        — what one supplier offers, and which of it you have imported.
//   • ORDERS         — the supplier orders your customer orders were routed into.
//   • PROFITABILITY  — what you paid a supplier against what a customer paid you.
//
// ── The key contract ──────────────────────────────────────────────────────
//
//   ['dropship']                                  the root every read nests under
//   ['dropship','suppliers','list',{…}]           the suppliers list window
//   ['dropship','suppliers', id]                  one supplier, in full
//   ['dropship','vendors']                        the connectable supplier types
//   ['dropship','catalog', supplierId, {q}]       one supplier's catalog window
//   ['dropship','orders','list',{…}]              the supplier-orders window
//   ['dropship','orders', id]                     one supplier order
//   ['dropship','analytics',{…}]                  the profitability summary
//   ['dropship','reports', kind, {…}]             the reporting reads
//
// Every write invalidates the ['dropship'] ROOT, so a connect, edit, sync,
// import or delete is reflected across the list, the detail and the catalog at
// once.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';

/* ── Semantic tone (shared with the Badge/Button color axis) ────────────── */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** Sort direction shared by every server-sorted list. */
export type SortDir = 'asc' | 'desc';

/* ── Money ──────────────────────────────────────────────────────────────── */

export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
}

/** Whole-dollar money for headline figures where the cents are just noise. */
export function formatCentsRounded(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/* ── Supplier types (vendors) ───────────────────────────────────────────── */

export type SupplierType = 'csv' | 'dsers' | 'spocket' | 'printify' | 'printful';

/** One credential input a vendor asks for when connecting. Mirrors the api's
 *  `VendorCredentialField` — fetched, never hardcoded, so the form can never
 *  drift from what the adapter actually needs. */
export interface VendorCredentialField {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  placeholder?: string;
  help?: string;
  required: boolean;
}

export interface VendorCapabilities {
  catalogSync: boolean;
  orderSubmission: boolean;
  trackingSync: boolean;
  inventorySync: boolean;
}

/** A connectable supplier type, as `GET /v1/dropship/vendors` returns it. */
export interface Vendor {
  slug: SupplierType;
  label: string;
  tagline: string;
  description: string;
  connectionMethod: 'api' | 'manual';
  pod: boolean;
  credentialFields: VendorCredentialField[];
  capabilities: VendorCapabilities;
  credentialsHelpUrl?: string;
}

/* ── Pricing rule ───────────────────────────────────────────────────────── */

export type PricingRuleType = 'percentage_markup' | 'multiplier' | 'flat_markup' | 'fixed_margin';

export interface PricingRule {
  type: PricingRuleType;
  value: number;
  roundTo?: 'cent' | 'dollar' | 'five_dollar';
  maxMsrp?: 'use_supplier_msrp';
}

/** What a pricing rule does, in the owner's words. Null rule = "use the price
 *  the supplier suggests", which is the API's own fallback. */
export function pricingRuleLabel(rule: PricingRule | null): string {
  if (!rule) return 'Use the price the supplier suggests';
  switch (rule.type) {
    case 'percentage_markup':
      return `Add ${String(rule.value)}% on top of what the supplier charges you`;
    case 'multiplier':
      return `Charge ${String(rule.value)}× what the supplier charges you`;
    case 'flat_markup':
      return `Add ${formatCents(rule.value)} on top of what the supplier charges you`;
    case 'fixed_margin':
      return `Price so you keep ${String(rule.value)}% of every sale`;
  }
}

/* ── Supplier ───────────────────────────────────────────────────────────── */

export type SupplierStatus = 'connecting' | 'active' | 'error' | 'disconnected';

/** One supplier connection, as `toSupplierView` serializes it. Secrets are NEVER
 *  in here — only `credentialsSet` says whether a usable token is on file. */
export interface Supplier {
  id: string;
  name: string;
  type: SupplierType;
  status: SupplierStatus;
  lastSyncAt: string | null;
  pricingRule: PricingRule | null;
  notes: string | null;
  /** The credential field spec for this vendor type — so the edit form renders
   *  the right inputs without a separate vendors fetch. Field SHAPE, never values. */
  credentialFields: VendorCredentialField[];
  /** Whether a usable token is stored, so the form shows "saved / replace"
   *  rather than forcing a re-entry to change anything else. */
  credentialsSet: boolean;
  vendorLabel: string;
  /** Property (site) ids this connection is enabled on. Empty = every site. */
  siteScope: string[];
  /** How many products from this supplier's catalog we hold. Null on the
   *  single-supplier reads that don't count (create/get/patch). */
  productCount: number | null;
  createdAt: string;
  updatedAt: string;
}

/** What a supplier connection is doing, in words a person can act on. */
export function supplierState(status: SupplierStatus): {
  label: string;
  tone: Tone;
  detail: string;
} {
  switch (status) {
    case 'active':
      return {
        label: 'Connected',
        tone: 'success',
        detail: 'Working normally — its catalog can be synced and orders can be routed to it.',
      };
    case 'connecting':
      return {
        label: 'Connecting',
        tone: 'info',
        detail: 'Still setting up the connection. This usually clears on its own in a moment.',
      };
    case 'error':
      return {
        label: 'Needs attention',
        tone: 'danger',
        detail:
          'The connection is not working — usually a token that has expired or been revoked. Re-enter its details to fix it.',
      };
    case 'disconnected':
      return {
        label: 'Disconnected',
        tone: 'neutral',
        detail: 'This connection has been removed and no longer syncs or receives orders.',
      };
  }
}

/** The columns the suppliers table can sort by — EXACTLY the server's whitelist. */
export type SupplierSort = 'name' | 'status' | 'createdAt' | 'lastSyncAt';

export interface SuppliersPageParams {
  q?: string;
  status?: string;
  sortBy: SupplierSort;
  order: SortDir;
  take: number;
  skip: number;
}

export const supplierKeys = {
  all: ['dropship'] as const,
  options: ['dropship', 'suppliers', 'options'] as const,
  page: (params: SuppliersPageParams) => ['dropship', 'suppliers', 'page', params] as const,
  detail: (id: string) => ['dropship', 'suppliers', id] as const,
  vendors: ['dropship', 'vendors'] as const,
};

export function useVendors() {
  return useQuery({
    queryKey: supplierKeys.vendors,
    queryFn: () => api.get<Vendor[]>('/v1/dropship/vendors'),
    // The vendor catalog is static config — no need to re-fetch it constantly.
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * Every supplier, name-sorted — for the dropdowns and name lookups on the orders
 * and products surfaces. Deliberately NOT paged: it feeds a `<Select>` and a
 * `supplierId → name` map, which want the whole (small, bounded) set, not a
 * window of it. The suppliers TABLE uses `useSuppliersPage`.
 */
export function useSuppliers() {
  return useQuery({
    queryKey: supplierKeys.options,
    queryFn: () =>
      api.list<Supplier>('/v1/dropship/suppliers', { sort_by: 'name', order: 'asc', take: 250 }),
    placeholderData: (previous) => previous,
  });
}

/** The suppliers TABLE window — one server query per visible window, server
 *  sorted and paged (never a client sort of a loaded page). */
export function useSuppliersPage(params: SuppliersPageParams) {
  return useQuery({
    queryKey: supplierKeys.page(params),
    queryFn: () =>
      api.list<Supplier>('/v1/dropship/suppliers', {
        ...(params.q?.trim() ? { q: params.q.trim() } : {}),
        ...(params.status && params.status !== 'all' ? { status: params.status } : {}),
        sort_by: params.sortBy,
        order: params.order,
        take: params.take,
        skip: params.skip,
      }),
    placeholderData: (previous) => previous,
  });
}

export function useSupplier(id: string) {
  return useQuery({
    queryKey: supplierKeys.detail(id),
    queryFn: () => api.get<Supplier>(`/v1/dropship/suppliers/${id}`),
    enabled: id !== 'new',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

export function useInvalidateDropship() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: supplierKeys.all });
    if (id) void queryClient.invalidateQueries({ queryKey: supplierKeys.detail(id) });
  };
}

/* ── Supplier mutations ─────────────────────────────────────────────────── */

export interface SupplierCreateInput {
  name: string;
  type: SupplierType;
  credentials: Record<string, string>;
  pricingRule?: PricingRule | null;
  notes?: string | null;
  siteScope?: string[];
}

export interface SupplierPatchInput {
  name?: string;
  credentials?: Record<string, string>;
  pricingRule?: PricingRule | null;
  notes?: string | null;
  siteScope?: string[];
}

export function useCreateSupplier() {
  const invalidate = useInvalidateDropship();
  return useMutation({
    mutationFn: (input: SupplierCreateInput) => api.post<Supplier>('/v1/dropship/suppliers', input),
    onSuccess: (created) => {
      invalidate(created.id);
    },
  });
}

export function useUpdateSupplier(id: string) {
  const invalidate = useInvalidateDropship();
  return useMutation({
    mutationFn: (patch: SupplierPatchInput) =>
      api.patch<Supplier>(`/v1/dropship/suppliers/${id}`, patch),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function useDeleteSupplier(id: string) {
  const invalidate = useInvalidateDropship();
  return useMutation({
    mutationFn: () => api.delete(`/v1/dropship/suppliers/${id}`),
    onSuccess: () => {
      invalidate();
    },
  });
}

export interface SyncResult {
  supplierId: string;
  status: string;
  publishesConfirmed: number;
}

export function useSyncSupplier(id: string) {
  const invalidate = useInvalidateDropship();
  return useMutation({
    mutationFn: () => api.post<SyncResult>(`/v1/dropship/suppliers/${id}/sync`),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

/* ── Products (the cross-supplier catalog) ──────────────────────────────── */

export type LinkStatus = 'active' | 'discontinued';

export interface CatalogVariant {
  supplierSku: string;
  title: string;
  options: Record<string, string>;
  costPriceCents: number;
  msrpCents: number | null;
  available?: boolean;
}

/** One product in a supplier's catalog, as `toDropshipProductView` returns it. */
export interface CatalogProduct {
  id: string;
  supplierProductId: string;
  title: string;
  description: string | null;
  images: string[];
  variants: CatalogVariant[];
  costPriceCents: number;
  msrpCents: number | null;
  importedAt: string;
  updatedAt: string;
  /** Whether you have already imported this into your own catalog. */
  isImported: boolean;
  /** The commerce publish state of the imported product (draft/active/archived),
   *  which is what actually governs whether it shows on your site. Null until
   *  imported. */
  productStatus: string | null;
  links: { id: string; productId: string; status: LinkStatus }[];
}

/** A catalog product carrying its owning supplier — the `GET /dropship/products`
 *  aggregate row, so the products table is one server query rather than a client
 *  fan-out across every supplier. */
export interface AggregateProduct extends CatalogProduct {
  supplierId: string;
  supplierName: string;
}

/** The columns the products table can sort by — EXACTLY the server's whitelist. */
export type ProductSort = 'title' | 'costPriceCents' | 'importedAt';

export interface ProductsPageParams {
  supplierId?: string;
  /** `imported` = in your catalog; `available` = offered but not imported. */
  status?: 'imported' | 'available';
  q?: string;
  sortBy: ProductSort;
  order: SortDir;
  take: number;
  skip: number;
}

export function useDropshipProducts(params: ProductsPageParams) {
  return useQuery({
    queryKey: ['dropship', 'products', 'page', params],
    queryFn: () =>
      api.list<AggregateProduct>('/v1/dropship/products', {
        ...(params.supplierId ? { supplierId: params.supplierId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.q?.trim() ? { q: params.q.trim() } : {}),
        sort_by: params.sortBy,
        order: params.order,
        take: params.take,
        skip: params.skip,
      }),
    placeholderData: (previous) => previous,
  });
}

export interface ImportResult {
  productId: string;
  linkId: string;
  variantCount: number;
}

export function useImportProduct(supplierId: string) {
  const invalidate = useInvalidateDropship();
  return useMutation({
    mutationFn: (productId: string) =>
      api.post<ImportResult>(`/v1/dropship/suppliers/${supplierId}/catalog/${productId}/import`),
    onSuccess: () => {
      invalidate();
    },
  });
}

export interface ReimportResult {
  productId: string;
  imagesAdded: number;
  optionsAdded: number;
  unavailableVariants: number;
}

export function useReimportProduct(supplierId: string) {
  const invalidate = useInvalidateDropship();
  return useMutation({
    mutationFn: (productId: string) =>
      api.post<ReimportResult>(
        `/v1/dropship/suppliers/${supplierId}/catalog/${productId}/reimport`
      ),
    onSuccess: () => {
      invalidate();
    },
  });
}

/** What an imported catalog product is doing on your site — the commerce publish
 *  state folded together with the link's own health. */
export function importState(product: CatalogProduct): { label: string; tone: Tone } | null {
  if (!product.isImported) return null;
  if (product.links.some((l) => l.status === 'discontinued')) {
    return { label: 'Supplier stopped making it', tone: 'danger' };
  }
  switch (product.productStatus) {
    case 'active':
      return { label: 'On sale', tone: 'success' };
    case 'draft':
      return { label: 'Imported, not on sale', tone: 'info' };
    case 'archived':
      return { label: 'Archived', tone: 'neutral' };
    default:
      return { label: 'Imported', tone: 'info' };
  }
}

/* ── Supplier orders ────────────────────────────────────────────────────── */

export type DropshipOrderStatus =
  'pending' | 'submitted' | 'shipped' | 'delivered' | 'failed' | 'cancelled';

export interface DropshipOrderLineItem {
  sku?: string;
  quantity?: number;
  unitPriceCents?: number;
  [key: string]: unknown;
}

/** One supplier order, as `toOrderView` serializes it. `orderId` is YOUR commerce
 *  order it was routed from; `supplierOrderId` is the supplier's own reference. */
export interface DropshipOrder {
  id: string;
  orderId: string;
  /** The customer order's human number (e.g. "1043"), or null. */
  orderNumber: string | null;
  supplierId: string;
  supplierOrderId: string | null;
  status: DropshipOrderStatus;
  trackingNumber: string | null;
  trackingUrl: string | null;
  errorMessage: string | null;
  lineItems: DropshipOrderLineItem[];
  submittedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function orderState(status: DropshipOrderStatus): {
  label: string;
  tone: Tone;
  detail: string;
} {
  switch (status) {
    case 'pending':
      return {
        label: 'Waiting to be sent',
        tone: 'info',
        detail: 'The order has reached this supplier but has not been submitted to them yet.',
      };
    case 'submitted':
      return {
        label: 'Sent to supplier',
        tone: 'info',
        detail: 'The supplier has the order and is preparing it. No tracking yet.',
      };
    case 'shipped':
      return {
        label: 'Shipped',
        tone: 'success',
        detail: 'The supplier has posted it to your customer.',
      };
    case 'delivered':
      return {
        label: 'Delivered',
        tone: 'success',
        detail: 'The order reached your customer.',
      };
    case 'failed':
      return {
        label: 'Could not be sent',
        tone: 'danger',
        detail: 'The supplier rejected the order or it could not be submitted. It needs attention.',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        tone: 'neutral',
        detail: 'This supplier order was cancelled.',
      };
  }
}

/** The columns the orders table can sort by — EXACTLY the server's whitelist. */
export type OrderSort = 'createdAt' | 'status' | 'supplierId';

export interface OrdersPageParams {
  status?: string;
  supplierId?: string;
  sortBy: OrderSort;
  order: SortDir;
  take: number;
  skip: number;
}

export const orderKeys = {
  page: (params: OrdersPageParams) => ['dropship', 'orders', 'page', params] as const,
  detail: (id: string) => ['dropship', 'orders', id] as const,
};

export function useDropshipOrders(params: OrdersPageParams) {
  return useQuery({
    queryKey: orderKeys.page(params),
    queryFn: () =>
      api.list<DropshipOrder>('/v1/dropship/orders', {
        ...(params.status && params.status !== 'all' ? { status: params.status } : {}),
        ...(params.supplierId ? { supplierId: params.supplierId } : {}),
        sort_by: params.sortBy,
        order: params.order,
        take: params.take,
        skip: params.skip,
      }),
    placeholderData: (previous) => previous,
  });
}

export function useDropshipOrder(id: string) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: () => api.get<DropshipOrder>(`/v1/dropship/orders/${id}`),
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

export interface RouteResult {
  orderId: string;
  status: string;
}

/** Re-run order routing for a COMMERCE order (recovery for a failed dropship
 *  order). Keyed on the commerce order id, which is what the endpoint takes. */
export function useRouteOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commerceOrderId: string) =>
      api.post<RouteResult>(`/v1/dropship/orders/route/${commerceOrderId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dropship', 'orders'] });
    },
  });
}

/* ── Profitability / reporting ──────────────────────────────────────────── */

export interface AnalyticsSupplierRow {
  supplierId: string;
  supplierName: string;
  orders: number;
  costCents: number;
  revenueCents: number;
  profitCents: number;
  marginPct: number;
}

export interface DropshipAnalytics {
  totalOrders: number;
  costCents: number;
  revenueCents: number;
  profitCents: number;
  marginPct: number;
  bySupplier: AnalyticsSupplierRow[];
}

export interface AnalyticsRange {
  from: string;
  to: string;
}

export function useDropshipAnalytics(range: AnalyticsRange, supplierId?: string) {
  return useQuery({
    queryKey: ['dropship', 'analytics', { ...range, supplierId }],
    queryFn: () =>
      api.get<DropshipAnalytics>('/v1/dropship/analytics', {
        from: range.from,
        to: range.to,
        ...(supplierId ? { supplierId } : {}),
      }),
    placeholderData: (previous) => previous,
  });
}

export interface TimeseriesPoint {
  bucket: string;
  ordersCount: number;
  revenueCents: number;
  costCents: number;
  profitCents: number;
}

export interface OrdersTimeseries {
  range: { from: string; to: string; grain: string };
  points: TimeseriesPoint[];
  totals: {
    ordersCount: number;
    revenueCents: number;
    costCents: number;
    profitCents: number;
    marginPct: number;
  };
  currency: string;
}

export function useOrdersTimeseries(range: AnalyticsRange) {
  return useQuery({
    queryKey: ['dropship', 'reports', 'timeseries', range],
    queryFn: () =>
      api.get<OrdersTimeseries>('/v1/dropship/reports/orders-timeseries', {
        from: range.from,
        to: range.to,
        grain: 'day',
      }),
    placeholderData: (previous) => previous,
  });
}

export interface SlaMeasures {
  routedOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  failedOrders: number;
  avgShipHours: number | null;
  avgDeliveryHours: number | null;
  fulfillmentRate: number;
  onTimeRate: number | null;
}

export interface SlaRow extends SlaMeasures {
  supplierId: string;
  supplierName: string;
}

export interface SupplierSlaReport extends SlaMeasures {
  rangeLabel: string;
  onTimeDeliveryDays: number;
  bySupplier: SlaRow[];
}

export function useSupplierSla(range: AnalyticsRange) {
  return useQuery({
    queryKey: ['dropship', 'reports', 'sla', range],
    queryFn: () =>
      api.get<SupplierSlaReport>('/v1/dropship/reports/supplier-sla', {
        from: range.from,
        to: range.to,
      }),
    placeholderData: (previous) => previous,
  });
}

export interface ActivityItem {
  id: string;
  orderId: string;
  orderNumber: string | null;
  supplierId: string;
  supplierName: string;
  status: DropshipOrderStatus;
  trackingNumber: string | null;
  updatedAt: string;
}

export function useDropshipActivity(limit = 12) {
  return useQuery({
    queryKey: ['dropship', 'reports', 'activity', { limit }],
    queryFn: () => api.get<ActivityItem[]>('/v1/dropship/reports/activity', { limit }),
    placeholderData: (previous) => previous,
  });
}

/* ── ISO date range presets (shared by the profitability surface) ────────── */

export type RangePreset = '7' | '30' | '90';

export const RANGE_LABEL: Record<RangePreset, string> = {
  '7': 'Last 7 days',
  '30': 'Last 30 days',
  '90': 'Last 90 days',
};

export function presetRange(preset: RangePreset): AnalyticsRange {
  const days = Number(preset);
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/* ── Errors ─────────────────────────────────────────────────────────────── */

/** Surface the server's own sentence for a 4xx (it names the exact problem —
 *  a bad credential, an already-imported product), else a plain fallback. */
export function dropshipErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}
