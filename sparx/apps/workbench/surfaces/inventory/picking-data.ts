'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE PICKING AND PACKING DATA LAYER
//
// Everything behind the walks list, the walk pane, the guided pick screen, the
// pack bench and the throughput report.
//
// ── A walk is a SERVER document, not a screen ─────────────────────────────
//
// Every confirmation is a round trip and the screen re-renders from what comes
// back. That is the same decision the receiving session made and for the same
// reasons: a walk survives the tablet sleeping, two people can work one trolley,
// and the "next instruction" a picker sees is never a guess this tab made.
//
// So there is no local list of lines being mutated here. `confirm` returns the
// whole walk plus the next instruction, and the screen uses that.
//
// ── The pick scan shares the offline queue, but not the replay ────────────
//
// Pick and pack scans go through `sendOrQueue`'s sibling below rather than the
// shared one, because the server's replay endpoint knowingly refuses the `pick`
// context (`QueuedScan`'s type excludes it): replaying a pick hours later would
// confirm units off a shelf somebody has since re-counted. A dropped pick scan
// is re-scanned; it is not replayed. That is a deliberate difference from
// receiving, where the pallet is still on the dock either way.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';
import { getTokenState, resolveToken } from '../../lib/api/token';
import { stockKeys, type Tone } from './data';
import { movementKeys } from './movements-data';
import { deviceId, scanKey, type ScanMatch, type ScanOutcome } from './scan-data';

/* ── Shapes (mirror the api-rest picking serializers) ───────────────────── */

export type PickListStatus = 'draft' | 'assigned' | 'picking' | 'picked' | 'cancelled';
export type PickListKind = 'single' | 'batch' | 'wave';
export type PickLineStatus = 'pending' | 'picked' | 'short' | 'skipped';
export type AllocationStrategy = 'fifo' | 'fefo' | 'nearest_bin' | 'single_bin';
export type ShortPickReason =
  'not_found' | 'damaged' | 'wrong_item' | 'insufficient' | 'inaccessible' | 'other';

/** One "go to this shelf and take this many" instruction. */
export interface PickLine {
  id: string;
  orderId: string;
  orderNumber: string;
  orderItemId: string;
  variantId: string;
  sku: string;
  productTitle: string;
  variantTitle: string | null;
  /** What to point the gun at. */
  primaryBarcode: string | null;
  binId: string | null;
  binCode: string | null;
  binZone: string | null;
  lotId: string | null;
  lotNumber: string | null;
  lotExpiresAt: string | null;
  quantity: number;
  pickedQuantity: number;
  shortQuantity: number;
  shortReason: ShortPickReason | null;
  shortNote: string | null;
  /** The count raised to settle the short, when one was. */
  shortCountId: string | null;
  pickSequence: number;
  status: PickLineStatus;
  /** True when a trigger pull confirmed it rather than a tap. */
  verifiedByScan: boolean;
  pickedAt: string | null;
  pickedBy: string | null;
}

export interface PickListRow {
  id: string;
  number: string;
  kind: PickListKind;
  status: PickListStatus;
  strategy: AllocationStrategy;
  warehouseId: string;
  warehouseName: string;
  assignedTo: string | null;
  orderCount: number;
  orderNumbers: string[];
  lineCount: number;
  pendingCount: number;
  shortCount: number;
  unitsRequested: number;
  unitsPicked: number;
  note: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  pickedAt: string | null;
  createdAt: string;
}

export interface PickListDetail extends PickListRow {
  usesBins: boolean;
  lines: PickLine[];
  orders: { orderId: string; orderNumber: string; position: number; customerName: string | null }[];
}

export interface PickActionResult {
  lineId: string;
  status: PickLineStatus;
  pickedQuantity: number;
  shortQuantity: number;
  message: string;
  /** The next instruction, or null when the walk is done. */
  next: PickLine | null;
  list: PickListDetail;
}

export interface ScanToPickResult {
  outcome: ScanOutcome;
  message: string;
  match: ScanMatch | null;
  scanEventId: string | null;
  pick: PickActionResult | null;
}

/* ── Packing ────────────────────────────────────────────────────────────── */

export type PackageStatus = 'open' | 'packed' | 'cancelled';

