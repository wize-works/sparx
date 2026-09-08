// Per-message handler. Every event the worker consumes is a small "go do this one thing
// against a platform API" instruction, dispatched here by type:
//
//   · social.post.due          → publish that post's due destinations        (drainPost)
//   · social.metrics.collect   → snapshot each published destination's numbers
//   · social.connection.check  → refresh a grant / prove it still works      (health)
//   · social.inbox.sync        → pull new comments, mentions and reviews
//   · social.inbox.reply       → send one reply back to the platform
//
// All of them are safe to redeliver: the drain re-attempts only still-pending
// destinations, a collect writes another snapshot, a health check is a read plus an
// idempotent status flip, an inbox sync upserts on the platform's own id, and a reply is
// guarded by the item's `replied_at`. So returning 500 on a transient failure to trigger
// redelivery is always safe.

import { z } from 'zod';
import type { Logger } from 'pino';

import { drainPost, type DrainOutcome } from './publish.js';
import { collectPostMetrics, type CollectOutcome } from './collect.js';
import { checkConnection, type HealthOutcome } from './health.js';
import { sendInboxReply, syncInbox, type InboxOutcome, type ReplyOutcome } from './inbox.js';

const PostRef = z.object({ postId: z.string().uuid() });

const SocialWorkerEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('social.post.due'), tenantId: z.string().uuid(), data: PostRef }),
  z.object({
    type: z.literal('social.metrics.collect'),
    tenantId: z.string().uuid(),
    data: PostRef,
  }),
  z.object({
    type: z.literal('social.connection.check'),
    tenantId: z.string().uuid(),
    data: z.object({ connectionId: z.string().uuid() }),
  }),
  z.object({
    type: z.literal('social.inbox.sync'),
    tenantId: z.string().uuid(),
    data: z.object({ socialTargetId: z.string().uuid() }),
  }),
  z.object({
    type: z.literal('social.inbox.reply'),
    tenantId: z.string().uuid(),
    data: z.object({ itemId: z.string().uuid() }),
  }),
]);
export type SocialWorkerEvent = z.infer<typeof SocialWorkerEvent>;

export type SocialWorkerOutcome =
  CollectOutcome | DrainOutcome | HealthOutcome | InboxOutcome | ReplyOutcome;

export function parseEvent(raw: unknown): SocialWorkerEvent | null {
  const result = SocialWorkerEvent.safeParse(raw);
  return result.success ? result.data : null;
}

export async function handle(
  event: SocialWorkerEvent,
  logger: Logger
): Promise<SocialWorkerOutcome> {
  switch (event.type) {
    case 'social.metrics.collect':
      return collectPostMetrics(event.tenantId, event.data.postId, logger);
    case 'social.connection.check':
      return checkConnection(event.tenantId, event.data.connectionId, logger);
    case 'social.inbox.sync':
      return syncInbox(event.tenantId, event.data.socialTargetId, logger);
    case 'social.inbox.reply':
      return sendInboxReply(event.tenantId, event.data.itemId, logger);
    default:
      return drainPost(event.tenantId, event.data.postId, logger);
  }
}
