'use client';

// Insights — the "how did my posts do?" lens for the social module. A social manager
// writes and schedules all week in the Calendar and Posts surfaces; this is where they
// come back to see whether any of it landed.
//
// It reads the same accounts and posts as its sibling surfaces, so it feels like one:
// a window switch (7 / 30 / 90 days) and a Refresh in the toolbar, a row of headline
// totals, then per-account performance and the posts that did best — every one of
// which opens the composer, so "that post did well, what did I say?" is one click.
//
// The audience owns a business, not an analytics console. Numbers are plain — "Views",
// "Reach", "Engagements" — and a number that a platform never reported shows as a dash,
// never a made-up zero. Nothing here is invented: it is whatever the platforms sent back.

import { useMemo, useState } from 'react';
import { EmptyState, Heading, Text, ToggleGroup, ToggleGroupItem } from '@wizeworks/silicaui-react';
import { BarChart3, Clock, ExternalLink, ServerCrash } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  catalogByPlatform,
  platformName,
  socialErrorMessage,
  useSocialInsights,
  useSocialOverview,
  type CatalogEntry,
  type InsightsAccount,
  type InsightsTopPost,
  type SocialPlatform,
} from './data';
import { PlatformMark } from '../../components/platform-mark';
import { AccountAvatar, useAvatarByTargetId, formatWhen } from './post-visuals';
import { formatMinuteOfDay, localTimezone, useBestTime, WEEKDAY_NAMES } from './planning-data';
import { PaneLoadError } from '../../components/pane-load-error';

/* ── The windows a business thinks in ─────────────────────────────────────── */

const WINDOWS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;

/* ── Small display pieces ─────────────────────────────────────────────────── */

/** A number, always with thousands separators and a dash for "never reported". */
function fmt(value: number | null): string {
  return value === null ? '—' : value.toLocaleString();
}

/** A headline total — the big-number tile shared with the Posts pipeline strip. */
function TotalTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-base-300 bg-base-100 flex flex-col gap-0.5 rounded-xl border p-3">
      <span className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** One labelled number in a row of them — right-aligned so columns line up. */
function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex min-w-[3.5rem] flex-col items-end">
      <span className="text-lg font-semibold tabular-nums">{fmt(value)}</span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

/* ── Per-account performance ──────────────────────────────────────────────── */

