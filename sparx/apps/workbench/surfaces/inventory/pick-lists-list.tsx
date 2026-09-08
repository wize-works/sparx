'use client';

// WALKS — the lists of "go and fetch these things", and how far through each one
// somebody is.
//
// ── Why "walk" and not "pick list" ────────────────────────────────────────
//
// The people using this are not warehouse-systems people. "Pick list" is a term
// of art; a walk is what it physically IS — somebody carrying a trolley round a
// building. The URL and the API keep `pick-list`, because that IS the term of art
// everywhere else in the industry and an integrator should not have to learn ours.
//
// ── The column that earns its place is SHORT ──────────────────────────────
//
// Progress tells you whether the work is done. Shorts tell you whether the stock
// numbers are wrong, which is the thing this whole module exists to fix — so a
// walk with a short on it wears a danger badge in the list rather than waiting to
// be discovered by whoever opens it.

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
import { ClipboardList, Route, TriangleAlert } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { plural, useStockLocations } from './data';
import {
  pickKindLabel,
  pickListState,
  usePickLists,
  type PickListRow,
  type PickListStatus,
} from './picking-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

const STATUS_OPTIONS: { value: PickListStatus; label: string }[] = [
  { value: 'draft', label: 'Waiting for a picker' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'picking', label: 'Being picked' },
  { value: 'picked', label: 'Picked' },
  { value: 'cancelled', label: 'Abandoned' },
];

/** One plain sentence per walk, tuned to the stage it is at. */
function summaryLine(walk: PickListRow): string {
  const orders = plural(walk.orderCount, 'order', 'orders');
  switch (walk.status) {
    case 'draft':
      return `${orders} · ${plural(walk.lineCount, 'thing', 'things')} to fetch`;
    case 'assigned':
      return `${orders} · ${walk.assignedTo ?? 'someone'} has it`;
    case 'picking':
      return `${orders} · ${String(walk.unitsPicked)} of ${String(walk.unitsRequested)} units picked`;
    case 'picked':
      return walk.shortCount > 0
        ? `${orders} · ${plural(walk.shortCount, 'line', 'lines')} came up short`
        : `${orders} · everything found`;
    case 'cancelled':
      return `${orders} · abandoned`;
    default:
      return orders;
  }
}

export function PickListsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | PickListStatus>('');
  const [locationId, setLocationId] = useState('');

  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(25);

  const skip = (page - 1) * pageSize;
  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((l) => l.isActive);

  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = usePickLists({
    ...(search.trim() ? { search: search.trim() } : {}),
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

  const openWalk = (walk: PickListRow, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.picking.detail', { id: walk.id }, { target: targetFor(event) });
  };

  const body = () => {
    if (isError) {
      return (
        <EmptyState
          icon={<Route className="size-6" aria-hidden />}
          title="Could not load the walks"
          description="This is a problem reaching the server. Nobody's walk is affected — the list just could not be read just now."
        />
      );
    }

    if (isLoading) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading walks…
        </p>
      );
    }

    if (rows.length === 0) {
      return (
        <ListEmptyState
          filtered={narrowed}
          noResults={{
            icon: <Route className="size-6" aria-hidden />,
            title: 'Nothing matches that',
            description:
              'No walks match those filters. Try clearing the status, or switching back to every location.',
          }}
          firstRun={{
            title: 'No walks yet',
            description:
              'A walk turns orders into a route through the building: which shelf, which item, how many, in the order you would actually walk it. Start one from an order, or from Orders with several selected.',
            actions: (
              <Button
                size="sm"
                color="module"
                variant="outline"
                onClick={() => {
                  ctx.open('crm.orders.list', {}, { target: 'tab' });
                }}
              >
                Go to orders
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
            <th>Walk</th>
            <th className="hidden text-right whitespace-nowrap @lg:table-cell">Picked</th>
            <th className="hidden text-right whitespace-nowrap @xl:table-cell">Short</th>
            <th className="hidden @3xl:table-cell">Started</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((walk) => {
            const state = pickListState(walk.status);
            return (
              <tr
                key={walk.id}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  openWalk(walk, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  openWalk(walk, event);
                }}
              >
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {walk.orderNumbers.slice(0, 3).join(', ') || walk.warehouseName}
                      {walk.orderNumbers.length > 3
                        ? ` +${String(walk.orderNumbers.length - 3)}`
                        : ''}
                    </span>
                    <span className="truncate font-mono text-sm">{walk.number}</span>
                    <span className="truncate text-sm @lg:hidden">
                      {pickKindLabel(walk.kind)} · {summaryLine(walk)}
                    </span>
                    <span className="truncate text-sm @3xl:hidden">
                      {walk.warehouseName}
                      {walk.startedAt ? (
                        <>
                          {' · started '}
                          <Timestamp value={walk.startedAt} format="relative" />
                        </>
                      ) : null}
                    </span>
                  </span>
                </td>
                <td className="hidden text-right whitespace-nowrap tabular-nums @lg:table-cell">
                  {walk.unitsPicked}/{walk.unitsRequested}
                </td>
                <td className="hidden text-right whitespace-nowrap @xl:table-cell">
                  {walk.shortCount > 0 ? (
                    <Badge color="danger" variant="soft" size="sm">
                      <TriangleAlert className="size-3" aria-hidden />
                      {walk.shortCount}
                    </Badge>
                  ) : (
                    <span className="tabular-nums">—</span>
                  )}
                </td>
                <td className="hidden whitespace-nowrap @3xl:table-cell">
                  {walk.startedAt ? (
                    <Timestamp value={walk.startedAt} format="relative" />
                  ) : (
                    <span>Not started</span>
                  )}
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
        label="Walk controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search walks"
              placeholder="Walk or order number…"
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
            color="module-inventory"
            variant="outline"
            className="ml-auto shrink-0 whitespace-nowrap"
            onClick={(event) => {
              ctx.open('inventory.picking.throughput', {}, { target: targetFor(event) });
            }}
          >
            <ClipboardList className="size-4" aria-hidden />
            <span className="hidden @md:inline">How the floor is running</span>
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-44 shrink"
              aria-label="Show walks that are"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as '' | PickListStatus);
                resetWindow();
              }}
            >
              <option value="">Any state</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Show walks at"
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
