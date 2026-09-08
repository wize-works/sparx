'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE SOCIAL-POSTING DATA LAYER
//
// One place your business posts to every social account it has connected —
// Google Business, LinkedIn and, as they roll out, Facebook, Instagram and the
// rest. You write a post once; sparx sends it to each account you pick, in that
// account's own shape.
//
// This file is the ONE door to the social API in api-rest. All four surfaces —
// Connections, the Composer, the Queue and the Approvals inbox — read and write
// through here, so the cache keys and the typed wire shapes live in one place
// and never drift apart.
//
// ── The endpoints (wizeworks/services/api-rest/.../v1/social) ────────────────────────
//   GET    /v1/social                     → { connections, catalog, settings }
//   GET    /v1/social/:platform/connect-url?redirect_uri=… → { url }  (admin)
//   POST   /v1/social/callback            → finish an OAuth connect     (admin)
//   PATCH  /v1/social/targets/:id         → turn one destination on/off (admin)
//   DELETE /v1/social/:platform           → disconnect a platform       (admin)
//   PATCH  /v1/social/settings            → the require-approval default (admin)
//   POST   /v1/social/posts               → save a draft + its targets  (editor)
//   GET    /v1/social/posts?status=…      → the queue / inbox           (viewer)
//   GET    /v1/social/posts/:id           → one post + per-target status (viewer)
//   PATCH  /v1/social/posts/:id           → edit a draft                (editor)
//   POST   /v1/social/posts/:id/submit    → draft → awaiting approval    (editor)
//   POST   /v1/social/posts/:id/schedule  → set a future time           (editor)
//   POST   /v1/social/posts/:id/approve   → approve (→ scheduled/publish) (admin)
//   POST   /v1/social/posts/:id/reject    → reject (→ draft)             (admin)
//   POST   /v1/social/posts/:id/publish   → publish now                 (admin)
//   DELETE /v1/social/posts/:id           → delete                      (admin)
//
// ── The key contract ───────────────────────────────────────────────────────
//   ['social']                       the root every read nests under
//   ['social','overview']            connections + platform catalog + settings
//   ['social','posts', {status}]     the queue / inbox, optionally by status
//   ['social','posts','detail', id]  one post, in full
//
// A connection write invalidates the ['social'] ROOT (connections AND the
// composer's target list move together); a post write invalidates the posts
// sub-tree so the queue, the inbox and the open composer all refresh at once.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';

/* ── Shared vocabulary ──────────────────────────────────────────────────── */

/** The platforms the module knows about. Kept open (a plain string) at the wire
 *  boundary so a platform the server adds later never breaks the type — display
 *  names always come from the catalog payload, never a hardcoded table. */
export type SocialPlatform = string;

/** A semantic tone for a `<Badge color>` — status is its own color axis. */
export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/* ── Connections ────────────────────────────────────────────────────────── */

/** One concrete destination a connection unlocks — a specific Facebook Page, a
 *  LinkedIn company page, a Google Business location. The tenant turns each on
 *  or off individually. */
export interface SocialTarget {
  id: string;
  externalTargetId: string;
  name: string;
  avatarUrl: string | null;
  enabled: boolean;
}

export type ConnectionStatus = 'active' | 'expired' | 'revoked';

/** One connected account. A grant can carry several targets. */
export interface SocialConnection {
  id: string;
  platform: SocialPlatform;
  status: ConnectionStatus;
  propertyId: string | null;
  displayName: string | null;
  externalId: string | null;
  avatarUrl: string | null;
  connectedAt: string;
  targets: SocialTarget[];
}

/** The posting rules for one platform — the composer validates against these at
 *  author time, so "too long for X" shows before anything is scheduled. */
export interface PlatformConstraints {
  maxTextLength: number;
  maxMediaCount: number;
  supportedMedia: ('image' | 'video')[];
  requiresMedia: boolean;
  aspectRatios?: string[];
}

export type PlatformPhase = 'v1' | 'Phase 2' | 'Phase 3';
export type PlatformAvailability = 'available' | 'coming_soon';