export interface PackageLine {
  id: string;
  orderItemId: string;
  variantId: string | null;
  sku: string;
  name: string;
  quantity: number;
  /** Of those, how many a trigger pull confirmed. */
  scannedQuantity: number;
  ordered: number;
  packedElsewhere: number;
}

export interface PackageRow {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  pickListId: string | null;
  pickListNumber: string | null;
  status: PackageStatus;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  packagingType: string | null;
  fulfillmentId: string | null;
  note: string | null;
  unitCount: number;
  scannedCount: number;
  packedAt: string | null;
  packedBy: string | null;
  createdAt: string;
}

export interface PackageDetail extends PackageRow {
  lines: PackageLine[];
  outstanding: { orderItemId: string; sku: string; name: string; remaining: number }[];
  orderFullyPacked: boolean;
}

export interface ScanToPackResult {
  outcome: ScanOutcome;
  message: string;
  match: ScanMatch | null;
  scanEventId: string | null;
  package: PackageDetail | null;
}

export interface FulfillResult {
  fulfillmentId: string;
  packageId: string;
  packageNumber: string;
  orderId: string;
  lines: number;
  units: number;
  orderComplete: boolean;
}

/* ── Throughput ─────────────────────────────────────────────────────────── */

export interface PickerThroughput {
  pickedBy: string | null;
  linesPicked: number;
  unitsPicked: number;
  linesShort: number;
  unitsShort: number;
  linesScanVerified: number;
  activeMinutes: number;
  unitsPerHour: number;
  scanVerifiedRate: number;
  shortLineRate: number;
}

export interface BinShortfall {
  binId: string | null;
  binCode: string | null;
  zone: string | null;
  linesShort: number;
  unitsShort: number;
  linesTotal: number;
  shortLineRate: number;
  topReason: ShortPickReason | null;
}

export interface PackThroughput {
  packedBy: string | null;
  boxesPacked: number;
  unitsPacked: number;
  unitsScanned: number;
  scanVerifiedRate: number;
}

export interface PickThroughputReport {
  from: string;
  to: string;
  totals: {
    walksCompleted: number;
    linesPicked: number;
    unitsPicked: number;
    linesShort: number;
    unitsShort: number;
    activeMinutes: number;
    unitsPerHour: number;
    scanVerifiedRate: number;
    shortLineRate: number;
    boxesPacked: number;
  };
  pickers: PickerThroughput[];
  bins: BinShortfall[];
  packers: PackThroughput[];
  shortReasons: { reason: ShortPickReason; lines: number; units: number }[];
}

/* ── Query keys ─────────────────────────────────────────────────────────── */

export interface PickListQuery {
  status?: PickListStatus;
  kind?: PickListKind;
  warehouseId?: string;
  assignedTo?: string;
  orderId?: string;
  search?: string;
  take: number;
  skip: number;
}

export const pickKeys = {
  all: ['inventory', 'pick-lists'] as const,
  list: (query: PickListQuery) => [...pickKeys.all, 'list', query] as const,
  detail: (id: string) => [...pickKeys.all, 'detail', id] as const,
  packages: ['inventory', 'packages'] as const,
  packageList: (query: Record<string, unknown>) =>
    ['inventory', 'packages', 'list', query] as const,
  packageDetail: (id: string) => ['inventory', 'packages', 'detail', id] as const,
  throughput: (query: Record<string, unknown>) => ['inventory', 'pick-throughput', query] as const,
};

/* ── Reads ──────────────────────────────────────────────────────────────── */

export function usePickLists(query: PickListQuery) {
  return useQuery({
    queryKey: pickKeys.list(query),
    queryFn: () =>
      api.list<PickListRow>('/v1/inventory/pick-lists', {
        ...(query.status ? { status: query.status } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.search ? { search: query.search } : {}),
        take: query.take,
        skip: query.skip,
      }),
    placeholderData: (previous) => previous,
  });
}

