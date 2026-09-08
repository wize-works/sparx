'use client';

// The support queue (docs/144 §7).
//
// SORTED BY WHAT RUNS OUT FIRST, not by what arrived first. That is the whole
// difference between a queue somebody works and a list somebody scrolls: the
// row at the top is the one that will be late soonest, and the server orders it
// that way because "soonest" is business-hours arithmetic over a calendar with
// holidays in it.
//
// COLOR CARRIES THE TWO FACTS PEOPLE SCAN FOR (RULE #4) — how urgent it is, and
// whether it is about to be late. A row that has missed its promise is danger, a
// row running short is amber, and everything on track stays quiet so those two
// keep meaning something. Nothing else on the row is colored, for the same
// reason.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Select,
  Table,
} from '@wizeworks/silicaui-react';
import { LifeBuoy, Plus } from 'lucide-react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { SavedViewsMenu, viewFilterHas, viewFilterValue, viewFilters } from './saved-views-menu';
import type { SavedView } from './workspace-data';
import {
  priorityLabel,
  priorityTone,
  sourceLabel,
  ticketSignal,
  useTickets,
  type TicketPriority,
  type TicketView,
} from './tickets-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function requesterName(view: TicketView): string {
  const customer = view.ticket.customer;
  if (customer) {
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
    if (name) return name;
    if (customer.company?.trim()) return customer.company.trim();
    if (customer.email?.trim()) return customer.email.trim();
  }
  if (view.ticket.company) return view.ticket.company.name;
  return 'Someone not on file';
}