/** A platform you could connect, with its display copy and posting rules. */
export interface CatalogEntry {
  platform: SocialPlatform;
  name: string;
  blurb: string;
  phase: PlatformPhase;
  availability: PlatformAvailability;
  constraints: PlatformConstraints;
}

export interface SocialSettings {
  requireApproval: boolean;
  /** Whether outbound links carry tracking so the visits they drive show up in reports. */
  trackLinks: boolean;
}

/** The everything-view GET /v1/social returns. */
export interface SocialOverview {
  connections: SocialConnection[];
  catalog: CatalogEntry[];
  settings: SocialSettings;
}

/** What a platform will and won't let one connected account do. Mirrors
 *  `SocialConnectionReadiness` in @wizeworks/social. */
export type ReadinessVerdict =
  'ready' | 'permissions_missing' | 'awaiting_review' | 'reconnect_required' | 'unverifiable';

export interface ConnectionReadiness {
  connectionId: string;
  platform: string;
  displayName: string | null;
  status: string;
  verdict: ReadinessVerdict;
  headline: string;
  detail: string;
  caveat: string | null;
  required: string[];
  granted: string[];
  missing: string[];
  grantedSource: 'platform' | 'stored' | 'none';
  checkedAt: string;
}

/* ── Posts ──────────────────────────────────────────────────────────────── */

export type PostStatus =
  | 'draft'
  | 'pending_approval'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'partially_published'
  | 'failed';

export type PostTargetStatus = 'pending' | 'publishing' | 'published' | 'failed' | 'skipped';

/** One post's fan-out to a single destination, with that destination's own
 *  result once it publishes. */
export interface PostTarget {
  id: string;
  socialTargetId: string;
  targetName: string;
  platform: SocialPlatform;
  status: PostTargetStatus;
  externalId: string | null;
  permalink: string | null;
  error: string | null;
  publishedAt: string | null;
  /** The wording written just for this destination, editable after the post is saved. */
  textOverride: string | null;
  firstComment: string | null;
  /** This destination's OWN send time; null = it goes when the post does. */
  scheduledAt: string | null;
}

export interface Post {
  id: string;
  propertyId: string | null;
  body: string;
  link: string | null;
  mediaAssetIds: string[];
  status: PostStatus;
  source: string;
  sourceRef: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  /** Why a reviewer sent it back, when they did. */
  reviewNote: string | null;
  /** In the pool the posting cadence recycles from. */
  evergreen: boolean;
  targets: PostTarget[];
}

/** The per-target instruction sent when composing — a base post can carry a
 *  tweak for one platform without changing it for the others. */
export interface ComposeTarget {
  targetId: string;
  textOverride?: string;
  firstComment?: string;
}

export interface CreatePostInput {
  body: string;
  link?: string | null;
  mediaAssetIds?: string[];
  source?: string;
  sourceRef?: string | null;
  targets: ComposeTarget[];
}

export interface UpdatePostInput {
  body?: string;
  link?: string | null;
  mediaAssetIds?: string[];
}

/* ── Insights (how the posts did) ───────────────────────────────────────── */

/** One account's totals across the window — everything summed over its posts. */
export interface InsightsAccount {
  socialTargetId: string;
  name: string;
  platform: SocialPlatform;
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
}

/** One post's row in the leaderboard — the best performers over the window. */
export interface InsightsTopPost {
  postId: string;
  postTargetId: string;
  excerpt: string;
  publishedAt: string | null;
  platform: SocialPlatform;
  targetName: string;
  permalink: string | null;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
  engagements: number;
}

/** The performance roll-up behind the Insights surface. */
export interface SocialInsights {
  windowDays: number;
  totals: { posts: number; engagements: number; reach: number; impressions: number };
  accounts: InsightsAccount[];
  topPosts: InsightsTopPost[];
}

/**
 * One reading of a destination's numbers. Every count is nullable on purpose: a
 * platform that has not granted the insights scope reports `null` for reach and
 * views (never `0`, which is a real value), so the UI must show a dash — not a
 * fabricated zero — where a number was never available.
 */
export interface MetricSnapshot {
  likes: number | null;
  comments: number | null;
  shares: number | null;
  impressions: number | null;
  reach: number | null;
  collectedAt: string;
}

