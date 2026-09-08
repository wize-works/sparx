'use client';

// Everything the notification list and its editor read or write.
//
// One list, no single-record endpoint: api-rest returns the whole (small) set
// in one call, so the editor reads its record out of the loaded list rather
// than a route that does not exist. A write invalidates the list and both the
// list and every open editor re-derive from one refreshed array.
//
// The signing secret is returned in FULL exactly once, on create. Every later
// read gives a redacted preview, so the create pane is the only place it can be
// copied — see webhook-detail.tsx.

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';
import type { WebhookEventKey } from './webhook-events';

export * from './webhook-events';

export * from './webhook-status';

/* ── Shapes ─────────────────────────────────────────────────────────────── */

/**
 * What actually came back from the address, as opposed to what was asked for.
 *
 * `lastOutcome: null` alongside `lastAttemptAt: null` means NOTHING HAS BEEN
 * SENT YET, which is a different fact from "everything worked" and must never
 * render as one.
 */
export interface WebhookHealth {
  delivered: number;
  failed: number;
  pending: number;
  lastAttemptAt: string | null;
  lastOutcome: 'delivered' | 'failed' | 'pending' | null;
  windowDays: number;
}

/** One subscription, as api-rest serialises it (camelCase — the handler spreads
 *  the Prisma row). `signingSecret` is redacted on reads. */
export interface WebhookSubscription {
  id: string;
  name: string;
  url: string;
  /** `string[]`, not `WebhookEventKey[]`: a subscription saved by an older
   *  release could carry a key this build does not know, and should still list.
   *  `eventLabel` handles the unknown. */
  events: string[];
  signingSecret: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  health?: WebhookHealth;
}

/** One attempt to reach the address. */
export interface WebhookDelivery {
  id: string;
  event_type: string;
  status: string;
  attempt_count: number;
  response_status: number | null;
  response_body: string | null;
  next_attempt_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

/* ── The query-key tree ─────────────────────────────────────────────────── */

export const webhookKeys = {
  all: ['cms', 'webhooks'] as const,
  list: () => [...webhookKeys.all, 'list'] as const,
  deliveries: (id: string) => [...webhookKeys.all, 'deliveries', id] as const,
};

/* ── Reads ──────────────────────────────────────────────────────────────── */

/** Every notification this site sends. */
export function useWebhooks() {
  return useQuery({
    queryKey: webhookKeys.list(),
    queryFn: () => api.get<WebhookSubscription[]>('/v1/webhooks/subscriptions'),
  });
}

/**
 * One webhook, read out of the loaded list. Returns the list's own loading and
 * error state alongside the resolved row, and `webhook: null` once the list has
 * loaded but holds no such id (deleted elsewhere, or a stale saved layout).
 */
export function useWebhook(id: string) {
  const query = useWebhooks();
  const webhook = query.data?.find((row) => row.id === id) ?? null;
  return { ...query, webhook };
}

/**
 * The recent attempts for one subscription.
 *
 * Kept OUT of the list payload: it is per-record detail, and the list only
 * needs the summary that rides on `health`.
 */
export function useWebhookDeliveries(id: string, enabled = true) {
  return useQuery({
    queryKey: webhookKeys.deliveries(id),
    queryFn: () =>
      api.get<{ items: WebhookDelivery[]; health: WebhookHealth }>(
        `/v1/webhooks/subscriptions/${id}/deliveries`
      ),
    enabled: enabled && id !== 'new',
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

/** Refetch the list AND the delivery history together. Refreshing only one of
 *  them let the badge say "Working" over a panel still saying "Nothing yet". */
export function useInvalidateWebhooks() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: webhookKeys.all });
  };
}

/* ── Writes ─────────────────────────────────────────────────────────────── */

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: WebhookEventKey[];
  active?: boolean;
}

/** Create returns the FULL signing secret — the only time it is the real value.
 *  The create pane must surface it before it is gone. */
export function useCreateWebhook() {
  const invalidate = useInvalidateWebhooks();
  return useMutation({
    mutationFn: (input: CreateWebhookInput) =>
      api.post<WebhookSubscription>('/v1/webhooks/subscriptions', input),
    onSuccess: () => {
      invalidate();
    },
  });
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  events?: WebhookEventKey[];
  active?: boolean;
}

export function useUpdateWebhook(id: string) {
  const invalidate = useInvalidateWebhooks();
  return useMutation({
    mutationFn: (patch: UpdateWebhookInput) =>
      api.patch<WebhookSubscription>(`/v1/webhooks/subscriptions/${id}`, patch),
    onSuccess: () => {
      invalidate();
    },
  });
}

export function useDeleteWebhook(id: string) {
  const invalidate = useInvalidateWebhooks();
  return useMutation({
    mutationFn: () => api.delete(`/v1/webhooks/subscriptions/${id}`),
    onSuccess: () => {
      // Safe here — unlike a single-record query, the collection endpoint still
      // resolves after the row is gone. The pane closes; the caller defers the
      // toast.
      invalidate();
    },
  });
}

/**
 * The server's own sentence for a 4xx, shown verbatim — the webhook routes name
 * the real problem far better than a status code. A 5xx carries no such
 * sentence, so it falls back to the caller's wording.
 */
export function webhookErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/** Medium date and time — a notification's moment is a fact people scan. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
