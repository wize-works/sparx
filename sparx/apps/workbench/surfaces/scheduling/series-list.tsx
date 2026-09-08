'use client';

// Repeating bookings — the standing arrangements: every Tuesday, the first of
// each month, a weekly class. Each row is a PATTERN, not an occurrence; the
// actual appointments it creates live in the Bookings list alongside every other.
//
// A pattern is a few facts — what it is, how often, how many are still to come —
// so it earns a compact table, sorted with the ones still running at the top.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  NativeSelect,
  SearchInput,
  Table,
} from '@wizeworks/silicaui-react';
import { Plus, Repeat } from 'lucide-react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import {
  humanizeRrule,
  seriesStateMeta,
  useBookingSeriesList,
  type BookingSeries,
  type SeriesStatus,
} from './bookings-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

const STATUS_OPTIONS: { value: SeriesStatus | ''; label: string }[] = [
  { value: '', label: 'All patterns' },
  { value: 'active', label: 'Still running' },
  { value: 'completed', label: 'Finished' },
  { value: 'cancelled', label: 'Stopped' },
];

const PAGE_SIZE = 50;

export function SeriesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SeriesStatus | ''>('');

  const query = { q: search.trim() || undefined, status, take: PAGE_SIZE, skip: 0 };
  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } =
    useBookingSeriesList(query);
  const rows = data?.items ?? [];
  const hasFilters = Boolean(search.trim() || status);

  const open = (series: BookingSeries, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('scheduling.series.detail', { id: series.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Repeating booking controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search repeating bookings"
              placeholder="Search by service…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            title="Set up a repeating booking — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('scheduling.series.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Repeating booking
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              aria-label="Filter by state"
              className="w-auto"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as SeriesStatus | '');
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

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <EmptyState
            icon={<Repeat className="size-6" aria-hidden />}
            title="Could not load your repeating bookings"
            description="Something went wrong reaching the server. Try refreshing in a moment."
          />
        ) : isLoading ? (
          <p className="p-4 text-base" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={hasFilters}
            noResults={{
              icon: <Repeat className="size-6" aria-hidden />,
              title: 'Nothing matches those filters',
              description:
                'Try a different search, or widen the filter to see finished and stopped ones.',
            }}
            firstRun={{
              title: 'No repeating bookings yet',
              description:
                'Set one up when the same appointment happens on a regular pattern — a standing weekly slot, a monthly service visit. Each one it creates appears in your Bookings list like any other.',
              actions: (
                <Button
                  color="module"
                  size="sm"
                  onClick={(event) => {
                    ctx.open(
                      'scheduling.series.detail',
                      { id: 'new' },
                      { target: targetFor(event) }
                    );
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Repeating booking
                </Button>
              ),
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>What repeats</th>
                <th className="hidden text-right @xl:table-cell">Still to come</th>
                <th className="text-right">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((series) => {
                const meta = seriesStateMeta(series.status);
                return (
                  <tr
                    key={series.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(series, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(series, event);
                    }}
                  >
                    <td className="align-top">
                      <div className="font-medium">{series.serviceName ?? 'A service'}</div>
                      <div className="text-sm">{humanizeRrule(series.rrule)}</div>
                    </td>
                    <td className="hidden text-right align-top font-mono text-sm tabular-nums @xl:table-cell">
                      {series.upcomingBookings}
                    </td>
                    <td className="text-right align-top">
                      <Badge color={meta.tone} variant="soft" size="sm">
                        {meta.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

export default SeriesListSurface;