/** Per-destination metrics for one post — the latest reading plus its history. */
export interface PostMetrics {
  postId: string;
  targets: {
    postTargetId: string;
    socialTargetId: string;
    targetName: string;
    platform: SocialPlatform;
    permalink: string | null;
    latest: MetricSnapshot | null;
    history: MetricSnapshot[];
  }[];
}

/* ── Query keys ─────────────────────────────────────────────────────────── */

export const socialKeys = {
  all: ['social'] as const,
  overview: ['social', 'overview'] as const,
  posts: (status?: string) => ['social', 'posts', { status: status ?? null }] as const,
  post: (id: string) => ['social', 'posts', 'detail', id] as const,
  insights: (windowDays: number) => ['social', 'insights', windowDays] as const,
  metrics: (postId: string) => ['social', 'posts', 'metrics', postId] as const,
  hashtagSets: ['social', 'hashtag-sets'] as const,
  slots: ['social', 'slots'] as const,
  bestTime: (timezone: string) => ['social', 'best-time', timezone] as const,
  inbox: (filter: string) => ['social', 'inbox', filter] as const,
  inboxCount: ['social', 'inbox', 'count'] as const,
  inboxThread: (id: string) => ['social', 'inbox', 'thread', id] as const,
  readiness: ['social', 'readiness'] as const,
};

/* ── Reads ──────────────────────────────────────────────────────────────── */

/** How often an open post detail re-checks itself while its targets are still going out
 *  (status `publishing`). Brisk enough to feel live as each account lands, and it stops
 *  the instant the post reaches a settled status. */
const PUBLISHING_POLL_MS = 2500;

/** Connections, the connectable-platform catalog, and the approval setting — one
 *  request behind the Connections surface AND the composer's destination list. */
export function useSocialOverview() {
  return useQuery({
    queryKey: socialKeys.overview,
    queryFn: () => api.get<SocialOverview>('/v1/social'),
  });
}

/** Per-account permission check — what each platform granted vs what the module needs.
 *  Deliberately NOT folded into {@link useSocialOverview}: it calls out to every platform
 *  in turn, so pinning it to the Connections list would make opening the list wait on
 *  eight other companies. Only fetched when the check is actually opened, and never
 *  refetched on window focus — a person leaving and returning to the tab should not spend
 *  another round of platform rate limit. */