export function usePickList(id: string) {
  return useQuery({
    queryKey: pickKeys.detail(id),
    queryFn: () => api.get<PickListDetail>(`/v1/inventory/pick-lists/${id}`),
    enabled: id !== '' && id !== 'new',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

export function usePackages(query: {
  orderId?: string;
  pickListId?: string;
  status?: PackageStatus;
  take?: number;
}) {
  return useQuery({
    queryKey: pickKeys.packageList(query),
    queryFn: () =>
      api.list<PackageRow>('/v1/inventory/packages', {
        ...(query.orderId ? { orderId: query.orderId } : {}),
        ...(query.pickListId ? { pickListId: query.pickListId } : {}),
        ...(query.status ? { status: query.status } : {}),
        take: query.take ?? 50,
      }),
    placeholderData: (previous) => previous,
  });
}

export function usePackage(id: string) {
  return useQuery({
    queryKey: pickKeys.packageDetail(id),
    queryFn: () => api.get<PackageDetail>(`/v1/inventory/packages/${id}`),
    enabled: id !== '' && id !== 'new',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

export function usePickThroughput(query: {
  from?: string;
  to?: string;
  warehouseId?: string;
  pickedBy?: string;
}) {
  return useQuery({
    queryKey: pickKeys.throughput(query),
    queryFn: () =>
      api.get<PickThroughputReport>('/v1/inventory/reports/pick-throughput', {
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
        ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
        ...(query.pickedBy ? { pickedBy: query.pickedBy } : {}),
      }),
    placeholderData: (previous) => previous,
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

function useInvalidatePicking() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: pickKeys.all });
    if (id) void queryClient.invalidateQueries({ queryKey: pickKeys.detail(id) });
  };
}

/**
 * The wide invalidation, for a short pick.
 *
 * A short pick puts units BACK on hand and holds them, and raises a count. So it
 * moves a stock number, writes a ledger row and creates a document — three
 * caches that would otherwise sit there showing the world as it was ten seconds
 * ago while the person who caused the change is looking at it.
 */
function useInvalidateAfterShort() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePicking();
  return (id: string) => {
    invalidate(id);
    void queryClient.invalidateQueries({ queryKey: stockKeys.all });
    void queryClient.invalidateQueries({ queryKey: movementKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['inventory', 'counts'] });
  };
}

/* ── Writes: the walk ───────────────────────────────────────────────────── */

export interface GeneratePickListInput {
  orderIds: string[];
  warehouseId?: string;
  kind?: PickListKind;
  strategy?: AllocationStrategy;
  assignedTo?: string | null;
  note?: string;
}

export function useGeneratePickList() {
  const invalidate = useInvalidatePicking();
  return useMutation({
    mutationFn: (input: GeneratePickListInput) =>
      api.post<PickListDetail>('/v1/inventory/pick-lists', input),
    onSuccess: (created) => {
      invalidate(created.id);
    },
  });
}

export function useAssignPickList(pickListId: string) {
  const invalidate = useInvalidatePicking();
  return useMutation({
    mutationFn: (assignedTo: string | null) =>
      api.post<PickListDetail>(`/v1/inventory/pick-lists/${pickListId}/assign`, { assignedTo }),
    onSuccess: () => {
      invalidate(pickListId);
    },
  });
}

export function useCancelPickList(pickListId: string) {
  const invalidate = useInvalidatePicking();
  return useMutation({
    mutationFn: (reason?: string) =>
      api.post<PickListDetail>(`/v1/inventory/pick-lists/${pickListId}/cancel`, {
        ...(reason ? { reason } : {}),
      }),
    onSuccess: () => {
      invalidate(pickListId);
    },
  });
}

export function useConfirmPick(pickListId: string) {
  const invalidate = useInvalidatePicking();
  return useMutation({
    mutationFn: (input: { lineId: string; quantity?: number; binId?: string | null }) =>
      api.post<PickActionResult>(`/v1/inventory/pick-lists/${pickListId}/pick`, input),
    onSuccess: () => {
      invalidate(pickListId);
    },
  });
}

export function useShortPick(pickListId: string) {
  const invalidate = useInvalidateAfterShort();
  return useMutation({
    mutationFn: (input: {
      lineId: string;
      quantity?: number;
      reason: ShortPickReason;
      note?: string;
      raiseCount?: boolean;
    }) => api.post<PickActionResult>(`/v1/inventory/pick-lists/${pickListId}/short`, input),
    onSuccess: () => {
      invalidate(pickListId);
    },
  });
}

export function useSkipPick(pickListId: string) {
  const invalidate = useInvalidatePicking();
  return useMutation({
    mutationFn: (lineId: string) =>
      api.post<PickActionResult>(`/v1/inventory/pick-lists/${pickListId}/skip`, { lineId }),
    onSuccess: () => {
      invalidate(pickListId);
    },
  });
}

/**
 * One trigger pull against a walk.
 *
 * Not queued when it fails, unlike a receiving scan. A pick replayed hours later
 * would confirm units off a shelf that has since been counted and corrected, so
 * the honest behaviour when the connection drops is to say so and let the picker
 * scan it again — which costs one trigger pull, and the alternative costs a stock
 * number nobody can explain.
 */
export function useScanToPick(pickListId: string) {
  const invalidate = useInvalidatePicking();
  return useMutation({
    mutationFn: (input: { value: string; quantity?: number; binId?: string | null }) =>
      api.post<ScanToPickResult>(`/v1/inventory/pick-lists/${pickListId}/scan`, {
        value: input.value,
        idempotencyKey: scanKey(),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.binId ? { binId: input.binId } : {}),
        deviceId: deviceId(),
        scannedAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      invalidate(pickListId);
    },
  });
}

/* ── Writes: the box ────────────────────────────────────────────────────── */

function useInvalidatePackages(id?: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: pickKeys.packages });
    if (id) void queryClient.invalidateQueries({ queryKey: pickKeys.packageDetail(id) });
  };
}

export function useCreatePackage() {
  const invalidate = useInvalidatePackages();
  return useMutation({
    mutationFn: (input: { orderId: string; pickListId?: string | null }) =>
      api.post<PackageDetail>('/v1/inventory/packages', input),
    onSuccess: invalidate,
  });
}

export function usePackItem(packageId: string) {
  const invalidate = useInvalidatePackages(packageId);
  return useMutation({
    mutationFn: (input: { orderItemId: string; quantity: number }) =>
      api.post<PackageDetail>(`/v1/inventory/packages/${packageId}/items`, input),
    onSuccess: invalidate,
  });
}

export function useScanToPack(packageId: string) {
  const invalidate = useInvalidatePackages(packageId);
  return useMutation({
    mutationFn: (input: { value: string; quantity?: number }) =>
      api.post<ScanToPackResult>(`/v1/inventory/packages/${packageId}/scan`, {
        value: input.value,
        idempotencyKey: scanKey(),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        deviceId: deviceId(),
        scannedAt: new Date().toISOString(),
      }),
    onSuccess: invalidate,
  });
}

export interface ClosePackageInput {
  weightGrams?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  packagingType?: string | null;
  allowPartial?: boolean;
}

export function useClosePackage(packageId: string) {
  const invalidate = useInvalidatePackages(packageId);
  return useMutation({
    mutationFn: (input: ClosePackageInput) =>
      api.post<PackageDetail>(`/v1/inventory/packages/${packageId}/close`, input),
    onSuccess: invalidate,
  });
}

export function useCancelPackage(packageId: string) {
  const invalidate = useInvalidatePackages(packageId);
  return useMutation({
    mutationFn: () => api.post<PackageDetail>(`/v1/inventory/packages/${packageId}/cancel`, {}),
    onSuccess: invalidate,
  });
}

/** Hand the box to shipping. Creates the shipping record for exactly what is in
 *  it, so a three-box order gets three tracking numbers. */
export function useFulfillPackage(packageId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { close?: boolean; allowPartial?: boolean; markShipped?: boolean }) =>
      api.post<FulfillResult>(`/v1/inventory/packages/${packageId}/fulfill`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pickKeys.packages });
      void queryClient.invalidateQueries({ queryKey: pickKeys.packageDetail(packageId) });
      // The order's fulfilment state just moved, and the orders surfaces show it.
      void queryClient.invalidateQueries({ queryKey: ['crm', 'orders'] });
      void queryClient.invalidateQueries({ queryKey: ['commerce', 'orders'] });
    },
  });
}

