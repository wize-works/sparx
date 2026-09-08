'use client';

// LOTS & SERIALS — tracing exactly which batch, or which numbered unit, a
// customer got.
//
// ── One surface, two things to trace ─────────────────────────────────────
//
// The same job — "find the exact thing that left the building" — is answered at
// two grains: a BATCH (a run made or bought together, with a code and often an
// expiry) or a SERIAL (one physical unit with its own number). They are two
// server collections, so the mode toggle is a real server switch, not a client
// filter over one dataset. Kept as one surface because an operator flips between
// them constantly: "the whole batch is bad" and "this one unit is faulty" are
// the same investigation from two ends.
//
// ── Why this one IS a table ──────────────────────────────────────────────
//
// The house rule is that a short list of one-line things is cards. This is the
// other case: many rows each carrying a code, a place, a count, a date and a
// state, and the whole job is scanning those down a column — which batch is
// nearest its expiry, which units are still in stock. Cards would turn a scan
// into a read. Columns disclose with @container so a pane docked narrow still
// shows the two that matter — what it is and its state.
//
// ── No "+" here, on purpose ──────────────────────────────────────────────
//
// A batch or a serial is born when a delivery is booked in with its batch/serial
// captured — the same way a stock level comes into existence by being counted,
// received or sold, never by being declared on a list screen. So there is no
// create action; the right-hand slot is the refresh button.
//
// ── Every narrowing is a SERVER filter ───────────────────────────────────
//
// Search, location, expiry window, recall state and serial status all go to the
// API, as does paging. Filtering a loaded page would answer "what is expiring"
// with the soonest of the rows in hand — the wrong answer wearing the right one.

import { useMemo, useState } from 'react';
import {
  Badge,
  Card,
  EmptyState,
  NativeSelect,
  SearchInput,
  Table,
  Text,
  ToggleGroup,
  ToggleGroupItem,
} from '@wizeworks/silicaui-react';
import { Layers, ScanBarcode } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useStockLocations } from './data';
import {
  describeExpiry,
  lotLocationLabel,
  lotState,
  serialStatusState,
  useLots,
  useSerials,
  type LotRow,
  type SerialRow,
} from './lots-data';
import { RowOpenHint } from '../../components/row-open-hint';

type Mode = 'lots' | 'serials';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** What to try when nothing matched — naming ONLY what is actually narrowing the
 *  list, so nobody hunts for a filter they never set. */
function emptyAdvice(mode: Mode, search: string, locationName: string | null): string {
  const parts: string[] = [];
  if (search) {
    parts.push(mode === 'lots' ? 'Try part of a batch code.' : 'Try part of a serial number.');
  }
  if (locationName) {
    parts.push(`You are only seeing what is kept at ${locationName} — switch to every location.`);
  }
  parts.push('Or widen the filters above.');
  return parts.join(' ');
}

