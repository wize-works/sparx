'use client';

// Feedback — the operator's direct line, and the replies that come back.
//
// This is the same /v1/me/feedback inbox the dashboard feeds (docs/112), so a
// note sent from a pane and a note sent from a dashboard page land in front of
// the same humans, in one thread, with one history. The workbench is not a
// second-class sender: everything the dashboard can do here — subject lines,
// history, threads, replies, the unread count, the sentiment pulse — is
// available from a pane too.
//
// It lives in its own module rather than in shell-data.ts because feedback is no
// longer one mutation: it is a small feature with six endpoints and its own
// cache keys, and folding that into the file that fetches the tenant name would
// make both harder to read.

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { api } from './client';

export type FeedbackCategory = 'idea' | 'problem' | 'question' | 'praise';
export type FeedbackSource = 'button' | 'pulse' | 'command';

/** Triage lifecycle. The workbench only ever READS these — the admin app owns
 *  every transition (docs/apps/admin/feedback.md §6). */
export type FeedbackStatus =
  'new' | 'triaged' | 'planned' | 'in_progress' | 'shipped' | 'declined' | 'answered';

export type FeedbackAuthorKind = 'staff' | 'user';

/**
 * The captured client context (docs/112 §4) — advisory metadata only, never
 * trusted for identity. Every field is optional because the server treats it
 * that way; a submission with no context is still a valid submission.
 */
export interface FeedbackContextPayload {
  route?: string;
  routePattern?: string | null;
  module?: string | null;
  section?: string | null;
  entity?: { type: string; id: string } | null;
  pageTitle?: string | null;
  property?: { id: string; name: string } | null;
  trail?: string[];
  viewport?: { width: number; height: number };
  device?: 'desktop' | 'tablet' | 'mobile';
  theme?: 'light' | 'dark';
  locale?: string;
  appVersion?: string;
  userAgent?: string;
}

export interface FeedbackInput {
  category: FeedbackCategory;
  subject?: string;
  body: string;
  sentiment?: number;
  source: FeedbackSource;
  context: FeedbackContextPayload;
}

export interface FeedbackSubmission {
  id: string;
  source: FeedbackSource;
  category: FeedbackCategory;
  subject: string | null;
  body: string;
  sentiment: number | null;
  status: FeedbackStatus;
  context: FeedbackContextPayload;
  attachmentAssetIds: string[];
  lastResponseAt: string | null;
  userUnread: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface FeedbackMessageRow {
  id: string;
  authorKind: FeedbackAuthorKind;
  authorName: string;
  body: string;
  attachmentAssetIds: string[];
  createdAt: string;
}

export interface FeedbackThread extends FeedbackSubmission {
  messages: FeedbackMessageRow[];
}

export interface FeedbackListResult {
  items: FeedbackSubmission[];
  unreadCount: number;
}

export interface PulseDescriptor {
  promptId: string;
  kind: 'sentiment';
  question: string;
}

export type PulseAction = 'shown' | 'dismissed' | 'answered';

/** Category presentation. The hint is the picker's tooltip — it tells someone
 *  which button is theirs before they have to guess. */
export const FEEDBACK_CATEGORIES: readonly {
  value: FeedbackCategory;
  label: string;
  hint: string;
}[] = [
  { value: 'idea', label: 'Idea', hint: 'A suggestion or a feature request' },
  { value: 'problem', label: 'Problem', hint: 'Something is broken or confusing' },
  { value: 'question', label: 'Question', hint: 'Ask us something' },
  { value: 'praise', label: 'Praise', hint: 'Tell us what you love' },
];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  triaged: 'Seen',
  planned: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
  declined: 'Declined',
  answered: 'Answered',
};

export const MAX_FEEDBACK_BODY = 5000;
export const MAX_FEEDBACK_SUBJECT = 160;

/* ── Queries ──────────────────────────────────────────────────────────────── */

/** My submissions, newest first, with the unread count alongside. */
export function useMyFeedback(enabled = true) {
  return useQuery({
    queryKey: ['feedback', 'list'],
    queryFn: () => api.get<FeedbackListResult>('/v1/me/feedback'),
    enabled,
  });
}

/**
 * Just the count, polled for the toolbar dot. Deliberately a separate endpoint
 * from the list: this runs every minute for the life of the session, and making
 * it fetch a hundred submission bodies to render one dot would be absurd.
 */
export function useFeedbackUnreadCount() {
  return useQuery({
    queryKey: ['feedback', 'unread-count'],
    queryFn: () => api.get<{ count: number }>('/v1/me/feedback/unread-count').then((r) => r.count),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

/** One submission and its messages. The GET clears the unread flag server-side. */
export function useFeedbackThread(id: string | null) {
  return useQuery({
    queryKey: ['feedback', 'thread', id],
    queryFn: () => api.get<FeedbackThread>(`/v1/me/feedback/${encodeURIComponent(id ?? '')}`),
    enabled: Boolean(id),
  });
}

/* ── Mutations ────────────────────────────────────────────────────────────── */

export function useSendFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FeedbackInput) => api.post<FeedbackSubmission>('/v1/me/feedback', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feedback'] });
    },
  });
}

export function useReplyToFeedback(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api.post<FeedbackMessageRow>(`/v1/me/feedback/${encodeURIComponent(id)}/messages`, { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feedback', 'thread', id] });
      void queryClient.invalidateQueries({ queryKey: ['feedback', 'list'] });
    },
  });
}

/* ── Pulse ────────────────────────────────────────────────────────────────── */

/**
 * Asks whether this person is eligible for a sentiment nudge. Eligibility is
 * decided entirely SERVER-side (account age, quarterly cadence, dismissal
 * backoff — docs/112 §5.2); the client only decides *when* to ask, so a cold
 * boot mid-task never triggers one.
 */
export function usePulse(route: string, enabled: boolean) {
  return useQuery({
    queryKey: ['feedback', 'pulse', route],
    queryFn: () => api.get<PulseDescriptor | null>('/v1/me/feedback/pulse', { route }),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
  });
}

/** Records shown / dismissed / answered so the cadence and the cap hold. */
export function recordPulseEvent(action: PulseAction, sentiment?: number): void {
  // Fire-and-forget: this is bookkeeping for a prompt the person has already
  // moved past. Failing to record it must never surface an error at them.
  void api.post('/v1/me/feedback/pulse/event', { action, sentiment }).catch(() => {
    /* ignore */
  });
}

/**
 * The friendly message for a failed submission. The server returns a deliberate
 * 429 with real copy when someone has sent a lot recently (docs/112 §3.2) —
 * that is a thank-you, not an error, so it must reach the person intact rather
 * than being flattened into "something went wrong."
 */
export function feedbackErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message;
  if (code === 'RATE_LIMITED' && message) return message;
  return 'That didn’t send. Give it a moment and try again.';
}

/** A 404 is a fact about the message ("it is gone"); anything else is a fact
 *  about the network. A thread pane needs to tell those two apart. */
export function isFeedbackNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
