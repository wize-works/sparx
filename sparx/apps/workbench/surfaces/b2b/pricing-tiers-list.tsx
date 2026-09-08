'use client';

// Price tiers — the named trade levels you put accounts on.
//
// Each tier is a discount you set once and apply to everyone on it, so the list
// shows the two things that tell tiers apart: what it takes off, and how many
// accounts are riding on it. A tier is a one-line idea, so it is a row per tier,
// not a wide table inventing columns to fill.

import { useState } from 'react';
import { Badge, Button, Card, EmptyState, SearchInput, Text } from '@wizeworks/silicaui-react';
import { DollarSign, Plus } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { discountSummary, formatCents, useTiers, type TierRow } from './pricing-tiers-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function PricingTiersListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useTiers({
    q: search.trim(),
    take: 100,
    skip: 0,
  });

  const rows = data?.items ?? [];
  const narrowed = search.trim() !== '';

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('b2b.pricing-tier.detail', { id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Price tier controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search price tiers"
              placeholder="Search price tiers…"
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
            title="Add a price tier — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('b2b.pricing-tier.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add a price tier
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

      <Card className="min-h-0 flex-1 overflow-y-auto p-2">
        {isError ? (
          <EmptyState
            icon={<DollarSign className="size-6" aria-hidden />}
            title="Could not load your price tiers"
            description="This is a problem reaching the server. Your tiers are unaffected — nothing has been lost."
          />
        ) : isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={narrowed}
            noResults={{
              icon: <DollarSign className="size-6" aria-hidden />,
              title: 'No tiers match that',
              description: 'Try a different word, or clear the search to see every tier.',
            }}
            firstRun={{
              title: 'No price tiers yet',
              description:
                'A price tier is a named trade level — trade, distributor, key account — with a discount you set once and give to every account on it. Add your first one, then put accounts on it.',
            }}
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {rows.map((row) => (
              <TierRowItem key={row.id} row={row} onOpen={open} />
            ))}
          </ul>
        )}
      </Card>

      <RowOpenHint />
    </div>
  );
}

function TierRowItem({
  row,
  onOpen,
}: {
  row: TierRow;
  onOpen: (id: string, event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const accountLabel =
    row.accountCount === undefined
      ? null
      : row.accountCount === 1
        ? '1 account'
        : `${String(row.accountCount)} accounts`;

  return (
    <li>
      <button
        type="button"
        className="hover:bg-base-200 flex w-full items-center gap-3 rounded p-3 text-left"
        onClick={(event) => {
          onOpen(row.id, event);
        }}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{row.name}</span>
          {row.description ? (
            <Text as="span" className="block truncate text-sm">
              {row.description}
            </Text>
          ) : null}
        </span>
        {accountLabel ? (
          <Text as="span" className="hidden shrink-0 text-sm @md:inline">
            {accountLabel}
          </Text>
        ) : null}
        <Badge
          color={row.discountValue > 0 ? 'module' : 'neutral'}
          variant="soft"
          size="sm"
          className="shrink-0"
        >
          {row.discountValue > 0 ? discountSummary(row) : 'No discount'}
        </Badge>
        {row.minOrderCents > 0 ? (
          <Text as="span" className="hidden shrink-0 text-sm @lg:inline">
            min {formatCents(row.minOrderCents)}
          </Text>
        ) : null}
      </button>
    </li>
  );
}
