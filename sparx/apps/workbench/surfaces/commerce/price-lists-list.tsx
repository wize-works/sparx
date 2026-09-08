'use client';

// The price-lists list.
//
// A price list carries several distinct facts a person scans across to tell one
// from another — who it is for, which currency, how many prices are on it, and
// whether it is live — so unlike the one-line collection/discount lists this is
// a real table, its columns disclosing with @container as the pane widens.
//
// A "price list" is a set of special prices for particular customers: a
// wholesale sheet, a distributor's rates, the "trade" price you give the
// businesses you supply. The empty state says exactly that, because the audience
// owns a shop, not a pricing engine.

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
import { Plus, Tag } from 'lucide-react';
import { useQuery } from '@wizeworks/query';
import { api } from '../../lib/api/client';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { audienceSummary, priceListState, type PriceListRow } from './price-lists-data';
import { RowOpenHint } from '../../components/row-open-hint';

const FILTERS = [
  { value: 'all', label: 'All', status: undefined },
  { value: 'active', label: 'Live', status: 'active' },
  { value: 'draft', label: 'Not live', status: 'draft' },
  { value: 'archived', label: 'Retired', status: 'archived' },
] as const;

type FilterValue = (typeof FILTERS)[number]['value'];

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function PriceListsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');

  const active = FILTERS.find((entry) => entry.value === filter) ?? FILTERS[0];

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['commerce', 'price-lists', 'list', { q: search, status: active.status }],
    queryFn: () =>
      api.list<PriceListRow>('/v1/commerce/price-lists', {
        ...(search.trim() ? { q: search.trim() } : {}),
        ...(active.status ? { status: active.status } : {}),
        take: 100,
      }),
    placeholderData: (previous) => previous,
  });

  const rows = data?.items ?? [];
  const narrowed = search.trim() !== '' || filter !== 'all';

  const openDetail = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.pricelist.detail', { id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Price list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search price lists"
              placeholder="Search price lists…"
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
            title="Add a price list — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('commerce.pricelist.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add a price list
          </Button>
        }
        controls={
          <>
            <div className="hidden w-40 shrink-0 @md:block">
              <Select
                size="sm"
                aria-label="Show which price lists"
                value={filter}
                items={FILTERS.map((entry) => ({ value: entry.value, label: entry.label }))}
                onValueChange={(next) => {
                  setFilter((next as FilterValue | null) ?? 'all');
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
            icon={<Tag className="size-6" aria-hidden />}
            title="Could not load your price lists"
            description="This is a problem reaching the server. Your price lists are unaffected — nothing has been lost."
          />
        ) : isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={narrowed}
            noResults={{
              icon: <Tag className="size-6" aria-hidden />,
              title: 'Nothing matches those filters',
              description: 'Try a different word, or clear the filters to see everything.',
            }}
            firstRun={{
              title: 'No price lists yet',
              description:
                'A price list is a set of special prices for particular customers — a wholesale sheet for the businesses you supply, or a members’ rate. Add your first one to start giving certain customers their own prices.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Name</th>
                <th className="hidden @lg:table-cell">Who it&apos;s for</th>
                <th className="hidden @xl:table-cell">Currency</th>
                <th className="hidden text-right @md:table-cell">Prices</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const state = priceListState(row);
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      openDetail(row.id, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      openDetail(row.id, event);
                    }}
                  >
                    <td className="font-medium">
                      <span className="block">{row.name}</span>
                      <Text as="span" className="text-sm @lg:hidden">
                        {audienceSummary(row)}
                      </Text>
                    </td>
                    <td className="hidden @lg:table-cell">{audienceSummary(row)}</td>
                    <td className="hidden font-mono text-sm @xl:table-cell">{row.currency}</td>
                    <td className="hidden text-right tabular-nums @md:table-cell">
                      {row.entryCount === 1 ? '1 price' : `${String(row.entryCount)} prices`}
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

      <RowOpenHint />
    </div>
  );
}