export function LotsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [mode, setMode] = useState<Mode>('lots');
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  // Lots-only axes.
  const [expiry, setExpiry] = useState<'' | 'soon' | 'expired'>('');
  const [recall, setRecall] = useState('');
  // Serials-only axis.
  const [serialStatus, setSerialStatus] = useState('');

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;

  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((location) => location.isActive);
  const locationName = activeLocations.find((location) => location.id === locationId)?.name ?? null;
  const locationNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const location of activeLocations) map.set(location.id, location.name);
    return map;
  }, [activeLocations]);

  // Frozen at mount so the query key stays stable — a fresh Date.now() every
  // render would mint a new key each time and refetch forever. A session almost
  // never crosses midnight, and the refresh button re-reads anyway.
  const expiryBounds = useMemo(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const soon = new Date(midnight.getTime() + 30 * 86_400_000);
    return { expired: midnight.toISOString(), soon: soon.toISOString() };
  }, []);
  // One clock for every row's badge, frozen at mount alongside the expiry
  // bounds, so a long list does not read against a slightly later "now" as it
  // renders down. The refresh button remounts the reads when it matters.
  const now = useMemo(() => Date.now(), []);

  const expiringBefore =
    expiry === 'expired' ? expiryBounds.expired : expiry === 'soon' ? expiryBounds.soon : undefined;

  const lotsQuery = useLots({
    q: search.trim(),
    ...(locationId ? { warehouseId: locationId } : {}),
    ...(recall ? { recallStatus: recall } : {}),
    ...(expiringBefore ? { expiringBefore } : {}),
    take,
    skip,
  });
  const serialsQuery = useSerials({
    q: search.trim(),
    ...(locationId ? { warehouseId: locationId } : {}),
    ...(serialStatus ? { status: serialStatus } : {}),
    take,
    skip,
  });

  const active = mode === 'lots' ? lotsQuery : serialsQuery;
  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = active;
  const rows = data?.items ?? [];
  const total = data?.total;

  const narrowed =
    search.trim() !== '' ||
    locationId !== '' ||
    (mode === 'lots' ? expiry !== '' || recall !== '' : serialStatus !== '');

  /** Anything that changes which rows match returns to the first window —
   *  staying on page 5 of a set that now has two shows nothing. */
  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    resetWindow();
  };

  const openLot = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.lots.detail', { id }, { target: targetFor(event) });
  };

  const body = () => {
    // A failed load REPLACES the table — never an empty grid under live filters
    // that invites "I must have none of these".
    if (isError) {
      return (
        <EmptyState
          icon={<Layers className="size-6" aria-hidden />}
          title={mode === 'lots' ? 'Could not load your batches' : 'Could not load your serials'}
          description="This is a problem reaching the server. Your records are unaffected — they just could not be read just now."
        />
      );
    }

    if (isLoading) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      );
    }

    if (rows.length === 0) {
      if (narrowed) {
        return (
          <EmptyState
            icon={
              mode === 'lots' ? (
                <Layers className="size-6" aria-hidden />
              ) : (
                <ScanBarcode className="size-6" aria-hidden />
              )
            }
            title="Nothing matches that"
            description={emptyAdvice(mode, search.trim(), locationName)}
          />
        );
      }
      return mode === 'lots' ? (
        <EmptyState
          icon={<Layers className="size-6" aria-hidden />}
          title="No batches are being tracked yet"
          description="A batch appears here when you book in a delivery and record its batch code — so you can later trace exactly which run a customer got, and find every unit if a run turns out to be bad."
        />
      ) : (
        <EmptyState
          icon={<ScanBarcode className="size-6" aria-hidden />}
          title="No serial numbers are being tracked yet"
          description="A serial number appears here when a unit is booked in with its own number — so a single faulty unit can be traced back to the exact order it left on."
        />
      );
    }

    return mode === 'lots' ? (
      <LotRows rows={rows as LotRow[]} now={now} onOpen={openLot} />
    ) : (
      <SerialRows rows={rows as SerialRow[]} locationNameById={locationNameById} onOpen={openLot} />
    );
  };

  return (
    <div className={PANE_SHELL}>
      {/* Genuinely many axes of narrowing across two modes — a mode switch, a
          text search, a location, and then either an expiry window + recall
          state (batches) or a lifecycle status (serials). That cannot reduce to
          one line in a docked pane, so this is one of the rare bars that wraps.
          Nothing is a create action; the refresh button carries `ml-auto`. */}
      <PaneToolbar
        label="Lots and serials controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label={mode === 'lots' ? 'Search batch codes' : 'Search serial numbers'}
              placeholder={mode === 'lots' ? 'Batch code…' : 'Serial number…'}
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                resetWindow();
              }}
            />
          </div>
        }
        controls={
          <>
            <ToggleGroup
              size="sm"
              color="module"
              className="shrink-0"
              value={[mode]}
              onValueChange={(next: unknown[]) => {
                if (next.includes('serials')) switchMode('serials');
                else if (next.includes('lots')) switchMode('lots');
              }}
            >
              <ToggleGroupItem value="lots" aria-label="Show batches">
                <Layers className="size-4" aria-hidden />
                <span className="hidden @md:inline">Batches</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="serials" aria-label="Show serial numbers">
                <ScanBarcode className="size-4" aria-hidden />
                <span className="hidden @md:inline">Serials</span>
              </ToggleGroupItem>
            </ToggleGroup>
            {/* The width has to sit on a WRAPPER: SearchInput forwards className to
            its inner <input>, so a sizing class aimed at the control never
            reaches the element that lays out. */}
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Show what is kept at"
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
            {mode === 'lots' ? (
              <>
                <NativeSelect
                  size="sm"
                  className="max-w-40 shrink"
                  aria-label="Filter by expiry"
                  value={expiry}
                  onChange={(event) => {
                    setExpiry(event.target.value as '' | 'soon' | 'expired');
                    resetWindow();
                  }}
                >
                  <option value="">Any expiry</option>
                  <option value="soon">Expiring soon</option>
                  <option value="expired">Already expired</option>
                </NativeSelect>

                <NativeSelect
                  size="sm"
                  className="max-w-40 shrink"
                  aria-label="Filter by recall"
                  value={recall}
                  onChange={(event) => {
                    setRecall(event.target.value);
                    resetWindow();
                  }}
                >
                  <option value="">Any recall status</option>
                  <option value="active">Recalled</option>
                  <option value="pending">Recall pending</option>
                  <option value="cleared">Recall cleared</option>
                </NativeSelect>
              </>
            ) : (
              <NativeSelect
                size="sm"
                className="max-w-40 shrink"
                aria-label="Filter by status"
                value={serialStatus}
                onChange={(event) => {
                  setSerialStatus(event.target.value);
                  resetWindow();
                }}
              >
                <option value="">Any status</option>
                <option value="in_stock">In stock</option>
                <option value="reserved">Set aside</option>
                <option value="sold">Sold</option>
                <option value="returned">Returned</option>
                <option value="scrapped">Scrapped</option>
                <option value="lost">Lost</option>
              </NativeSelect>
            )}
            {/* ALWAYS the last child of a list toolbar — see RefreshButton. */}
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      {/* Full width — matches the house list convention: the table fills the pane. */}
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
        {rows.length > 0 && mode === 'lots' ? <RowOpenHint what="a batch to open" /> : null}
      </div>
    </div>
  );
}

