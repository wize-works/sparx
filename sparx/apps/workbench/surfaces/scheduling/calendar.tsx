'use client';

// THE CALENDAR — the operator's diary, everything booked in laid out by time.
//
// Two shapes of the same grid. WEEK is seven day-columns on one time axis — the
// "how does my week look" view. DAY is one day split into a column per resource
// (a member of staff, a bay, a room), which is how a shop actually runs a day:
// who is on what, and where the gaps are. A resource can't be double-booked (the
// database forbids it), so a resource column is a clean single track.
//
// Everything that narrows or moves the diary is a real read: the [from, to)
// window is a server filter, the resource filter is passed to the server too, so
// the grid never sieves a page in the browser and calls it the answer. Color is
// status, carried by the blocks themselves (see calendar-timegrid), so a glance
// tells you what is confirmed, what still needs a nod, and what is under way.
//
// Clicking a booking opens a quick-look MODAL over the diary — reschedule, the
// lifecycle moves, and its change history, without splitting or hiding the grid.
// Shift-click opens the full booking pane alongside, alt-click in its own window,
// for anyone who wants the deep editor straight away.

import { useMemo, useState } from 'react';
import {
  Button,
  EmptyState,
  Join,
  NativeSelect,
  Text,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { CalendarOff, ChevronLeft, ChevronRight, Link2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { CalendarBookingModal } from './calendar-booking-modal';
import { useSchedulingResources } from './bookings-data';
import {
  addDays,
  addWeeks,
  dayLabel,
  dayWindow,
  isSameDay,
  isToday,
  useCalendarRange,
  weekDays,
  weekLabel,
  weekdayHeading,
  weekWindow,
  type CalendarEvent,
} from './calendar-data';
import { windowForEvents } from './calendar-grid';
import { TimeGrid, targetFor, type GridColumn } from './calendar-timegrid';
import { RowOpenHint } from '../../components/row-open-hint';

type View = 'week' | 'day';

/** Column heading for a week day — the weekday over its date, today lit up. */
function WeekHeader({ date }: { date: Date }) {
  const { weekday, day } = weekdayHeading(date);
  const today = isToday(date);
  return (
    <span className="flex flex-col items-center leading-tight">
      <span className="text-xs">{weekday}</span>
      <span className={`text-sm tabular-nums ${today ? 'font-bold' : 'font-medium'}`}>{day}</span>
    </span>
  );
}

/** The week's seven day columns, each carrying the bookings that START on it. */
function weekColumns(anchor: Date, events: CalendarEvent[]): GridColumn[] {
  return weekDays(anchor).map((date) => ({
    key: date.toISOString(),
    header: <WeekHeader date={date} />,
    today: isToday(date),
    events: events.filter((event) => isSameDay(new Date(event.startAt), date)),
  }));
}

/**
 * The day's columns — one per resource, plus an "Unassigned" column for anything
 * not yet given to anyone. When a single resource is chosen the server already
 * narrowed the read, so it is one column; when the business has no resources set
 * up at all, the whole day is a single track.
 */
function dayColumns(
  events: CalendarEvent[],
  resources: { id: string; name: string }[],
  chosenResourceId: string
): GridColumn[] {
  if (chosenResourceId) {
    const name = resources.find((resource) => resource.id === chosenResourceId)?.name ?? 'Booked';
    return [{ key: chosenResourceId, header: headerText(name), events }];
  }
  if (resources.length === 0) {
    return [{ key: 'all', header: headerText('All bookings'), events }];
  }
  const columns: GridColumn[] = resources.map((resource) => ({
    key: resource.id,
    header: headerText(resource.name),
    events: events.filter((event) => event.resourceIds.includes(resource.id)),
  }));
  const unassigned = events.filter((event) => event.resourceIds.length === 0);
  if (unassigned.length > 0) {
    columns.push({ key: 'unassigned', header: headerText('Unassigned'), events: unassigned });
  }
  return columns;
}

function headerText(label: string) {
  return <span className="truncate text-sm font-semibold">{label}</span>;
}

export function CalendarSurface({ ctx }: { ctx: SurfaceContext }) {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [resourceId, setResourceId] = useState('');
  // The booking shown in the quick-look modal, or null when it is closed.
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const resources = useSchedulingResources();
  const activeResources = resources.data ?? [];

  const range = view === 'week' ? weekWindow(anchor) : dayWindow(anchor);
  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = useCalendarRange({
    ...range,
    ...(resourceId ? { resourceId } : {}),
  });

  const events = useMemo(() => data ?? [], [data]);
  const timeWindow = useMemo(() => windowForEvents(events), [events]);

  const columns = useMemo(
    () =>
      view === 'week'
        ? weekColumns(anchor, events)
        : dayColumns(events, resources.data ?? [], resourceId),
    [view, anchor, events, resources.data, resourceId]
  );

  const label = view === 'week' ? weekLabel(anchor) : dayLabel(anchor);
  const columnMinClass = view === 'week' ? 'min-w-[7rem]' : 'min-w-[12rem]';

  const step = (direction: 1 | -1) => {
    setAnchor((current) =>
      view === 'week' ? addWeeks(current, direction) : addDays(current, direction)
    );
  };

  const openBooking = (event: CalendarEvent, modifiers: { shiftKey: boolean; altKey: boolean }) => {
    // The escape hatch: shift/alt jumps straight to the full booking PANE beside
    // the diary or in its own window. A plain click opens the quick-look modal,
    // which keeps the calendar in view behind it.
    if (modifiers.shiftKey || modifiers.altKey) {
      ctx.open('scheduling.bookings.detail', { id: event.id }, { target: targetFor(modifiers) });
      return;
    }
    setSelectedBookingId(event.id);
  };

  const body = () => {
    if (isError) {
      return (
        <EmptyState
          icon={<CalendarOff className="size-6" aria-hidden />}
          title="Could not load your diary"
          description="This is a problem reaching the server. Nothing in your diary has changed — the bookings just could not be read just now."
          actions={
            <Button
              size="sm"
              color="module"
              variant="soft"
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

    if (isLoading && events.length === 0) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading your diary…
        </p>
      );
    }

    return (
      <div className="relative h-full">
        <TimeGrid
          columns={columns}
          window={timeWindow}
          columnMinClass={columnMinClass}
          onOpenEvent={openBooking}
        />
        {events.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center pt-24">
            <div className="bg-base-100 border-base-200 max-w-sm rounded-lg border px-4 py-3 text-center">
              <Text className="font-medium">
                {view === 'week' ? 'Nothing booked this week' : 'Nothing booked this day'}
              </Text>
              <Text className="text-sm">
                {resourceId
                  ? 'This person or resource has an open diary here. Try a different week, or clear the filter.'
                  : 'An open diary. New bookings appear here as soon as they are made.'}
              </Text>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Calendar controls"
        status={<Text className="hidden min-w-0 truncate font-medium @sm:block">{label}</Text>}
        controls={
          <>
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              onClick={() => {
                setAnchor(new Date());
              }}
            >
              Today
            </Button>
            <Join>
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                shape="square"
                aria-label={view === 'week' ? 'Previous week' : 'Previous day'}
                onClick={() => {
                  step(-1);
                }}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                shape="square"
                aria-label={view === 'week' ? 'Next week' : 'Next day'}
                onClick={() => {
                  step(1);
                }}
              >
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </Join>
            {/* The "where am I in time" anchor. In the day view especially — whose
            columns are resource names, not dates — this is the only thing naming
            the day. Truncates rather than wraps the bar. */}
            <ToggleGroup
              size="sm"
              color="module"
              className="ml-auto shrink-0"
              value={[view]}
              onValueChange={(next: unknown[]) => {
                const picked = next.at(-1);
                if (picked === 'week' || picked === 'day') setView(picked);
              }}
            >
              <ToggleGroupItem value="day">Day</ToggleGroupItem>
              <ToggleGroupItem value="week">Week</ToggleGroupItem>
            </ToggleGroup>
            {/* People & equipment as a picker, not chips: a business can have twenty,
            and twenty chips is a bar taller than the grid. */}
            <NativeSelect
              size="sm"
              className="hidden max-w-40 shrink @md:block"
              aria-label="Show the diary for"
              value={resourceId}
              disabled={activeResources.length === 0}
              onChange={(domEvent) => {
                setResourceId(domEvent.target.value);
              }}
            >
              <option value="">Everyone &amp; equipment</option>
              {activeResources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </NativeSelect>
            <Tooltip content="Linked outside calendars" align="end">
              <Button
                size="sm"
                variant="ghost"
                color="neutral"
                shape="square"
                aria-label="Linked outside calendars"
                onClick={() => {
                  ctx.open('scheduling.calendar.connections', {}, { target: 'beside' });
                }}
              >
                <Link2 className="size-4" aria-hidden />
              </Button>
            </Tooltip>
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

      {/* One recessed card holding the whole grid. Capped nowhere on purpose: the
          diary earns the full width it is given — more of the day and more
          columns, not a paragraph pinned to the left. */}
      <div className="bg-base-100 min-h-0 flex-1 overflow-hidden rounded-lg">{body()}</div>

      {events.length > 0 ? <RowOpenHint what="a booking to open it" /> : null}

      {/* The quick-look modal floats over the diary — the grid above stays mounted
          and live behind it, so a booking is opened without losing the week. */}
      <CalendarBookingModal
        bookingId={selectedBookingId}
        open={selectedBookingId !== null}
        onOpenChange={(next) => {
          if (!next) setSelectedBookingId(null);
        }}
        ctx={ctx}
      />
    </div>
  );
}

export default CalendarSurface;
