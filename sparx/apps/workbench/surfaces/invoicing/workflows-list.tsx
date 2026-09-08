'use client';

// Workflows — every path a document can take through the business.
//
// Same shape as the invoices list next door, deliberately: recessed pane,
// Toolbar card, table card. Two lists in one module that disagree about what a
// list looks like is worse than either choice on its own, and the table is the
// module's established one.
//
// The stage chain is the column that matters — "Service / Repair · 5 stages"
// says nothing an operator came here to learn, whereas Estimate › Approved ›
// Invoiced › Paid answers "which of these do I want" without opening anything.
// It is the widest thing here, so it discloses at @xl.
//
// Sorted and paged BY THE SERVER, like invoices. Nothing bounds how many
// workflows a tenant has: a single-brand shop has three, and a manufacturer
// running a different document flow per product line, region or dealer tier has
// hundreds. Sorting or filtering the loaded window in the browser would mean
// "sort these 25" while the header claims to have sorted everything — and would
// leave a filtered page showing 3 rows under a total that counted 25.
//
// Sorting is OFF until a header is clicked. The unsorted order is the tenant's
// own — default workflow first, then the order they arranged them in — which is
// the only ordering here that carries meaning rather than just being an order.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  SearchInput,
  Table,
} from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, GitBranch, Plus } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { stageTone, type DocumentWorkflowDetail } from './types';
import { useWorkflows, workflowErrorMessage, type WorkflowSortKey } from './workflow-data';
import { RowOpenHint } from '../../components/row-open-hint';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

type StateFilter = 'active' | 'archived' | 'all';

const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

/** The sequence as one string, for the row's tooltip. The Stages column is
 *  hidden below @xl, so on a narrow pane this is the only way to read the chain
 *  without opening the workflow. */
function chainText(workflow: DocumentWorkflowDetail): string {
  return workflow.stages.map((stage) => stage.customerLabel).join(' › ');
}

/** Null = the tenant's own arrangement, which is a real answer rather than the
 *  absence of one, so it is representable rather than defaulting to a column. */
type Sort = { key: WorkflowSortKey; dir: 'asc' | 'desc' } | null;

