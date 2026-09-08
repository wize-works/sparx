'use client';

// The deals list — the sales you are working on, as a BOARD or as a table.
//
// The board is the default, and it is the point: a pipeline is a thing work moves
// ACROSS, so the view that lets you move it is the one that matches what a deal
// actually is. Columns are the pipeline's own stages, a card carries the deal's
// worth and the one thing urgent about it, and dropping a card commits the move
// through the same `move-stage` endpoint the detail pane uses — the only
// sanctioned stage-change path, because it is what emits `deal.stage_changed`
// for the automations keyed off it.
//
// The table stays for the jobs a board is bad at: scanning many pipelines at
// once, sorting by value, and reading closed history. Which one you were last in
// is remembered per person.
//
// A board needs ONE pipeline — columns cannot be the stages of several processes
// at once — so board mode resolves "All pipelines" to the default one rather
// than showing an empty frame and an explanation.

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  SearchInput,
  Select,
  Table,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  useToast,
} from '@wizeworks/silicaui-react';
import { Columns3, List, Plus, Target } from 'lucide-react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { PaneScope } from '../../lib/dock/window-boundary';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { RecordBoard, type BoardColumn, type BoardTone } from '../../components/record-board';
import { SavedViewsMenu, viewFilterValue, viewFilters } from './saved-views-menu';
import { scoreBand, useActiveScoringModel } from './scoring-data';
import type { SavedView } from './workspace-data';
import { readListView, writeListView, type ListView } from '../../lib/view-preference';
import { usePipelines, stageTypeMeta, type PipelineStage } from './pipelines-data';
import {
  dealCustomerName,
  dealDueSignal,
  dealErrorMessage,
  formatMoney,
  useDeals,
  useMoveDealToStage,
  type Deal,
  type DealListParams,
} from './deals-data';
import { RowOpenHint } from '../../components/row-open-hint';

const SURFACE_KEY = 'crm.deals.list';

/** Every deal on the pipeline, not a page of them — see `DealListParams.take`. */
const BOARD_TAKE = 250;

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** A stage's meaning, as a board tone. In-flight wears the module hue, not grey:
 *  the CRM's own color is what says "this is yours and it is live". */
function stageTone(stageType: string): BoardTone {
  if (stageType === 'won') return 'success';
  if (stageType === 'lost') return 'danger';
  return 'module';
}

