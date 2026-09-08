'use client';

// PEOPLE — the roster (docs/149 §5).
//
// The list has two jobs beyond naming everyone, and both are the reason it is a
// screen rather than a settings page:
//
//   1. WHO IS ON THE CLOCK RIGHT NOW. The one fact here that changes without
//      anyone on this screen doing anything, so it polls and it leads.
//   2. WHOSE TICKET HAS RUN OUT. A lapsed licence is a van that cannot leave the
//      yard, and the roster is where somebody looks before assigning the day's
//      work — so the warning belongs on the row, not two clicks away.
//
// Everything else — pay, documents, the timesheet — lives on the person's own
// pane. A roster that showed wages would be a roster nobody could leave open on
// a shared screen.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  Heading,
  SearchInput,
  Table,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { AlertTriangle, Clock, Plus, UserPlus, Users } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterPaneChange } from '../../lib/defer';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  staffErrorMessage,
  useClock,
  useOpenClocks,
  useStaffMembers,
  type StaffMember,
} from './data';
import { employmentLabel, formatMinutes, formatTime, staffState } from './format';
import { RowOpenHint } from '../../components/row-open-hint';

const STATUS_FILTERS = [
  { value: 'active', label: 'Working' },
  { value: 'onboarding', label: 'Starting' },
  { value: 'former', label: 'Left' },
  { value: 'all', label: 'Everyone' },
] as const;

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** How long the running clock has been running. Recomputed on each render of a
 *  60-second poll rather than ticking every second — a shift is read in minutes,
 *  and a per-second timer would re-render the whole roster sixty times a minute
 *  to move a number nobody is watching that closely. */
function runningMinutes(startedAt: string | null, now: number): number {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000));
}

