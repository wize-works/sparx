'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE BARCODES AND SCANNING DATA LAYER
//
// Everything behind the barcode registry, the label sheet, and the four
// scan-driven jobs: receiving a delivery, counting a shelf, filling a transfer,
// and just asking "what is this".
//
// ── A scan is a SERVER round trip, on purpose ─────────────────────────────
//
// It would be faster to keep a receiving tally in the browser. It would also be
// gone when the tablet sleeps, wrong when two people work the same pallet, and
// unrecoverable when the battery dies at box ninety of a hundred. So the tally
// lives in the database and the screen shows what the server believes.
//
// ── Every scan carries a key, and the key is minted HERE ──────────────────
//
// One per trigger pull, kept with the scan in the offline queue below. Sending
// the same key twice applies the scan once — that single rule is what makes it
// safe to keep scanning through a dropped connection, and it only works if the
// key is minted at the trigger and never re-minted on retry.
//
// ── The offline queue ─────────────────────────────────────────────────────
//
// Warehouses have metal racking and no signal at the back. When a scan fails to
// reach the server it goes into `localStorage` and is replayed when the
// connection returns, in the order the triggers were pulled. `localStorage`
// rather than IndexedDB deliberately: the payload is tiny, the API is
// synchronous (so a scan cannot be lost between the catch and the write), and a
// queue that survives a tab crash is worth more than one that holds a megabyte.
// ══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { api } from '../../lib/api/client';

/* ── Shapes ─────────────────────────────────────────────────────────────── */