export function useSocialReadiness(enabled: boolean) {
  return useQuery({
    queryKey: socialKeys.readiness,
    queryFn: () => api.get<{ connections: ConnectionReadiness[] }>('/v1/social/readiness'),
    enabled,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
}

/** The queue / inbox. `status` filters server-side; omit it for everything. */
export function useSocialPosts(status?: PostStatus) {
  return useQuery({
    queryKey: socialKeys.posts(status),
    queryFn: () =>
      api
        .get<{ posts: Post[] }>('/v1/social/posts', status ? { status } : undefined)
        .then((r) => r.posts),
    // Keep the queue/board honest while a post is going out: as long as ANY row is
    // publishing (its targets landing in the background), poll so it moves to
    // published/failed on its own — no manual refresh. Stops once the list is settled.
    refetchInterval: (q) =>
      (q.state.data ?? []).some((p) => p.status === 'publishing') ? PUBLISHING_POLL_MS : false,
  });
}

export function useSocialPost(id: string) {
  return useQuery({
    queryKey: socialKeys.post(id),
    queryFn: () => api.get<Post>(`/v1/social/posts/${id}`),
    enabled: id !== 'new',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
    // "Publish now" hands the post to a background drain that flips each target
    // pending → published/failed over the next few seconds (a Pub/Sub worker, not the
    // request). A one-shot fetch would strand the just-published detail on its
    // "publishing / Waiting" snapshot until a manual reopen. Poll ONLY in that transient
    // window — every other status (draft, scheduled, pending_approval, published,
    // partially_published, failed) is settled, so the clock stops the moment it lands.
    refetchInterval: (q) => (q.state.data?.status === 'publishing' ? PUBLISHING_POLL_MS : false),
  });
}

/**
 * How many posts are waiting for an admin — the number on the Approvals nav row.
 *
 * Polls slowly: an automation drafting a post is not something anyone watches
 * second-by-second, and this runs whenever the Social panel is open. Fails quietly to
 * `0`, because a badge is not worth an error state.
 */
export function useApprovalCount(): number {
  const query = useQuery({
    queryKey: socialKeys.posts('pending_approval'),
    queryFn: () =>
      api
        .get<{ posts: Post[] }>('/v1/social/posts', { status: 'pending_approval' })
        .then((r) => r.posts),
    refetchInterval: 120_000,
    retry: false,
  });
  return query.data?.length ?? 0;
}

/** The performance roll-up over the last `windowDays` — totals, per-account rows,
 *  and the best-performing posts. Behind the Insights surface. */
export function useSocialInsights(windowDays: number) {
  return useQuery({
    queryKey: socialKeys.insights(windowDays),
    queryFn: () => api.get<SocialInsights>('/v1/social/insights', { windowDays }),
  });
}

/**
 * One post's per-destination numbers — the latest reading and its history.
 *
 * `collecting` turns on a short poll. Asking for fresh numbers only ENQUEUES the
 * platform round-trip (the endpoint 202s immediately), so a single refetch on the
 * mutation's success lands before the worker has written anything and reads back
 * the same empty result — the button appears to do nothing. While a collection is
 * in flight we re-read every few seconds instead, and the caller turns this off as
 * soon as a newer snapshot arrives or it has waited long enough.
 */
export function usePostMetrics(postId: string, collecting = false) {
  return useQuery({
    queryKey: socialKeys.metrics(postId),
    queryFn: () => api.get<PostMetrics>(`/v1/social/posts/${postId}/metrics`),
    enabled: postId !== 'new',
    refetchInterval: collecting ? 4000 : false,
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

function useInvalidateOverview() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: socialKeys.overview });
  };
}

function useInvalidatePosts() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    // The ['social','posts'] prefix covers every status filter AND every detail
    // at once, so one write refreshes the queue, the inbox and the open composer.
    void queryClient.invalidateQueries({ queryKey: ['social', 'posts'] });
    if (id) void queryClient.invalidateQueries({ queryKey: socialKeys.post(id) });
  };
}

/* ── Connection mutations ───────────────────────────────────────────────── */

/** Ask the server for the platform's consent URL to send the owner to.
 *  `redirectUri` is the page on this app that hands the code back (a popup). */
export function useConnectUrl() {
  return useMutation({
    mutationFn: ({ platform, redirectUri }: { platform: SocialPlatform; redirectUri: string }) =>
      api.get<{ url: string }>(`/v1/social/${platform}/connect-url`, { redirect_uri: redirectUri }),
  });
}

/** Finish an OAuth connect: trade the returned code + state for a stored,
 *  encrypted grant and its discovered destinations. */
export function useCompleteConnect() {
  const invalidate = useInvalidateOverview();
  return useMutation({
    mutationFn: (input: { code: string; state: string }) =>
      api.post<{
        connected: boolean;
        platform: SocialPlatform;
        externalId: string | null;
        targets: SocialTarget[];
      }>('/v1/social/callback', input),
    onSuccess: () => {
      invalidate();
    },
  });
}

/** Turn one destination on or off. */
export function useToggleTarget() {
  const invalidate = useInvalidateOverview();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch<{ id: string; enabled: boolean }>(`/v1/social/targets/${id}`, { enabled }),
    onSuccess: () => {
      invalidate();
    },
  });
}

/** Disconnect every connection for a platform. Destinations cascade away. */
export function useDisconnectPlatform() {
  const invalidate = useInvalidateOverview();
  return useMutation({
    mutationFn: (platform: SocialPlatform) => api.delete(`/v1/social/${platform}`),
    onSuccess: () => {
      invalidate();
    },
  });
}

/** Change one of the module's two tenant-wide settings — whether posts need an admin's
 *  approval, and whether outbound links carry tracking. */
export function useUpdateSocialSettings() {
  const invalidate = useInvalidateOverview();
  return useMutation({
    mutationFn: (patch: Partial<SocialSettings>) =>
      api.patch<{ settings: SocialSettings }>('/v1/social/settings', patch),
    onSuccess: () => {
      invalidate();
    },
  });
}

