'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE WEBHOOKS DATA LAYER
//
// A webhook tells ANOTHER system, over the internet, the moment something
// happens on your site — you publish a page, a file finishes uploading, a
// redirect is added. A developer building on top of your content points a
// webhook at their own address and gets a message there instead of having to
// poll for changes.
//
// Everything the Webhooks list and the webhook editor read or write goes
// through here, so the list and the editor can never disagree about a field one
// of them forgot to fetch, and a Save in the editor refreshes the row in the
// list docked beside it.
//
// ── One list, no single-record endpoint ────────────────────────────────────
//
// api-rest exposes the collection (GET), a create (POST), a patch and a delete
// — but NO `GET /:id`. The set is small and fully returned in one call, so the
// editor reads its record straight out of the loaded list (`useWebhook`) rather
// than a route that does not exist. A write invalidates the list, and both the
// list AND every open editor re-derive from the one refreshed array.
//
// ── The signing secret is shown ONCE ───────────────────────────────────────
//
// The server generates the secret and returns the FULL value exactly once, in
// the create response (Stripe-style). Every later read returns a redacted
// preview only (`whsec_xxxxxxxx…`). There is no reveal-again and no rotate
// endpoint, so the create pane is the one and only place the whole secret can
// be copied — see webhook-detail.tsx.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';

/* ── Shapes ─────────────────────────────────────────────────────────────── */

/** Exactly the event keys the server accepts (`EVENT_KEYS` in the route). We do
 *  NOT invent these — an off-list key is rejected by the create/patch schema. */
export type WebhookEventKey =
  | 'content.entry.created'
  | 'content.entry.updated'
  | 'content.entry.published'
  | 'content.entry.scheduled'
  | 'content.entry.unpublished'
  | 'content.entry.deleted'
  | 'media.uploaded'
  | 'media.processed'
  | 'form.submitted'
  | 'redirect.added'
  | 'redirect.changed'
  | 'redirect.removed'
  // Selling (persona issue 407). `order.placed` stays absent: declared in the
  // registry and published by nothing, so a subscription to it never fires.
  | 'order.paid'
  | 'payment.captured'
  | 'payment.failed'
  // Inventory (docs/146 Phase 12.3). `inventory.levels.updated` is absent on
  // purpose: it exists in the event registry and nothing publishes it, so a
  // subscription to it would sit silent and read as a broken endpoint.
  | 'inventory.adjusted'
  | 'inventory.low'
  | 'inventory.depleted'
  | 'inventory.count.completed'
  | 'inventory.reconciliation.drift'
  | 'inventory.oversell.blocked'
  | 'inventory.classification.changed'
  | 'inventory.lot.expiring'
  | 'inventory.bin.moved'
  | 'inventory.pick_list.created'
  | 'inventory.pick_list.completed'
  | 'inventory.pick.short'
  | 'inventory.package.packed'
  | 'inventory.transfer.shipped'
  | 'inventory.transfer.received'
  | 'inventory.assembly.completed'
  | 'inventory.purchase_order.late'
  | 'inventory.backorder.created'
  | 'inventory.backorder.allocated'
  | 'inventory.source.created'
  | 'inventory.source.sync_started'
  | 'inventory.source.sync_completed'
  | 'inventory.source.error'
  | 'inventory.source.stale'
  | 'inventory.source.recovered';

/** One subscription, exactly as api-rest serialises it (camelCase — the handler
 *  spreads the Prisma row). `signingSecret` is a redacted preview on reads and
 *  the full value ONLY on the create response. */
