'use client';

// The trade accounts list — the businesses you supply.
//
// An account carries several facts a person scans across to tell one from
// another — who it is, what tier they're on, how much of their credit they've
// used, and whether they're open for orders — so this is a real table whose
// columns disclose with @container as the pane widens.
//
// A "trade account" is a business that buys from you on agreed prices and terms,
// not card at checkout. The empty state says exactly that, because the audience
// runs a business, not a CRM.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Select,
  Table,
  Text,
} from '@wizeworks/silicaui-react';
import { Building2, Plus } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { accountState, formatCents, useAccounts, type AccountRow } from './accounts-data';
import { RowOpenHint } from '../../components/row-open-hint';

const FILTERS = [
  { value: 'all', label: 'All', status: undefined },
  { value: 'active', label: 'Open for orders', status: 'active' },
  { value: 'credit_hold', label: 'On credit hold', status: 'credit_hold' },
  { value: 'suspended', label: 'Suspended', status: 'suspended' },
  { value: 'inactive', label: 'Closed', status: 'inactive' },
] as const;

type FilterValue = (typeof FILTERS)[number]['value'];

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function AccountsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const active = FILTERS.find((entry) => entry.value === filter) ?? FILTERS[0];
  const skip = (page - 1) * pageSize;
  const narrowed = search.trim() !== '' || filter !== 'all';

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useAccounts({
    q: search.trim(),
    status: active.status,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const openDetail = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('b2b.account.detail', { id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Trade account controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search trade accounts"
              placeholder="Company name or tax number…"
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
            data-tour="b2b-add-account"
            color="module"
            size="sm"
            className="ml-auto"
            title="Add a trade account — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('b2b.account.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add a trade account
          </Button>
        }
        controls={
          <>
            <div className="hidden w-44 shrink-0 @md:block">
              <Select
                size="sm"
                aria-label="Show which accounts"
                value={filter}
                items={FILTERS.map((entry) => ({ value: entry.value, label: entry.label }))}
                onValueChange={(next) => {
                  setFilter((next as FilterValue | null) ?? 'all');
                  resetWindow();
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
            icon={<Building2 className="size-6" aria-hidden />}
            title="Could not load your trade accounts"
            description="This is a problem reaching the server. Your accounts are unaffected — nothing has been lost."
          />
        ) : isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={narrowed}
            noResults={{
              icon: <Building2 className="size-6" aria-hidden />,
              title: 'No accounts match that',
              description: 'Try a different word, or switch back to All to see every account.',
            }}
            firstRun={{
              title: 'No trade accounts yet',
              description:
                'A trade account is a business you supply on agreed prices and terms — a garage, a builder, a reseller — rather than a shopper paying card at checkout. Add your first one to give them their own prices and let their people order.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Company</th>
                <th className="hidden @lg:table-cell">Price tier</th>
                <th className="hidden text-right @xl:table-cell">Credit used</th>
                <th className="text-right">Standing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <AccountTableRow key={row.id} row={row} onOpen={openDetail} />
              ))}
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

function AccountTableRow({
  row,
  onOpen,
}: {
  row: AccountRow;
  onOpen: (id: string, event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const state = accountState(row.status);
  return (
    <tr
      className="cursor-pointer"
      tabIndex={0}
      role="button"
      onClick={(event) => {
        onOpen(row.id, event);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(row.id, event);
      }}
    >
      <td className="font-medium">
        <span className="block">{row.companyName}</span>
        <Text as="span" className="text-sm @lg:hidden">
          {row.pricingTierName ?? 'No tier'}
        </Text>
      </td>
      <td className="hidden @lg:table-cell">{row.pricingTierName ?? '—'}</td>
      <td className="hidden text-right text-sm tabular-nums @xl:table-cell">
        {row.creditLimitCents > 0
          ? `${formatCents(row.creditUsedCents)} of ${formatCents(row.creditLimitCents)}`
          : 'No credit set'}
      </td>
      <td className="text-right">
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </td>
    </tr>
  );
}
