'use client';

// The pipelines list — the ways you win work.
//
// A pipeline is the set of stages a deal moves through. This is a table: the
// pipeline's name is the anchor, with how many stages it has and whether it is
// the default or archived in their own columns. Deal counts are not in the list
// payload, so they are not shown here — they live where a pipeline's deals do.

import {
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Select,
  Table,
} from '@wizeworks/silicaui-react';
import { useState } from 'react';
import { Plus, Workflow } from 'lucide-react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { usePipelines, type Pipeline } from './pipelines-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function PipelinesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'active' | 'all'>('active');

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = usePipelines({
    q: search,
    includeArchived: scope === 'all',
    // BOTH kinds (docs/144 §7.2) — sales pipelines and support queues. This is
    // the only surface where a support queue's stages can be renamed or
    // reordered, so filtering to deals here would leave it unreachable.
    objectKey: 'all',
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const filtered = search.trim() !== '' || scope !== 'active';

  const open = (pipeline: Pipeline, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('crm.pipeline.detail', { id: pipeline.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Pipeline list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              color="module"
              size="sm"
              aria-label="Search pipelines"
              placeholder="Search pipelines…"
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
            title="New pipeline — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('crm.pipeline.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            New pipeline
          </Button>
        }
        controls={
          <>
            <div className="hidden w-44 shrink-0 @lg:block">
              <Select
                color="module"
                size="sm"
                aria-label="Which pipelines to show"
                value={scope}
                items={{ active: 'Active pipelines', all: 'Including archived' }}
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
            icon={<Workflow className="size-6" aria-hidden />}
            title="Could not load your pipelines"
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
              icon: <Workflow className="size-6" aria-hidden />,
              title: 'No pipelines match that',
              description: 'Try a different word, or switch back to active pipelines.',
            }}
            firstRun={{
              title: 'No pipelines yet',
              description:
                'A pipeline is the set of stages a deal moves through — your own way of winning work. Create your first one to start tracking deals.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Name</th>
                <th>Moves</th>
                <th className="hidden text-right @md:table-cell">Stages</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  onClick={(event) => {
                    open(row, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    open(row, event);
                  }}
                >
                  <td className="font-medium">{row.name}</td>
                  <td>
                    {/* WHAT this process moves (docs/144 §7.2). Two things live
                        in one list now, and their stage words mean different
                        things — so which is which cannot be left to the name a
                        tenant happened to pick. Distinct hues, because that is
                        the distinction the column exists to draw. */}
                    <Badge
                      color={row.objectKey === 'ticket' ? 'info' : 'module'}
                      variant="soft"
                      size="sm"
                    >
                      {row.objectKey === 'ticket' ? 'Support requests' : 'Sales deals'}
                    </Badge>
                  </td>
                  <td className="hidden text-right text-sm tabular-nums @md:table-cell">
                    {row.stages.length}
                  </td>
                  <td>
                    {row.archivedAt ? (
                      <Badge color="neutral" variant="soft" size="sm">
                        Archived
                      </Badge>
                    ) : row.isDefault ? (
                      <Badge color="module" variant="soft" size="sm">
                        Default
                      </Badge>
                    ) : (
                      <Badge color="success" variant="soft" size="sm">
                        Active
                      </Badge>
                    )}
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
