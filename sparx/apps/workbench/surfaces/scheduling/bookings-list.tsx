'use client';

// Bookings — every appointment, class, reservation and rental as one searchable
// list. This is the module's core operational surface: an owner opens it to see
// what is coming, whether it is confirmed, and who it is with, and to open any
// one of them to work on it.
//
// A booking is a multi-attribute record — when, what, with whom, what state —
// so it earns a table: each column answers a different question scanned across.
// The one the list is really FOR is WHEN, so it leads and sorts the list.

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
import { CalendarClock, Plus } from 'lucide-react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import {
  bookingResourceLabel,
  bookingStateMeta,
  bookingTypeLabel,
  bookingWhoLabel,
  formatClock,
  formatDay,
  useBookings,
  type Booking,
  type BookingOrder,
  type BookingStatus,
  type BookingType,
} from './bookings-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

const STATUS_OPTIONS: { value: BookingStatus | ''; label: string }[] = [
  { value: '', label: 'Any status' },
  { value: 'requested', label: 'Awaiting confirmation' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'Did not turn up' },
];

const TYPE_OPTIONS: { value: BookingType | ''; label: string }[] = [
  { value: '', label: 'Every kind' },
  { value: 'appointment', label: 'Appointments' },
  { value: 'class', label: 'Classes' },
  { value: 'reservation', label: 'Reservations' },
  { value: 'rental', label: 'Rentals' },
];

const PAGE_SIZE = 50;

export function BookingsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<BookingStatus | ''>('');
  const [type, setType] = useState<BookingType | ''>('');
  const [order, setOrder] = useState<BookingOrder>('desc');
  const [page, setPage] = useState(0);

  const query = {
    q: search.trim() || undefined,
    status,
    bookingType: type,
    order,
    take: PAGE_SIZE,
    skip: page * PAGE_SIZE,
  };

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useBookings(query);
  const rows = data?.items ?? [];
  const total = data?.total;
  const hasFilters = Boolean(search.trim() || status || type);

  const open = (booking: Booking, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('scheduling.bookings.detail', { id: booking.id }, { target: targetFor(event) });
  };

  // Reset to the first page whenever a filter changes — page 3 of the old result
  // set is meaningless against a new one.
  const onFilter = <T,>(setter: (value: T) => void) => {
    return (value: T) => {
      setter(value);
      setPage(0);
    };
  };

  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = page * PAGE_SIZE + rows.length;
  const canPrev = page > 0;
  const canNext = total === undefined ? rows.length === PAGE_SIZE : to < total;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Booking list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search bookings by note or name"
              placeholder="Search notes and names…"
              value={search}
              onValueChange={onFilter(setSearch)}
            />
          </div>
        }
        primary={
          <Button
            data-tour="scheduling-take-booking"
            color="module"
            size="sm"
            className="ml-auto"
            title="Take a booking — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('scheduling.bookings.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Take a booking
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              aria-label="Filter by status"
              className="w-auto"
              value={status}
              onChange={(event) => {
                onFilter(setStatus)(event.target.value as BookingStatus | '');
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              aria-label="Filter by kind of booking"
              className="w-auto"
              value={type}
              onChange={(event) => {
                onFilter(setType)(event.target.value as BookingType | '');
              }}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              aria-label="Order by time"
              className="w-auto"
              value={order}
              onChange={(event) => {
                onFilter(setOrder)(event.target.value as BookingOrder);
              }}
            >
              <option value="desc">Most recent first</option>
              <option value="asc">Soonest first</option>
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
            icon={<CalendarClock className="size-6" aria-hidden />}
            title="Could not load your bookings"
            description="Something went wrong reaching the server. It may be a temporary problem — try refreshing in a moment."
          />
        ) : isLoading ? (
          <p className="p-4 text-base" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={hasFilters}
            noResults={{
              icon: <CalendarClock className="size-6" aria-hidden />,
              title: 'Nothing matches those filters',
              description:
                'Try a different search, or widen the status and kind filters to see more.',
            }}
            firstRun={{
              title: 'No bookings yet',
              description:
                'When someone books a time with you — online or taken here by hand — it appears in this list. Take your first one to see how it looks.',
              actions: (
                <Button
                  color="module"
                  size="sm"
                  onClick={(event) => {
                    ctx.open(
                      'scheduling.bookings.detail',
                      { id: 'new' },
                      { target: targetFor(event) }
                    );
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Take a booking
                </Button>
              ),
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th className="hidden @2xl:table-cell">With</th>
                <th className="text-right">State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((booking) => {
                const meta = bookingStateMeta(booking.status);
                return (
                  <tr
                    key={booking.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(booking, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(booking, event);
                    }}
                  >
                    <td className="align-top">
                      <div className="font-medium">
                        {formatDay(booking.startAt, booking.timezone)}
                      </div>
                      <div className="text-sm">
                        {formatClock(booking.startAt, booking.timezone)}
                      </div>
                    </td>
                    <td className="align-top">
                      <div className="font-medium">{booking.service.name}</div>
                      <div className="text-sm">
                        {bookingTypeLabel(booking.bookingType)} · {bookingWhoLabel(booking)}
                      </div>
                    </td>
                    <td className="hidden align-top text-sm @2xl:table-cell">
                      {bookingResourceLabel(booking)}
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

      {rows.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-3 px-1">
          <p className="text-sm">
            {total === undefined
              ? `Showing ${String(from)}–${String(to)}`
              : `Showing ${String(from)}–${String(to)} of ${String(total)}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              disabled={!canPrev}
              onClick={() => {
                setPage((current) => Math.max(0, current - 1));
              }}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              disabled={!canNext}
              onClick={() => {
                setPage((current) => current + 1);
              }}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default BookingsListSurface;
