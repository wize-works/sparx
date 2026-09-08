'use client';

// PAST MOVES — every migration this account has run.
//
// Exists for one reason that only shows up weeks later: a tenant asks "did the
// orders ever come across?" and nobody can answer. A run is a durable record of
// what was brought in, from where, and what went wrong, and it stays readable
// long after the person who ran it has forgotten doing so.
//
// Practice runs are listed alongside real ones and labelled as such — a tenant who
// ran three practices and no real import needs to see exactly that, rather than a
// list that looks like the work was done.

import { Badge, Button, Heading, Text } from '@wizeworks/silicaui-react';
import { ArrowRight, PackagePlus } from 'lucide-react';
import { ListEmptyState } from '../../components/list-empty-state';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { entityLabel, runTone, useMigrationRuns, type RunSummary } from './data';
import type { CanonicalEntity } from '@wizeworks/migration';

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

function RunRow({ run, onOpen }: { run: RunSummary; onOpen: () => void }) {
  const landed = run.importedCount + run.updatedCount;
  return (
    <div className="border-base-300 bg-base-100 flex flex-wrap items-center gap-3 rounded-xl border p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Heading level={3} className="text-base">
            {run.vendor ?? 'A file'}
          </Heading>
          <Badge color={runTone(run.status)} variant="soft" size="sm">
            {run.status === 'running'
              ? 'Still going'
              : run.status === 'failed'
                ? 'Had trouble'
                : 'Done'}
          </Badge>
          {run.dryRun ? (
            <Badge color="info" variant="outline" size="sm">
              Practice
            </Badge>
          ) : null}
        </div>
        <Text className="text-sm">
          {when(run.startedAt)}
          {run.fileName !== null ? ` · ${run.fileName}` : ''}
        </Text>
        <Text className="text-sm">
          {run.entities.map((entity) => entityLabel(entity as CanonicalEntity)).join(' · ')}
        </Text>
      </div>

      <div className="flex flex-col items-end gap-0.5">
        <Text className="text-2xl font-semibold tabular-nums">{landed.toLocaleString()}</Text>
        <Text className="text-sm">
          {run.dryRun ? 'would come across' : 'brought across'}
          {run.errorCount > 0 ? ` · ${run.errorCount.toLocaleString()} skipped` : ''}
        </Text>
      </div>

      <Button variant="ghost" size="sm" onClick={onOpen}>
        See what happened
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

export function MigrationHistorySurface({ ctx }: { ctx: SurfaceContext }) {
  const { data, isPending, isFetching, dataUpdatedAt, refetch } = useMigrationRuns();
  const runs = data?.runs ?? [];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Past moves controls"
        controls={
          <>
            <Button
              color="primary"
              size="sm"
              onClick={() => ctx.open('platform.migrate', {}, { target: 'tab' })}
            >
              <PackagePlus className="size-4" aria-hidden />
              Move something in
            </Button>
          </>
        }
        refresh={
          <div className="ml-auto flex items-center gap-2">
            <RefreshButton
              onRefresh={() => void refetch()}
              isFetching={isFetching}
              updatedAt={dataUpdatedAt}
            />
          </div>
        }
      />

      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 overflow-y-auto">
        {isPending ? <Text>Loading…</Text> : null}

        {!isPending && runs.length === 0 ? (
          <ListEmptyState
            filtered={false}
            noResults={{
              icon: <PackagePlus className="size-6" aria-hidden />,
              title: 'No moves match',
            }}
            firstRun={{
              icon: <PackagePlus className="size-6" aria-hidden />,
              title: 'Nothing has been moved in yet',
              description:
                'When you bring a catalogue, a contact list or a blog over from another platform, each move is recorded here with exactly what landed.',
              actions: (
                <Button
                  color="module"
                  onClick={() => ctx.open('platform.migrate', {}, { target: 'tab' })}
                >
                  Move something in
                </Button>
              ),
            }}
          />
        ) : null}

        {runs.map((run) => (
          <RunRow
            key={run.runId}
            run={run}
            onOpen={() => ctx.open('platform.migrate.run', { runId: run.runId }, { target: 'tab' })}
          />
        ))}
      </div>
    </div>
  );
}