export interface WebhookSubscription {
  id: string;
  name: string;
  url: string;
  /** Kept as `string[]` rather than `WebhookEventKey[]`: a subscription saved by
   *  an older release could carry a key this build does not know, and it should
   *  still list rather than fail to type. `eventLabel` handles the unknown. */
  events: string[];
  signingSecret: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ── The one human catalogue of events ──────────────────────────────────────
 *
 * The keys are wire values; everything a person reads comes from here. Grouped
 * so the editor can lay them out under plain headings, and worded for a business
 * owner — "Content published", not `content.entry.published`. */

export type WebhookEventGroup =
  'Selling' | 'Content' | 'Files' | 'Redirects' | 'Stock' | 'Warehouse' | 'Supply' | 'Stock feeds';

export interface WebhookEventDef {
  key: WebhookEventKey;
  label: string;
  description: string;
  group: WebhookEventGroup;
}

export const WEBHOOK_EVENTS: readonly WebhookEventDef[] = [
  /* ── Selling ───────────────────────────────────────────────────────────── */

  {
    key: 'order.paid',
    label: 'Order paid',
    description:
      'Somebody has paid for an order. The money is on its way to you and the order is ready to be filled. This is the one most people are here for.',
    group: 'Selling',
  },
  {
    key: 'payment.captured',
    label: 'Payment taken',
    description:
      'A card payment goes through. On an ordinary order this happens at the same moment as the one above; on a deposit or a later charge it does not, which is why both exist.',
    group: 'Selling',
  },
  {
    key: 'payment.failed',
    label: 'Payment failed',
    description:
      'A card payment was declined or could not be taken. Worth watching — a run of these is money you are not getting.',
    group: 'Selling',
  },
  {
    key: 'form.submitted',
    label: 'Form filled in',
    description:
      'Somebody fills in a form on your site — a contact page, an enquiry, a trade application.',
    group: 'Selling',
  },

  /* ── Content ───────────────────────────────────────────────────────────── */

  {
    key: 'content.entry.published',
    label: 'Content published',
    description: 'Something you write goes live on your site.',
    group: 'Content',
  },
  {
    key: 'content.entry.unpublished',
    label: 'Content taken down',
    description: 'A live page is unpublished and becomes a private draft again.',
    group: 'Content',
  },
  {
    key: 'content.entry.scheduled',
    label: 'Content scheduled',
    description: 'A page is set to publish itself at a future time.',
    group: 'Content',
  },
  {
    key: 'content.entry.created',
    label: 'Content created',
    description: 'A brand-new draft is started, before it is published.',
    group: 'Content',
  },
  {
    key: 'content.entry.updated',
    label: 'Content edited',
    description: 'Any change is saved to an existing page, draft or live.',
    group: 'Content',
  },
  {
    key: 'content.entry.deleted',
    label: 'Content deleted',
    description: 'A page is removed for good.',
    group: 'Content',
  },
  {
    key: 'media.uploaded',
    label: 'File uploaded',
    description: 'An image, video or file is added to your media library.',
    group: 'Files',
  },
  {
    key: 'media.processed',
    label: 'File ready',
    description: 'An uploaded file finishes processing and is ready to use.',
    group: 'Files',
  },
  {
    key: 'redirect.added',
    label: 'Redirect added',
    description: 'A rule is set up to send an old web address to a new one.',
    group: 'Redirects',
  },
  {
    key: 'redirect.changed',
    label: 'Redirect changed',
    description: 'An existing rule is repointed at a different address.',
    group: 'Redirects',
  },
  {
    key: 'redirect.removed',
    label: 'Redirect removed',
    description: 'A redirect rule is deleted.',
    group: 'Redirects',
  },

  /* ── Stock ─────────────────────────────────────────────────────────────── */

  {
    key: 'inventory.adjusted',
    label: 'Stock changed',
    description:
      'Any quantity moves, for any reason — a sale, a delivery, a count, a correction. The busiest of these by a wide margin; take it when another system needs to mirror your numbers, not when a person needs telling.',
    group: 'Stock',
  },
  {
    key: 'inventory.low',
    label: 'Stock running low',
    description: 'An item drops to the level you said counts as low, and is worth reordering.',
    group: 'Stock',
  },
  {
    key: 'inventory.depleted',
    label: 'Stock ran out',
    description: 'An item reaches zero at a location and can no longer be sold from it.',
    group: 'Stock',
  },
  {
    key: 'inventory.count.completed',
    label: 'Count posted',
    description:
      'A stock count is applied and the figures on the shelf become the figures in the system.',
    group: 'Stock',
  },
  {
    key: 'inventory.reconciliation.drift',
    label: 'Numbers stopped adding up',
    description:
      'The running total for an item no longer matches the sum of its movements. This is the alarm that says a figure somewhere cannot be trusted.',
    group: 'Stock',
  },
  {
    key: 'inventory.oversell.blocked',
    label: 'Oversell prevented',
    description:
      'Someone tried to buy more than you actually had and was stopped. Worth watching — a run of these is demand you are turning away.',
    group: 'Stock',
  },
  {
    key: 'inventory.classification.changed',
    label: 'Item importance changed',
    description:
      'An item moves between top value, mid value and long tail, or its demand becomes predictable enough to forecast.',
    group: 'Stock',
  },
  {
    key: 'inventory.lot.expiring',
    label: 'Batch nearing expiry',
    description: 'A batch crosses into the window where it needs shifting before it is unsellable.',
    group: 'Stock',
  },

  /* ── Warehouse ─────────────────────────────────────────────────────────── */

  {
    key: 'inventory.bin.moved',
    label: 'Stock moved shelf',
    description:
      'Stock is put away or moved between shelves inside one location. The location total does not change — nothing entered or left the building.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.pick_list.created',
    label: 'Picking started',
    description: 'A picking run is raised and the work is ready for somebody on the floor.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.pick_list.completed',
    label: 'Picking finished',
    description: 'Every line on a picking run is accounted for and the run is closed.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.pick.short',
    label: 'Shelf came up short',
    description:
      'A picker found fewer than the system promised. The earliest honest warning that a number is wrong, straight from the floor.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.package.packed',
    label: 'Box packed',
    description: 'A box is sealed and verified against what the order asked for.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.transfer.shipped',
    label: 'Transfer sent',
    description: 'Stock leaves one of your locations bound for another and is now in transit.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.transfer.received',
    label: 'Transfer arrived',
    description: 'Stock in transit lands at the receiving location and is sellable again.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.assembly.completed',
    label: 'Build finished',
    description:
      'A build run is completed: the components come off the shelf and the finished item goes on.',
    group: 'Warehouse',
  },

  /* ── Supply ────────────────────────────────────────────────────────────── */

  {
    key: 'inventory.purchase_order.late',
    label: 'Supplier order late',
    description: 'A purchase order passes the date the supplier promised it, and has not arrived.',
    group: 'Supply',
  },
  {
    key: 'inventory.backorder.created',
    label: 'Item promised without stock',
    description:
      'Something is sold that you cannot ship yet, so a promise to a named customer now exists.',
    group: 'Supply',
  },
  {
    key: 'inventory.backorder.allocated',
    label: 'Promise covered by new stock',
    description:
      'Arriving stock is assigned to somebody already waiting for it, in the order they were promised.',
    group: 'Supply',
  },

  /* ── Stock feeds ───────────────────────────────────────────────────────── */

  {
    key: 'inventory.source.created',
    label: 'Feed connected',
    description: 'A new supplier or warehouse feed is set up to send you stock figures.',
    group: 'Stock feeds',
  },
  {
    key: 'inventory.source.sync_started',
    label: 'Feed started',
    description: 'A scheduled pull from one of your feeds begins.',
    group: 'Stock feeds',
  },
  {
    key: 'inventory.source.sync_completed',
    label: 'Feed finished',
    description: 'A pull finishes, with how many lines it changed.',
    group: 'Stock feeds',
  },
  {
    key: 'inventory.source.error',
    label: 'Feed failed',
    description:
      'A feed could not be read. Until it is fixed, its figures are frozen at whatever they last were.',
    group: 'Stock feeds',
  },
  {
    key: 'inventory.source.stale',
    label: 'Feed went quiet',
    description:
      'A feed has not reported for long enough that its figures should no longer be relied on. Silence is not the same as no change, and this is the event that says so.',
    group: 'Stock feeds',
  },
  {
    key: 'inventory.source.recovered',
    label: 'Feed recovered',
    description: 'A feed that was failing or quiet starts reporting again.',
    group: 'Stock feeds',
  },
] as const;

const EVENT_LABELS = new Map<string, string>(WEBHOOK_EVENTS.map((e) => [e.key, e.label]));

export const WEBHOOK_EVENT_GROUPS: readonly WebhookEventGroup[] = [
  'Selling',
  'Content',
  'Files',
  'Redirects',
  'Stock',
  'Warehouse',
  'Supply',
  'Stock feeds',
];

/** The plain-language name for an event key, or the raw key for one this build
 *  does not recognise (a subscription saved by a newer release). */
export function eventLabel(key: string): string {
  return EVENT_LABELS.get(key) ?? key;
}

/* ── The query-key tree ─────────────────────────────────────────────────── */

export const webhookKeys = {
  all: ['cms', 'webhooks'] as const,
  list: () => [...webhookKeys.all, 'list'] as const,
};

/* ── Reads ──────────────────────────────────────────────────────────────── */

/**
 * Every webhook this site has. The endpoint returns the whole set in one call
 * (no paging), so there is one query and the list, the editor and the count all
 * read from it.
 */
export function useWebhooks() {
  return useQuery({
    queryKey: webhookKeys.list(),
    queryFn: () => api.get<WebhookSubscription[]>('/v1/webhooks/subscriptions'),
  });
}

/**
 * One webhook, for the editor — read out of the loaded list rather than a
 * single-record route (there isn't one). Returns the list's own loading/error
 * state alongside the resolved row, and `webhook: null` once the list has
 * loaded but holds no such id (deleted elsewhere, or a stale saved layout).
 */
export function useWebhook(id: string) {
  const query = useWebhooks();
  const webhook = query.data?.find((row) => row.id === id) ?? null;
  return { ...query, webhook };
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

function useInvalidateWebhooks() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: webhookKeys.list() });
  };
}

