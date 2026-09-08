'use client';

// Questions & answers — the scalable moderation TABLE.
//
// The primary list surface for Q&A: a real <Table> with a status filter, search,
// server-side sortable headers and server-side paging — the shape that survives
// hundreds of questions a day, where the one-at-a-time card queue does not.
//
// Two ways into the card queue from here, and that split is the point:
//   • "Work the queue" opens the backlog at the top, for a heads-down session;
//   • clicking a ROW opens the queue focused on THAT question.
// The table is for triage, scan and bulk decisions; the queue is for reading one
// question in full and answering it. Same two verbs either way — show or hide.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Filter,
  FilterItem,
  SearchInput,
  Table,
  Timestamp,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, Check, EyeOff, HelpCircle, ListChecks } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { productErrorMessage, questionState } from './products-data';
import {
  customerLabel,
  useBulkModerateQuestions,
  useModerateQueueQuestion,
  useQuestionsList,
  type ModerationSortDir,
  type QuestionSort,
} from './moderation-data';
import { RowOpenHint } from '../../components/row-open-hint';

/** Plain-language filter over the stored statuses. Default is "Waiting" — the
 *  queue's whole job is the backlog, so that is what opens. */
const STATUS_FILTERS = [
  { value: 'pending', label: 'Waiting' },
  { value: 'published', label: 'Shown' },
  { value: 'rejected', label: 'Hidden' },
  { value: 'all', label: 'All' },
] as const;

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** Trims a question to a single readable line for the table cell. */
function preview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat;
}

