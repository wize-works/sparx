'use client';

// Search performance — the SEO module's landing.
//
// One read of "how easily are people finding me, and what should I do about it":
// a strip of headline figures, the trend of visits from search over time, what
// to work on across the site, the search terms bringing people in, and a feed of
// the most recent checks.
//
// Two independent "not ready yet" states, handled honestly rather than with
// invented data:
//   • Nothing scored yet → a first-run prompt to scan the site.
//   • Search Console not connected → the organic sections show a compact prompt
//     to connect Google, never a wall of zeros dressed up as real numbers.
//
// A reporting surface, not a list — stat cards and read-only sections in one
// capped, centred column.

import { useMemo } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  Stat,
  StatDesc,
  StatTitle,
  StatValue,
  Stats,
  Table,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { Gauge, LineChart, Link2, RefreshCw, Search } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { OrganicChart } from './organic-chart';
import {
  auditDetailParams,
  entityLabel,
  formatCount,
  formatCtr,
  formatPosition,
  gradeLabel,
  scoreTone,
  seoErrorMessage,
  useActivity,
  useAudits,
  useChecklist,
  useOrganicSummary,
  useOrganicTimeseries,
  useReindexAudits,
  useSearchConsoleStatus,
  useTopQueries,
  type ActivityRun,
  type Tone,
} from './data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-5xl flex-col gap-4';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

const SCORE_INK: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
};

/* ── The "connect Google" prompt shown in place of organic data ──────────── */

function ConnectPrompt({ configured, onOpen }: { configured: boolean; onOpen: () => void }) {
  return (
    <div className="border-base-300 flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
      <div className="flex items-center gap-2">
        <Link2 className="text-module size-5" aria-hidden />
        <Heading level={3} className="text-base font-semibold">
          {configured ? 'Connect Google to see this' : 'Coming soon'}
        </Heading>
      </div>
      <Text className="text-sm">
        {configured
          ? 'These are the real numbers Google records — how many people saw your site in search and how many clicked. Connect Search Console, the free tool from Google, to see them here.'
          : 'Google’s own search numbers are not ready on this side yet. It is nothing to do with your account or your plan, and there is nothing for you to switch on. Everything measured here — how each page scores, and what is worth fixing — is up to date.'}
      </Text>
      <Button size="sm" color="module" variant="outline" onClick={onOpen}>
        <Link2 className="size-4" aria-hidden />
        {configured ? 'Connect Search Console' : 'About Search Console'}
      </Button>
    </div>
  );
}

/* ── Activity feed row ───────────────────────────────────────────────────── */

