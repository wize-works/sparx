'use client';

// Owed to you — what has been invoiced but not paid, and how late each one is.
//
// Aging IS the surface: the same balance reads very differently at "due next
// week" and "90 days late", so lateness carries the color AND the default order.
// A summary bar up top shows where ALL the money is stuck — it always reflects the
// full outstanding set, never the filtered view, because it's the headline for
// everything owed. Below it, every matching invoice is one row of a sortable,
// paged table (a dense list of records belongs in a table, not a stack of cards).
// Search, the aging filter, sort and paging are all server-driven, so each spans
// the whole set rather than one loaded window. Opening a row opens the invoice.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  Heading,
  Progress,
  SearchInput,
  Table,
  Text,
} from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, CheckCircle2, ReceiptText } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { bucketTone, useReceivables, type Receivable } from './receivables-data';
import { formatMoney, formatMoneyCompact, formatDay } from './format';
import { RowOpenHint } from '../../components/row-open-hint';

// The aging facets — same bucket keys the summary bars use, so clicking a chip
// narrows the table to exactly that band.
const BUCKET_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'current', label: 'Not yet due' },
  { value: 'd1_30', label: '1–30' },
  { value: 'd31_60', label: '31–60' },
  { value: 'd61_90', label: '61–90' },
  { value: 'd90_plus', label: '90+' },
] as const;

type SortKey = 'overdueDays' | 'balance';
type SortDir = 'asc' | 'desc';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** How late this invoice is, in plain words + its semantic tone. */
function lateness(r: Receivable): {
  label: string;
  tone: 'success' | 'warning' | 'error' | 'info';
} {
  if (r.overdueDays <= 0) {
    return { label: 'Not yet due', tone: 'info' };
  }
  const days = r.overdueDays;
  return {
    label: days === 1 ? '1 day late' : `${String(days)} days late`,
    tone: bucketTone(r.bucket),
  };
}

function ReceivableRow({
  item,
  onOpen,
}: {
  item: Receivable;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const late = lateness(item);
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
      <td className="font-mono text-sm whitespace-nowrap">{item.number ?? 'Draft'}</td>
      <td className="max-w-48 truncate font-medium">{item.customerName}</td>
      <td>
        <Badge color={late.tone} variant="soft" size="sm">
          {late.label}
        </Badge>
      </td>
      <td className="hidden text-sm whitespace-nowrap @lg:table-cell">{formatDay(item.dueAt)}</td>
      <td className="text-right font-medium tabular-nums">
        {formatMoney(item.balance, item.currency)}
      </td>
    </tr>
  );
}

export function ReceivablesSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState('all');
  // Most overdue first — the chase list leads with the oldest debt.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'overdueDays',
    dir: 'desc',
  });
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useReceivables({
    q: search.trim(),
    bucket,
    sort,
    take,
    skip,
  });

  const currency = data?.currency ?? 'USD';
  const rows = data?.items ?? [];
  const total = data?.total;

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' }
    );
    resetWindow();
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

  const open = (item: Receivable, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('invoicing.invoice.edit', { id: item.id }, { target: targetFor(event) });
  };

  // Nothing owed AT ALL — distinct from "nothing matches this filter" below.
  const allPaidUp = data?.totalCount === 0;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Receivables list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search by customer or invoice number"
              placeholder="Search customer or invoice…"
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                resetWindow();
              }}
            />
          </div>
        }
        controls={
          <>
            <Filter
              color="module"
              value={bucket}
              onValueChange={(next) => {
                setBucket(next ?? 'all');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter by how late"
            >
              {BUCKET_FILTERS.map((filter) => (
                <FilterItem key={filter.value} value={filter.value}>
                  {filter.label}
                </FilterItem>
              ))}
            </Filter>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            icon={<ReceiptText className="size-6" aria-hidden />}
            title="Could not load what you're owed"
            description="This can happen if invoicing isn't switched on for this business, or the server couldn't be reached. Your invoices are unaffected."
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
        ) : allPaidUp ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<CheckCircle2 className="size-6" aria-hidden />}
              title="You're all paid up"
              description="Every invoice you've sent has been paid. When something is invoiced but still owed, it'll show here — sorted by how late it is."
            />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {/* Headline: the one number an owner came for, then where it's stuck.
                Always the FULL outstanding set — the filter below narrows the
                table, never this. */}
            <Card className="p-4">
              <Text className="text-sm">Total outstanding</Text>
              <Heading level={2} className="mt-1 text-3xl font-semibold tabular-nums">
                {formatMoney(data.totalOutstanding, currency)}
              </Heading>
              <Text className="mt-1 text-sm">
                across {data.totalCount === 1 ? '1 invoice' : `${String(data.totalCount)} invoices`}
              </Text>

              <div className="mt-4 flex flex-col gap-3">
                {data.buckets
                  .filter((b) => b.balance > 0)
                  .map((b) => (
                    <div
                      key={b.key}
                      className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm"
                    >
                      <span className="truncate">{b.label}</span>
                      <Progress
                        color={bucketTone(b.key)}
                        value={b.balance}
                        max={data.totalOutstanding}
                        aria-label={`${b.label}: ${formatMoney(b.balance, currency)}`}
                      />
                      <span className="text-right font-medium tabular-nums">
                        {formatMoneyCompact(b.balance, currency)}
                      </span>
                    </div>
                  ))}
              </div>
            </Card>

            {/* The records themselves — sortable, paged, worked oldest-debt-first
                by default. The "How late" column carries the aging bucket per row,
                so the grouping signal survives without repeating a header. */}
            {rows.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<ReceiptText className="size-6" aria-hidden />}
                  title="No invoices match those filters"
                  description="Try a different search, or switch the aging filter back to All. Your total outstanding above still counts every open invoice."
                />
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <Table size="sm" hover>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      {header('overdueDays', 'How late')}
                      <th className="hidden @lg:table-cell">Due</th>
                      {header('balance', 'Balance', 'text-right')}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => (
                      <ReceivableRow
                        key={item.id}
                        item={item}
                        onOpen={(event) => {
                          open(item, event);
                        }}
                      />
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}

            <div>
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
                }}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                  setTake(size);
                }}
              />
              <RowOpenHint what="an invoice to open it" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