export function QaListSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const moderate = useModerateQueueQuestion();
  const bulkModerate = useBulkModerateQuestions();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('pending');
  const [sort, setSort] = useState<{ key: QuestionSort; dir: ModerationSortDir }>({
    key: 'createdAt',
    dir: 'desc',
  });

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);
  const skip = (page - 1) * pageSize;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The row whose quick-action is in flight, so its buttons alone read as busy
  // rather than every row's (the moderate mutation is shared across the table).
  const [actingId, setActingId] = useState<string | null>(null);

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useQuestionsList({
    q: search,
    status,
    sortBy: sort.key,
    order: sort.dir,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const anyFilter = search.trim() !== '' || status !== 'all';

  const selectedIds = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  const clearSelection = () => {
    setSelected(new Set());
  };

  /** Anything that changes WHICH rows match returns to the first window and drops
   *  the selection — acting on rows you can no longer see is the worse mistake. */
  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
    clearSelection();
  };

  const toggleSort = (key: QuestionSort) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'createdAt' ? 'desc' : 'asc' }
    );
    resetWindow();
  };

  const toggleSelect = (id: string, next: boolean) => {
    setSelected((current) => {
      const copy = new Set(current);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  };

  const openQueue = (event: { shiftKey: boolean; altKey: boolean }, focusId?: string) => {
    ctx.open('commerce.qa.queue', focusId ? { focusId } : {}, { target: targetFor(event) });
  };

  const setStatusFor = (id: string, next: 'published' | 'rejected', done: string) => {
    setActingId(id);
    moderate.mutate(
      { id, status: next },
      {
        onSuccess: () => {
          toast.add({ title: done, type: 'success' });
        },
        onError: (err) => {
          toast.add({
            title: 'Could not change that question',
            description: productErrorMessage(err, 'Nothing was changed.'),
            type: 'error',
          });
        },
        onSettled: () => {
          setActingId(null);
        },
      }
    );
  };

  const bulkSetStatus = (next: 'published' | 'rejected', done: string) => {
    bulkModerate.mutate(
      { questionIds: selectedIds, status: next },
      {
        onSuccess: (result) => {
          clearSelection();
          toast.add({ title: `${done} (${String(result.count)})`, type: 'success' });
        },
        onError: (err) => {
          toast.add({
            title: 'Could not update those questions',
            description: productErrorMessage(err, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const header = (key: QuestionSort, label: string, extra = '') => (
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

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Questions list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search questions"
              placeholder="Search questions…"
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
            variant="soft"
            size="sm"
            className="ml-auto"
            title="Work the queue — read and answer questions one at a time. Hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              openQueue(event);
            }}
          >
            <ListChecks className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Work the queue</span>
          </Button>
        }
        controls={
          <>
            <Filter
              color="module"
              value={status}
              onValueChange={(next) => {
                setStatus(next ?? 'pending');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter by status"
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
            }}
          />
        }
      />

      {selectedIds.length > 0 ? (
        <div className="bg-base-100 border-base-300 flex flex-wrap items-center gap-2 rounded-lg border p-2">
          <span className="px-1 text-sm font-medium">
            {selectedIds.length === 1 ? '1 selected' : `${String(selectedIds.length)} selected`}
          </span>
          <Button
            size="sm"
            color="module"
            loading={bulkModerate.isPending}
            onClick={() => {
              bulkSetStatus('published', 'Shown');
            }}
          >
            <Check className="size-4" aria-hidden />
            Show
          </Button>
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            loading={bulkModerate.isPending}
            onClick={() => {
              bulkSetStatus('rejected', 'Hidden');
            }}
          >
            <EyeOff className="size-4" aria-hidden />
            Hide
          </Button>
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            className="ml-auto"
            onClick={clearSelection}
          >
            Clear
          </Button>
        </div>
      ) : null}

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <EmptyState
            icon={<HelpCircle className="size-6" aria-hidden />}
            title="Could not load the questions"
            description="Something went wrong reaching the server. Nothing customers asked has been lost — try again in a moment."
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
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading questions…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<HelpCircle className="size-6" aria-hidden />}
            title={anyFilter ? 'Nothing matches those filters' : 'No questions yet'}
            description={
              anyFilter
                ? 'Try a different word, or switch the filter back to All.'
                : 'When a shopper asks something on one of your product pages, it appears here for you to answer and show.'
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th className="w-10">
                  <Checkbox
                    color="module"
                    checked={allSelected}
                    aria-label="Select every question in view"
                    onChange={(event) => {
                      setSelected(
                        event.target.checked ? new Set(rows.map((r) => r.id)) : new Set()
                      );
                    }}
                  />
                </th>
                <th>Question</th>
                <th className="hidden @lg:table-cell">Product</th>
                <th className="hidden @xl:table-cell">Asked by</th>
                {header('status', 'Status')}
                {header('createdAt', 'Asked', 'hidden @2xl:table-cell')}
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const state = questionState(row.status);
                const busyRow = actingId === row.id && moderate.isPending;
                const open = (event: { shiftKey: boolean; altKey: boolean }) => {
                  openQueue(event, row.id);
                };
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(event);
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(event);
                    }}
                  >
                    <td
                      className="w-10"
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      <Checkbox
                        color="module"
                        checked={selected.has(row.id)}
                        aria-label={`Select this question about ${row.productTitle ?? 'a product'}`}
                        onChange={(event) => {
                          toggleSelect(row.id, event.target.checked);
                        }}
                      />
                    </td>
                    <td className="max-w-md truncate">{preview(row.body)}</td>
                    <td className="hidden max-w-40 truncate text-sm @lg:table-cell">
                      {row.productTitle ?? '—'}
                    </td>
                    <td className="hidden max-w-40 truncate text-sm @xl:table-cell">
                      {customerLabel(row.customer)}
                    </td>
                    <td>
                      <Badge color={state.tone} variant="soft" size="sm">
                        {state.label}
                      </Badge>
                    </td>
                    <td className="hidden text-sm @2xl:table-cell">
                      <Timestamp value={row.createdAt} format="relative" />
                    </td>
                    <td
                      className="text-right"
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      <div className="inline-flex items-center gap-1">
                        <Tooltip content="Show on the page">
                          <Button
                            size="sm"
                            variant="ghost"
                            color="module"
                            shape="square"
                            aria-label="Show this question on the page"
                            loading={busyRow}
                            onClick={() => {
                              setStatusFor(row.id, 'published', 'Question shown on the page');
                            }}
                          >
                            <Check className="size-4" aria-hidden />
                          </Button>
                        </Tooltip>
                        <Tooltip content="Hide" align="end">
                          <Button
                            size="sm"
                            variant="ghost"
                            color="neutral"
                            shape="square"
                            aria-label="Hide this question"
                            loading={busyRow}
                            onClick={() => {
                              setStatusFor(row.id, 'rejected', 'Question hidden');
                            }}
                          >
                            <EyeOff className="size-4" aria-hidden />
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

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
            setTake(pageSize);
            clearSelection();
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setTake(size);
            clearSelection();
          }}
        />
        <RowOpenHint what="a row to open it in the queue" />
      </div>
    </div>
  );
}