export function TicketsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'open' | 'mine' | 'unassigned' | 'late' | 'all'>('open');
  const [priority, setPriority] = useState<'all' | TicketPriority>('all');
  const [viewId, setViewId] = useState<string | null>(null);

  // "Which requests" is one dropdown but three separate facts, so it is saved as
  // three conditions on the fields the resolvers publish rather than as the name
  // of the option somebody picked. That is what lets the same view be handed to
  // a report — and it is why "Late" survives as a real question (no time left on
  // the promise) instead of a magic word only this screen understands.
  const currentFilters = viewFilters([
    search.trim() !== '' && { field: 'ticket.search', operator: 'contains', value: search.trim() },
    view !== 'all' && { field: 'ticket.isResolved', operator: 'eq', value: false },
    view === 'unassigned' && { field: 'ticket.isAssigned', operator: 'eq', value: false },
    view === 'late' && { field: 'ticket.minutesToResolve', operator: 'lt', value: 0 },
    priority !== 'all' && { field: 'ticket.priority', operator: 'eq', value: priority },
  ]);

  const applyView = (saved: SavedView | null): void => {
    setViewId(saved?.id ?? null);
    setSearch(viewFilterValue(saved, 'ticket.search'));
    setView(
      viewFilterHas(saved, 'ticket.isAssigned')
        ? 'unassigned'
        : viewFilterHas(saved, 'ticket.minutesToResolve')
          ? 'late'
          : viewFilterHas(saved, 'ticket.isResolved')
            ? 'open'
            : 'all'
    );
    const nextPriority = viewFilterValue(saved, 'ticket.priority');
    setPriority(nextPriority === '' ? 'all' : (nextPriority as TicketPriority));
  };

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useTickets({
    q: search,
    // "Late" and "unassigned" are still questions about OPEN requests — a
    // resolved one cannot be late any more, and nobody needs to pick it up.
    state: view === 'all' ? 'all' : 'open',
    ...(view === 'unassigned' ? { unassigned: true } : {}),
    ...(view === 'late' ? { breached: true } : {}),
    ...(priority === 'all' ? {} : { priority }),
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const filtered = search.trim() !== '' || view !== 'open' || priority !== 'all';

  const viewItems = useMemo(
    () => ({
      open: 'Still open',
      unassigned: 'Nobody has it',
      late: 'Late',
      all: 'Everything',
    }),
    []
  );

  const priorityItems = useMemo(
    () => ({
      all: 'Any urgency',
      urgent: 'Urgent',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    }),
    []
  );

  const open = (row: TicketView, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('crm.ticket.detail', { id: row.ticket.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Support queue controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              color="module"
              size="sm"
              aria-label="Search requests"
              placeholder="Search by subject or number…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            title="New request — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('crm.ticket.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            New request
          </Button>
        }
        controls={
          <>
            <div className="hidden w-40 shrink-0 @lg:block">
              <Select
                color="module"
                size="sm"
                aria-label="Which requests to show"
                value={view}
                items={viewItems}
                onValueChange={(next) => {
                  setView(next as 'open' | 'unassigned' | 'late' | 'all');
                }}
              />
            </div>
            <div className="hidden w-36 shrink-0 @2xl:block">
              <Select
                color="module"
                size="sm"
                aria-label="Filter by urgency"
                value={priority}
                items={priorityItems}
                onValueChange={(next) => {
                  setPriority(next as 'all' | TicketPriority);
                }}
              />
            </div>
            {/* No sort: this queue is ordered by what runs out first, which is
            business-hours arithmetic the server does. A saved view must not
            overwrite that with a column somebody happened to click. */}
            <SavedViewsMenu
              objectKey="ticket"
              current={currentFilters}
              baseline={viewFilters([{ field: 'ticket.isResolved', operator: 'eq', value: false }])}
              nameHint="Needs me today"
              selectedId={viewId}
              onApply={applyView}
            />
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
        {isError ? (
          <EmptyState
            icon={<LifeBuoy className="size-6" aria-hidden />}
            title="Could not load the support queue"
            description="Something went wrong reaching the server. It may be a temporary problem — try again in a moment."
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
        ) : isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={filtered}
            noResults={{
              icon: <LifeBuoy className="size-6" aria-hidden />,
              title: 'Nothing matches those filters',
              // The one empty state that is genuinely good news gets said as
              // good news — a support lead who filters to "Late" and sees
              // nothing should be told that means nothing is late.
              description:
                'If you were looking for late requests, this is the answer you want: everything is inside the time you promised.',
            }}
            firstRun={{
              title: 'No open requests',
              description:
                'Requests land here when a customer emails you, fills in a form, or starts a live chat — and you can add one by hand for anything that came in another way. Every one gets a reply time based on the hours you work.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th className="w-16 text-right">#</th>
                <th>Request</th>
                <th className="w-24">Urgency</th>
                <th className="w-32">Time left</th>
                <th className="hidden @lg:table-cell">Stage</th>
                <th className="hidden @2xl:table-cell">Owner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const signal = ticketSignal(row);
                return (
                  <tr
                    key={row.ticket.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(row, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(row, event);
                    }}
                  >
                    <td className="text-right text-sm tabular-nums">{row.ticket.number}</td>
                    <td>
                      <span className="font-medium">{row.ticket.subject}</span>
                      <span className="block text-sm">
                        {requesterName(row)} · {sourceLabel(row.ticket.source)}
                      </span>
                    </td>
                    <td>
                      <Badge color={priorityTone(row.ticket.priority)} variant="soft" size="sm">
                        {priorityLabel(row.ticket.priority)}
                      </Badge>
                    </td>
                    <td>
                      {signal ? (
                        <Badge color={signal.tone} variant="soft" size="sm" title={signal.detail}>
                          {signal.label}
                        </Badge>
                      ) : (
                        // Deliberately plain. A row with time in hand is the
                        // normal case, and badging it would drown the two rows
                        // that need somebody.
                        <span className="text-sm">On track</span>
                      )}
                    </td>
                    <td className="hidden text-sm @lg:table-cell">
                      {row.ticket.stage?.name ?? '—'}
                    </td>
                    <td className="hidden text-sm @2xl:table-cell">
                      {row.ticket.assignedTo?.name ?? row.ticket.assignedTo?.email ?? 'Nobody yet'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="flex shrink-0 items-center justify-between px-1">
        <RowOpenHint />
        {typeof total === 'number' && !isPending ? (
          <p className="text-xs">
            {filtered ? `${rows.length.toLocaleString()} shown` : `${total.toLocaleString()} open`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