export interface Barcode {
  id: string;
  variantId: string;
  sku: string | null;
  productId: string | null;
  productTitle: string | null;
  variantTitle: string | null;
  value: string;
  symbology: string;
  symbologyLabel: string;
  /** Base units one scan of this code means. 12 on a case code. */
  packSize: number;
  isPrimary: boolean;
  supplierId: string | null;
  supplierName: string | null;
  label: string | null;
  source: string;
  lastScannedAt: string | null;
  scanCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A code two items both claim. Refused entry to the registry; only a human can pick. */
export interface BarcodeConflict {
  variantId: string;
  productId: string;
  sku: string;
  productTitle: string;
  value: string;
  heldByVariantId: string | null;
  heldBySku: string | null;
  heldByProductTitle: string | null;
}

export type ScanKind =
  'variant' | 'bin' | 'purchase_order' | 'goods_receipt' | 'transfer' | 'count' | 'lot' | 'serial';

export interface ScanMatch {
  kind: ScanKind;
  id: string;
  code: string;
  title: string;
  detail: string | null;
  /** `equivalent` means it matched through a symbology reading, not literally. */
  via: 'exact' | 'equivalent';
  // Present on a variant match.
  variantId?: string;
  productId?: string;
  packSize?: number;
  onHand?: number;
  // Present on a bin match.
  warehouseId?: string;
  warehouseName?: string;
  isSellable?: boolean;
  unitCount?: number;
  status?: string;
}

export interface ScanResolution {
  scanned: string;
  matches: ScanMatch[];
}

export type ScanOutcome = 'applied' | 'duplicate' | 'not_found' | 'rejected';

export interface ScanActionResult {
  outcome: ScanOutcome;
  message: string;
  match: ScanMatch | null;
  quantity: number;
  sessionQuantity: number | null;
  scanEventId: string | null;
}

export interface ReceivingLine {
  purchaseOrderLineId: string;
  variantId: string;
  sku: string;
  productTitle: string;
  variantTitle: string | null;
  ordered: number;
  receivedPreviously: number;
  scanned: number;
  scannedDamaged: number;
  outstanding: number;
  primaryBarcode: string | null;
}

export interface ReceivingSession {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  status: string;
  warehouseId: string;
  warehouseName: string;
  supplierName: string | null;
  usesBins: boolean;
  lines: ReceivingLine[];
  unresolved: { value: string; scannedAt: string; message: string | null }[];
  totalScanned: number;
}

export interface ScanEvent {
  id: string;
  value: string;
  contextType: string;
  contextId: string | null;
  outcome: string;
  message: string | null;
  variantId: string | null;
  sku: string | null;
  productTitle: string | null;
  binId: string | null;
  binCode: string | null;
  quantity: number;
  damagedQuantity: number;
  deviceId: string | null;
  actorId: string | null;
  scannedAt: string;
  createdAt: string;
  /** Seconds the scan spent in an offline queue. Zero when live. */
  replayLagSeconds: number;
}

/* ── Query keys ─────────────────────────────────────────────────────────── */

export const scanKeys = {
  all: ['inventory', 'barcodes'] as const,
  list: (query: Record<string, unknown>) => [...scanKeys.all, 'list', query] as const,
  forVariant: (variantId: string) => [...scanKeys.all, 'variant', variantId] as const,
  conflicts: () => [...scanKeys.all, 'conflicts'] as const,
  receiving: (poId: string) => ['inventory', 'receiving-session', poId] as const,
  events: (query: Record<string, unknown>) => ['inventory', 'scan-events', query] as const,
};

/* ── Reads ──────────────────────────────────────────────────────────────── */

export interface BarcodeQuery {
  variantId?: string;
  supplierId?: string;
  q?: string;
  includeInactive?: boolean;
  limit: number;
  offset: number;
}

export function useBarcodes(query: BarcodeQuery) {
  return useQuery({
    queryKey: scanKeys.list(query as unknown as Record<string, unknown>),
    queryFn: () =>
      api.list<Barcode>('/v1/inventory/barcodes', {
        ...(query.variantId ? { variant_id: query.variantId } : {}),
        ...(query.supplierId ? { supplier_id: query.supplierId } : {}),
        ...(query.q ? { q: query.q } : {}),
        ...(query.includeInactive ? { include_inactive: true } : {}),
        limit: query.limit,
        offset: query.offset,
      }),
    placeholderData: (previous) => previous,
  });
}

export function useVariantBarcodes(variantId: string | undefined) {
  return useQuery({
    queryKey: scanKeys.forVariant(variantId ?? ''),
    enabled: Boolean(variantId),
    queryFn: () => api.get<Barcode[]>(`/v1/inventory/barcodes/variant/${variantId ?? ''}`),
  });
}

export function useBarcodeConflicts() {
  return useQuery({
    queryKey: scanKeys.conflicts(),
    queryFn: () => api.get<BarcodeConflict[]>('/v1/inventory/barcodes/conflicts'),
  });
}

export function useReceivingSession(purchaseOrderId: string | undefined) {
  return useQuery({
    queryKey: scanKeys.receiving(purchaseOrderId ?? ''),
    enabled: Boolean(purchaseOrderId),
    queryFn: () => api.get<ReceivingSession>(`/v1/inventory/receiving/${purchaseOrderId ?? ''}`),
  });
}

export function useScanEvents(query: {
  contextType?: string;
  contextId?: string;
  variantId?: string;
  take?: number;
}) {
  return useQuery({
    queryKey: scanKeys.events(query),
    queryFn: () =>
      api.list<ScanEvent>('/v1/inventory/scan/events', {
        ...(query.contextType ? { context_type: query.contextType } : {}),
        ...(query.contextId ? { context_id: query.contextId } : {}),
        ...(query.variantId ? { variant_id: query.variantId } : {}),
        take: query.take ?? 100,
      }),
    placeholderData: (previous) => previous,
  });
}

/* ── Registry writes ────────────────────────────────────────────────────── */

function useInvalidateBarcodes() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: scanKeys.all });
    // The primary GTIN mirrors down onto the variant, so the catalogue is stale.
    void queryClient.invalidateQueries({ queryKey: ['commerce', 'products'] });
  };
}

export interface BarcodeDraft {
  variantId: string;
  value: string;
  symbology?: string;
  packSize?: number;
  isPrimary?: boolean;
  supplierId?: string | null;
  label?: string | null;
  source?: string;
  allowInvalidCheckDigit?: boolean;
}

export function useCreateBarcode() {
  const invalidate = useInvalidateBarcodes();
  return useMutation({
    mutationFn: (draft: BarcodeDraft) => api.post<Barcode>('/v1/inventory/barcodes', draft),
    onSuccess: invalidate,
  });
}