/* ── Post mutations ─────────────────────────────────────────────────────── */

export function useCreatePost() {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (input: CreatePostInput) => api.post<Post>('/v1/social/posts', input),
    onSuccess: (created) => {
      invalidate(created.id);
    },
  });
}

/** What to do with a freshly composed post, in one click from the composer's
 *  `new` state: keep it as a draft, send it for approval, schedule it, or (for an
 *  admin) publish it now. */
export type ComposeAction = 'draft' | 'submit' | 'schedule' | 'publish';

/**
 * Create a post and, in the same step, move it where the operator asked. The
 * create endpoint always makes a draft (it is the only call that accepts the
 * chosen destinations + per-destination tweaks), so a one-click "schedule" is a
 * create followed by the matching lifecycle call — done here, behind the data
 * layer, so a surface never issues a raw request. Always resolves to the created
 * post so the composer can swap `{id:'new'}` → `{id}`.
 */
export function useComposePost() {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: async ({
      input,
      action,
      scheduledAt,
    }: {
      input: CreatePostInput;
      action: ComposeAction;
      scheduledAt?: string;
    }): Promise<Post> => {
      const post = await api.post<Post>('/v1/social/posts', input);
      if (action === 'submit') {
        return api.post<Post>(`/v1/social/posts/${post.id}/submit`);
      }
      if (action === 'schedule' && scheduledAt) {
        return api.post<Post>(`/v1/social/posts/${post.id}/schedule`, { scheduledAt });
      }
      if (action === 'publish') {
        await api.post(`/v1/social/posts/${post.id}/publish`);
        return post;
      }
      return post;
    },
    onSuccess: (post) => {
      invalidate(post.id);
    },
  });
}

export function useUpdatePost(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (input: UpdatePostInput) => api.patch<Post>(`/v1/social/posts/${id}`, input),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function useSubmitPost(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: () => api.post<Post>(`/v1/social/posts/${id}/submit`),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function useSchedulePost(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (scheduledAt: string) =>
      api.post<Post>(`/v1/social/posts/${id}/schedule`, { scheduledAt }),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

/**
 * Reschedule ANY post to a new time in one call — the drag-to-reschedule path on the
 * calendar, where the id is per-drop, not fixed (so `useSchedulePost(id)`'s hook-per-id
 * shape does not fit). Optimistic: the post's `scheduledAt` is patched in every posts
 * list cache the instant it is dropped, so the chip lands on the new day with no wait,
 * and rolls back if the server refuses (a time in the past, a post past its window).
 */
export function useReschedulePost() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: ({ id, scheduledAt }: { id: string; scheduledAt: string }) =>
      api.post<Post>(`/v1/social/posts/${id}/schedule`, { scheduledAt }),
    onMutate: async ({ id, scheduledAt }) => {
      await queryClient.cancelQueries({ queryKey: ['social', 'posts'] });
      // Snapshot every posts cache (each status filter) so an error can roll back.
      const snapshot = queryClient.getQueriesData<Post[]>({ queryKey: ['social', 'posts'] });
      queryClient.setQueriesData<Post[]>({ queryKey: ['social', 'posts'] }, (list) =>
        // The detail cache holds a single Post, not an array — the guard leaves it be;
        // onSettled invalidates it so it re-reads authoritatively.
        Array.isArray(list) ? list.map((p) => (p.id === id ? { ...p, scheduledAt } : p)) : list
      );
      return { snapshot };
    },
    onError: (_error, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: (post) => {
      invalidate(post?.id);
    },
  });
}

export function useApprovePost(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: () => api.post<Post>(`/v1/social/posts/${id}/approve`),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

/** Send a post back to its author. `note` is why — without it a rejection is a silent
 *  state change and the author has to guess what to fix. */
export function useRejectPost(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (note?: string) =>
      api.post<Post>(`/v1/social/posts/${id}/reject`, note ? { note } : {}),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function usePublishPost(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: () =>
      api.post<{ publishing: boolean; postId: string; targetCount: number }>(
        `/v1/social/posts/${id}/publish`
      ),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

/* ── Changing where a saved post goes ───────────────────────────────────── */

/** Add a destination, drop one, retune its wording, or give it its own send time —
 *  after the post was created. Until this existed all four were frozen at creation, so
 *  an almost-right post had to be rebuilt. */
export interface UpdateTargetsInput {
  add?: ComposeTarget[];
  remove?: string[];
  update?: {
    id: string;
    textOverride?: string | null;
    firstComment?: string | null;
    scheduledAt?: string | null;
  }[];
}

export function useUpdatePostTargets(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (input: UpdateTargetsInput) =>
      api.patch<Post>(`/v1/social/posts/${id}/targets`, input),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

/** Send ONE destination again after it failed. The others — including the ones that
 *  already went out — are untouched. */
export function useRetryPostTarget(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (postTargetId: string) =>
      api.post<{ retrying: boolean }>(`/v1/social/posts/${id}/targets/${postTargetId}/retry`),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

/** Copy a post into a fresh draft — same words, pictures and destinations. */
export function useDuplicatePost() {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (id: string) => api.post<Post>(`/v1/social/posts/${id}/duplicate`),
    onSuccess: (created) => {
      invalidate(created.id);
    },
  });
}

/** Put a post in (or take it out of) the pool the posting cadence recycles from. */
export function useSetPostEvergreen(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (evergreen: boolean) =>
      api.patch<Post>(`/v1/social/posts/${id}/evergreen`, { evergreen }),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function useDeletePost(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: () => api.delete(`/v1/social/posts/${id}`),
    onSuccess: () => {
      invalidate();
    },
  });
}

/**
 * Ask the server to pull fresh numbers for a post from every platform it went to.
 * The endpoint enqueues a background collection and returns immediately (202), so
 * the numbers arrive on a later refetch rather than in this response — hence we
 * invalidate the insights roll-up AND this post's metrics so the next read shows
 * whatever has landed. Keyed by post id, so it fits any row.
 */
export function useRefreshPostMetrics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) =>
      api.post<{ collecting: boolean; postId: string }>(
        `/v1/social/posts/${postId}/metrics/refresh`
      ),
    onSuccess: (_result, postId) => {
      void queryClient.invalidateQueries({ queryKey: ['social', 'insights'] });
      void queryClient.invalidateQueries({ queryKey: socialKeys.metrics(postId) });
    },
  });
}

