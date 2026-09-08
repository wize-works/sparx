'use client';

// The tasks list — the work the team owes customers and deals.
//
// A table, matching the other CRM lists: the task's title is the anchor, with its
// state, when it is due, and what it is about in their own columns. The two facts
// a queue is scanned for — is it done, and is it late — carry semantic color, so
// an overdue open task reads red without anyone hunting for it.

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
import { ListChecks, Plus } from 'lucide-react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import {
  isOverdue,
  taskStatusMeta,
  taskSubject,
  useTasks,
  type Task,
  type TaskStatus,
} from './tasks-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function TasksListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | TaskStatus>('open');

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useTasks({
    q: search,
    status: status === 'all' ? undefined : status,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const filtered = search.trim() !== '' || status !== 'open';

  const statusItems = useMemo(
    () => ({
      open: 'To do',
      completed: 'Done',
      cancelled: 'Cancelled',
      all: 'All tasks',
    }),
    []
  );

  const open = (task: Task, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('crm.task.detail', { id: task.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Task list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              color="module"
              size="sm"
              aria-label="Search tasks"
              placeholder="Search tasks…"
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
            title="New task — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('crm.task.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            New task
          </Button>
        }
        controls={
          <>
            <div className="hidden w-36 shrink-0 @lg:block">
              <Select
                color="module"
                size="sm"
                aria-label="Which tasks to show"
                value={status}
                items={statusItems}
                onValueChange={(next) => {
                  setStatus(next as 'all' | TaskStatus);
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
            icon={<ListChecks className="size-6" aria-hidden />}
            title="Could not load your tasks"
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
              icon: <ListChecks className="size-6" aria-hidden />,
              title: 'No tasks match those filters',
              description:
                'Try a different word, or change the filter — done and cancelled tasks are hidden unless you ask for them.',
            }}
            firstRun={{
              title: 'No tasks to do',
              description:
                'Tasks are the things you need to do for a customer or a deal. Add your first one to keep track of follow-ups.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Task</th>
                <th>Status</th>
                <th className="text-right">Due</th>
                <th className="hidden @lg:table-cell">For</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const overdue = isOverdue(row);
                const meta = taskStatusMeta(row.status, overdue);
                const subject = taskSubject(row);
                return (
                  <tr
                    key={row.id}
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
                    <td className="font-medium">{row.title}</td>
                    <td>
                      <Badge color={meta.tone} variant="soft" size="sm">
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="text-right">
                      {overdue ? (
                        <Badge color="danger" variant="soft" size="sm">
                          {shortDate(row.dueAt)}
                        </Badge>
                      ) : (
                        <span className="text-sm">{shortDate(row.dueAt)}</span>
                      )}
                    </td>
                    <td className="hidden text-sm @lg:table-cell">{subject ?? '—'}</td>
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
            {filtered ? `${rows.length.toLocaleString()} shown` : `${total.toLocaleString()} to do`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