function AccountRow({
  account,
  avatarByTargetId,
  catalogMap,
}: {
  account: InsightsAccount;
  avatarByTargetId: Map<string, string | null>;
  catalogMap: Map<SocialPlatform, CatalogEntry>;
}) {
  const engagements = account.likes + account.comments + account.shares;
  return (
    <div className="border-base-300 flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3 last:border-b-0">
      <AccountAvatar
        platform={account.platform}
        name={account.name}
        src={avatarByTargetId.get(account.socialTargetId)}
        title={account.name}
        size="sm"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base font-medium">{account.name}</span>
        <span className="text-sm">{platformName(account.platform, catalogMap)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Stat label="Posts" value={account.posts} />
        <Stat label="Engagements" value={engagements} />
        <Stat label="Reach" value={account.reach} />
      </div>
    </div>
  );
}

/* ── Top posts ────────────────────────────────────────────────────────────── */

function TopPostRow({
  post,
  catalogMap,
  onOpen,
}: {
  post: InsightsTopPost;
  catalogMap: Map<SocialPlatform, CatalogEntry>;
  onOpen: () => void;
}) {
  return (
    <li className="border-base-300 flex flex-col border-b last:border-b-0">
      <button
        type="button"
        className="hover:bg-base-200 flex w-full min-w-0 cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-left"
        onClick={onOpen}
      >
        {/* The network only, not the pair: a top-post row carries the destination's NAME
            but not its id, so there is no profile picture to look up. The platform disc
            still answers "where did this one do well?" without reading the line. */}
        <PlatformMark platform={post.platform} className="size-8" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="min-w-0 text-base font-medium break-words">{post.excerpt}</span>
          <span className="text-sm">
            {post.targetName} · {platformName(post.platform, catalogMap)}
            {post.publishedAt ? ` · ${formatWhen(post.publishedAt)}` : ''}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Stat label="Engagements" value={post.engagements} />
          <Stat label="Reach" value={post.reach} />
        </span>
      </button>

      {/* Live link — a sibling of the row button, since an anchor cannot nest in one. */}
      {post.permalink ? (
        <div className="flex px-4 pb-3">
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer noopener"
            className="text-module inline-flex items-center gap-0.5 text-sm underline"
          >
            View on {post.targetName}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      ) : null}
    </li>
  );
}

/* ── When to post ─────────────────────────────────────────────────────────── */

/**
 * "Post around here" — drawn from THIS business's own posts and the numbers they got.
 *
 * Every competitor ships this as an industry average, which tells a parts distributor in
 * Utah the same thing it tells a bakery in Lisbon. The only figure worth acting on is the
 * one from your own audience — and when there isn't enough history yet, this says so
 * plainly instead of showing a confident-looking table built on three posts.
 */
function BestTimePanel() {
  const timezone = useMemo(() => localTimezone(), []);
  const report = useBestTime(timezone);
  const data = report.data;

  if (report.isPending) {
    return (
      <section className="card bg-base-100 overflow-hidden">
        <header className="border-base-300 flex items-center gap-2 border-b px-4 py-3">
          <Heading level={2} className="text-base font-semibold">
            When to post
          </Heading>
        </header>
        <Text className="px-4 py-3 text-sm">Loading…</Text>
      </section>
    );
  }
  if (!data) return null;

  return (
    <section className="card bg-base-100 overflow-hidden">
      <header className="border-base-300 flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <Clock className="size-4 shrink-0" aria-hidden />
        <Heading level={2} className="text-base font-semibold">
          When to post
        </Heading>
        <div className="flex-1" />
        <Text className="text-sm">From your own posts</Text>
      </header>

      {!data.confident ? (
        <Text className="px-4 py-3 text-sm">
          Not enough history yet to say. Once you have a few posts at different times of the week,
          the times your audience actually shows up will appear here — worked out from your own
          results, not an industry average.
        </Text>
      ) : (
        <>
          <div>
            {data.buckets.slice(0, 5).map((bucket) => (
              <div
                key={`${String(bucket.weekday)}-${String(bucket.hour)}`}
                className="border-base-300 flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1 text-base font-medium">
                  {WEEKDAY_NAMES[bucket.weekday]}s around {formatMinuteOfDay(bucket.hour * 60)}
                </span>
                <Stat label="Avg engagements" value={bucket.averageEngagements} />
                <Stat label="Posts" value={bucket.posts} />
              </div>
            ))}
          </div>
          <Text className="px-4 py-3 text-sm">
            Worked out from {data.sampleSize} posts over the last six months, in your local time (
            {data.timezone}).
          </Text>
        </>
      )}
    </section>
  );
}

/* ── The surface ──────────────────────────────────────────────────────────── */

export function SocialInsightsSurface({ ctx }: { ctx: SurfaceContext }) {
  const [windowDays, setWindowDays] = useState(30);
  const insights = useSocialInsights(windowDays);
  const overview = useSocialOverview();

  const avatarByTargetId = useAvatarByTargetId(overview.data?.connections ?? []);
  const catalogMap = useMemo(
    () => catalogByPlatform(overview.data?.catalog ?? []),
    [overview.data]
  );

  const data = insights.data;
  // Reach and views come from an extra platform scope; when nothing reported either
  // across the whole window, that scope is almost certainly missing — say so plainly
  // rather than leaving two zeros looking like real, disappointing numbers.
  const noReachData = data ? data.totals.reach === 0 && data.totals.impressions === 0 : false;

  if (insights.isError) {
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          icon={<ServerCrash className="size-6" aria-hidden />}
          title="Could not load your numbers"
          description={socialErrorMessage(
            insights.error,
            'This is a problem reaching the server. Nothing about your posts has changed.'
          )}
          onRetry={() => {
            void insights.refetch();
          }}
        />
      </div>
    );
  }

  const isEmpty = data ? data.topPosts.length === 0 && data.accounts.length === 0 : false;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Insights controls"
        controls={
          <>
            <ToggleGroup
              color="module"
              size="sm"
              value={[String(windowDays)]}
              aria-label="How far back to look"
              onValueChange={(value: string[]) => {
                const next = value[value.length - 1];
                if (next) setWindowDays(Number(next));
              }}
            >
              {WINDOWS.map((w) => (
                <ToggleGroupItem key={w.value} value={w.value}>
                  {w.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={insights.isFetching}
            updatedAt={insights.data ? insights.dataUpdatedAt : undefined}
            onRefresh={() => {
              void insights.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {insights.isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : isEmpty ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<BarChart3 className="size-6" aria-hidden />}
              title="No numbers yet"
              description="Performance shows up here once your posts have been live for a while and the accounts report back. Open a post you have already sent and hit “Refresh numbers” to pull the latest."
            />
          </div>
        ) : data ? (
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
            {/* Headline totals across the chosen window. */}
            <section className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
                <TotalTile label="Posts" value={data.totals.posts} />
                <TotalTile label="Engagements" value={data.totals.engagements} />
                <TotalTile label="Reach" value={data.totals.reach} />
                <TotalTile label="Views" value={data.totals.impressions} />
              </div>
              {noReachData ? (
                <Text className="text-sm">
                  Reach and views need extra permissions from the platform.
                </Text>
              ) : null}
            </section>

            {/* When to post — before the per-account breakdown, because it is the one
                thing on this screen that changes what someone DOES next week. */}
            <BestTimePanel />

            {/* Per-account performance. */}
            {data.accounts.length > 0 ? (
              <section className="card bg-base-100 overflow-hidden">
                <header className="border-base-300 flex items-center gap-2 border-b px-4 py-3">
                  <Heading level={2} className="text-base font-semibold">
                    By account
                  </Heading>
                  <div className="flex-1" />
                  <Text className="text-sm">{data.accounts.length}</Text>
                </header>
                <div>
                  {data.accounts.map((account) => (
                    <AccountRow
                      key={account.socialTargetId}
                      account={account}
                      avatarByTargetId={avatarByTargetId}
                      catalogMap={catalogMap}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {/* The posts that did best — each opens in the composer. */}
            {data.topPosts.length > 0 ? (
              <section className="card bg-base-100 overflow-hidden">
                <header className="border-base-300 flex items-center gap-2 border-b px-4 py-3">
                  <Heading level={2} className="text-base font-semibold">
                    Top posts
                  </Heading>
                  <div className="flex-1" />
                  <Text className="text-sm">{data.topPosts.length}</Text>
                </header>
                <ul>
                  {data.topPosts.map((post) => (
                    <TopPostRow
                      key={post.postTargetId}
                      post={post}
                      catalogMap={catalogMap}
                      onOpen={() => {
                        ctx.open('social.composer', { id: post.postId });
                      }}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default SocialInsightsSurface;