function PersonRow({
  person,
  onTheClockSince,
  onOpen,
  onClockOut,
  clockingOut,
}: {
  person: StaffMember;
  onTheClockSince: string | null;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
  onClockOut: () => void;
  clockingOut: boolean;
}) {
  const state = staffState(person.status);
  const certs = person.certificationSummary;
  const now = Date.now();

  return (
    <tr
      className="cursor-pointer"
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(event);
      }}
    >
      <td className="max-w-56 min-w-0">
        <div className="truncate font-medium">{person.name}</div>
        {person.jobTitle ? <div className="truncate text-sm">{person.jobTitle}</div> : null}
      </td>
      <td>
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </td>
      <td>
        {onTheClockSince ? (
          // Solid, not soft: this is the one row state that means something is
          // happening right now, and it has to win against the soft badges.
          <Badge color="info" size="sm">
            <Clock className="size-3.5" aria-hidden />
            {formatMinutes(runningMinutes(onTheClockSince, now))}
          </Badge>
        ) : null}
      </td>
      <td>
        {certs.expired > 0 ? (
          <Badge color="error" size="sm">
            <AlertTriangle className="size-3.5" aria-hidden />
            {certs.expired === 1 ? '1 expired' : `${String(certs.expired)} expired`}
          </Badge>
        ) : certs.expiring > 0 ? (
          <Badge color="warning" variant="soft" size="sm">
            {certs.expiring === 1 ? '1 expiring' : `${String(certs.expiring)} expiring`}
          </Badge>
        ) : null}
      </td>
      <td className="hidden text-sm @lg:table-cell">{employmentLabel(person.employmentType)}</td>
      <td className="hidden text-sm @2xl:table-cell">{person.email ?? '—'}</td>
      <td className="text-right">
        {onTheClockSince ? (
          <Button
            size="sm"
            variant="outline"
            color="info"
            loading={clockingOut}
            onClick={(event) => {
              event.stopPropagation();
              onClockOut();
            }}
          >
            Clock out
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

export function PeopleSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const [status, setStatus] = useState<string>('active');
  const [search, setSearch] = useState('');
  const [clockingOutId, setClockingOutId] = useState<string | null>(null);

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useStaffMembers({
    ...(status === 'all' ? { includeArchived: true } : { status: status as never }),
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  const open = useOpenClocks();
  const { clockOut } = useClock();

  /** staffMemberId → when their running clock started. */
  const running = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const entry of open.data?.items ?? []) map.set(entry.staffMemberId, entry.startedAt);
    return map;
  }, [open.data?.items]);

  const people = data?.items ?? [];
  const onTheClock = people.filter((person) => running.has(person.id));
  const needsAttention = people.reduce(
    (sum, person) => sum + person.certificationSummary.expired,
    0
  );

  const doClockOut = (person: StaffMember) => {
    setClockingOutId(person.id);
    clockOut.mutate(
      { staffMemberId: person.id },
      {
        onSettled: () => {
          setClockingOutId(null);
        },
        onSuccess: (entry) => {
          afterPaneChange(() => {
            toast.add({
              title: `${person.name} clocked out`,
              description: `${formatMinutes(entry.minutes)} logged, waiting to be approved.`,
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not clock them out',
            description: staffErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Roster controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search the roster"
              placeholder="Find someone…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto"
            onClick={() => {
              ctx.open('staff.person', { id: 'new' });
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Add someone</span>
          </Button>
        }
        controls={
          <>
            <Filter
              color="module"
              value={status}
              onValueChange={(next) => {
                setStatus(typeof next === 'string' ? next : 'active');
              }}
              showReset={false}
              aria-label="Filter by who is here"
            >
              {STATUS_FILTERS.map((filter) => (
                <FilterItem key={filter.value} value={filter.value}>
                  {filter.label}
                </FilterItem>
              ))}
            </Filter>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
              void open.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            icon={<Users className="size-6" aria-hidden />}
            title="Could not load your team"
            description="The server could not be reached. Nobody's record is affected."
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
        ) : isPending || !data ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : people.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<UserPlus className="size-6" aria-hidden />}
              title={search.trim() ? 'Nobody matches that' : 'No one on the roster yet'}
              description={
                search.trim()
                  ? 'Try a different name, or switch the filter to Everyone.'
                  : 'Add the people who work for you and sparx can track their hours, what those hours cost, and when their tickets and licences run out.'
              }
              actions={
                search.trim() ? null : (
                  <Button
                    size="sm"
                    color="module"
                    onClick={() => {
                      ctx.open('staff.person', { id: 'new' });
                    }}
                  >
                    <Plus className="size-4" aria-hidden />
                    Add the first person
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            {onTheClock.length > 0 || needsAttention > 0 ? (
              <div className="grid gap-3 @2xl:grid-cols-2">
                {onTheClock.length > 0 ? (
                  <Card className="p-4">
                    <Text className="text-sm">On the clock right now</Text>
                    <Heading level={2} className="mt-1 text-3xl font-semibold tabular-nums">
                      {onTheClock.length}
                    </Heading>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {onTheClock.map((person) => (
                        <Badge key={person.id} color="info" variant="soft" size="sm">
                          {person.name}
                          {' · '}
                          {formatTime(running.get(person.id) ?? null)}
                        </Badge>
                      ))}
                    </div>
                  </Card>
                ) : null}

                {needsAttention > 0 ? (
                  <Card className="p-4">
                    <Text className="text-sm">Expired tickets and licences</Text>
                    <Heading level={2} className="mt-1 text-3xl font-semibold tabular-nums">
                      {needsAttention}
                    </Heading>
                    <Text className="mt-1 text-sm">
                      Somebody on this list is not currently qualified for work you may be about to
                      assign them.
                    </Text>
                    <Button
                      size="sm"
                      color="error"
                      className="mt-3 self-start"
                      onClick={() => {
                        ctx.open('staff.certifications', {});
                      }}
                    >
                      See what has run out
                    </Button>
                  </Card>
                ) : null}
              </div>
            ) : null}

            <Card className="overflow-hidden">
              <Table size="sm" hover>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Clock</th>
                    <th>Tickets</th>
                    <th className="hidden @lg:table-cell">Type</th>
                    <th className="hidden @2xl:table-cell">Email</th>
                    <th className="text-right" />
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => (
                    <PersonRow
                      key={person.id}
                      person={person}
                      onTheClockSince={
                        running.has(person.id) ? (running.get(person.id) ?? null) : null
                      }
                      clockingOut={clockingOutId === person.id}
                      onOpen={(event) => {
                        ctx.open('staff.person', { id: person.id }, { target: targetFor(event) });
                      }}
                      onClockOut={() => {
                        doClockOut(person);
                      }}
                    />
                  ))}
                </tbody>
              </Table>
            </Card>

            <RowOpenHint what="someone to open their record" />
          </div>
        )}
      </div>
    </div>
  );
}