/* ── Roles (mirror the server's ranked gate, so a control never appears for
      someone the server will refuse) ──────────────────────────────────────── */

const ROLE_RANK: Record<string, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

/** May this viewer compose, edit, submit and schedule? (Server bar: editor.) */
export function canCompose(role: string | undefined): boolean {
  return (ROLE_RANK[role ?? ''] ?? 0) >= 1;
}

/** May this viewer approve, publish now, connect accounts, and change the
 *  approval setting? (Server bar: admin.) Deleting a post is also admin-gated. */
export function canApprove(role: string | undefined): boolean {
  return (ROLE_RANK[role ?? ''] ?? 0) >= 2;
}

/* ── Presentation helpers (shared, so every surface speaks alike) ─────────── */

/** A post's status in plain words, with its own color tone and a one-line note.
 *  Feeds `<Badge color={tone} variant="soft">` — status carries its own color. */
export function postStatusMeta(status: string): { label: string; tone: Tone; detail: string } {
  switch (status) {
    case 'published':
      return { label: 'Published', tone: 'success', detail: 'Live on every destination.' };
    case 'partially_published':
      return {
        label: 'Partly published',
        tone: 'warning',
        detail: 'Some destinations went out and some did not — see each one below.',
      };
    case 'publishing':
      return { label: 'Publishing', tone: 'info', detail: 'Going out to your accounts now.' };
    case 'scheduled':
      return { label: 'Scheduled', tone: 'info', detail: 'Waiting for its time to go out.' };
    case 'pending_approval':
      return {
        label: 'Awaiting approval',
        tone: 'warning',
        detail: 'An admin needs to approve this before it goes live.',
      };
    case 'failed':
      return {
        label: 'Failed',
        tone: 'error',
        detail: 'It could not be published. Nothing went out.',
      };
    default:
      return { label: 'Draft', tone: 'neutral', detail: 'Saved, but not sent anywhere yet.' };
  }
}

