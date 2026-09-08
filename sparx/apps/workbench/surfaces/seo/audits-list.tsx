'use client';

// Site checks — every page on the site, scored for how easily it can be found,
// worst first, plus the site-wide list of what is going wrong most often.
//
// Two things share this surface because they answer the same question from two
// directions: the checklist says "which KINDS of problem are most common across
// the site", the page list says "which PAGES need attention". An owner uses the
// first to decide what to work on and the second to find where.
//
// Opening a page opens its full breakdown BESIDE the list (a read-only detail
// pane), so you can run down the list scoring page after page without losing
// your place.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  NativeSelect,
  SearchInput,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  auditDetailParams,
  checkTone,
  entityLabel,
  gradeLabel,
  scoreTone,
  seoErrorMessage,
  useAudits,
  useChecklist,
  useReindexAudits,
  type AuditRow,
  type ChecklistCheck,
  type Tone,
} from './data';
import { RowOpenHint } from '../../components/row-open-hint';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-4xl flex-col gap-4';

/** Same modifier contract as every list — a row opens the page's breakdown,
 *  alongside on shift, in a new window on alt. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Every kind of page' },
  { value: 'builder_page', label: 'Pages' },
  { value: 'cms_page', label: 'Articles' },
  { value: 'product', label: 'Products' },
  { value: 'collection', label: 'Collections' },
];

/* ── The site-wide checklist roll-up ─────────────────────────────────────── */

const CHECK_INK: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
};

function ChecklistRow({ check }: { check: ChecklistCheck }) {
  const affected = check.pagesFail + check.pagesWarn;
  return (
    <li className="border-base-300 flex flex-wrap items-center gap-2 border-b py-2.5 last:border-b-0">
      <Badge color={checkTone(check.status)} variant="soft" size="sm">
        {check.status === 'fail' ? 'Failing' : check.status === 'warn' ? 'Warning' : 'Good'}
      </Badge>
      <Text className="min-w-0 flex-1 font-medium">{check.label}</Text>
      <Text className="shrink-0 text-sm tabular-nums">
        {affected === 0
          ? 'All pages pass'
          : `${affected} of ${check.pagesScored} ${affected === 1 ? 'page' : 'pages'} to fix`}
      </Text>
    </li>
  );
}

function ChecklistCard({
  summary,
  needsAttention,
}: {
  summary: { pagesScored: number; passing: number; warning: number; failing: number };
  needsAttention: ChecklistCheck[];
}) {
  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
        <Heading level={2} className="text-lg font-semibold">
          What to work on across the site
        </Heading>
        <Text className="text-sm">
          Common problems, counted across all {summary.pagesScored}{' '}
          {summary.pagesScored === 1 ? 'scored page' : 'scored pages'}. Fixing one of these usually
          lifts several pages at once.
        </Text>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col">
          <span className={`text-2xl font-semibold tabular-nums ${CHECK_INK.error}`}>
            {summary.failing}
          </span>
          <Text className="text-sm">Failing</Text>
        </div>
        <div className="flex flex-col">
          <span className={`text-2xl font-semibold tabular-nums ${CHECK_INK.warning}`}>
            {summary.warning}
          </span>
          <Text className="text-sm">Worth a look</Text>
        </div>
        <div className="flex flex-col">
          <span className={`text-2xl font-semibold tabular-nums ${CHECK_INK.success}`}>
            {summary.passing}
          </span>
          <Text className="text-sm">All good</Text>
        </div>
      </div>

      {needsAttention.length > 0 ? (
        <ul>
          {needsAttention.map((check) => (
            <ChecklistRow key={check.id} check={check} />
          ))}
        </ul>
      ) : (
        <Text className="text-sm">
          Nothing stands out across the site — every check is passing on the pages scored so far.
        </Text>
      )}
    </section>
  );
}

/* ── One page row ────────────────────────────────────────────────────────── */

