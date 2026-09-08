'use client';

// The automations table — the rules that run your business while you are not
// looking. A standard list surface: a real <Table> with sortable column headers,
// inside a Card scroll container, matching every other list in the app.
//
// Sorting is CLIENT-side here, and that is correct rather than lazy: unlike the
// paged supplier/order lists, `GET /v1/automations` returns the whole (bounded)
// set in one go — there is no page 2 for a client sort to give a wrong answer
// about. Filtering by status / origin is server-side; search and sort are local.
//
// Columns disclose progressively with @container, never a viewport query: a
// narrow pane on a wide monitor must not show six columns in 300px.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Select,
  Table,
  Timestamp,
} from '@wizeworks/silicaui-react';
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Workflow } from 'lucide-react';
import { RefreshButton } from '../../components/refresh-button';
import { ListEmptyState } from '../../components/list-empty-state';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  automationState,
  ModuleTags,
  parseActions,
  summarizeTrigger,
  TierBadge,
} from './automations-presentation';
import { useAutomations, type Automation } from './automations-data';
import { RowOpenHint } from '../../components/row-open-hint';

type SortKey = 'name' | 'trigger' | 'runs' | 'lastRun' | 'status';
type Dir = 'asc' | 'desc';

const STATUS_RANK: Record<string, number> = { error: 0, active: 1, paused: 2, draft: 3 };

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function AutomationsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [status, setStatus] = useState('all');
  const [origin, setOrigin] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: 'lastRun', dir: 'desc' });

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useAutomations({
    status,
    origin,
  });

  const needle = search.trim().toLowerCase();

  const rows = useMemo(() => {
    const all = data ?? [];
    const filtered = needle
      ? all.filter(
          (a) =>
            a.name.toLowerCase().includes(needle) ||
            (a.description ?? '').toLowerCase().includes(needle)
        )
      : all;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const runAt = (a: Automation) => (a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0);
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'trigger':
          return (
            dir *
            summarizeTrigger(a.triggerType, a.triggerConfig).localeCompare(
              summarizeTrigger(b.triggerType, b.triggerConfig)
            )
          );
        case 'runs':
          return dir * (a.runCount - b.runCount);
        case 'lastRun':
          return dir * (runAt(a) - runAt(b));
        case 'status':
          return dir * ((STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9));
      }
    });
  }, [data, needle, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : // Text ascends; counts and recency descend (busiest / newest first).
          { key, dir: key === 'name' || key === 'trigger' ? 'asc' : 'desc' }
    );
  };

  const header = (key: SortKey, label: string, extra = '') => (
    <th
      className={extra}
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="link link-hover inline-flex items-center gap-1"
        onClick={() => {
          toggleSort(key);
        }}
      >
        {label}
        {sort.key === key ? (
          sort.dir === 'asc' ? (
            <ArrowUp className="size-3" aria-hidden />
          ) : (
            <ArrowDown className="size-3" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('automations.detail', { id }, { target: targetFor(event) });
  };

  const filtering = status !== 'all' || origin !== 'all' || needle !== '';

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Automations list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search automations"
              placeholder="Search automations…"
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
            title="New automation — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('automations.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">New automation</span>
          </Button>
        }
        controls={
          <>
            <div className="hidden w-36 shrink-0 @md:block">
              <Select
                size="sm"
                aria-label="Filter by status"
                value={status}
                items={{
                  all: 'Any status',
                  active: 'On',
                  paused: 'Paused',
                  draft: 'Draft',
                  error: 'Needs attention',
                }}
                onValueChange={(next) => {
                  setStatus((next as string) || 'all');
                }}
              />
            </div>
            <div className="hidden w-36 shrink-0 @2xl:block">
              <Select
                size="sm"
                aria-label="Filter by who made it"
                value={origin}
                items={{ all: 'Anyone', user: 'Made by you', system: 'Set up by sparx' }}
                onValueChange={(next) => {
                  setOrigin((next as string) || 'all');
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
            icon={<Workflow className="size-6" aria-hidden />}
            title="Could not load your automations"
            description="Something went wrong reaching the server. Your rules are unaffected and still running — try again in a moment."
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
            Loading automations…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={filtering}
            noResults={{
              icon: <Workflow className="size-6" aria-hidden />,
              title: 'No automations match those filters',
              description: 'Try a different search, or switch the filters back to Any.',
            }}
            firstRun={{
              title: 'No automations yet',
              description:
                'Automations run jobs for you — email a customer when they order, chase an overdue invoice, tag a big spender. Create your first to get started.',
              actions: (
                <Button
                  size="sm"
                  color="module"
                  onClick={(event) => {
                    ctx.open('automations.detail', { id: 'new' }, { target: targetFor(event) });
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  New automation
                </Button>
              ),
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                {header('name', 'Name')}
                {header('trigger', 'When it runs', 'hidden @lg:table-cell')}
                <th className="hidden @2xl:table-cell">Touches</th>
                {header('runs', 'Runs', 'hidden text-right @md:table-cell')}
                {header('lastRun', 'Last run', 'hidden @xl:table-cell')}
                {header('status', 'Status')}
              </tr>
            </thead>
            <tbody>
              {rows.map((automation) => {
                const state = automationState(automation.status);
                const actions = parseActions(automation.actions);
                return (
                  <tr
                    key={automation.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(automation.id, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(automation.id, event);
                    }}
                  >
                    <td className="max-w-64">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate font-medium">{automation.name}</span>
                        {automation.draft !== null ? (
                          <Badge color="info" variant="soft" size="sm">
                            Draft edits
                          </Badge>
                        ) : null}
                        <TierBadge origin={automation.origin} locked={automation.locked} />
                      </div>
                    </td>
                    <td className="hidden max-w-64 truncate text-sm @lg:table-cell">
                      {summarizeTrigger(automation.triggerType, automation.triggerConfig)}
                    </td>
                    <td className="hidden @2xl:table-cell">
                      <ModuleTags
                        trigger={{
                          triggerType: automation.triggerType,
                          triggerConfig: automation.triggerConfig,
                        }}
                        actions={actions}
                      />
                    </td>
                    <td className="hidden text-right tabular-nums @md:table-cell">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {automation.errorCount > 0 ? (
                          <span
                            className="text-error inline-flex items-center gap-0.5"
                            title={`${String(automation.errorCount)} failed`}
                          >
                            <AlertTriangle className="size-3.5" aria-hidden />
                            {automation.errorCount}
                          </span>
                        ) : null}
                        {automation.runCount}
                      </div>
                    </td>
                    <td className="hidden text-sm @xl:table-cell">
                      {automation.lastRunAt ? (
                        <Timestamp value={automation.lastRunAt} format="relative" />
                      ) : (
                        'Not run yet'
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
        )}
      </Card>

      <RowOpenHint what="a rule to open it" />
    </div>
  );
}
