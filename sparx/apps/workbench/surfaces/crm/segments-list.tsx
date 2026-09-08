'use client';

// The segments list — the saved groups of customers.
//
// A table, matching the customers and accounts lists: name is the anchor, with
// the rule count and the segment's state (built-in / archived / custom) in their
// own columns. Counts of members are NOT shown here — that is a per-row read, and
// the list must stay one request; membership lives on the detail.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Select,
  Table,
} from '@wizeworks/silicaui-react';
import { Filter, Plus } from 'lucide-react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { ruleCount, segmentMembership, useSegments, type Segment } from './segments-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function ruleSummary(segment: Segment): string {
  const count = ruleCount(segment.rules);
  if (count === 0) return 'From activity';
  return count === 1 ? '1 rule' : `${String(count)} rules`;
}

/** The segment's state as one soft badge — never a bland empty cell. */
function StateBadge({ segment }: { segment: Segment }) {
  if (segment.archivedAt) {
    return (
      <Badge color="neutral" variant="soft" size="sm">
        Archived
      </Badge>
    );
  }
  if (segment.isBuiltIn) {
    return (
      <Badge color="module" variant="soft" size="sm">
        Built-in
      </Badge>
    );
  }
  return (
    <Badge color="success" variant="soft" size="sm">
      Active
    </Badge>
  );
}

export function SegmentsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'active' | 'all'>('active');

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useSegments({
    q: search,
    includeArchived: scope === 'all',
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const filtered = search.trim() !== '' || scope !== 'active';

  const scopeItems = useMemo(() => ({ active: 'Active segments', all: 'Including archived' }), []);

  const open = (segment: Segment, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('crm.segment.detail', { id: segment.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Segment list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              color="module"
              size="sm"
              aria-label="Search segments"
              placeholder="Search segments…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            title="New segment — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('crm.segment.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            New segment
          </Button>
        }
        controls={
          <>
            <div className="hidden w-44 shrink-0 @lg:block">
              <Select
                color="module"
                size="sm"
                aria-label="Which segments to show"
                value={scope}
                items={scopeItems}
                onValueChange={(next) => {
                  setScope(next as 'active' | 'all');
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
            icon={<Filter className="size-6" aria-hidden />}
            title="Could not load your segments"
            description="Something went wrong reaching the server. It may be a temporary problem — try again in a moment."
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
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={filtered}
            noResults={{
              icon: <Filter className="size-6" aria-hidden />,
              title: 'No segments match that',
              description: 'Try a different word, or switch back to active segments.',
            }}
            firstRun={{
              title: 'No segments yet',
              description:
                'A segment is a saved group of customers who share something — big spenders, or everyone who has not bought in a year. Create your first one to start targeting a group.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Name</th>
                {/* The size leads the right-hand side because "how many people
                    is that" is what this list is opened to find out. */}
                <th className="text-right">People</th>
                <th className="hidden @lg:table-cell">Rules</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((segment) => (
                <tr
                  key={segment.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  onClick={(event) => {
                    open(segment, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    open(segment, event);
                  }}
                >
                  <td>
                    <span className="font-medium">{segment.name}</span>
                    {segment.description ? (
                      <span className="block truncate text-sm @md:hidden">
                        {ruleSummary(segment)}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-right text-sm tabular-nums">
                    {segment._count ? segmentMembership(segment._count.members) : '—'}
                  </td>
                  <td className="hidden text-sm @lg:table-cell">{ruleSummary(segment)}</td>
                  <td>
                    <StateBadge segment={segment} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="flex shrink-0 items-center justify-between px-1">
        <RowOpenHint />
        {typeof total === 'number' && !isPending ? (
          <p className="text-xs">
            {filtered
              ? `${rows.length.toLocaleString()} shown`
              : `${total.toLocaleString()} in total`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