/* ── The packing slip ───────────────────────────────────────────────────── */

/**
 * Open the packing slip in a window the browser can print.
 *
 * Not a plain link. api-rest wants a bearer token and the slip is HTML rather
 * than JSON, so `window.open('/v1/...')` would land on a 401 in a blank tab —
 * which is the kind of failure that gets reported as "printing is broken" and
 * takes an hour to trace. Fetch it authenticated, hand the browser a blob, and
 * let its own print dialog do the rest.
 *
 * The blob URL is revoked on a timer rather than immediately: revoking before
 * the new window has finished reading it produces an empty page, and there is no
 * event that reliably says it has.
 */
export async function openPackingSlip(packageId: string): Promise<void> {
  const state = await getTokenState();
  const token = await resolveToken();
  const response = await fetch(`${state.apiUrl}/v1/inventory/packages/${packageId}/packing-slip`, {
    headers: {
      accept: 'text/html',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(state.propertyId ? { 'x-sparx-property-id': state.propertyId } : {}),
    },
  });
  if (!response.ok) throw new Error('The packing slip could not be produced.');

  const html = await response.text();
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/* ── Saying what a walk means ───────────────────────────────────────────── */

export interface PickState {
  label: string;
  tone: Tone;
}

/** A walk's state in the words a warehouse would use. */
export function pickListState(status: PickListStatus): PickState {
  switch (status) {
    case 'draft':
      return { label: 'Waiting for a picker', tone: 'warning' };
    case 'assigned':
      return { label: 'Assigned', tone: 'info' };
    case 'picking':
      return { label: 'Being picked', tone: 'info' };
    case 'picked':
      return { label: 'Picked', tone: 'success' };
    case 'cancelled':
      return { label: 'Abandoned', tone: 'neutral' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

export function pickLineState(status: PickLineStatus): PickState {
  switch (status) {
    case 'pending':
      return { label: 'To pick', tone: 'info' };
    case 'picked':
      return { label: 'Picked', tone: 'success' };
    case 'short':
      return { label: 'Short', tone: 'danger' };
    case 'skipped':
      return { label: 'Left for later', tone: 'warning' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

export function packageState(status: PackageStatus): PickState {
  switch (status) {
    case 'open':
      return { label: 'Being packed', tone: 'info' };
    case 'packed':
      return { label: 'Sealed', tone: 'success' };
    case 'cancelled':
      return { label: 'Unpacked', tone: 'neutral' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

const KIND_LABELS: Record<PickListKind, string> = {
  single: 'One order',
  batch: 'Several orders, one tote each',
  wave: 'Several orders, merged by shelf',
};

export function pickKindLabel(kind: PickListKind): string {
  return KIND_LABELS[kind] ?? kind;
}

const STRATEGY_LABELS: Record<AllocationStrategy, string> = {
  fifo: 'Oldest stock first',
  fefo: 'Nearest expiry first',
  nearest_bin: 'Shortest walk',
  single_bin: 'One shelf per line',
};

export function strategyLabel(strategy: AllocationStrategy): string {
  return STRATEGY_LABELS[strategy] ?? strategy;
}

export const SHORT_REASONS: { value: ShortPickReason; label: string; hint: string }[] = [
  {
    value: 'not_found',
    label: 'Nothing on the shelf',
    hint: 'The shelf was empty, or the item simply was not there.',
  },
  {
    value: 'insufficient',
    label: 'Not enough there',
    hint: 'Some were there but fewer than the order needs.',
  },
  {
    value: 'damaged',
    label: 'Damaged',
    hint: 'They were there and they are not fit to send.',
  },
  {
    value: 'wrong_item',
    label: 'Something else is on that shelf',
    hint: 'A put-away went to the wrong place.',
  },
  {
    value: 'inaccessible',
    label: 'Cannot reach it',
    hint: 'Blocked aisle, top rack, no forklift right now.',
  },
  { value: 'other', label: 'Something else', hint: 'Say what happened in the note.' },
];

export function shortReasonLabel(reason: ShortPickReason | null): string {
  return SHORT_REASONS.find((r) => r.value === reason)?.label ?? 'Short';
}

/** Grams as a person would say it. */
export function formatWeight(grams: number | null): string {
  if (grams === null || grams <= 0) return '—';
  if (grams < 1000) return `${String(grams)} g`;
  return `${(grams / 1000).toFixed(2)} kg`;
}

/* ── Errors ─────────────────────────────────────────────────────────────── */

/** The server's own sentence for a 4xx. These routes refuse in real words —
 *  "this box does not complete order SO-1042 — still to pack: 2 × WIDGET" — and
 *  a generic message would throw away the only useful part. */
export function pickErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

export function isPickNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