function AuditListRow({
  row,
  onOpen,
}: {
  row: AuditRow;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const tone = scoreTone(row.grade);
  return (
    <li className="border-base-300 border-b last:border-b-0">
      <button
        type="button"
        className="hover:bg-base-200 flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={onOpen}
      >
        {/* The score is the point of the row — a big number in its own color so
            the eye runs straight down the column. */}
        <span
          className={`w-10 shrink-0 text-2xl font-semibold tabular-nums ${CHECK_INK[tone]}`}
          aria-hidden
        >
          {row.score}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{row.title ?? 'Untitled page'}</span>
            <Badge color="neutral" variant="soft" size="sm" className="shrink-0">
              {entityLabel(row.entityType)}
            </Badge>
          </span>
          {row.path ? <span className="truncate font-mono text-sm">{row.path}</span> : null}
          {row.fixFirst ? (
            <span className="truncate text-sm">Fix first: {row.fixFirst}</span>
          ) : null}
        </span>
        <Badge color={tone} variant="soft" size="sm" className="shrink-0">
          {gradeLabel(row.grade)}
        </Badge>
      </button>
    </li>
  );
}

/* ── The surface ─────────────────────────────────────────────────────────── */

export function AuditsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const audits = useAudits();
  const checklist = useChecklist();
  const reindex = useReindexAudits();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const rows = useMemo(() => audits.data ?? [], [audits.data]);
  const needle = search.trim().toLowerCase();

  const matches = useMemo(() => {
    return rows.filter((row) => {
      if (typeFilter && row.entityType !== typeFilter) return false;
      if (!needle) return true;
      return (
        (row.title ?? '').toLowerCase().includes(needle) ||
        (row.path ?? '').toLowerCase().includes(needle)
      );
    });
  }, [rows, typeFilter, needle]);

  const needsAttention = useMemo(
    () => (checklist.data?.checks ?? []).filter((c) => c.status === 'fail' || c.status === 'warn'),
    [checklist.data]
  );

  const openRow = (row: AuditRow, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('seo.audits.detail', auditDetailParams(row), { target: targetFor(event) });
  };

  const rescan = () => {
    reindex.mutate(undefined, {
      onSuccess: (result) => {
        toast.add({
          title:
            result.reindexed === 0
              ? 'Nothing to score yet'
              : `Scored ${result.reindexed} ${result.reindexed === 1 ? 'page' : 'pages'}`,
          description: result.truncated
            ? 'This site is large, so only the first pages of each kind were scored this time.'
            : undefined,
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

  const nothingScored =
    !audits.isPending && rows.length === 0 && (checklist.data?.summary.pagesScored ?? 0) === 0;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Site checks controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search pages"
              placeholder="Search pages…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        status={
          <p className="hidden shrink-0 text-sm whitespace-nowrap @2xl:block">
            {needle || typeFilter
              ? `${matches.length} of ${rows.length}`
              : `${rows.length} ${rows.length === 1 ? 'page' : 'pages'}`}
          </p>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0 whitespace-nowrap"
            title="Score every page on the site again"
            loading={reindex.isPending}
            onClick={rescan}
          >
            <RefreshCw className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Rescan the site</span>
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="hidden max-w-44 shrink @xl:block"
              aria-label="Show only one kind of page"
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value);
              }}
            >
              {TYPE_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </NativeSelect>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={audits.isFetching || checklist.isFetching}
            updatedAt={audits.data ? audits.dataUpdatedAt : undefined}
            onRefresh={() => {
              void audits.refetch();
              void checklist.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {audits.isError ? (
          <PaneLoadError
            icon={<Search className="size-6" aria-hidden />}
            title="Could not load your site checks"
            description="This is a problem reaching the server. Your pages are unaffected — the scores just could not be read."
            onRetry={() => {
              void audits.refetch();
            }}
          />
        ) : audits.isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading your site checks…
          </p>
        ) : nothingScored ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              className="max-w-md"
              icon={<ShieldCheck className="size-6" aria-hidden />}
              title="No pages checked yet"
              description="Run a scan to score every page on your site for how easily people can find it. It takes a moment, and you can come back to a list of what to fix first."
              actions={
                <Button size="sm" color="module" loading={reindex.isPending} onClick={rescan}>
                  <RefreshCw className="size-4" aria-hidden />
                  Scan now
                </Button>
              }
            />
          </div>
        ) : (
          <div className={COLUMN}>
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Site checks
              </Heading>
              <Text>
                Every page scored for how easily people can find it on a search engine. Open a page
                to see exactly what to change.
              </Text>
            </div>

            {checklist.data && checklist.data.summary.pagesScored > 0 ? (
              <ChecklistCard summary={checklist.data.summary} needsAttention={needsAttention} />
            ) : null}

            <section className="card bg-base-100 overflow-hidden">
              <header className="border-base-300 flex flex-wrap items-center gap-2 border-b px-4 py-3">
                <Heading level={2} className="text-base font-semibold">
                  Pages, lowest score first
                </Heading>
                <div className="flex-1" />
                <Text className="text-sm">
                  {matches.length} {matches.length === 1 ? 'page' : 'pages'}
                </Text>
              </header>
              {matches.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    icon={<Search className="size-6" aria-hidden />}
                    title={needle || typeFilter ? 'No pages match that' : 'No pages to show'}
                    description={
                      needle || typeFilter
                        ? 'Try a different search, or show every kind of page again.'
                        : 'Run a scan to score your pages.'
                    }
                  />
                </div>
              ) : (
                <ul>
                  {matches.map((row) => (
                    <AuditListRow
                      key={row.id}
                      row={row}
                      onOpen={(event) => {
                        openRow(row, event);
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      <RowOpenHint what="a page to see what to fix" />
    </div>
  );
}
