'use client';

// STOCK SOURCES — the connections that keep your numbers in step with something
// outside sparx (a published spreadsheet, another system, an on-site bridge).
//
// ── Why this one IS a table ──────────────────────────────────────────────
//
// A source is a one-line thing, but a business scans DOWN a source list asking
// the same three questions of each — what kind is it, when did it last bring
// numbers in, is it healthy. A table lets that scan happen down a column, and
// discloses those columns with @container so a pane docked narrow still shows
// the two that always matter: what it is called and whether it is working. The
// rest (kind, last updated, health) shed as the pane gets tight.
//
// ── Search and status go to the server ───────────────────────────────────
//
// Both are query params, so the list you see is the server's answer, not a page
// filtered in the browser.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  NativeSelect,
  SearchInput,
  Table,
  Timestamp,
} from '@wizeworks/silicaui-react';
import { Cable, FileSpreadsheet, Link2, Plus, Server } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  agentOnline,
  relativeTime,
  sourceState,
  sourceTypeLabel,
  syncIntervalLabel,
  useInventorySources,
  type InventorySource,
  type SourceStatus,
  type SourceType,
} from './sources-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** The mark for each kind of connection. */
function TypeIcon({ type }: { type: SourceType }) {
  const Icon = type === 'csv' ? FileSpreadsheet : type === 'api' ? Cable : Server;
  return <Icon className="text-module size-5 shrink-0" aria-hidden />;
}

/**
 * The "how is it doing" line — a plain-word detail that goes BEYOND the status
 * badge. For an on-site bridge that means when it last reached us (the thing
 * that quietly drifts stale); for a feed we pull, it is the schedule we pull on.
 */
function healthLine(source: InventorySource): string {
  if (source.type === 'agent') {
    if (!source.enrolledAt) return 'Not paired yet';
    return agentOnline(source.agentLastSeenAt)
      ? `Reached us ${relativeTime(source.agentLastSeenAt)}`
      : `Silent — last seen ${relativeTime(source.agentLastSeenAt)}`;
  }
  return syncIntervalLabel(source.syncIntervalSec);
}

const STATUS_OPTIONS: { value: SourceStatus | ''; label: string }[] = [
  { value: '', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'error', label: 'Having trouble' },
];

export function SourcesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SourceStatus | ''>('');
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;
  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = useInventorySources({
    q: search.trim(),
    status,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const narrowed = search.trim() !== '' || status !== '';

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const openSource = (source: InventorySource, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.sources.detail', { id: source.id }, { target: targetFor(event) });
  };

  const addSource = () => {
    ctx.open('inventory.sources.detail', { id: 'new' }, { target: 'tab' });
  };

  const body = () => {
    // A failed load REPLACES the list. Rendering an empty grid under a live
    // filter invites someone to conclude they have no sources.
    if (isError) {
      return (
        <EmptyState
          icon={<Link2 className="size-6" aria-hidden />}
          title="Could not load your stock sources"
          description="This is a problem reaching the server. Your connections are unaffected — they just could not be listed just now."
        />
      );
    }

    if (isLoading) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading your sources…
        </p>
      );
    }

    if (rows.length === 0) {
      return (
        <ListEmptyState
          filtered={narrowed}
          noResults={{
            icon: <Link2 className="size-6" aria-hidden />,
            title: 'Nothing matches that',
            description: 'Try part of a source’s name, or switch the status back to “Any status”.',
          }}
          firstRun={{
            title: 'No stock sources yet',
            description:
              'Connect a stock source when something outside sparx keeps the count — a spreadsheet you publish, another system, or a bridge on your own computers. Its numbers then flow in and become what you sell against.',
            actions: (
              <Button size="sm" color="module" onClick={addSource}>
                <Plus className="size-4" aria-hidden />
                Add a source
              </Button>
            ),
          }}
        />
      );
    }

    return (
      <Card className="overflow-hidden">
        <Table size="sm" hover>
          <thead>
            <tr>
              <th>Source</th>
              <th className="hidden @lg:table-cell">Kind</th>
              <th className="hidden whitespace-nowrap @xl:table-cell">Last updated</th>
              <th className="hidden @3xl:table-cell">How it is doing</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((source) => {
              const state = sourceState(source);
              return (
                <tr
                  key={source.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  onClick={(event) => {
                    openSource(source, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openSource(source, event);
                  }}
                >
                  {/* `max-w-0 w-full` is load-bearing: a table cell sizes to its
                      content, so a long source name would push the row wider and
                      shove the state badge — the one column that must never go —
                      off the right edge. Zeroing the max width makes THIS the
                      cell that gives, which is what lets the truncation bite. */}
                  <td className="w-full max-w-0">
                    <span className="flex min-w-0 items-center gap-3">
                      <TypeIcon type={source.type} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-base font-medium">{source.name}</span>
                        {/* Below @lg the Kind and Last-updated columns are gone,
                            so their gist comes back here — a row that reads as a
                            bare name tells you nothing about the connection. */}
                        <span className="truncate text-sm @lg:hidden">
                          {sourceTypeLabel(source.type)}
                          {' · '}
                          {source.lastSyncAt ? (
                            <>
                              updated <Timestamp value={source.lastSyncAt} format="relative" />
                            </>
                          ) : (
                            'not run yet'
                          )}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="hidden max-w-40 truncate @lg:table-cell">
                    {sourceTypeLabel(source.type)}
                  </td>
                  <td className="hidden whitespace-nowrap @xl:table-cell">
                    {source.lastSyncAt ? (
                      <Timestamp value={source.lastSyncAt} format="relative" />
                    ) : (
                      'Not run yet'
                    )}
                  </td>
                  <td className="hidden max-w-56 truncate @3xl:table-cell">{healthLine(source)}</td>
                  <td>
                    <Badge color={state.tone} variant="soft" size="sm">
                      {state.label}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Stock source controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search stock sources"
              placeholder="Source name…"
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                resetWindow();
              }}
            />
          </div>
        }
        primary={
          <Button size="sm" color="module" className="ml-auto shrink-0" onClick={addSource}>
            <Plus className="size-4" aria-hidden />
            <span className="hidden @sm:inline">Add a source</span>
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Show sources with status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as SourceStatus | '');
                resetWindow();
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>

      <div className="shrink-0">
        <ListPagination
          shown={rows.length}
          firstRow={rows.length === 0 ? 0 : skip + 1}
          total={total}
          page={page}
          pageSize={pageSize}
          canLoadMore={take < MAX_TAKE}
          busy={isFetching}
          onLoadMore={() => {
            setTake((current) => Math.min(current + pageSize, MAX_TAKE));
          }}
          onPageChange={(next) => {
            setPage(next);
            setTake(pageSize);
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setTake(size);
          }}
        />
        {rows.length > 0 ? <RowOpenHint /> : null}
      </div>
    </div>
  );
}
