'use client';

// COUNT SCHEDULES — counting as a standing instruction, not something someone
// remembers.
//
// ── Why this screen exists ────────────────────────────────────────────────
//
// Counting has been possible since the beginning, and every count had to be
// created by hand. In practice that means it happens keenly for a fortnight and
// then stops — which is why so many businesses own software that can count and
// still cannot trust their numbers.
//
// A schedule is the difference. Set it once and the counts appear, already
// filled in with what to count, blind so the counter writes down what they SEE.
//
// ── Four states, four different problems ──────────────────────────────────
//
// Due now (waiting on tonight's run, or press the button) · waiting on the last
// count (a second count over the same shelves would produce two sets of expected
// figures for one lot of stock, so it is deliberately held) · paused · simply
// scheduled. They look similar and mean opposite things, so each wears its own
// color and its own words.
//
// It is a TABLE because every row carries several numbers you compare down a
// column — how often, how many at a time, when last, when next.

import { useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  NativeSelect,
  Table,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { CalendarClock, ClipboardCheck, Play, PlusCircle } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { plural, stockErrorMessage, useStockLocations } from './data';
import {
  abcLabel,
  abcTone,
  cadenceLabel,
  scheduleState,
  useCountSchedules,
  useRunCountSchedule,
  type CountSchedule,
} from './planning-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function CountSchedulesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [locationId, setLocationId] = useState('');

  const locations = useStockLocations();
  const activeLocations = (locations.data?.items ?? []).filter((location) => location.isActive);

  const schedules = useCountSchedules(locationId);
  const run = useRunCountSchedule();
  const toast = useToast();

  const rows = schedules.data?.items ?? [];
  const dueCount = rows.filter((r) => r.isActive && r.isDue && !r.lastCountOpen).length;

  const onRun = (schedule: CountSchedule) => {
    run.mutate(schedule.id, {
      onSuccess: (result) => {
        if (result.countsCreated === 0) {
          toast.add({
            title: 'Nothing to count',
            description:
              result.skippedOpen > 0
                ? 'The last count from this schedule is still open. Finish it first.'
                : 'No stock matched this schedule right now.',
            type: 'info',
          });
          return;
        }
        const created = result.counts[0];
        toast.add({
          title: `Count ${created?.number ?? ''} created`,
          description: `${plural(created?.lineCount ?? 0, 'item', 'items')} to check. Find it under Counts.`,
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not start that count',
          description: stockErrorMessage(error, 'Nothing was created. Please try again.'),
          type: 'error',
        });
      },
    });
  };

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.count-schedules.detail', { id }, { target: targetFor(event) });
  };

  const body = () => {
    if (schedules.isError) {
      return (
        <EmptyState
          icon={<ClipboardCheck className="size-6" aria-hidden />}
          title="Could not load your counting schedules"
          description="This is a problem reaching the server. Nothing has changed — the list just could not be read right now."
        />
      );
    }
    if (schedules.isLoading) {
      return (
        <p className="p-4 text-base" role="status">
          Loading your counting schedules…
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<CalendarClock className="size-6" aria-hidden />}
          title="No counting schedules yet"
          description="A schedule is what turns counting from something you mean to do into something that happens. The usual setup is three: your top-value stock every month, the middle every quarter, and the long tail once a year — between them they cover everything for a fraction of the effort of a full stocktake."
          actions={
            <Button
              color="module"
              onClick={() => {
                ctx.open('inventory.count-schedules.detail', { id: 'new' });
              }}
            >
              <PlusCircle className="size-4" aria-hidden />
              Set one up
            </Button>
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Schedule</th>
            <th className="hidden whitespace-nowrap @lg:table-cell">Covers</th>
            <th className="hidden whitespace-nowrap @xl:table-cell">How often</th>
            <th className="hidden text-right whitespace-nowrap @2xl:table-cell">Per run</th>
            <th className="whitespace-nowrap">Next</th>
            <th className="whitespace-nowrap">State</th>
            <th className="w-0" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const state = scheduleState(row);
            return (
              <tr
                key={row.id}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  open(row.id, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  open(row.id, event);
                }}
              >
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{row.name}</span>
                    <span className="truncate text-sm">
                      {row.warehouseName ?? row.warehouseCode}
                      {row.isBlind ? ' · blind count' : ' · shows the expected figure'}
                    </span>
                    <span className="truncate text-sm @xl:hidden">
                      {cadenceLabel(row.cadence, row.intervalDays)}
                    </span>
                  </span>
                </td>
                <td className="hidden whitespace-nowrap @lg:table-cell">
                  {row.abcClass ? (
                    <Badge color={abcTone(row.abcClass)} variant="soft" size="sm">
                      {abcLabel(row.abcClass)}
                    </Badge>
                  ) : (
                    <Text className="text-sm">Everything</Text>
                  )}
                  {row.zoneName ? <span className="block text-sm">{row.zoneName}</span> : null}
                </td>
                <td className="hidden whitespace-nowrap @xl:table-cell">
                  {cadenceLabel(row.cadence, row.intervalDays)}
                </td>
                <td className="hidden text-right tabular-nums @2xl:table-cell">
                  {row.maxItemsPerRun}
                </td>
                <td className="whitespace-nowrap">
                  <Timestamp value={row.nextRunAt} format="relative" />
                </td>
                <td className="whitespace-nowrap">
                  <Badge color={state.tone} variant="soft" size="sm">
                    {state.label}
                  </Badge>
                </td>
                <td
                  className="w-0"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    color="module"
                    disabled={!row.isActive || row.lastCountOpen}
                    loading={run.isPending}
                    aria-label={`Start a count from ${row.name} now`}
                    onClick={() => {
                      onRun(row);
                    }}
                  >
                    <Play className="size-4" aria-hidden />
                    Count now
                  </Button>
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
        label="Counting schedule controls"
        primary={
          <Button
            className="ml-auto"
            size="sm"
            color="module"
            onClick={() => {
              ctx.open('inventory.count-schedules.detail', { id: 'new' });
            }}
          >
            <PlusCircle className="size-4" aria-hidden />
            New schedule
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-48 shrink"
              aria-label="Show schedules for"
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value);
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
            isFetching={schedules.isFetching}
            updatedAt={schedules.data ? schedules.dataUpdatedAt : undefined}
            onRefresh={() => {
              void schedules.refetch();
            }}
          />
        }
      />

      {dueCount > 0 ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>{plural(dueCount, 'schedule is', 'schedules are')} due</AlertTitle>
            <AlertDescription>
              Tonight&rsquo;s run will create their counts. Press “Count now” on a row to do it
              immediately.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <Card className="min-h-0 flex-1 overflow-y-auto">{body()}</Card>
    </div>
  );
}
