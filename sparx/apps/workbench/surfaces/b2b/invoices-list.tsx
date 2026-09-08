'use client';

// Wholesale invoices — what your trade accounts owe you.
//
// A business bought on terms, so you invoice them and they pay within the agreed
// window. This list is opened to answer "who owes me, and what's late" — so the
// filter chips are the questions, not the enum: Owed, Overdue, Paid. Each row
// shows the balance still outstanding and how overdue it is, because that is what
// a person chasing money needs at a glance.

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
import { Plus, Receipt, X } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  formatCents,
  formatDate,
  invoiceState,
  useInvoices,
  type InvoiceRow,
} from './invoices-data';
import { RowOpenHint } from '../../components/row-open-hint';

const FILTERS = [
  { value: 'all', label: 'All', status: undefined },
  { value: 'unpaid', label: 'Owed', status: 'unpaid' },
  { value: 'overdue', label: 'Overdue', status: 'overdue' },
  { value: 'partial', label: 'Part paid', status: 'partial' },
  { value: 'paid', label: 'Paid', status: 'paid' },
] as const;

type FilterValue = (typeof FILTERS)[number]['value'];

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function InvoicesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const accountId = typeof ctx.params.accountId === 'string' ? ctx.params.accountId : undefined;
  const accountName =
    typeof ctx.params.accountName === 'string' ? ctx.params.accountName : undefined;

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const active = FILTERS.find((entry) => entry.value === filter) ?? FILTERS[0];
  const skip = (page - 1) * pageSize;
  const narrowed = filter !== 'all' || search.trim() !== '';

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useInvoices({
    accountId,
    status: active.status,
    take,
    skip,
  });

  // The list route has no free-text search, so the box narrows the loaded window
  // by invoice number or company — a small, honest convenience over a low-volume
  // AR list rather than a claim the server is filtering.
  const term = search.trim().toLowerCase();
  const rows = (data?.items ?? []).filter((row) => {
    if (term === '') return true;
    return (
      row.invoiceNumber.toLowerCase().includes(term) ||
      (row.account?.companyName.toLowerCase().includes(term) ?? false)
    );
  });
  const total = data?.total;

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const open = (invoice: InvoiceRow, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('b2b.invoice.detail', { id: invoice.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Wholesale invoice controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search invoices on screen"
              placeholder="Invoice number or company…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            title="Raise an invoice — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open(
                'b2b.invoice.detail',
                { id: 'new', ...(accountId ? { accountId } : {}) },
                { target: targetFor(event) }
              );
            }}
          >
            <Plus className="size-4" aria-hidden />
            Raise an invoice
          </Button>
        }
        controls={
          <>
            <Filter
              color="module"
              value={filter}
              onValueChange={(next) => {
                setFilter((next as FilterValue | null) ?? 'all');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter invoices"
            >
              {FILTERS.map((entry) => (
                <FilterItem key={entry.value} value={entry.value}>
                  {entry.label}
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

      {accountId && accountName ? (
        <div className="flex items-center gap-2">
          <Badge color="module" variant="soft">
            {accountName}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            onClick={() => {
              ctx.open('b2b.invoices.list', {}, { target: 'replace' });
            }}
          >
            <X className="size-4" aria-hidden />
            Show all invoices
          </Button>
        </div>
      ) : null}

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            icon={<Receipt className="size-6" aria-hidden />}
            title="Could not load your invoices"
            description="This is a problem reaching the server. Your invoices are unaffected — nothing has been lost."
          />
        ) : isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading invoices…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={narrowed}
            noResults={{
              icon: <Receipt className="size-6" aria-hidden />,
              title: 'No invoices match that',
              description: 'Try a different word, or switch back to All to see every invoice.',
            }}
            firstRun={{
              title: 'No invoices yet',
              description: accountName
                ? `${accountName} has no invoices yet. Raise one for work you've billed them for outside an order.`
                : 'When a trade account buys on terms, its invoice shows up here with what it owes and when it is due. You can also raise one by hand for work billed outside an order.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Invoice</th>
                <th className="hidden @lg:table-cell">Business</th>
                <th className="hidden text-sm @2xl:table-cell">Due</th>
                <th className="hidden text-right @xl:table-cell">Owed</th>
                <th className="text-right">Standing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => {
                const state = invoiceState(invoice);
                return (
                  <tr
                    key={invoice.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(invoice, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(invoice, event);
                    }}
                  >
                    <td className="font-mono text-sm">{invoice.invoiceNumber}</td>
                    <td className="hidden max-w-48 truncate @lg:table-cell">
                      {invoice.account?.companyName ?? '—'}
                    </td>
                    <td className="hidden text-sm @2xl:table-cell">{formatDate(invoice.dueAt)}</td>
                    <td className="hidden text-right font-medium tabular-nums @xl:table-cell">
                      {invoice.balanceCents > 0
                        ? formatCents(invoice.balanceCents)
                        : formatCents(0)}
                    </td>
                    <td className="text-right">
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
