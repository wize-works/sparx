'use client';

// LOCATIONS — every place you keep stock: a warehouse, a shop floor, a van.
//
// ── A table, like every other list ───────────────────────────────────────
//
// A location is an identity (a name and the code on its shelf labels) plus two
// facts — what kind of place it is, and where it is. Laid down a table those
// facts line up into columns you scan, and the list reads the same as every
// other list in the app rather than as its own bespoke thing. The columns
// disclose with @container: docked narrow you see the name, its code and its
// state; given room the kind and the town come back. The name cell is the one
// that GIVES (`max-w-0 w-full`), so the state badge is never the column shoved
// off the right edge.
//
// ── Every narrowing is a SERVER filter ───────────────────────────────────
//
// Search, the kind of place, "show closed", and the paging all go to the API.
// Filtering the loaded window in the browser would answer "which of my 3PLs" by
// sieving the fifty rows that happen to be in hand.
//
// ── Three empty states, three different problems ─────────────────────────
//
// Nothing matches the search or filters · nothing exists yet · the load failed.
// Telling someone to set up their first location when they have twelve and
// mistyped is the worse of the mistakes, so the narrowed case says so instead.

import { useState } from 'react';
import { Badge, Button, Card, EmptyState, SearchInput, Table } from '@wizeworks/silicaui-react';
import { Plus, Warehouse } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  LOCATION_TYPES,
  locationPlace,
  locationState,
  locationTypeLabel,
  useLocations,
  type Location,
} from './locations-data';
import { RowOpenHint } from '../../components/row-open-hint';

const DETAIL_KEY = 'inventory.warehouses.detail';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** What to try when nothing matched — naming ONLY what is actually narrowing the
 *  list, so no one goes hunting for a filter they never set. */
function emptyAdvice(search: string, typeLabel: string | null, includeClosed: boolean): string {
  const parts: string[] = [];
  if (search) parts.push('Try part of a location’s name or its code.');
  if (typeLabel) parts.push(`You are only seeing “${typeLabel}” places — switch to every kind.`);
  if (!includeClosed) parts.push('Closed locations are hidden — turn them on to include those.');
  return parts.join(' ');
}

export function LocationsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [includeClosed, setIncludeClosed] = useState(false);

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;

  const { data, isPending, isFetching, dataUpdatedAt, isError, refetch } = useLocations({
    q: search.trim(),
    ...(type ? { type } : {}),
    includeClosed,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const typeLabel = type ? locationTypeLabel(type) : null;
  // Only an explicit search or kind filter counts as "narrowed". "Show closed"
  // is OFF by default, so treating that default as a narrowing would show a
  // brand-new account "Nothing matches that" instead of a first-run create
  // prompt — the empty-account case must reach the CTA, not the search advice.
  const narrowed = search.trim() !== '' || type !== '';

  /** Anything that changes which rows match returns to the first window —
   *  staying on page 5 of a set that now has two shows nothing. */
  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const openNew = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(DETAIL_KEY, { id: 'new' }, { target: targetFor(event) });
  };

  const open = (location: Location, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(DETAIL_KEY, { id: location.id }, { target: targetFor(event) });
  };

  const body = () => {
    // A failed load REPLACES the grid — never an empty grid under live filters,
    // which invites someone to conclude they have no locations.
    if (isError) {
      return (
        <EmptyState
          icon={<Warehouse className="size-6" aria-hidden />}
          title="Could not load your locations"
          description="This is a problem reaching the server. Your locations are unaffected — the list just could not be read just now."
          actions={
            <Button
              size="sm"
              color="module"
              onClick={() => {
                void refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      );
    }

    if (isPending) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading locations…
        </p>
      );
    }

    if (rows.length === 0) {
      return (
        <ListEmptyState
          filtered={narrowed}
          noResults={{
            icon: <Warehouse className="size-6" aria-hidden />,
            title: 'Nothing matches that',
            description: emptyAdvice(search.trim(), typeLabel, includeClosed),
          }}
          firstRun={{
            title: 'No locations yet',
            description: `A location is any place you keep stock — a warehouse, a shop, a garage, a van. Set up your first and you can start counting what is in it.${
              includeClosed
                ? ''
                : ' If you have closed a location before, switch on “Show closed” to see it.'
            }`,
            actions: (
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  openNew({ shiftKey: false, altKey: false });
                }}
              >
                <Plus className="size-4" aria-hidden />
                New location
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
            <th>Location</th>
            <th className="hidden whitespace-nowrap @lg:table-cell">Kind</th>
            <th className="hidden @xl:table-cell">Where</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((location) => {
            const state = locationState(location);
            const place = locationPlace(location);
            return (
              <tr
                key={location.id}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  open(location, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  open(location, event);
                }}
              >
                {/* `max-w-0 w-full` makes this the cell that GIVES: a table cell
                    sizes to its content, so without it a long location name
                    pushes the row wider and shoves the State badge off the right
                    edge — the one column that must never be the one to go. */}
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{location.name}</span>
                    {/* The code is how the shelves are labelled — mono because it
                        is a code, not prose. */}
                    <span className="truncate font-mono text-sm">{location.code}</span>
                    {/* Below @lg the Kind column is gone; below @xl the Where
                        column is gone. Each folds back here so a narrow pane
                        still says what the place is and where it is. */}
                    <span className="truncate text-sm @lg:hidden">
                      {locationTypeLabel(location.type)}
                    </span>
                    {place ? <span className="truncate text-sm @xl:hidden">{place}</span> : null}
                  </span>
                </td>
                <td className="hidden whitespace-nowrap @lg:table-cell">
                  {locationTypeLabel(location.type)}
                </td>
                <td className="hidden max-w-48 truncate @xl:table-cell">{place ?? '—'}</td>
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
      {/* The toolbar does NOT wrap: a second line shoves the grid down and
          reflows as you type. Things give way instead — the kind picker shrinks,
          the "show closed" toggle sheds its label below @2xl — and the search box
          absorbs whatever is left. The primary action carries `ml-auto`. */}
      <PaneToolbar
        label="Locations list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search locations"
              placeholder="Name or code…"
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                resetWindow();
              }}
            />
          </div>
        }
        filters={[
          {
            label: 'Kind of place',
            key: 'type',
            value: type,
            onValueChange: (next) => {
              setType(next);
              resetWindow();
            },
            options: [
              { value: '', label: 'Every kind' },
              ...LOCATION_TYPES.map((kind) => ({ value: kind.value, label: kind.label })),
            ],
            neutralValue: '',
            present: 'select',
          },
          {
            label: 'Closed places',
            key: 'includeClosed',
            value: includeClosed ? 'yes' : 'no',
            onValueChange: (next) => {
              setIncludeClosed(next === 'yes');
              resetWindow();
            },
            options: [
              { value: 'no', label: 'Open only' },
              { value: 'yes', label: 'Show closed' },
            ],
            neutralValue: 'no',
          },
        ]}
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0 whitespace-nowrap"
            title="New location — hold Shift to open alongside, Alt for a new window"
            onClick={openNew}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">New location</span>
          </Button>
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

      {/* Full width — the base-100 card lifts the rows off the recessed pane.
          Matches the house list convention: the table fills the pane. */}
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
        {rows.length > 0 ? <RowOpenHint /> : null}
      </div>
    </div>
  );
}