export function DealsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [pipelineId, setPipelineId] = useState('all');
  const [state, setState] = useState<'open' | 'closed' | 'all'>('open');

  // Board-first. The stored preference lands on the first client effect rather
  // than during render — localStorage does not exist on the server, and guessing
  // is what the app already does for the compact breakpoint.
  const [view, setView] = useState<ListView>('board');
  useEffect(() => {
    setView(readListView(SURFACE_KEY, 'board'));
  }, []);

  // Null when this business has not set deal scoring up — which is what keeps a
  // health badge off every card on a board where health means nothing yet.
  const dealScoreMax = useActiveScoringModel('deal')?.maxScore ?? null;

  const chooseView = (next: ListView) => {
    setView(next);
    writeListView(SURFACE_KEY, next);
  };

  const [pendingLoss, setPendingLoss] = useState<{ deal: Deal; stage: PipelineStage } | null>(null);

  const { data: pipelines, isPending: pipelinesPending } = usePipelines();
  const pipelineList = useMemo(() => pipelines?.items ?? [], [pipelines]);

  const isBoard = view === 'board';

  // A board is one process. "All pipelines" resolves to the default (or the
  // first) rather than rendering a board of nothing.
  const boardPipeline = useMemo(() => {
    if (pipelineId !== 'all') return pipelineList.find((p) => p.id === pipelineId) ?? null;
    return pipelineList.find((p) => p.isDefault) ?? pipelineList[0] ?? null;
  }, [pipelineId, pipelineList]);

  const [viewId, setViewId] = useState<string | null>(null);

  // Board and table narrow by different things, so they save different views —
  // the board has no open/closed control at all (a pipeline without its won and
  // lost columns is not that pipeline), and its pipeline is always set to
  // something. Saving the board's resolved pipeline rather than the literal
  // "all" is deliberate: reopening the view should land on the board somebody
  // was looking at, not on whichever pipeline happens to be default that month.
  const currentFilters = isBoard
    ? viewFilters([
        search.trim() !== '' && {
          field: 'deal.search',
          operator: 'contains',
          value: search.trim(),
        },
        Boolean(boardPipeline) && {
          field: 'deal.pipelineId',
          operator: 'eq',
          value: boardPipeline?.id,
        },
      ])
    : viewFilters([
        search.trim() !== '' && {
          field: 'deal.search',
          operator: 'contains',
          value: search.trim(),
        },
        pipelineId !== 'all' && { field: 'deal.pipelineId', operator: 'eq', value: pipelineId },
        // The published field is the boolean the resolvers already expose, not
        // this list's three-way control — `deal.isClosed` is what a report or an
        // automation condition would be written against.
        state !== 'all' && { field: 'deal.isClosed', operator: 'eq', value: state === 'closed' },
      ]);

  // What "nothing chosen" means here — the table opens on open deals, and the
  // board opens on the default pipeline. Neither is an empty filter set, so
  // without this the menu would offer to save an untouched list.
  const defaultPipelineId = pipelineList.find((p) => p.isDefault)?.id ?? pipelineList[0]?.id;
  const baselineFilters = isBoard
    ? viewFilters([
        Boolean(defaultPipelineId) && {
          field: 'deal.pipelineId',
          operator: 'eq',
          value: defaultPipelineId,
        },
      ])
    : viewFilters([{ field: 'deal.isClosed', operator: 'eq', value: false }]);

  const applyView = (view: SavedView | null): void => {
    setViewId(view?.id ?? null);
    setSearch(viewFilterValue(view, 'deal.search'));
    const nextPipeline = viewFilterValue(view, 'deal.pipelineId');
    setPipelineId(nextPipeline === '' ? 'all' : nextPipeline);
    // No condition means no restriction, which is "all deals" — not the list's
    // own opening default. A view says what it says.
    const closed = viewFilterValue(view, 'deal.isClosed');
    setState(closed === '' ? 'all' : closed === 'true' ? 'closed' : 'open');
  };

  const params: DealListParams = isBoard
    ? {
        q: search,
        // Undefined only while the pipelines are still loading.
        pipelineId: boardPipeline?.id,
        // No state filter: the board shows won and lost columns too, because a
        // pipeline whose last stages are missing is not that pipeline.
        take: BOARD_TAKE,
      }
    : {
        q: search,
        pipelineId: pipelineId === 'all' ? undefined : pipelineId,
        state: state === 'all' ? undefined : state,
      };

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useDeals(params);
  const moveDeal = useMoveDealToStage();

  const rows = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total;
  const filtered = search.trim() !== '' || pipelineId !== 'all' || (!isBoard && state !== 'open');

  const pipelineItems = useMemo(() => {
    const items: Record<string, string> = isBoard ? {} : { all: 'All pipelines' };
    for (const p of pipelineList) items[p.id] = p.name;
    return items;
  }, [pipelineList, isBoard]);

  const stages = useMemo(
    () => [...(boardPipeline?.stages ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [boardPipeline]
  );
  const stagesById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const columns: BoardColumn[] = useMemo(
    () =>
      stages.map((stage) => {
        const inStage = rows.filter((deal) => deal.stageId === stage.id);
        const worth = inStage.reduce((sum, deal) => sum + Number(deal.value || 0), 0);
        return {
          id: stage.id,
          name: stage.name,
          tone: stageTone(stage.stageType),
          summary:
            inStage.length > 0 ? formatMoney(worth, inStage[0]?.currency ?? 'USD') : undefined,
        };
      }),
    [stages, rows]
  );

  const cards = useMemo(
    () => rows.map((deal) => ({ id: deal.id, columnId: deal.stageId, item: deal })),
    [rows]
  );

  const open = (deal: Deal, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('crm.deal.detail', { id: deal.id }, { target: targetFor(event) });
  };

  function commitMove(deal: Deal, stage: PipelineStage, closedReason?: string) {
    moveDeal.mutate(
      {
        id: deal.id,
        toStage: { id: stage.id, name: stage.name, stageType: stage.stageType },
        ...(closedReason ? { closedReason } : {}),
      },
      {
        onSuccess: () => {
          if (stage.stageType === 'won') {
            toast.add({
              title: `${deal.title} won`,
              description: `Worth ${formatMoney(deal.value, deal.currency)}.`,
              type: 'success',
            });
          }
        },
        onError: (error) => {
          toast.add({
            title: 'Could not move that deal',
            description: dealErrorMessage(
              error,
              'Something went wrong reaching the server. The deal has been put back where it was.'
            ),
            type: 'error',
          });
        },
      }
    );
  }

  function handleMove(dealId: string, toStageId: string) {
    const deal = rows.find((d) => d.id === dealId);
    const stage = stagesById.get(toStageId);
    if (!deal || !stage) return;

    // Losing a deal is the one move worth a question. Why it was lost is the
    // only field on a deal nobody can reconstruct later, and the moment it
    // happens is the only moment anyone knows the answer.
    if (stage.stageType === 'lost') {
      setPendingLoss({ deal, stage });
      return;
    }
    commitMove(deal, stage);
  }

  const boardReady = !pipelinesPending && boardPipeline !== null && stages.length > 0;
  const truncated = isBoard && typeof total === 'number' && total > rows.length;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Deal list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              color="module"
              size="sm"
              aria-label="Search deals"
              placeholder="Search deals…"
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
            title="New deal — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('crm.deal.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            New deal
          </Button>
        }
        controls={
          <>
            <div className="hidden w-40 shrink-0 @xl:block">
              <Select
                color="module"
                size="sm"
                aria-label="Which pipeline"
                value={isBoard ? (boardPipeline?.id ?? '') : pipelineId}
                items={pipelineItems}
                onValueChange={(next) => {
                  setPipelineId(next as string);
                }}
              />
            </div>
            {isBoard ? null : (
              <div className="hidden w-32 shrink-0 @lg:block">
                <Select
                  color="module"
                  size="sm"
                  aria-label="Open or closed"
                  value={state}
                  items={{ open: 'Open', closed: 'Closed', all: 'All deals' }}
                  onValueChange={(next) => {
                    setState(next as 'open' | 'closed' | 'all');
                  }}
                />
              </div>
            )}
            <ToggleGroup
              size="sm"
              color="module"
              className="shrink-0"
              value={[view]}
              onValueChange={(next: unknown[]) => {
                // Single-select, but the control still speaks in arrays. Ignore a
                // deselect (empty array) — there is no "no view".
                const picked = next[0];
                if (picked === 'board' || picked === 'table') chooseView(picked);
              }}
            >
              <ToggleGroupItem value="board" aria-label="Show the board">
                <Columns3 className="size-4" aria-hidden />
                <span className="hidden @lg:inline">Board</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="table" aria-label="Show the list">
                <List className="size-4" aria-hidden />
                <span className="hidden @lg:inline">List</span>
              </ToggleGroupItem>
            </ToggleGroup>
            <SavedViewsMenu
              objectKey="deal"
              current={currentFilters}
              baseline={baselineFilters}
              nameHint="Closing this month"
              selectedId={viewId}
              onApply={applyView}
            />
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

      <Card className="min-h-0 flex-1 overflow-hidden">
        {isError ? (
          <EmptyState
            icon={<Target className="size-6" aria-hidden />}
            title="Could not load your deals"
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
        ) : isPending || (isBoard && pipelinesPending) ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : isBoard && !boardReady ? (
          <EmptyState
            icon={<Columns3 className="size-6" aria-hidden />}
            title="No pipeline to show a board for"
            description="A board needs a pipeline — the named steps a deal moves through, from first contact to won or lost. Set one up and every deal gets a column to sit in."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={(event) => {
                  ctx.open('crm.pipeline.detail', { id: 'new' }, { target: targetFor(event) });
                }}
              >
                Set up a pipeline
              </Button>
            }
          />
        ) : rows.length === 0 && !isBoard ? (
          <ListEmptyState
            filtered={filtered}
            noResults={{
              icon: <Target className="size-6" aria-hidden />,
              title: 'No deals match those filters',
              description:
                'Try a different word, or change the filters — closed deals are hidden unless you ask for them.',
            }}
            firstRun={{
              title: 'No deals yet',
              description:
                'A deal tracks a sale you are working on, from first contact to close. Add your first one to start a pipeline.',
            }}
          />
        ) : isBoard ? (
          <div className="flex h-full min-h-0 flex-col p-3">
            <RecordBoard
              columns={columns}
              cards={cards}
              noun="deal"
              emptyColumnText="Nothing at this step yet."
              onMove={handleMove}
              onOpenCard={open}
              renderCard={(deal) => <DealCard deal={deal} scoreMax={dealScoreMax} />}
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <Table size="sm" hover>
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Stage</th>
                  <th className="text-right">Value</th>
                  <th className="hidden @lg:table-cell">For</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const meta = stageTypeMeta(row.stage?.stageType ?? 'open');
                  const customer = dealCustomerName(row.customer);
                  return (
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
                      <td className="font-medium">{row.title}</td>
                      <td>
                        <Badge color={meta.tone} variant="soft" size="sm">
                          {row.stage?.name ?? meta.label}
                        </Badge>
                      </td>
                      <td className="text-right font-mono text-sm tabular-nums">
                        {formatMoney(row.value, row.currency)}
                      </td>
                      <td className="hidden text-sm @lg:table-cell">{customer ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <div className="flex shrink-0 items-center justify-between gap-3 px-1">
        <RowOpenHint what={isBoard ? 'a card to open it' : undefined} className="px-0" />
        {typeof total === 'number' && !isPending ? (
          <p className="text-xs">
            {/* Say so when the board is not showing everything. A column that
                quietly stops reads as "this is all of them". */}
            {truncated
              ? `Showing the ${rows.length.toLocaleString()} most recent of ${total.toLocaleString()}`
              : filtered
                ? `${rows.length.toLocaleString()} shown`
                : `${total.toLocaleString()} ${isBoard ? 'on this pipeline' : 'open'}`}
          </p>
        ) : null}
      </div>

      {pendingLoss ? (
        <LostReasonDialog
          deal={pendingLoss.deal}
          stage={pendingLoss.stage}
          onCancel={() => {
            setPendingLoss(null);
          }}
          onConfirm={(reason) => {
            commitMove(pendingLoss.deal, pendingLoss.stage, reason);
            setPendingLoss(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* ── The card ───────────────────────────────────────────────────────────── */

function DealCard({ deal, scoreMax }: { deal: Deal; scoreMax: number | null }) {
  const customer = dealCustomerName(deal.customer);
  const signal = dealDueSignal(deal);
  // Health only where the business has told us what healthy means. A board full
  // of "Not scored" would be a column of noise on every tenant that never wrote
  // a rule, and a bare 0 would libel every deal on the board.
  const band = scoreMax !== null && deal.score > 0 ? scoreBand(deal.score, scoreMax) : null;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="leading-snug font-medium">{deal.title}</p>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm tabular-nums">
          {formatMoney(deal.value, deal.currency)}
        </span>
        <span className="flex shrink-0 items-baseline gap-1">
          {band ? (
            <Badge color={band.color} variant="soft" size="sm">
              {deal.score}
            </Badge>
          ) : null}
          {signal ? (
            <Badge color={signal.tone} variant="soft" size="sm">
              {signal.label}
            </Badge>
          ) : null}
        </span>
      </div>
      {customer ? <p className="truncate text-sm">{customer}</p> : null}
    </div>
  );
}

/* ── Why was it lost? ───────────────────────────────────────────────────── */

// A modal holding real work, which the workbench allows only when it earns it
// (sparx/apps/workbench/CLAUDE.md): there is nothing to lose if it is abandoned, no
// durable thing to come back to, nothing else needed on screen, and it takes
// seconds. Cancelling leaves the deal exactly where it was.
function LostReasonDialog({
  deal,
  stage,
  onCancel,
  onConfirm,
}: {
  deal: Deal;
  stage: PipelineStage;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    // PORTALLED INTO THIS PANE. Without it the dialog escapes the pane’s
    // `ModuleScope`, where `--color-module` lives, so every `color="module"`
    // control inside falls back to `--color-primary` — Ember red on a form
    // where nothing is wrong. It would also open in the ORIGINAL window when
    // this pane has been torn off.
    <PaneScope>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next) onCancel();
        }}
      >
        <DialogContent>
          <DialogTitle>Why was this lost?</DialogTitle>
          <DialogDescription>
            You are moving <strong>{deal.title}</strong> to {stage.name}. A sentence now is worth
            more than a guess in six months — it is the only part of a lost deal nobody can work out
            later.
          </DialogDescription>

          <Field className="mt-4">
            <FieldLabel>What happened</FieldLabel>
            <FieldControl
              render={
                <Textarea
                  color="module"
                  rows={3}
                  placeholder="Went with a cheaper quote."
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                  }}
                />
              }
            />
            <FieldDescription>You can leave this blank and add it later.</FieldDescription>
          </Field>

          <DialogFooter>
            <DialogClose>
              <Button color="neutral" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button
              color="danger"
              onClick={() => {
                onConfirm(reason);
              }}
            >
              Mark it lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}