/* ── Batch rows ─────────────────────────────────────────────────────────── */

function LotRows({
  rows,
  now,
  onOpen,
}: {
  rows: LotRow[];
  now: number;
  onOpen: (id: string, event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  return (
    <Table size="sm" hover>
      <thead>
        <tr>
          <th>Batch</th>
          <th className="hidden @lg:table-cell">Location</th>
          <th className="text-right whitespace-nowrap">Remaining</th>
          <th className="hidden @xl:table-cell">Expiry</th>
          <th>State</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((lot) => {
          const state = lotState(lot, now);
          const expiry = describeExpiry(lot.expiresAt, now);
          return (
            <tr
              key={lot.id}
              className="cursor-pointer"
              tabIndex={0}
              role="button"
              onClick={(event) => {
                onOpen(lot.id, event);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                onOpen(lot.id, event);
              }}
            >
              {/* `max-w-0 w-full` makes THIS the cell that gives, so the state
                  badge is never the column shoved off the right edge. */}
              <td className="w-full max-w-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-mono">{lot.lotNumber}</span>
                  <span className="truncate text-sm">
                    {lot.productTitle ?? 'Untitled product'}
                    {lot.variantSku ? ` · ${lot.variantSku}` : ''}
                  </span>
                  {/* Below @lg the Location column is gone, so it comes back
                      here — a batch without a place is not a full answer. */}
                  <span className="truncate text-sm @lg:hidden">{lotLocationLabel(lot)}</span>
                  {/* Below @xl the Expiry column is gone; a soon/expired date is
                      the point of the row, so it must not vanish entirely. */}
                  {expiry ? (
                    <span className="truncate text-sm @xl:hidden">{expiry.long}</span>
                  ) : null}
                </span>
              </td>
              <td className="hidden max-w-48 truncate @lg:table-cell">{lotLocationLabel(lot)}</td>
              <td className="text-right font-medium whitespace-nowrap tabular-nums">
                {lot.quantity}
              </td>
              <td className="hidden whitespace-nowrap @xl:table-cell">
                {expiry ? (
                  <Text className="text-sm">{expiry.long}</Text>
                ) : (
                  <Text className="text-sm">No expiry</Text>
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
}

/* ── Serial rows ────────────────────────────────────────────────────────── */

function SerialRows({
  rows,
  locationNameById,
  onOpen,
}: {
  rows: SerialRow[];
  locationNameById: Map<string, string>;
  onOpen: (id: string, event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  return (
    <Table size="sm" hover>
      <thead>
        <tr>
          <th>Serial number</th>
          <th className="hidden @lg:table-cell">Location</th>
          <th className="hidden @xl:table-cell">Batch</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((serial) => {
          const state = serialStatusState(serial.status);
          const location = locationNameById.get(serial.warehouseId) ?? serial.warehouseCode ?? '—';
          // A unit only has somewhere to open TO when it belongs to a batch —
          // the batch is its detail. A lot-less unit is a leaf, shown but not
          // clickable, so the row never promises a pane it cannot deliver.
          const lotBatchId = serial.lotBatchId;
          const interactive: React.HTMLAttributes<HTMLTableRowElement> & { tabIndex?: number } =
            lotBatchId !== null
              ? {
                  tabIndex: 0,
                  role: 'button',
                  onClick: (event) => {
                    onOpen(lotBatchId, event);
                  },
                  onKeyDown: (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    onOpen(lotBatchId, event);
                  },
                }
              : {};
          return (
            <tr
              key={serial.id}
              className={lotBatchId !== null ? 'cursor-pointer' : ''}
              {...interactive}
            >
              <td className="w-full max-w-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-mono">{serial.serial}</span>
                  <span className="truncate text-sm">
                    {serial.productTitle ?? 'Untitled product'}
                    {serial.variantSku ? ` · ${serial.variantSku}` : ''}
                  </span>
                  <span className="truncate text-sm @lg:hidden">{location}</span>
                  {serial.lotNumber ? (
                    <span className="truncate font-mono text-sm @xl:hidden">
                      Batch {serial.lotNumber}
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="hidden max-w-48 truncate @lg:table-cell">{location}</td>
              <td className="hidden max-w-40 truncate font-mono text-sm @xl:table-cell">
                {serial.lotNumber ?? 'No batch'}
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
}
