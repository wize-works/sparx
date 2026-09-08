'use client';

// SHELVES — where inside each location your stock actually sits.
//
// ── Why this is a table ──────────────────────────────────────────────────
//
// Same test the Stock list passes: hundreds of rows each carrying several facts
// you scan DOWN a column — how many items, how many units, how full, what kind.
// Cards would turn a scan into a read.
//
// ── Sorted by the WALK, not the alphabet ─────────────────────────────────
//
// Rows come back in pick-sequence order from the server, which is the order
// someone physically passes the shelves. An alphabetical list of shelf labels is
// a list; a list in walk order is a route, and it is the difference between the
// screen describing the warehouse and matching it.
//
// ── Kind carries color ──────────────────────────────────────────────────
//
// The distinction that matters on this screen is "can stock here be sold", and a
// column of identical grey chips hides it entirely. On-hold and damaged shelves
// are red because stock sitting on them is invisible to customers — which is
// either exactly right or a problem, and either way worth seeing from across the
// room.

import { useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  NativeSelect,
  SearchInput,
  Table,
  Text,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { Grid3x3, QrCode, Search } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useStockLocations } from './data';
import {
  BIN_TYPES,
  binAddress,
  binFullness,
  binTypeLabel,
  binTypeTone,
  useBins,
  type Bin,
} from './bins-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

const NUMBER = new Intl.NumberFormat();

/** How full, as one of a fixed set of width classes so every value is a LITERAL
 *  Tailwind class the compiler can see — an inline width is banned, and at this
 *  bar size a 10% step is a couple of pixels. */
const FULL_WIDTH = [
  'w-0',
  'w-[10%]',
  'w-[20%]',
  'w-[30%]',
  'w-[40%]',
  'w-[50%]',
  'w-[60%]',
  'w-[70%]',
  'w-[80%]',
  'w-[90%]',
  'w-full',
];

export function BinsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const [type, setType] = useState('');
  const [nonEmptyOnly, setNonEmptyOnly] = useState(false);

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;
  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((l) => l.isActive);
  const locationName = activeLocations.find((l) => l.id === locationId)?.name ?? null;

  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = useBins({
    q: search.trim(),
    ...(locationId ? { warehouseId: locationId } : {}),
    ...(type ? { type } : {}),
    nonEmptyOnly,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const narrowed = search.trim() !== '' || locationId !== '' || type !== '' || nonEmptyOnly;

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const open = (bin: Bin, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.bins.detail', { id: bin.id }, { target: targetFor(event) });
  };

  const body = () => {
    if (isError) {
      return (
        <EmptyState
          icon={<Grid3x3 className="size-6" aria-hidden />}
          title="Could not load your shelves"
          description="This is a problem reaching the server. Your shelves and their stock are unaffected — they just could not be read just now."
        />
      );
    }

    if (isLoading) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading shelves…
        </p>
      );
    }

    if (rows.length === 0) {
      // Three different problems, and the worst mistake is telling someone with
      // four hundred shelves to create their first one because they mistyped.
      return (
        <EmptyState
          icon={
            narrowed ? (
              <Search className="size-6" aria-hidden />
            ) : (
              <Grid3x3 className="size-6" aria-hidden />
            )
          }
          title={narrowed ? 'Nothing matches that' : 'No shelves set up yet'}
          description={
            narrowed
              ? locationName
                ? `No shelves at ${locationName} match those filters. Try clearing the kind, or switch to every location.`
                : 'No shelves match those filters. Try part of a shelf label or a zone name.'
              : 'Shelves let you record which part of a location something is in, so people can find it without walking the room. Turn them on for a location from its settings, then add the shelves you actually have.'
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Shelf</th>
            <th className="hidden @lg:table-cell">Location</th>
            <th>Kind</th>
            <th className="hidden text-right @xl:table-cell">Items</th>
            <th className="text-right">Units</th>
            <th className="hidden @2xl:table-cell">How full</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((bin) => {
            const fullness = binFullness(bin);
            return (
              <tr
                key={bin.id}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  open(bin, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  open(bin, event);
                }}
              >
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-mono font-medium">{bin.code}</span>
                    {bin.name ? <span className="truncate text-sm">{bin.name}</span> : null}
                    {/* Below @lg the Location column is gone, and a shelf with no
                        place is not an answer. */}
                    <span className="truncate text-sm @lg:hidden">{bin.warehouseName ?? '—'}</span>
                    {bin.zone || bin.aisle ? (
                      <span className="hidden truncate text-sm @lg:inline">{binAddress(bin)}</span>
                    ) : null}
                  </span>
                </td>
                <td className="hidden max-w-40 truncate @lg:table-cell">
                  {bin.warehouseName ?? '—'}
                </td>
                <td>
                  <span className="flex flex-wrap items-center gap-1">
                    <Badge color={binTypeTone(bin.type)} variant="soft" size="sm">
                      {binTypeLabel(bin.type)}
                    </Badge>
                    {/* Said out loud rather than left to be inferred from the
                        kind: "cannot be sold" is the fact with consequences. */}
                    {!bin.isSellable && bin.unitCount > 0 ? (
                      <Badge color="danger" variant="outline" size="sm">
                        Not sellable
                      </Badge>
                    ) : null}
                  </span>
                </td>
                <td className="hidden text-right tabular-nums @xl:table-cell">{bin.itemCount}</td>
                <td className="text-right font-medium whitespace-nowrap tabular-nums">
                  {NUMBER.format(bin.unitCount)}
                </td>
                <td className="hidden @2xl:table-cell">
                  {fullness === null ? (
                    <Text className="text-sm">—</Text>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span className="bg-base-200 h-2 w-16 overflow-hidden rounded-full">
                        <span
                          className={`block h-full rounded-full ${
                            fullness >= 0.9 ? 'bg-warning' : 'bg-module'
                          } ${FULL_WIDTH[Math.round(fullness * 10)] ?? 'w-full'}`}
                        />
                      </span>
                      <Text className="text-sm tabular-nums">{Math.round(fullness * 100)}%</Text>
                    </span>
                  )}
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
        label="Shelf list controls"
        search={
          <SearchInput
            value={search}
            placeholder="Shelf label or zone"
            onValueChange={(value) => {
              setSearch(value);
              resetWindow();
            }}
          />
        }
        controls={
          <>
            <Button
              color="module-inventory"
              size="sm"
              onClick={() => {
                ctx.open('inventory.bins.detail', { id: 'new' });
              }}
            >
              New shelf
            </Button>
            <Tooltip content="Print labels for the shelves you are looking at">
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                onClick={() => {
                  ctx.open(
                    'inventory.bins.labels',
                    { ...(locationId ? { warehouseId: locationId } : {}) },
                    { target: 'beside' }
                  );
                }}
              >
                <QrCode className="size-4" aria-hidden />
                Labels
              </Button>
            </Tooltip>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Location"
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
            <NativeSelect
              size="sm"
              className="max-w-36 shrink"
              aria-label="Kind of shelf"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                resetWindow();
              }}
            >
              <option value="">Every kind</option>
              {BIN_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </NativeSelect>
            <ToggleGroup
              value={nonEmptyOnly ? ['non-empty'] : []}
              onValueChange={(value) => {
                setNonEmptyOnly(value.includes('non-empty'));
                resetWindow();
              }}
            >
              <ToggleGroupItem value="non-empty" aria-label="Only show shelves holding stock">
                Holding stock
              </ToggleGroupItem>
            </ToggleGroup>
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

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>

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
  );
}