/** One destination's result in plain words + tone. */
export function targetStatusMeta(status: string): { label: string; tone: Tone } {
  switch (status) {
    case 'published':
      return { label: 'Published', tone: 'success' };
    case 'publishing':
      return { label: 'Publishing', tone: 'info' };
    case 'failed':
      return { label: 'Failed', tone: 'error' };
    case 'skipped':
      return { label: 'Skipped', tone: 'neutral' };
    default:
      return { label: 'Waiting', tone: 'neutral' };
  }
}

/** A connection's health in plain words. */
export function connectionStatusMeta(status: string): { label: string; tone: Tone } {
  switch (status) {
    case 'active':
      return { label: 'Connected', tone: 'success' };
    case 'expired':
      return { label: 'Reconnect needed', tone: 'warning' };
    case 'revoked':
      return { label: 'Disconnected', tone: 'neutral' };
    default:
      return { label: status.replace(/_/g, ' '), tone: 'neutral' };
  }
}

/** The catalog entry for a platform, keyed for quick lookup. */
export function catalogByPlatform(catalog: CatalogEntry[]): Map<SocialPlatform, CatalogEntry> {
  return new Map(catalog.map((entry) => [entry.platform, entry]));
}

/** The display name for a platform, from the catalog — never hardcoded. Falls
 *  back to the raw slug tidied up if the catalog has not loaded. */
export function platformName(
  platform: SocialPlatform,
  byPlatform: Map<SocialPlatform, CatalogEntry>
): string {
  return byPlatform.get(platform)?.name ?? platform.replace(/_/g, ' ');
}

/** How one destination's post reads against its platform's rules, worked out at
 *  author time. `block` stops a publish (a platform that needs media has none);
 *  `warn` lets it through with a caution (text over the limit). */
export interface TargetPreview {
  level: 'ok' | 'warn' | 'block';
  /** Plain-language notes to show under the destination. */
  notes: string[];
  /** How many characters over the limit, when the text is too long. */
  overBy: number;
}

export function evaluateTarget(
  constraints: PlatformConstraints | undefined,
  text: string,
  mediaCount: number
): TargetPreview {
  if (!constraints) return { level: 'ok', notes: [], overBy: 0 };

  const notes: string[] = [];
  let level: TargetPreview['level'] = 'ok';
  let overBy = 0;

  if (text.length > constraints.maxTextLength) {
    overBy = text.length - constraints.maxTextLength;
    level = 'warn';
    notes.push(
      `${overBy.toLocaleString()} ${overBy === 1 ? 'character' : 'characters'} over the ${constraints.maxTextLength.toLocaleString()}-character limit — it will be cut short here.`
    );
  }

  if (constraints.requiresMedia && mediaCount === 0) {
    level = 'block';
    notes.push('This platform needs a picture or video — add one, or leave it off this post.');
  }

  if (mediaCount > constraints.maxMediaCount) {
    level = level === 'block' ? 'block' : 'warn';
    notes.push(
      `Takes at most ${constraints.maxMediaCount} ${constraints.maxMediaCount === 1 ? 'item' : 'items'} — only the first ${constraints.maxMediaCount} will be used.`
    );
  }

  if (mediaCount > 0 && constraints.aspectRatios && constraints.aspectRatios.length > 0) {
    notes.push(`Best shapes here: ${constraints.aspectRatios.join(', ')}.`);
  }

  return { level, notes, overBy };
}

/**
 * The server's own sentence for a 4xx, shown verbatim: these routes explain the
 * exact problem (a time in the past, a post with no destination, a platform not
 * ready) far better than anything guessed from a status code. A 5xx falls back
 * to the caller's wording.
 */
export function socialErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/** Whether a post can still be edited / moved through the lifecycle. Mirrors the
 *  server's EDITABLE_STATUSES — once it is publishing or done, the composer is
 *  read-only. */
export function isEditablePost(status: string): boolean {
  return (
    status === 'draft' ||
    status === 'pending_approval' ||
    status === 'scheduled' ||
    status === 'failed'
  );
}
