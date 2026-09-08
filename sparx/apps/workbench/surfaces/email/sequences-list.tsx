'use client';

// The email-sequences table — the multi-touch journeys that follow up with
// people for you, one email at a time, on their own clock. A standard list
// surface: a real <Table> inside a Card scroll container, matching every other
// list in the app.
//
// Filtering by status is server-side; search is local (the whole in-scope set
// comes back in one call, so there is no page 2 for a local search to be wrong
// about). Columns disclose progressively with @container, never a viewport query
// — a narrow pane on a wide monitor must not show six columns in 300px.

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
import { Plus, Route } from 'lucide-react';
import { RefreshButton } from '../../components/refresh-button';
import { ListEmptyState } from '../../components/list-empty-state';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { useSites } from '../../lib/api/shell-data';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { sequenceState, useSequences, type SequenceRow } from './sequences-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function SequencesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useSequences({ status });
  const { data: sites } = useSites();

  const siteName = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of sites ?? []) map.set(site.id, site.name);
    return (propertyId: string | null) =>
      propertyId ? (map.get(propertyId) ?? 'One business') : 'Every business';
  }, [sites]);

  const needle = search.trim().toLowerCase();

  const rows = useMemo(() => {
    const all = data ?? [];
    const filtered = needle
      ? all.filter(
          (s) =>
            s.name.toLowerCase().includes(needle) ||
            (s.description ?? '').toLowerCase().includes(needle)
        )
      : all;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [data, needle]);

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('email.sequences.detail', { id }, { target: targetFor(event) });
  };

  const filtering = status !== 'all' || needle !== '';

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Email sequences list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search sequences"
              placeholder="Search sequences…"
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
            title="New sequence — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('email.sequences.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">New sequence</span>
          </Button>
        }
        controls={
          <>
            <div className="hidden w-40 shrink-0 @md:block">
              <Select
                size="sm"
                aria-label="Filter by status"
                value={status}
                items={{
                  all: 'Any status',
                  active: 'On',
                  draft: 'Draft',
                  archived: 'Stopped',
                }}
                onValueChange={(next) => {
                  setStatus((next as string) || 'all');
                }}
              />
            </div>
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
            icon={<Route className="size-6" aria-hidden />}
            title="Could not load your sequences"
            description="Something went wrong reaching the server. Anyone already in a sequence is unaffected — try again in a moment."
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
            Loading sequences…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={filtering}
            noResults={{
              icon: <Route className="size-6" aria-hidden />,
              title: 'No sequences match those filters',
              description: 'Try a different search, or switch the status filter back to Any.',
            }}
            firstRun={{
              title: 'No sequences yet',
              description:
                'A sequence follows up with someone over time — a welcome today, a nudge in two days, an offer in a week — sending each email on its own schedule. Create your first to get started.',
              actions: (
                <Button
                  size="sm"
                  color="module"
                  onClick={(event) => {
                    ctx.open('email.sequences.detail', { id: 'new' }, { target: targetFor(event) });
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  New sequence
                </Button>
              ),
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Name</th>
                <th className="hidden text-right @md:table-cell">Emails</th>
                <th className="hidden text-right @lg:table-cell">In progress</th>
                <th className="hidden text-right @xl:table-cell">Enrolled</th>
                <th className="hidden @2xl:table-cell">For</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((sequence: SequenceRow) => {
                const state = sequenceState(sequence.status);
                return (
                  <tr
                    key={sequence.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(sequence.id, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(sequence.id, event);
                    }}
                  >
                    <td className="max-w-72">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{sequence.name}</span>
                        {sequence.description ? (
                          <span className="truncate text-sm">{sequence.description}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="hidden text-right tabular-nums @md:table-cell">
                      {sequence.steps.length}
                    </td>
                    <td className="hidden text-right tabular-nums @lg:table-cell">
                      {sequence.counts.active}
                    </td>
                    <td className="hidden text-right tabular-nums @xl:table-cell">
                      {sequence.counts.total}
                    </td>
                    <td className="hidden max-w-40 truncate text-sm @2xl:table-cell">
                      {siteName(sequence.propertyId)}
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
        )}
      </Card>

      <RowOpenHint what="a sequence to open it" />
    </div>
  );
}
