'use client';

// PLACES — the premises a business serves customers from: the shop, the clinic,
// the studio, the yard. Every person, service and booking is filed against one.
//
// A table, like every other list. A place is its name and where it is, plus what
// is filed there — the count is the useful column, because it is what tells you
// whether a place is really in use before you switch it off.
//
// Most businesses have exactly one, so this list is usually a single row. That is
// fine: the row is where they name it and set its address and time zone, which
// until now nothing in the product let them do.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Table,
  ToggleGroup,
  ToggleGroupItem,
} from '@wizeworks/silicaui-react';
import { EyeOff, MapPin, Plus } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatAddress, useLocations, type BusinessLocation } from './setup-data';
import { RowOpenHint } from '../../components/row-open-hint';

const DETAIL_KEY = 'scheduling.locations.detail';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** What is filed here, in the owner's words. Bookings lead because they are the
 *  reason a place cannot simply be deleted. */
function filedNote(location: BusinessLocation): string {
  const parts: string[] = [];
  const { resources, services, bookings } = location.counts;
  if (resources > 0)
    parts.push(`${String(resources)} ${resources === 1 ? 'person or thing' : 'people & things'}`);
  if (services > 0) parts.push(`${String(services)} ${services === 1 ? 'service' : 'services'}`);
  if (bookings > 0) parts.push(`${String(bookings)} ${bookings === 1 ? 'booking' : 'bookings'}`);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing filed here yet';
}

export function LocationsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [activeOnly, setActiveOnly] = useState(false);
  const { data, isPending, isFetching, dataUpdatedAt, isError, refetch } = useLocations(activeOnly);

  const rows = data?.items ?? [];

  const openNew = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(DETAIL_KEY, { id: 'new' }, { target: targetFor(event) });
  };

  const open = (location: BusinessLocation, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(DETAIL_KEY, { id: location.id }, { target: targetFor(event) });
  };

  const body = () => {
    if (isError) {
      return (
        <EmptyState
          icon={<MapPin className="size-6" aria-hidden />}
          title="Could not load your places"
          description="This is a problem reaching the server. Nothing is affected — the list just could not be read just now."
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
          Loading…
        </p>
      );
    }

    if (rows.length === 0) {
      return (
        <ListEmptyState
          filtered={activeOnly}
          noResults={{
            icon: <MapPin className="size-6" aria-hidden />,
            title: 'Nothing matches that',
            description: 'You are only seeing places that are switched on.',
          }}
          firstRun={{
            title: 'No places yet',
            description:
              'Add the premises you serve customers from — your shop, your clinic, your studio. Your people, your services and your bookings are each filed against one.',
            actions: (
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  openNew({ shiftKey: false, altKey: false });
                }}
              >
                <Plus className="size-4" aria-hidden />
                Add a place
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
            <th>Name</th>
            <th className="hidden whitespace-nowrap @xl:table-cell">Filed here</th>
            <th className="hidden whitespace-nowrap @lg:table-cell">Time zone</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((location) => {
            const address = formatAddress(location.address);
            const filed = filedNote(location);
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
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{location.name}</span>
                    {/* The address is only ever shown here, so it always shows. The
                        "filed here" line is a NARROW-SCREEN STAND-IN for its own
                        column — without the hide it printed the same sentence twice
                        on one row once the column appeared. */}
                    {address === '' ? (
                      <span className="truncate text-sm @xl:hidden">{filed}</span>
                    ) : (
                      <span className="truncate text-sm">{address}</span>
                    )}
                  </span>
                </td>
                <td className="hidden whitespace-nowrap @xl:table-cell">{filed}</td>
                <td className="hidden whitespace-nowrap @lg:table-cell">{location.timezone}</td>
                <td>
                  <Badge color={location.isActive ? 'success' : 'neutral'} variant="soft" size="sm">
                    {location.isActive ? 'In use' : 'Off'}
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
        label="Places list controls"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0 whitespace-nowrap"
            title="Add a place — hold Shift to open alongside, Alt for a new window"
            onClick={openNew}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Add a place</span>
          </Button>
        }
        controls={
          <>
            <ToggleGroup
              size="sm"
              color="module"
              className="shrink-0"
              value={activeOnly ? ['active'] : []}
              onValueChange={(next: unknown[]) => {
                setActiveOnly(next.includes('active'));
              }}
            >
              <ToggleGroupItem
                value="active"
                aria-label="Hide switched-off ones"
                title="Hide switched-off ones"
              >
                <EyeOff className="size-4" aria-hidden />
                <span className="hidden @2xl:inline">In use only</span>
              </ToggleGroupItem>
            </ToggleGroup>
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

      <Card className="mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto">{body()}</Card>

      {rows.length > 0 ? <RowOpenHint /> : null}
    </div>
  );
}
