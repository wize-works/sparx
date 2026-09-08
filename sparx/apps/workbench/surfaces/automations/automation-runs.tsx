'use client';

// The run history of one rule — every time it fired, and how it went.
//
// A standard list surface: a real <Table> with sortable column headers inside a
// Card. Sorting is client-side because `GET /:id/runs` returns the recent window
// in one response (newest first, bounded by `limit`) — there is no page 2 for a
// local sort to misrepresent. Filtering by result is server-side.
//
// This is the observability side of an automation: did it run, did every step
// finish, and if not, what stopped it? Open a row for the full step timeline and
// the policy audit. Reached from a rule's toolbar, so it always knows its rule.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Heading,
  Select,
  Table,
  Timestamp,
} from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, History, ListChecks, Target } from 'lucide-react';
import { RefreshButton } from '../../components/refresh-button';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { EnrollmentPanel } from './enrollment-panel';
import { runState } from './automations-presentation';
import { useAutomation, useAutomationRuns, type AutomationRunRow } from './automations-data';

type SortKey = 'started' | 'finished' | 'steps' | 'status';
type Dir = 'asc' | 'desc';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** Try to name the event that started a run, from its stored payload. */
function triggerSummary(triggerEvent: unknown): string | null {
  if (triggerEvent && typeof triggerEvent === 'object') {
    const t = (triggerEvent as { type?: unknown; eventType?: unknown }).type;
    const e = (triggerEvent as { type?: unknown; eventType?: unknown }).eventType;
    if (typeof t === 'string') return t;
    if (typeof e === 'string') return e;
  }
  return null;
}

export function AutomationRunsSurface({ ctx }: { ctx: SurfaceContext }) {
  const automationId = typeof ctx.params.automationId === 'string' ? ctx.params.automationId : '';
  // Results first — see the note by the toggle in the toolbar.
  const [view, setView] = useState<'results' | 'runs'>('results');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: 'started', dir: 'desc' });

  const { data: automation } = useAutomation(automationId);
  const {
    data: runs,
    isPending,
    isError,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useAutomationRuns(automationId, { status, limit: 100 });

  const filtering = status !== 'all';

  const rows = useMemo(() => {
    const all = runs ?? [];
    const dir = sort.dir === 'asc' ? 1 : -1;
    const at = (v: string | null) => (v ? new Date(v).getTime() : 0);
    return [...all].sort((a, b) => {
      switch (sort.key) {
        case 'started':
          return dir * (at(a.startedAt) - at(b.startedAt));
        case 'finished':
          return dir * (at(a.completedAt) - at(b.completedAt));
        case 'steps':
          return dir * (a.actionsTotal - b.actionsTotal);
        case 'status':
          return dir * a.status.localeCompare(b.status);
      }
    });
  }, [runs, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'status' ? 'asc' : 'desc' }
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

  const open = (run: AutomationRunRow, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('automations.run', { automationId, runId: run.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Run history controls"
        controls={
          <>
            <ListChecks className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              {automation ? `${automation.name} — runs` : 'Runs'}
            </Heading>
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Button
                size="sm"
                variant={view === 'results' ? 'soft' : 'ghost'}
                color={view === 'results' ? 'module' : 'neutral'}
                onClick={() => {
                  setView('results');
                }}
              >
                <Target className="size-4" aria-hidden />
                Results
              </Button>
              <Button
                size="sm"
                variant={view === 'runs' ? 'soft' : 'ghost'}
                color={view === 'runs' ? 'module' : 'neutral'}
                onClick={() => {
                  setView('runs');
                }}
              >
                <History className="size-4" aria-hidden />
                Every run
              </Button>
            </div>
            <div className={`w-40 shrink-0 ${view === 'runs' ? '' : 'hidden'}`}>
              <Select
                size="sm"
                color="module"
                aria-label="Filter by result"
                value={status}
                items={{
                  all: 'Any result',
                  completed: 'Finished',
                  failed: 'Failed',
                  running: 'Running',
                  waiting: 'Waiting',
                  skipped: 'Skipped',
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
            updatedAt={runs ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      {/* "Results" is the DEFAULT view, and that is the point of the pair: the
          run list says a hundred things happened; the funnel says whether any of
          it worked. Somebody who opens this surface is asking the second
          question, and the first is one click away when they need the detail. */}
      {view === 'results' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          <EnrollmentPanel automationId={automationId} />
        </div>
      ) : (
        <Card className="min-h-0 flex-1 overflow-y-auto">
          {isError ? (
            <EmptyState
              icon={<History className="size-6" aria-hidden />}
              title="Could not load these runs"
              description="Something went wrong reaching the server. Try again in a moment."
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
              Loading runs…
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<History className="size-6" aria-hidden />}
              title={filtering ? 'No runs match that' : 'No runs yet'}
              description={
                filtering
                  ? 'Try a different result, or switch the filter back to Any.'
                  : 'This rule has not fired yet. Once its trigger happens, every run shows up here with a step-by-step record.'
              }
            />
          ) : (
            <Table size="sm" hover>
              <thead>
                <tr>
                  {header('started', 'Started')}
                  <th className="hidden @xl:table-cell">Trigger</th>
                  {header('steps', 'Steps', 'hidden text-right @md:table-cell')}
                  {header('finished', 'Finished', 'hidden @lg:table-cell')}
                  {header('status', 'Result')}
                </tr>
              </thead>
              <tbody>
                {rows.map((run) => {
                  const state = runState(run.status);
                  const summary = triggerSummary(run.triggerEvent);
                  return (
                    <tr
                      key={run.id}
                      className="cursor-pointer"
                      tabIndex={0}
                      role="button"
                      onClick={(event) => {
                        open(run, event);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        open(run, event);
                      }}
                    >
                      <td className="text-sm">
                        <div className="flex items-center gap-1.5">
                          <Timestamp value={run.startedAt} format="relative" />
                          {run.automationVersion !== null ? (
                            <Badge color="neutral" variant="outline" size="sm">
                              v{run.automationVersion}
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="hidden max-w-64 truncate font-mono text-xs @xl:table-cell">
                        {summary ?? '—'}
                      </td>
                      <td className="hidden text-right tabular-nums @md:table-cell">
                        {run.actionsTotal}
                      </td>
                      <td className="hidden text-sm @lg:table-cell">
                        {run.completedAt ? (
                          <Timestamp value={run.completedAt} format="relative" />
                        ) : (
                          '—'
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
      )}

      {view === 'runs' ? (
        <p className="shrink-0 px-1 text-xs">Click a run to see every step and why each one ran.</p>
      ) : null}
    </div>
  );
}