function ActivityRow({
  run,
  onOpen,
}: {
  run: ActivityRun;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const tone = scoreTone(run.grade);
  return (
    <li className="border-base-300 border-b last:border-b-0">
      <button
        type="button"
        className="hover:bg-base-200 flex w-full items-center gap-3 px-4 py-2.5 text-left"
        onClick={onOpen}
      >
        <span className={`w-8 shrink-0 text-lg font-semibold tabular-nums ${SCORE_INK[tone]}`}>
          {run.score}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{run.title ?? 'Untitled page'}</span>
          <span className="text-sm">
            {entityLabel(run.entityType)} · checked{' '}
            <Timestamp value={run.computedAt} format="relative" />
          </span>
        </span>
        <Badge color={tone} variant="soft" size="sm" className="shrink-0">
          {gradeLabel(run.grade)}
        </Badge>
      </button>
    </li>
  );
}

/* ── The surface ─────────────────────────────────────────────────────────── */

export function PerformanceSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();

  const audits = useAudits();
  const checklist = useChecklist();
  const activity = useActivity();
  const scStatus = useSearchConsoleStatus();
  const reindex = useReindexAudits();

  const connected = scStatus.data?.connection?.status === 'connected';
  const configured = scStatus.data?.configured ?? false;

  const organicSummary = useOrganicSummary(connected);
  const organicTimeseries = useOrganicTimeseries(connected);
  const topQueries = useTopQueries(connected);

  const rows = useMemo(() => audits.data ?? [], [audits.data]);
  const averageScore = useMemo(() => {
    if (rows.length === 0) return null;
    return Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length);
  }, [rows]);
  const toImprove = useMemo(
    () => rows.filter((row) => row.grade === 'needs-work' || row.grade === 'poor').length,
    [rows]
  );

  const pagesScored = checklist.data?.summary.pagesScored ?? rows.length;
  const nothingScored = !audits.isPending && rows.length === 0 && pagesScored === 0;

  const openSearchConsole = () => {
    ctx.open('seo.search-console', {}, { target: 'tab' });
  };

  const openRun = (run: ActivityRun, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('seo.audits.detail', auditDetailParams(run), { target: targetFor(event) });
  };

  const rescan = () => {
    reindex.mutate(undefined, {
      onSuccess: (result) => {
        toast.add({
          title:
            result.reindexed === 0
              ? 'Nothing to score yet'
              : `Scored ${result.reindexed} ${result.reindexed === 1 ? 'page' : 'pages'}`,
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not run the scan',
          description: seoErrorMessage(error, 'Nothing was changed. Try again shortly.'),
          type: 'error',
        });
      },
    });
  };

  const refreshAll = () => {
    void audits.refetch();
    void checklist.refetch();
    void activity.refetch();
    void scStatus.refetch();
    if (connected) {
      void organicSummary.refetch();
      void organicTimeseries.refetch();
      void topQueries.refetch();
    }
  };

  const organicHasData =
    (organicTimeseries.data?.totals.clicks ?? 0) > 0 ||
    (organicTimeseries.data?.totals.impressions ?? 0) > 0;

  const body = () => {
    if (audits.isError) {
      return (
        <PaneLoadError
          icon={<Gauge className="size-6" aria-hidden />}
          title="Could not load your search performance"
          description="This is a problem reaching the server. Your site and its scores are unaffected."
          onRetry={() => {
            void audits.refetch();
          }}
        />
      );
    }

    if (audits.isPending) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading your search performance…
        </p>
      );
    }

    if (nothingScored) {
      return (
        <div className="flex h-full items-center justify-center p-8">
          <EmptyState
            className="max-w-md"
            icon={<Gauge className="size-6" aria-hidden />}
            title="Let’s see how findable your site is"
            description="Run a quick scan to score every page for how easily people can find it on a search engine. You’ll get a clear list of what to fix first — no jargon."
            actions={
              <Button size="sm" color="module" loading={reindex.isPending} onClick={rescan}>
                <RefreshCw className="size-4" aria-hidden />
                Scan now
              </Button>
            }
          />
        </div>
      );
    }

    return (
      <div className={COLUMN}>
        <div className="flex flex-col gap-1">
          <Heading level={1} className="text-2xl font-semibold">
            Search performance
          </Heading>
          <Text>
            How easily people find you on a search engine, and which of your pages they land on.
          </Text>
        </div>

        {/* Headline figures. Organic ones read "—" until Google is connected —
            an honest blank, not a fabricated zero. */}
        <section className="card bg-base-100">
          <Stats className="grid grid-cols-1 gap-2 px-2 py-1 @lg:grid-cols-2 @3xl:grid-cols-4">
            <Stat>
              <StatTitle>Average score</StatTitle>
              <StatValue className="text-2xl tabular-nums">{averageScore ?? '—'}</StatValue>
              <StatDesc>
                across {pagesScored} {pagesScored === 1 ? 'page checked' : 'pages checked'}
              </StatDesc>
            </Stat>
            <Stat>
              <StatTitle>Visits from search</StatTitle>
              <StatValue className="text-2xl tabular-nums">
                {connected && organicSummary.data ? formatCount(organicSummary.data.clicks) : '—'}
              </StatValue>
              <StatDesc>{connected ? 'in the last 28 days' : 'connect Google to see'}</StatDesc>
            </Stat>
            <Stat>
              <StatTitle>Average position</StatTitle>
              <StatValue className="text-2xl tabular-nums">
                {connected && organicSummary.data
                  ? formatPosition(organicSummary.data.avgPosition)
                  : '—'}
              </StatValue>
              <StatDesc>{connected ? 'in Google results' : 'connect Google to see'}</StatDesc>
            </Stat>
            <Stat>
              <StatTitle>Pages to improve</StatTitle>
              <StatValue
                className={`text-2xl tabular-nums ${toImprove > 0 ? SCORE_INK.warning : ''}`}
              >
                {toImprove}
              </StatValue>
              <StatDesc>
                {toImprove === 0 ? 'all pages in good shape' : 'scoring under 70'}
              </StatDesc>
            </Stat>
          </Stats>
        </section>

        {/* Visits from search, over time. */}
        <section className="card bg-base-100 flex flex-col gap-3 p-4">
          <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
            <Heading level={2} className="flex items-center gap-2 text-lg font-semibold">
              <LineChart className="size-4" aria-hidden />
              Visits from search
            </Heading>
            <Text className="text-sm">How many people reached your site from a search engine.</Text>
          </div>
          {!connected ? (
            <ConnectPrompt configured={configured} onOpen={openSearchConsole} />
          ) : organicTimeseries.isPending ? (
            <p className="text-sm" role="status">
              Loading…
            </p>
          ) : organicHasData && organicTimeseries.data ? (
            <OrganicChart points={organicTimeseries.data.points} />
          ) : (
            <Text className="text-sm">
              Google is connected, but there are no search visits recorded for the last 28 days yet.
              Numbers arrive with a day or two&apos;s delay.
            </Text>
          )}
        </section>

        {/* What to work on across the site. */}
        {checklist.data && checklist.data.summary.pagesScored > 0 ? (
          <section className="card bg-base-100 flex flex-col gap-3 p-4">
            <div className="border-base-300 flex flex-wrap items-center gap-2 border-b pb-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Heading level={2} className="text-lg font-semibold">
                  What to work on
                </Heading>
                <Text className="text-sm">
                  Common problems across your pages, grouped by check.
                </Text>
              </div>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="ghost"
                color="neutral"
                onClick={(event) => {
                  ctx.open('seo.audits', {}, { target: targetFor(event) });
                }}
              >
                See every check
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col">
                <span className={`text-2xl font-semibold tabular-nums ${SCORE_INK.error}`}>
                  {checklist.data.summary.failing}
                </span>
                <Text className="text-sm">Failing</Text>
              </div>
              <div className="flex flex-col">
                <span className={`text-2xl font-semibold tabular-nums ${SCORE_INK.warning}`}>
                  {checklist.data.summary.warning}
                </span>
                <Text className="text-sm">Worth a look</Text>
              </div>
              <div className="flex flex-col">
                <span className={`text-2xl font-semibold tabular-nums ${SCORE_INK.success}`}>
                  {checklist.data.summary.passing}
                </span>
                <Text className="text-sm">All good</Text>
              </div>
            </div>
          </section>
        ) : null}

        {/* Search terms bringing people in. */}
        <section className="card bg-base-100 flex flex-col gap-3 p-4">
          <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
            <Heading level={2} className="text-lg font-semibold">
              What people searched for
            </Heading>
            <Text className="text-sm">The terms bringing the most visitors from search.</Text>
          </div>
          {!connected ? (
            <ConnectPrompt configured={configured} onOpen={openSearchConsole} />
          ) : topQueries.isPending ? (
            <p className="text-sm" role="status">
              Loading…
            </p>
          ) : (topQueries.data ?? []).length === 0 ? (
            <Text className="text-sm">
              No search terms recorded for the last 28 days yet. They appear here as Google gathers
              them.
            </Text>
          ) : (
            <Table size="sm">
              <thead>
                <tr>
                  <th>Search term</th>
                  <th className="text-right whitespace-nowrap">Visits</th>
                  <th className="hidden text-right whitespace-nowrap @lg:table-cell">
                    Times shown
                  </th>
                  <th className="hidden text-right whitespace-nowrap @xl:table-cell">Clicked</th>
                  <th className="hidden text-right whitespace-nowrap @xl:table-cell">Position</th>
                </tr>
              </thead>
              <tbody>
                {(topQueries.data ?? []).map((query) => (
                  <tr key={query.query}>
                    <td className="max-w-0">
                      <span className="block truncate">{query.query}</span>
                    </td>
                    <td className="text-right font-medium tabular-nums">
                      {formatCount(query.clicks)}
                    </td>
                    <td className="hidden text-right tabular-nums @lg:table-cell">
                      {formatCount(query.impressions)}
                    </td>
                    <td className="hidden text-right tabular-nums @xl:table-cell">
                      {formatCtr(query.ctr)}
                    </td>
                    <td className="hidden text-right tabular-nums @xl:table-cell">
                      {formatPosition(query.position)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        {/* Recently checked pages. */}
        <section className="card bg-base-100 overflow-hidden">
          <header className="border-base-300 flex flex-wrap items-center gap-2 border-b px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Heading level={2} className="text-base font-semibold">
                Recently checked
              </Heading>
              <Text className="text-sm">The latest pages to be scored.</Text>
            </div>
            <div className="flex-1" />
            <Button
              size="sm"
              variant="ghost"
              color="neutral"
              onClick={(event) => {
                ctx.open('seo.audits', {}, { target: targetFor(event) });
              }}
            >
              See all pages
            </Button>
          </header>
          {activity.isPending ? (
            <p className="p-4 text-sm" role="status">
              Loading…
            </p>
          ) : (activity.data ?? []).length === 0 ? (
            <div className="p-4">
              <Text className="text-sm">No pages have been checked yet.</Text>
            </div>
          ) : (
            <ul>
              {(activity.data ?? []).map((run) => (
                <ActivityRow
                  key={run.id}
                  run={run}
                  onOpen={(event) => {
                    openRun(run, event);
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Search performance controls"
        primary={
          <Button
            color="module"
            size="sm"
            variant="outline"
            className="ml-auto shrink-0 whitespace-nowrap"
            title="Score every page on the site again"
            loading={reindex.isPending}
            onClick={rescan}
          >
            <Search className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Rescan the site</span>
          </Button>
        }
        refresh={
          <RefreshButton
            isFetching={
              audits.isFetching ||
              checklist.isFetching ||
              activity.isFetching ||
              scStatus.isFetching
            }
            updatedAt={audits.data ? audits.dataUpdatedAt : undefined}
            onRefresh={refreshAll}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </div>
  );
}
