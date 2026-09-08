'use client';

// STOCK COUNTS — the sessions where you count what is actually on the shelf and
// correct the numbers when they disagree.
//
// ── A table, like every other list ────────────────────────────────────────
//
// A count is a session: a location, a state, how far the counting has got, and
// the money value of the differences it found. Laid down a table those become
// columns you scan — how many items, how big the difference, when it started —
// and the list reads the same as every other list in the app. The columns
// disclose with @container: docked narrow you see the location, its number and
// its state, with the progress and difference folded under the name; given room
// they come back as their own right-aligned numeric columns. The name cell is
// the one that GIVES (`max-w-0 w-full`), so the State badge is never shoved off
// the right edge.
//
// ── Creating a count is a PANE, in its "new" state ────────────────────────
//
// A new count is the same surface as an open one, started empty — so the "+"
// opens the detail pane at {id:'new'} rather than a modal. There is real work in
// starting a count (choosing where, choosing what), a durable thing you return
// to, and it takes minutes not seconds. A modal clears none of those bars.
//
// ── Two empty states ──────────────────────────────────────────────────────
//
// Nothing matches the filters · no count has ever been started. The second
// invites the first count; the first must not, or someone who filtered to
// "Applied" and has none yet is told to go start counting when they are mid-way
// through their first session two filters away.

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
import { ClipboardCheck, ClipboardList, Plus } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural, useStockLocations } from './data';
import {
  countState,
  countTypeLabel,
  useCounts,
  type CountRow,
  type CountStatus,
} from './counts-data';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** The one summary line a card carries, tuned to what matters at each stage:
 *  progress while counting, the value of the differences once counted, what was
 *  corrected once applied. */
function summaryLine(count: CountRow): string {
  const items = plural(count.lineCount, 'item', 'items');
  switch (count.status) {
    case 'counting':
      return `${String(count.countedLineCount)} of ${items} counted`;
    case 'review':
    case 'approved':
      return count.varianceValueCents > 0
        ? `${items} counted · differences worth ${formatCents(count.varianceValueCents)}`
        : `${items} counted · everything matched`;
    case 'posted':
      return count.varianceValueCents > 0
        ? `${items} · ${formatCents(count.varianceValueCents)} of corrections applied`
        : `${items} · everything matched, nothing to correct`;
    case 'cancelled':
      return `${items} · discarded without changing any stock`;
    default:
      return items;
  }
}

const STATUS_OPTIONS: { value: CountStatus; label: string }[] = [
  { value: 'counting', label: 'Being counted' },
  { value: 'review', label: 'Ready to apply' },
  { value: 'approved', label: 'Approved' },
  { value: 'posted', label: 'Applied' },
  { value: 'cancelled', label: 'Discarded' },
];

export function CountsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | CountStatus>('');
  const [locationId, setLocationId] = useState('');

  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(25);

  const skip = (page - 1) * pageSize;
  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((location) => location.isActive);
  const locationName = activeLocations.find((location) => location.id === locationId)?.name ?? null;

  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = useCounts({
    q: search.trim(),
    ...(status ? { status } : {}),
    ...(locationId ? { warehouseId: locationId } : {}),
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const narrowed = search.trim() !== '' || status !== '' || locationId !== '';

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const openCount = (count: CountRow, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.counts.detail', { id: count.id }, { target: targetFor(event) });
  };

  const body = () => {
    if (isError) {
      return (
        <EmptyState
          icon={<ClipboardList className="size-6" aria-hidden />}
          title="Could not load your counts"
          description="This is a problem reaching the server. Your counts are unaffected — the list just could not be read just now."
        />
      );
    }

    if (isLoading) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading counts…
        </p>
      );
    }

    if (rows.length === 0) {
      return (
        <ListEmptyState
          filtered={narrowed}
          noResults={{
            icon: <ClipboardCheck className="size-6" aria-hidden />,
            title: 'Nothing matches that',
            description: locationName
              ? `No counts match those filters at ${locationName}. Clear the status, or switch back to every location.`
              : 'No counts match those filters. Try clearing the status filter or a different location.',
          }}
          firstRun={{
            title: 'No stock counts yet',
            description:
              'A stock count is where you count what is really on the shelf and put the numbers right. Start one, count each item, and apply it to correct your stock in one go.',
            actions: (
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  ctx.open('inventory.counts.detail', { id: 'new' }, { target: 'tab' });
                }}
              >
                <Plus className="size-4" aria-hidden />
                Start a count
              </Button>
            ),
          }}
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Count</th>
            <th className="hidden text-right whitespace-nowrap @lg:table-cell">Counted</th>
            <th className="hidden text-right whitespace-nowrap @xl:table-cell">Difference</th>
            <th className="hidden @3xl:table-cell">Started</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((count) => {
            const state = countState(count.status);
            // The difference value is only frozen once counting is done, so a
            // session still being counted shows a dash rather than a misleading
            // "£0.00" that reads as "everything matched".
            const difference =
              count.status === 'counting' ? '—' : formatCents(count.varianceValueCents);
            return (
              <tr
                key={count.id}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  openCount(count, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  openCount(count, event);
                }}
              >
                {/* `max-w-0 w-full` makes this the cell that GIVES, so a long
                    location name never pushes the State badge off the right. */}
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {count.warehouseName ?? 'Stock count'}
                    </span>
                    <span className="truncate font-mono text-sm">{count.number}</span>
                    {/* Below @lg the Counted and Difference columns are gone, so
                        the plain-language summary folds back here; below @3xl the
                        Started column folds back too. */}
                    <span className="truncate text-sm @lg:hidden">
                      {countTypeLabel(count.type)} · {summaryLine(count)}
                    </span>
                    <span className="truncate text-sm @3xl:hidden">
                      Started <Timestamp value={count.createdAt} format="relative" />
                    </span>
                  </span>
                </td>
                <td className="hidden text-right whitespace-nowrap tabular-nums @lg:table-cell">
                  {count.countedLineCount}/{count.lineCount}
                </td>
                <td className="hidden text-right whitespace-nowrap tabular-nums @xl:table-cell">
                  {difference}
                </td>
                <td className="hidden whitespace-nowrap @3xl:table-cell">
                  <Timestamp value={count.createdAt} format="relative" />
                </td>
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
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Stock count controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search counts"
              placeholder="Count number or location…"
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                resetWindow();
              }}
            />
          </div>
        }
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto shrink-0 whitespace-nowrap"
            aria-label="Start a new count"
            title="Start a new count"
            onClick={(event) => {
              ctx.open(
                'inventory.counts.detail',
                { id: 'new' },
                { target: event.shiftKey ? 'beside' : 'tab' }
              );
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @md:inline">New count</span>
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Show counts that are"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as '' | CountStatus);
                resetWindow();
              }}
            >
              <option value="">Any status</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Show counts at"
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value);
                resetWindow();
              }}
            >
              <option value="">Every location</option>
              {activeLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </NativeSelect>
            {/* ALWAYS the last child of a list toolbar — see RefreshButton. */}
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

      {/* Full width — the base-100 card lifted off the recessed pane. Matches the
          house list convention: the table fills the pane. */}
      <Card className="min-h-0 flex-1 overflow-y-auto">{body()}</Card>

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
      </div>
    </div>
  );
}