export function useUpdateBarcode() {
  const invalidate = useInvalidateBarcodes();
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string;
      packSize?: number;
      isPrimary?: boolean;
      label?: string | null;
      supplierId?: string | null;
      isActive?: boolean;
    }) => api.patch<Barcode>(`/v1/inventory/barcodes/${id}`, patch),
    onSuccess: invalidate,
  });
}

export function useSetPrimaryBarcode() {
  const invalidate = useInvalidateBarcodes();
  return useMutation({
    mutationFn: (id: string) => api.post<Barcode>(`/v1/inventory/barcodes/${id}/primary`, {}),
    onSuccess: invalidate,
  });
}

/** Settle a code two items claim. `take` moves it here; `clear` drops this item's claim. */
export function useResolveBarcodeConflict() {
  const invalidate = useInvalidateBarcodes();
  return useMutation({
    mutationFn: (input: { variantId: string; action: 'take' | 'clear' }) =>
      api.post<void>('/v1/inventory/barcodes/conflicts/resolve', input),
    onSuccess: invalidate,
  });
}

export function useDeleteBarcode() {
  const invalidate = useInvalidateBarcodes();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/v1/inventory/barcodes/${id}`),
    onSuccess: invalidate,
  });
}

export interface GenerateResult {
  generated: { variantId: string; sku: string; value: string }[];
  skipped: { variantId: string; sku: string; existing: string }[];
}

export function useGenerateBarcodes() {
  const invalidate = useInvalidateBarcodes();
  return useMutation({
    mutationFn: (input: { variantIds: string[]; force?: boolean }) =>
      api.post<GenerateResult>('/v1/inventory/barcodes/generate', input),
    onSuccess: invalidate,
  });
}

/* ── Resolution ─────────────────────────────────────────────────────────── */

/** One-shot lookup. Not a query hook: a scan is an EVENT, not a subscription. */
export async function resolveScan(
  value: string,
  options: { expect?: ScanKind[]; warehouseId?: string } = {}
): Promise<ScanResolution> {
  return api.post<ScanResolution>('/v1/inventory/scan', {
    value,
    ...(options.expect ? { expect: options.expect } : {}),
    ...(options.warehouseId ? { warehouseId: options.warehouseId } : {}),
  });
}

/* ── The offline queue ──────────────────────────────────────────────────── */

const QUEUE_KEY = 'sparx.inventory.scanQueue.v1';

export interface QueuedScan {
  contextType: 'receipt' | 'count' | 'transfer' | 'put_away' | 'lookup';
  contextId: string;
  value: string;
  idempotencyKey: string;
  quantity?: number;
  damagedQuantity?: number;
  deviceId?: string | null;
  scannedAt: string;
  warehouseId?: string;
  toBinId?: string;
  fromBinId?: string | null;
}

function readQueue(): QueuedScan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedScan[]) : [];
  } catch {
    // A corrupt queue is worse than an empty one: it would fail replay forever
    // and there is no scan in it anybody can still name.
    return [];
  }
}

function writeQueue(scans: QueuedScan[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(scans));
  } catch {
    // Storage full or blocked. Nothing useful to do — the scan is already lost,
    // and throwing here would take the whole receiving screen down with it.
  }
}

/**
 * A stable id for this handheld.
 *
 * Not a login and not a fingerprint — just enough to tell "gun 4 is
 * mis-reading" from "Dave is mis-reading", which is a question every warehouse
 * eventually asks and none can answer without it.
 */
export function deviceId(): string {
  if (typeof window === 'undefined') return 'server';
  const KEY = 'sparx.inventory.deviceId';
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

/** One per trigger pull. Never re-minted on retry — that is the whole contract. */
export function scanKey(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `scan-${random}`;
}

export interface ReplayResult {
  idempotencyKey: string;
  outcome: ScanOutcome | 'error';
  message: string;
}

/**
 * The queue, its size, and a replay that runs itself when the browser comes back
 * online.
 *
 * Replay is also attempted on mount, because the commonest recovery is not
 * "the connection returned while I watched" but "somebody carried the tablet
 * back to the office and opened it again".
 */
export function useScanQueue() {
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [replaying, setReplaying] = useState(false);
  const [lastReplay, setLastReplay] = useState<ReplayResult[] | null>(null);
  const queryClient = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    setQueue(readQueue());
  }, []);

  const enqueue = useCallback((scan: QueuedScan) => {
    const next = [...readQueue(), scan];
    writeQueue(next);
    setQueue(next);
  }, []);

  const clear = useCallback(() => {
    writeQueue([]);
    setQueue([]);
  }, []);

  const replay = useCallback(async (): Promise<ReplayResult[] | null> => {
    // A second replay running over the same queue would send every scan twice.
    // Harmless — the keys make it a no-op — but it would report every scan as a
    // duplicate and frighten whoever is reading the screen.
    if (running.current) return null;
    const pending = readQueue();
    if (pending.length === 0) return null;

    running.current = true;
    setReplaying(true);
    try {
      const { results } = await api.post<{ results: ReplayResult[] }>('/v1/inventory/scan/replay', {
        scans: pending,
      });
      // Anything the server accepted OR recognised as already-applied is done.
      // A hard error stays queued: it may be a server that was mid-deploy.
      const settled = new Set(
        results.filter((r) => r.outcome !== 'error').map((r) => r.idempotencyKey)
      );
      const remaining = readQueue().filter((s) => !settled.has(s.idempotencyKey));
      writeQueue(remaining);
      setQueue(remaining);
      setLastReplay(results);
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
      return results;
    } catch {
      // Still offline. The queue is untouched, which is the correct outcome.
      return null;
    } finally {
      running.current = false;
      setReplaying(false);
    }
  }, [queryClient]);

  useEffect(() => {
    void replay();
    const onOnline = () => void replay();
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [replay]);

  return { queue, size: queue.length, replaying, lastReplay, enqueue, clear, replay };
}

/* ── Scan actions ───────────────────────────────────────────────────────── */

/**
 * Send a scan, and queue it if the send fails.
 *
 * The catch is the whole point. Every scan action in the warehouse goes through
 * here so that losing the connection costs nobody a scan and nobody has to
 * notice — the alternative is an error toast per trigger pull and a receiver who
 * gives up and writes on the box.
 */
async function sendOrQueue(
  path: string,
  body: object,
  queued: QueuedScan,
  enqueue: (scan: QueuedScan) => void
): Promise<ScanActionResult> {
  try {
    return await api.post<ScanActionResult>(path, body);
  } catch (error) {
    // A 4xx is the server saying no — a real refusal that must be shown, not
    // hidden in a queue that will replay it to the same refusal forever.
    if (isClientError(error)) throw error;
    enqueue(queued);
    return {
      outcome: 'applied',
      message: 'Saved on this device — it will sync when the connection is back.',
      match: null,
      quantity: queued.quantity ?? 1,
      sessionQuantity: null,
      scanEventId: null,
    };
  }
}

function isClientError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

export function useScanToReceive(purchaseOrderId: string) {
  const queryClient = useQueryClient();
  const { enqueue } = useScanQueue();
  return useMutation({
    mutationFn: (input: {
      value: string;
      quantity?: number;
      damagedQuantity?: number;
      binId?: string | null;
    }) => {
      const envelope: QueuedScan = {
        contextType: 'receipt',
        contextId: purchaseOrderId,
        value: input.value,
        idempotencyKey: scanKey(),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        ...(input.damagedQuantity !== undefined ? { damagedQuantity: input.damagedQuantity } : {}),
        deviceId: deviceId(),
        scannedAt: new Date().toISOString(),
      };
      return sendOrQueue(
        `/v1/inventory/receiving/${purchaseOrderId}/scan`,
        { ...envelope, ...(input.binId ? { binId: input.binId } : {}) },
        envelope,
        enqueue
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scanKeys.receiving(purchaseOrderId) });
    },
  });
}

export function useUndoReceivingScan(purchaseOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scanEventId: string) =>
      api.delete<ReceivingSession>(
        `/v1/inventory/receiving/${purchaseOrderId}/scan/${scanEventId}`
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: scanKeys.receiving(purchaseOrderId) });
    },
  });
}

export function usePostScannedReceipt(purchaseOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reference?: string; note?: string; binId?: string | null }) =>
      api.post<{ id: string; number: string }>(
        `/v1/inventory/receiving/${purchaseOrderId}/post`,
        input
      ),
    onSuccess: () => {
      // Posting writes the ledger, so almost everything inventory is stale.
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useScanToCount(countId: string) {
  const queryClient = useQueryClient();
  const { enqueue } = useScanQueue();
  return useMutation({
    mutationFn: (input: { value: string; quantity?: number; accumulate?: boolean }) => {
      const envelope: QueuedScan = {
        contextType: 'count',
        contextId: countId,
        value: input.value,
        idempotencyKey: scanKey(),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        deviceId: deviceId(),
        scannedAt: new Date().toISOString(),
      };
      return sendOrQueue(
        `/v1/inventory/counts/${countId}/scan`,
        {
          ...envelope,
          ...(input.accumulate !== undefined ? { accumulate: input.accumulate } : {}),
        },
        envelope,
        enqueue
        // The count endpoint returns { scan, count }; only the scan half is the
        // action result, and the count comes back through the invalidation below.
      ).then((result) =>
        'scan' in result ? (result as unknown as { scan: ScanActionResult }).scan : result
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'counts'] });
    },
  });
}

export function useScanToTransfer(transferId: string) {
  const queryClient = useQueryClient();
  const { enqueue } = useScanQueue();
  return useMutation({
    mutationFn: (input: { value: string; quantity?: number }) => {
      const envelope: QueuedScan = {
        contextType: 'transfer',
        contextId: transferId,
        value: input.value,
        idempotencyKey: scanKey(),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        deviceId: deviceId(),
        scannedAt: new Date().toISOString(),
      };
      return sendOrQueue(`/v1/inventory/transfers/${transferId}/scan`, envelope, envelope, enqueue);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory', 'transfers'] });
    },
  });
}

export function useScanPutAway() {
  const queryClient = useQueryClient();
  const { enqueue } = useScanQueue();
  return useMutation({
    mutationFn: (input: {
      value: string;
      warehouseId: string;
      toBinId: string;
      fromBinId?: string | null;
      quantity?: number;
    }) => {
      const envelope: QueuedScan = {
        contextType: 'put_away',
        contextId: input.toBinId,
        value: input.value,
        idempotencyKey: scanKey(),
        ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
        deviceId: deviceId(),
        scannedAt: new Date().toISOString(),
        warehouseId: input.warehouseId,
        toBinId: input.toBinId,
        fromBinId: input.fromBinId ?? null,
      };
      return sendOrQueue('/v1/inventory/put-away/scan', envelope, envelope, enqueue);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

/* ── Presentation helpers ───────────────────────────────────────────────── */

/** The color a scan result wears. State is its own axis; grey says nothing. */
export function scanTone(outcome: ScanOutcome): 'success' | 'info' | 'warning' | 'danger' {
  switch (outcome) {
    case 'applied':
      return 'success';
    case 'duplicate':
      return 'info';
    case 'not_found':
      return 'warning';
    default:
      return 'danger';
  }
}

const KIND_LABELS: Record<ScanKind, string> = {
  variant: 'Product',
  bin: 'Shelf',
  purchase_order: 'Purchase order',
  goods_receipt: 'Delivery',
  transfer: 'Transfer',
  count: 'Stock count',
  lot: 'Batch',
  serial: 'Unit',
};

export function scanKindLabel(kind: ScanKind): string {
  return KIND_LABELS[kind] ?? 'Match';
}

/** Which module hue a scan result belongs to — a shelf and a PO are not the same thing. */
export function scanKindColor(kind: ScanKind): string {
  switch (kind) {
    case 'variant':
      return 'module-commerce';
    case 'purchase_order':
    case 'goods_receipt':
      return 'module-inventory';
    default:
      return 'module-inventory';
  }
}
