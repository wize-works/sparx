'use client';

// BOOKING RULES — the notice you need, what happens on a cancellation, and
// whether a deposit is taken up front. Each set of rules is a named policy a
// service points at, so a machine shop's 24-hour cancellation terms never bind a
// cake-tasting customer.
//
// A table, like every other list. A policy is a name plus a plain-language
// summary of what it asks of a customer. Search goes to the SERVER; there is no
// state to badge — a policy is a set of terms, not a thing with a lifecycle.

import { useState } from 'react';
import { Button, Card, EmptyState, SearchInput, Table } from '@wizeworks/silicaui-react';
import { Plus, ShieldCheck } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { policySummary, usePolicies, type BookingPolicy } from './setup-data';
import { RowOpenHint } from '../../components/row-open-hint';

const DETAIL_KEY = 'scheduling.policies.detail';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function PoliciesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;

  const { data, isPending, isFetching, dataUpdatedAt, isError, refetch } = usePolicies({
    q: search.trim(),
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const narrowed = search.trim() !== '';

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const openNew = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(DETAIL_KEY, { id: 'new' }, { target: targetFor(event) });
  };

  const open = (policy: BookingPolicy, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(DETAIL_KEY, { id: policy.id }, { target: targetFor(event) });
  };

  const body = () => {
    if (isError) {
      return (
        <EmptyState
          icon={<ShieldCheck className="size-6" aria-hidden />}
          title="Could not load your booking rules"
          description="This is a problem reaching the server. Your rules are unaffected — the list just could not be read just now."
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
      );
    }

    if (isPending) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading booking rules…
        </p>
      );
    }

    if (rows.length === 0) {
      return (
        <ListEmptyState
          filtered={narrowed}
          noResults={{
            icon: <ShieldCheck className="size-6" aria-hidden />,
            title: 'Nothing matches that',
            description: 'Try part of a rule set’s name.',
          }}
          firstRun={{
            title: 'No booking rules yet',
            description:
              'Booking rules decide how much notice you need, what happens if someone cancels late or misses a booking, and whether a deposit is taken. Set up a rule set and you can apply it to any service.',
            actions: (
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  openNew({ shiftKey: false, altKey: false });
                }}
              >
                <Plus className="size-4" aria-hidden />
                New rule set
              </Button>
            ),
          }}
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Rule set</th>
            <th className="hidden @md:table-cell">What it asks of a customer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((policy) => (
            <tr
              key={policy.id}
              className="cursor-pointer"
              tabIndex={0}
              role="button"
              onClick={(event) => {
                open(policy, event);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open(policy, event);
              }}
            >
              <td className="w-full max-w-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{policy.name}</span>
                  <span className="truncate text-sm @md:hidden">{policySummary(policy)}</span>
                </span>
              </td>
              <td className="hidden @md:table-cell">{policySummary(policy)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Booking rules list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search booking rules"
              placeholder="Rule set name…"
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
            className="ml-auto shrink-0 whitespace-nowrap"
            title="New rule set — hold Shift to open alongside, Alt for a new window"
            onClick={openNew}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">New rule set</span>
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

      <Card className="mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto">{body()}</Card>

      <div className="mx-auto w-full max-w-4xl shrink-0">
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
        {rows.length > 0 ? <RowOpenHint /> : null}
      </div>
    </div>
  );
}
