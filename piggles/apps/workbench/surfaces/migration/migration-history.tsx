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

import { Badge, Button, Card, Heading, Text } from '@wizeworks/silicaui-react';
import { faArrowRight, faBoxOpen } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { ListEmptyState } from '../../components/list-empty-state';
import { PaneLoadError } from '../../components/pane-load-error';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { entityLabel, runTone, useMigrationRuns, type RunSummary } from './data';
import { landedBreakdown } from './run-outcome';
import type { CanonicalEntity } from '@wizeworks/migration';

/** Registry module for this pane, so the brand draws the right picture in the
 *  empty and waiting states rather than the generic one. */
const MODULE = 'platform';

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
  // Without this the row reads the same for a run that added twenty five people and
  // a run that overwrote twenty five — see run-outcome.
  const breakdown = landedBreakdown(
    { imported: run.importedCount, updated: run.updatedCount },
    run.dryRun
  );
  return (
    // A silica Card rather than a hand-rolled base-100 box: on Piggles' warm
    // surfaces a hairline barely separates anything, and Card carries the
    // resting shadow that does (DESIGN.md §4).
    //
    // `shrink-0` because the list around it is a flex column that scrolls: without
    // it every row shrank to share the visible height instead of the column
    // scrolling, so each card was drawn 65px tall over 108px of content and the
    // bottom line of every row was cut in half.
    <Card className="flex shrink-0 flex-wrap items-center gap-3 p-4">
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
        {breakdown === null ? null : <Text className="text-end text-sm">{breakdown}</Text>}
      </div>

      <Button variant="ghost" size="sm" onClick={onOpen}>
        See what happened
        <Icon glyph={faArrowRight} className="size-4" aria-hidden />
      </Button>
    </Card>
  );
}

export function MigrationHistorySurface({ ctx }: { ctx: SurfaceContext }) {
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useMigrationRuns();
  const runs = data?.runs ?? [];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Past moves controls"
        primary={
          <Button
            color="primary"
            size="sm"
            onClick={() => ctx.open('platform.migrate', {}, { target: 'tab' })}
          >
            <Icon glyph={faBoxOpen} className="size-4" aria-hidden />
            Move something in
          </Button>
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
        {/* Carded like the runs themselves, so the pane keeps its shape between
            waiting, empty and a list. */}
        {isPending ? (
          <Card>
            <PaneWaiting module={MODULE} />
          </Card>
        ) : null}

        {isError && runs.length === 0 ? (
          // Split out of the empty branch: a failed read left `runs` empty, and
          // "nothing has been moved in yet" is the one sentence someone who HAS
          // moved something in must never be shown. Only when there is nothing
          // to show — a failed poll over runs still on screen leaves them be.
          <Card>
            <PaneLoadError
              icon={<Icon glyph={faBoxOpen} className="size-6" aria-hidden />}
              title="Could not load your past moves"
              description="This is a problem reaching the server. Everything you have already moved in is unaffected."
              onRetry={() => {
                void refetch();
              }}
            />
          </Card>
        ) : null}

        {!isError && !isPending && runs.length === 0 ? (
          <Card>
            <ListEmptyState
              module={MODULE}
              filtered={false}
              noResults={{
                icon: <Icon glyph={faBoxOpen} className="size-6" aria-hidden />,
                title: 'No moves match',
              }}
              firstRun={{
                icon: <Icon glyph={faBoxOpen} className="size-6" aria-hidden />,
                title: 'Nothing has been moved in yet',
                description:
                  'When you bring a catalog, a contact list or a blog over from another platform, each move is recorded here with exactly what landed.',
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
          </Card>
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
