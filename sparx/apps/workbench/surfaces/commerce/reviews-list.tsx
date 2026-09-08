'use client';

// Reviews — the scalable moderation TABLE.
//
// The primary list surface for reviews: a real <Table> with a status filter,
// search, server-side sortable headers (including by star rating — the fastest
// way to find the one-stars) and server-side paging. It survives the promotion
// that drops thirty reviews overnight, where the one-at-a-time card queue does
// not.
//
// Into the card queue two ways: "Work the queue" opens the backlog at the top;
// a ROW click opens the queue focused on that review. The table triages and
// bulk-decides; the queue reads one review in full and replies to it.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Filter,
  FilterItem,
  Rating,
  SearchInput,
  Table,
  Timestamp,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { ArrowDown, ArrowUp, Check, EyeOff, ListChecks, MessageSquare, Trash2 } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { productErrorMessage, reviewState } from './products-data';
import {
  customerLabel,
  useBulkDeleteReviews,
  useBulkModerateReviews,
  useModerateQueueReview,
  useReviewsList,
  type ModerationSortDir,
  type ReviewSort,
} from './moderation-data';
import { RowOpenHint } from '../../components/row-open-hint';

/** Plain-language filter over the stored statuses. `approved` reads as "Shown".
 *  Default is "Waiting" — the backlog is the queue's job. */
const STATUS_FILTERS = [
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Shown' },
  { value: 'rejected', label: 'Hidden' },
  { value: 'all', label: 'All' },
] as const;

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function preview(review: { title: string; body: string }): string {
  const flat = (review.title ? `${review.title} — ${review.body}` : review.body)
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

export function ReviewsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const moderate = useModerateQueueReview();
  const bulkModerate = useBulkModerateReviews();
  const bulkDelete = useBulkDeleteReviews();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('pending');
  const [sort, setSort] = useState<{ key: ReviewSort; dir: ModerationSortDir }>({
    key: 'createdAt',
    dir: 'desc',
  });

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);
  const skip = (page - 1) * pageSize;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actingId, setActingId] = useState<string | null>(null);

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useReviewsList({
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
  const busyBulk = bulkModerate.isPending || bulkDelete.isPending;

  const clearSelection = () => {
    setSelected(new Set());
  };

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
    clearSelection();
  };

  const toggleSort = (key: ReviewSort) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'status' ? 'asc' : 'desc' }
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
    ctx.open('commerce.reviews.queue', focusId ? { focusId } : {}, { target: targetFor(event) });
  };

  const setStatusFor = (id: string, next: 'approved' | 'rejected', done: string) => {
    setActingId(id);
    moderate.mutate(
      { id, status: next },
      {
        onSuccess: () => {
          toast.add({ title: done, type: 'success' });
        },
        onError: (err) => {
          toast.add({
            title: 'Could not change that review',
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

  const bulkSetStatus = (next: 'approved' | 'rejected', done: string) => {
    bulkModerate.mutate(
      { reviewIds: selectedIds, status: next },
      {
        onSuccess: (result) => {
          clearSelection();
          toast.add({ title: `${done} (${String(result.count)})`, type: 'success' });
        },
        onError: (err) => {
          toast.add({
            title: 'Could not update those reviews',
            description: productErrorMessage(err, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onBulkDelete = () => {
    void (async () => {
      const count = selectedIds.length;
      const ok = await confirm({
        title: count === 1 ? 'Delete this review?' : `Delete these ${String(count)} reviews?`,
        description:
          'Their words, ratings and any photos are removed for good, and the affected products have their overall ratings worked out again. Hiding is undoable; deleting is not.',
        confirmLabel: count === 1 ? 'Delete it' : 'Delete them',
        cancelLabel: 'Keep them',
        color: 'danger',
      });
      if (!ok) return;
      bulkDelete.mutate(selectedIds, {
        onSuccess: (result) => {
          clearSelection();
          toast.add({ title: `Deleted ${String(result.count)} reviews`, type: 'success' });
        },
        onError: (err) => {
          toast.add({
            title: 'Could not delete those reviews',
            description: productErrorMessage(err, 'Nothing was changed.'),
            type: 'error',
          });
        },
      });
    })();
  };

  const header = (key: ReviewSort, label: string, extra = '', title?: string) => (
    <th
      className={extra}
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="link link-hover inline-flex items-center gap-1"
        title={title}
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
        label="Reviews list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search reviews"
              placeholder="Search reviews…"
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
            title="Work the queue — read and reply to reviews one at a time. Hold Shift to open alongside, Alt for a new window"
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
            disabled={busyBulk}
            onClick={() => {
              bulkSetStatus('approved', 'Shown');
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
            disabled={busyBulk}
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
            color="danger"
            loading={bulkDelete.isPending}
            disabled={busyBulk}
            onClick={onBulkDelete}
          >
            <Trash2 className="size-4" aria-hidden />
            Delete
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
            icon={<MessageSquare className="size-6" aria-hidden />}
            title="Could not load the reviews"
            description="Something went wrong reaching the server. Nothing customers wrote has been lost — try again in a moment."
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
            Loading reviews…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="size-6" aria-hidden />}
            title={anyFilter ? 'Nothing matches those filters' : 'No reviews yet'}
            description={
              anyFilter
                ? 'Try a different word, or switch the filter back to All.'
                : 'When a customer reviews one of your products, it appears here for you to publish or hide before it goes on your website.'
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
                    aria-label="Select every review in view"
                    onChange={(event) => {
                      setSelected(
                        event.target.checked ? new Set(rows.map((r) => r.id)) : new Set()
                      );
                    }}
                  />
                </th>
                {header('rating', 'Review', '', 'Sort by star rating')}
                <th className="hidden @lg:table-cell">Product</th>
                <th className="hidden @xl:table-cell">By</th>
                {header('status', 'Status')}
                {header('createdAt', 'Date', 'hidden @2xl:table-cell')}
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const state = reviewState(row.status);
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
                        aria-label={`Select this review of ${row.productTitle ?? 'a product'}`}
                        onChange={(event) => {
                          toggleSelect(row.id, event.target.checked);
                        }}
                      />
                    </td>
                    <td className="max-w-md">
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Rating
                            value={row.rating}
                            max={5}
                            readOnly
                            size="sm"
                            label={`${String(row.rating)} out of 5`}
                          />
                          {row.verifiedPurchase ? (
                            <Badge color="success" variant="soft" size="sm">
                              Really bought it
                            </Badge>
                          ) : null}
                        </div>
                        <span className="truncate text-sm">{preview(row)}</span>
                      </div>
                    </td>
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
                        <Tooltip content="Publish it">
                          <Button
                            size="sm"
                            variant="ghost"
                            color="module"
                            shape="square"
                            aria-label="Publish this review"
                            loading={busyRow}
                            onClick={() => {
                              setStatusFor(row.id, 'approved', 'Review published');
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
                            aria-label="Hide this review"
                            loading={busyRow}
                            onClick={() => {
                              setStatusFor(row.id, 'rejected', 'Review hidden');
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
