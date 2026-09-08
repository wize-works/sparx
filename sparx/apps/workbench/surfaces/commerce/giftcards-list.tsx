'use client';

// The gift cards list.
//
// The workbench table standard (the same shape as the invoicing list): a real
// <Table> with sortable headers backed by SERVER-SIDE sort, server-side paging
// via <ListPagination>, and columns that disclose progressively with @container.
//
// A gift card is money with a code on it, so the two facts this list leads with
// are exactly those: the code, and how much is left on it. Who it was for and
// whether it can still be spent come next. Money columns are tabular-nums so the
// figures line up as you scan down them.

import { useState } from 'react';
import { Badge, Button, Card, EmptyState, SearchInput, Table } from '@wizeworks/silicaui-react';
import { ArrowDown, ArrowUp, Plus, Ticket } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { formatCents } from './products-data';
import {
  giftCardState,
  useGiftCardsList,
  type GiftCardRow,
  type GiftCardSort,
  type SortDir,
} from './giftcards-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function recipientLabel(row: GiftCardRow): string | null {
  const name = row.recipientName?.trim();
  if (name) return name;
  const email = row.recipientEmail?.trim();
  if (email) return email;
  return null;
}

/** When it stops working, in plain words. */
function expiryLabel(iso: string | null): string {
  if (!iso) return 'Never expires';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function issuedLabel(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function GiftCardsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  // Newest issued first — a card you just created shows up at the top.
  const [sort, setSort] = useState<{ key: GiftCardSort; dir: SortDir }>({
    key: 'createdAt',
    dir: 'desc',
  });

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);
  const skip = (page - 1) * pageSize;

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useGiftCardsList({
    q: search,
    sortBy: sort.key,
    order: sort.dir,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toggleSort = (key: GiftCardSort) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : // Money + dates descend (biggest / newest first); the code ascends.
          { key, dir: key === 'code' || key === 'status' ? 'asc' : 'desc' }
    );
    resetWindow();
  };

  const header = (key: GiftCardSort, label: string, extra = '') => (
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
    ctx.open('commerce.giftcard.detail', { id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Gift card list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search gift cards"
              placeholder="Search by code or recipient…"
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
            title="Issue a gift card — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('commerce.giftcard.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Issue a gift card</span>
          </Button>
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
        {error ? (
          <EmptyState
            icon={<Ticket className="size-6" aria-hidden />}
            title="Could not load your gift cards"
            description="Something went wrong reaching the server. It may be temporary — try again in a moment."
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading gift cards…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={Boolean(search.trim())}
            noResults={{
              icon: <Ticket className="size-6" aria-hidden />,
              title: 'Nothing matches that search',
              description: 'Try a different word, or clear the search box to see everything.',
            }}
            firstRun={{
              title: 'No gift cards yet',
              description:
                'A gift card lets someone pre-pay an amount for another person to spend with you. Issue your first one to get started.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                {header('code', 'Code')}
                {/* Recipient is a name OR an email OR nothing, so there is no one
                    column to order it by — a plain, unsorted cell. */}
                <th className="hidden @lg:table-cell">For</th>
                {header('balanceCents', 'Balance', 'text-right')}
                {header('status', 'State')}
                {header('expiresAt', 'Expires', 'hidden @2xl:table-cell')}
                {header('createdAt', 'Issued', 'hidden @3xl:table-cell text-right')}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const state = giftCardState(row.status);
                const who = recipientLabel(row);
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(row.id, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(row.id, event);
                    }}
                  >
                    <td className="font-mono font-semibold">{row.code}</td>
                    <td className="hidden max-w-48 truncate text-sm @lg:table-cell">
                      {who ?? '—'}
                    </td>
                    <td className="text-right font-semibold tabular-nums">
                      {formatCents(row.balanceCents, row.currency)}
                    </td>
                    <td>
                      <Badge color={state.tone} variant="soft" size="sm" title={state.detail}>
                        {state.label}
                      </Badge>
                    </td>
                    <td className="hidden text-sm @2xl:table-cell">{expiryLabel(row.expiresAt)}</td>
                    <td className="hidden text-right text-sm @3xl:table-cell">
                      {issuedLabel(row.createdAt)}
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
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setTake(size);
          }}
        />
        <RowOpenHint />
      </div>
    </div>
  );
}