export function WorkflowsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [state, setState] = useState<StateFilter>('active');
  const [sort, setSort] = useState<Sort>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [take, setTake] = useState<number>(25);

  const needle = search.trim();
  const skip = (page - 1) * pageSize;

  const { data, isPending, isFetching, isError, error, dataUpdatedAt, refetch } = useWorkflows({
    q: needle || undefined,
    state,
    ...(sort ? { sortBy: sort.key, order: sort.dir } : {}),
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;

  /** Anything that changes which rows match has to return to the first window —
   *  staying on page 5 of a result set that now has two pages shows nothing. */
  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toggleSort = (key: WorkflowSortKey) => {
    setSort((current) =>
      current?.key === key
        ? current.dir === 'asc'
          ? { key, dir: 'desc' }
          : // Third click returns to the tenant's own arrangement rather than
            // cycling back to ascending. Their order is the one thing a sort
            // cannot reproduce, so there has to be a way back to it.
            null
        : // Text ascends. `stages` descends — "which of these is the
          // complicated one" is the question a step count gets asked.
          { key, dir: key === 'stages' ? 'desc' : 'asc' }
    );
    resetWindow();
  };

  const header = (key: WorkflowSortKey, label: string, extra = '') => (
    <th
      className={extra}
      aria-sort={sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="link link-hover inline-flex items-center gap-1"
        onClick={() => {
          toggleSort(key);
        }}
      >
        {label}
        {sort?.key === key ? (
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
    ctx.open('invoicing.workflow.edit', { id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Workflow list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search workflows"
              placeholder="Search workflows…"
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                resetWindow();
              }}
            />
          </div>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            title="New workflow — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('invoicing.workflow.edit', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">New workflow</span>
          </Button>
        }
        controls={
          <>
            <Filter
              color="module"
              value={state}
              onValueChange={(next) => {
                setState((next as StateFilter | null) ?? 'active');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter by state"
            >
              {STATE_FILTERS.map((filter) => (
                <FilterItem key={filter.value} value={filter.value}>
                  {filter.label}
                </FilterItem>
              ))}
            </Filter>
            {/* ALWAYS the last child of a list toolbar — see RefreshButton. Inside
            the Toolbar so it joins the roving arrow-key focus. */}
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
            icon={<GitBranch className="size-6" aria-hidden />}
            title="Could not load your workflows"
            description={workflowErrorMessage(
              error,
              'Something went wrong reaching the server. Your workflows are unaffected and your documents keep working.'
            )}
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
            Loading workflows…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<GitBranch className="size-6" aria-hidden />}
            title={
              needle || state !== 'active' ? 'Nothing matches those filters' : 'No workflows yet'
            }
            description={
              needle || state !== 'active'
                ? 'Try a different word, or switch back to Active.'
                : 'A workflow is the path a document takes — quote, then invoice, then paid — and what your customer sees at each step. Every business gets a couple to start with, so this being empty is unusual.'
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                {header('name', 'Name')}
                {/* The chain itself has no order to sort on — a sequence is not
                    a value — so this column carries no header button. */}
                <th className="hidden @xl:table-cell">Stages</th>
                {header('stages', 'Steps', 'hidden @2xl:table-cell text-right')}
                {header('state', 'State')}
              </tr>
            </thead>
            <tbody>
              {rows.map((workflow) => (
                <tr
                  key={workflow.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  title={chainText(workflow)}
                  onClick={(event) => {
                    open(workflow.id, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    open(workflow.id, event);
                  }}
                >
                  {/* A rich cell, not a bare string: the name is the row's
                      identity and the reference name is how it is addressed
                      everywhere else, so they belong together rather than in a
                      column that only appears on a wide pane. */}
                  <td>
                    <span className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{workflow.name}</span>
                        {/* Qualifies the name rather than reporting state — it
                            is which workflow gets picked when nobody picks. */}
                        {workflow.isDefault ? (
                          <Badge color="module" variant="soft" size="sm">
                            Default
                          </Badge>
                        ) : null}
                      </span>
                      <span className="font-mono text-sm">{workflow.slug}</span>
                    </span>
                  </td>
                  <td className="hidden max-w-96 @xl:table-cell">
                    {workflow.stages.length === 0 ? (
                      // Reachable: stages are deletable, and a workflow with
                      // none cannot carry a document at all.
                      <span className="text-sm">No stages — nothing can be created on it</span>
                    ) : (
                      // Wraps rather than clipping. The rows already stand two
                      // lines tall, so a long chain costs nothing to show in
                      // full — and a half-visible sequence is the one thing this
                      // column exists to prevent.
                      <span className="flex flex-wrap items-center gap-x-1 gap-y-1">
                        {workflow.stages.map((stage, index) => (
                          <span key={stage.id} className="flex items-center gap-1">
                            {index > 0 ? <span aria-hidden>›</span> : null}
                            <Badge color={stageTone(stage.stageType)} variant="soft" size="sm">
                              {stage.customerLabel}
                            </Badge>
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="hidden text-right tabular-nums @2xl:table-cell">
                    {workflow.stages.length}
                  </td>
                  <td>
                    <Badge
                      color={workflow.archivedAt ? 'neutral' : 'success'}
                      variant="soft"
                      size="sm"
                    >
                      {workflow.archivedAt ? 'Archived' : 'Active'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Sits on the pane, not in a card — it describes the table rather than
          being part of it, which is exactly what the recessed surface says. */}
      <div className="shrink-0">
        <ListPagination
          shown={rows.length}
          firstRow={rows.length === 0 ? 0 : skip + 1}
          total={total}
          page={page}
          pageSize={pageSize}
          canLoadMore={take < MAX_TAKE}
          busy={isFetching}
          onLoadMore={() => {
            setTake((current) => Math.min(current + pageSize, MAX_TAKE));
          }}
          onPageChange={(next) => {
            setPage(next);
            // A jump REPLACES the window, so any growth from "load more"
            // belongs to the window you just left, not the one you land on.
            setTake(pageSize);
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setTake(size);
          }}
        />
        {/* The open gestures, and only where there is a pointer to do them
            with — on the stack these three modifiers do not exist. */}
        <RowOpenHint />
      </div>
    </div>
  );
}