/* ── Writes ─────────────────────────────────────────────────────────────── */

export interface CreateWebhookInput {
  name: string;
  url: string;
  events: WebhookEventKey[];
  active?: boolean;
}

/** Create returns the FULL signing secret in `signingSecret` — the only time it
 *  is ever the real value. The create pane must surface it before it is gone. */
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
      // Refreshing the list is safe here — unlike a single-record detail query,
      // the collection endpoint still resolves after the row is gone (it just
      // returns one fewer). The pane closes; the toast is deferred by the caller.
      invalidate();
    },
  });
}

/* ── Saying what a state means ──────────────────────────────────────────── */

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/** Active vs paused, in an owner's words, with the tone that carries the color
 *  on a `<Badge>`. Paused is `warning`, not neutral: it is a deliberately-off
 *  state worth noticing, not a bland fact. */
export function webhookState(active: boolean): { label: string; tone: Tone; detail: string } {
  return active
    ? {
        label: 'Active',
        tone: 'success',
        detail: 'Notifications are being sent to this address as events happen.',
      }
    : {
        label: 'Paused',
        tone: 'warning',
        detail: 'No notifications are being sent. Turn it back on whenever you like.',
      };
}

/**
 * The server's own sentence for a 4xx, shown verbatim — the webhook routes name
 * the real problem (a bad URL, an unknown event) far better than a status code.
 * A 5xx carries no such sentence, so it falls back to the caller's wording.
 */
export function webhookErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/** Medium date and time — a webhook's "added" moment is a fact people scan. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
