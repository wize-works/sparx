'use client';

// ONE RUN — plan it, commit to it, make it.
//
// ── Three states, and the middle one is the point ────────────────────────
//
//   On paper    nothing has moved and nothing is held. Free to change or drop.
//   Parts held  the components are RESERVED. They stop being sellable the moment
//               the build is committed to, so nobody discovers at the bench that
//               the last four hinges went out on an order this morning. Still
//               nothing has physically moved.
//   Made        the parts came off the shelf, the finished thing went on it, and
//               the cost is settled. Terminal — a correction is a stock count.
//
// The screen names all three in those words, because "released" means nothing to
// somebody who has not read a manual.
//
// ── Marking it made is the irreversible bit, and it says so ──────────────
//
// It moves real stock in both directions at once, so it asks first and the
// confirmation states what will happen in units. A run that yielded fewer than
// planned completes for what actually came out; the parts consumed scale with
// it, and the difference between planned and actual is left visible rather than
// smoothed away.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Combobox,
  DateInput,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Stat,
  StatDesc,
  StatTitle,
  StatValue,
  Stats,
  Table,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Ban, CheckCircle2, CookingPot, Hammer, Lock } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural, useStockLocations } from './data';
import { buyingErrorMessage, isNotFound } from './suppliers-data';
import {
  runKindLabel,
  runState,
  useAssemblyOrder,
  useBoms,
  useCancelRun,
  useCompleteRun,
  usePlanRun,
  useReleaseRun,
  type AssemblyKind,
} from './assembly-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-4xl flex-col gap-4';

/* ── Planning a run ─────────────────────────────────────────────────────── */

function PlanRun({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const planRun = usePlanRun();
  const locations = useStockLocations();
  // Only recipes in USE can be built to — a draft is by definition not the one
  // everyone is building to, and the server refuses it anyway.
  const boms = useBoms({ q: '', status: 'active', take: 250, skip: 0 });

  const [kind, setKind] = useState<AssemblyKind>('assemble');
  const [bomId, setBomId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [plannedFor, setPlannedFor] = useState<Date | null>(null);
  const [notes, setNotes] = useState('');

  const activeLocations = useMemo(
    () => (locations.data?.items ?? []).filter((l) => l.isActive),
    [locations.data]
  );
  useEffect(() => {
    if (warehouseId === '' && activeLocations.length > 0) setWarehouseId(activeLocations[0]!.id);
  }, [activeLocations, warehouseId]);

  useEffect(() => {
    ctx.setTitle('Plan a run');
  }, [ctx]);

  const bomOptions = useMemo(
    () =>
      (boms.data?.items ?? []).map((b) => ({
        value: b.id,
        label: `${b.outputTitle ?? b.outputSku ?? 'Item'} · ${b.name} (makes ${String(b.outputQuantity)})`,
      })),
    [boms.data]
  );
  const selected = bomOptions.find((o) => o.value === bomId) ?? null;

  const parsedQuantity = Number.parseInt(quantity, 10);
  const canPlan =
    bomId !== '' && warehouseId !== '' && Number.isFinite(parsedQuantity) && parsedQuantity > 0;
  const dirty = bomId !== '' || notes.trim() !== '';
  useDirtySource(dirty, 'You have not saved this run yet. Close anyway?');

  const plan = () => {
    if (!canPlan) return;
    planRun.mutate(
      {
        kind,
        bomId,
        warehouseId,
        quantity: parsedQuantity,
        ...(plannedFor ? { plannedFor: plannedFor.toISOString() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      {
        onSuccess: (run) => {
          ctx.open('inventory.assemblies.detail', { id: run.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({
              title: `${run.number} planned`,
              description:
                'Nothing has moved yet. Hold the parts when you are ready to commit to it, so nobody sells them out from under the build.',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not plan that run',
            description: buyingErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Plan a run actions"
        status={
          <span className="inline-flex items-center gap-1.5">
            <Hammer className="size-4" aria-hidden />
            <Text as="span" className="text-sm font-medium">
              Plan a run
            </Text>
          </span>
        }
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto shrink-0"
            disabled={!canPlan}
            loading={planRun.isPending}
            onClick={plan}
          >
            Plan it
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Plan a run
            </Heading>
            <Text>
              Say what you are making and how many. Nothing moves until you mark it made — this is
              the paper stage.
            </Text>
          </div>

          {bomOptions.length === 0 ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>No recipes in use yet</AlertTitle>
                <AlertDescription>
                  A run is built to a recipe. Write one and mark it as in use, then come back — a
                  draft cannot be built from, so that everyone builds to the same one.
                </AlertDescription>
              </AlertContent>
              <Button
                size="sm"
                color="module"
                variant="soft"
                onClick={() => {
                  ctx.open('inventory.boms.detail', { id: 'new' }, { target: 'tab' });
                }}
              >
                <CookingPot className="size-4" aria-hidden />
                Write a recipe
              </Button>
            </Alert>
          ) : null}

          <FormSection title="What is happening">
            <Field>
              <FieldLabel required>Making or taking apart</FieldLabel>
              <NativeSelect
                color="module"
                aria-label="Making or taking apart"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as AssemblyKind);
                }}
              >
                <option value="assemble">Making something from parts</option>
                <option value="disassemble">Taking something apart into its parts</option>
              </NativeSelect>
              <FieldDescription>
                {kind === 'assemble'
                  ? 'Parts come off the shelf and a finished thing goes on it.'
                  : 'A finished thing comes off the shelf and its parts go back on. What it cost is spread back across them.'}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel required>Recipe</FieldLabel>
              <Combobox
                color="module"
                items={bomOptions}
                value={selected}
                placeholder={bomOptions.length === 0 ? 'No recipes in use' : 'Find the recipe…'}
                emptyMessage="No recipe matches that."
                aria-label="Recipe"
                clearable={false}
                onValueChange={(next) => {
                  const option = next as { value: string } | null;
                  if (option) setBomId(option.value);
                }}
              />
            </Field>

            <div className="grid gap-3 @md:grid-cols-3">
              <Field>
                <FieldLabel required>How many</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className="text-right tabular-nums"
                      value={quantity}
                      onChange={(event) => {
                        setQuantity(event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Finished ones, not batches.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel required>Where</FieldLabel>
                <NativeSelect
                  color="module"
                  aria-label="Location"
                  value={warehouseId}
                  onChange={(event) => {
                    setWarehouseId(event.target.value);
                  }}
                >
                  {activeLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </NativeSelect>
                <FieldDescription>
                  Parts come from here and the finished ones land here.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Planned for</FieldLabel>
                <DateInput
                  color="module"
                  value={plannedFor}
                  aria-label="Planned for"
                  onValueChange={(date) => {
                    setPlannedFor(date);
                  }}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>Notes</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={2}
                    placeholder="Anything worth recording about this run"
                    value={notes}
                    onChange={(event) => {
                      setNotes(event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

/* ── An existing run ────────────────────────────────────────────────────── */

function ViewRun({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const run = useAssemblyOrder(id);
  const release = useReleaseRun(id);
  const complete = useCompleteRun(id);
  const cancel = useCancelRun(id);

  const [madeQuantity, setMadeQuantity] = useState('');

  useEffect(() => {
    if (run.data) ctx.setTitle(run.data.number);
  }, [ctx, run.data]);

  if (run.isError) {
    const gone = isNotFound(run.error);
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          reason={gone ? 'missing' : 'unreachable'}
          title={gone ? 'This run no longer exists' : 'Could not load this run'}
          description={
            gone
              ? 'It may have been deleted. The stock it used and produced is unaffected.'
              : 'This is a problem reaching the server. The run itself is unaffected — it just could not be read just now.'
          }
          onRetry={() => {
            void run.refetch();
          }}
        />
      </div>
    );
  }

  if (run.isPending) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  const data = run.data;
  const state = runState(data.status);
  const isMaking = data.kind === 'assemble';
  const planned = data.quantityPlanned;
  const parsedMade = Number.parseInt(madeQuantity, 10);
  const made =
    Number.isFinite(parsedMade) && parsedMade > 0 ? Math.min(parsedMade, planned) : planned;

  const doRelease = async () => {
    const ok = await confirm({
      title: `Hold the parts for ${data.number}?`,
      description: isMaking
        ? `The ${String(data.lines.length)} parts this needs stop being sellable, so nothing gets sold out from under the build. Nothing physically moves, and cancelling gives them straight back.`
        : `${plural(planned, 'unit', 'units')} of ${data.outputSku ?? 'the finished item'} stop being sellable so nobody sells what you are about to take apart.`,
      confirmLabel: 'Hold them',
      cancelLabel: 'Not yet',
      color: 'warning',
    });
    if (!ok) return;
    release.mutate(undefined, {
      onError: (error) => {
        toast.add({
          title: 'Could not hold the parts',
          description: buyingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const doComplete = async () => {
    const ok = await confirm({
      title: `Mark ${data.number} as made?`,
      description: isMaking
        ? `${plural(made, 'unit', 'units')} of ${data.outputSku ?? 'the finished item'} go onto the shelf, and the parts come off it. This moves real stock and cannot be undone by editing — a correction afterwards is a stock count.`
        : `${plural(made, 'unit', 'units')} of ${data.outputSku ?? 'the finished item'} come off the shelf and its parts go back on. This moves real stock and cannot be undone by editing.`,
      confirmLabel: 'Mark it made',
      cancelLabel: 'Go back',
      color: 'warning',
    });
    if (!ok) return;
    complete.mutate(
      { ...(made !== planned ? { quantity: made } : {}) },
      {
        onSuccess: (finished) => {
          toast.add({
            title: `${finished.number} made`,
            description:
              finished.outputUnitCostCents === null
                ? 'The stock has moved.'
                : `${plural(finished.quantityCompleted, 'unit', 'units')} at ${formatCents(finished.outputUnitCostCents)} each — worked out from what actually came off the shelf, plus the time.`,
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not mark that made',
            description: buyingErrorMessage(
              error,
              'Nothing was changed. Your stock is unaffected.'
            ),
            type: 'error',
          });
        },
      }
    );
  };

  const doCancel = async () => {
    const ok = await confirm({
      title: `Call off ${data.number}?`,
      description:
        data.status === 'released'
          ? 'The parts being held go back to being sellable. Nothing was consumed, so nothing needs putting back on a shelf.'
          : 'Nothing has moved, so nothing changes except that the run stops being on the list.',
      confirmLabel: 'Call it off',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    cancel.mutate(undefined, {
      onError: (error) => {
        toast.add({
          title: 'Could not call that off',
          description: buyingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const workable = data.status === 'planned' || data.status === 'released';

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Run actions"
        status={
          <span className="inline-flex items-center gap-1.5">
            <Hammer className="size-4" aria-hidden />
            <Text as="span" className="font-mono text-sm font-medium">
              {data.number}
            </Text>
          </span>
        }
        controls={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
            {data.status === 'planned' ? (
              <Button
                size="sm"
                color="warning"
                className="ml-auto shrink-0"
                loading={release.isPending}
                onClick={() => {
                  void doRelease();
                }}
              >
                <Lock className="size-4" aria-hidden />
                Hold the parts
              </Button>
            ) : null}
            {/* The action this surface exists for, so it is solid and colored. */}
            {workable ? (
              <Button
                size="sm"
                color="module"
                className={data.status === 'planned' ? 'shrink-0' : 'ml-auto shrink-0'}
                loading={complete.isPending}
                onClick={() => {
                  void doComplete();
                }}
              >
                <CheckCircle2 className="size-4" aria-hidden />
                Mark it made
              </Button>
            ) : null}
            {workable ? (
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                shape="square"
                aria-label="Call this run off"
                loading={cancel.isPending}
                onClick={() => {
                  void doCancel();
                }}
              >
                <Ban className="size-4" aria-hidden />
              </Button>
            ) : (
              <span className="ml-auto" />
            )}
          </>
        }
        refresh={
          <RefreshButton
            isFetching={run.isFetching}
            updatedAt={run.dataUpdatedAt}
            onRefresh={() => {
              void run.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              {runKindLabel(data.kind)} {data.outputTitle ?? data.outputSku ?? 'something'}
            </Heading>
            <Text className="text-sm">
              {data.bomName ? `${data.bomName} · ` : ''}
              {data.warehouseName ?? 'No location'}
              {data.plannedFor
                ? ` · planned for ${new Date(data.plannedFor).toLocaleDateString()}`
                : ''}
            </Text>
          </div>

          {data.status === 'completed' ? (
            <Card className="shrink-0">
              <Stats className="grid grid-cols-1 gap-2 px-2 py-1 @2xl:grid-cols-3">
                <Stat>
                  <StatTitle>{isMaking ? 'Made' : 'Taken apart'}</StatTitle>
                  <StatValue className="text-2xl tabular-nums">{data.quantityCompleted}</StatValue>
                  <StatDesc>
                    {data.quantityCompleted === planned
                      ? 'exactly what was planned'
                      : `of ${String(planned)} planned`}
                  </StatDesc>
                </Stat>
                <Stat>
                  <StatTitle>Cost each</StatTitle>
                  <StatValue className="text-module text-2xl tabular-nums">
                    {data.outputUnitCostCents === null
                      ? '—'
                      : formatCents(data.outputUnitCostCents)}
                  </StatValue>
                  {/* The claim worth making: this is not an estimate. */}
                  <StatDesc>
                    worked out from what actually came off the shelf, plus the time
                  </StatDesc>
                </Stat>
                <Stat>
                  <StatTitle>The whole run</StatTitle>
                  <StatValue className="text-2xl tabular-nums">
                    {data.totalCostCents === null ? '—' : formatCents(data.totalCostCents)}
                  </StatValue>
                  <StatDesc>including {formatCents(data.laborCostCents)} of time</StatDesc>
                </Stat>
              </Stats>
            </Card>
          ) : null}

          {data.status === 'released' ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>The parts are being held</AlertTitle>
                <AlertDescription>
                  They are no longer sellable, so nothing gets sold out from under this build — but
                  nothing has physically moved yet. Mark it made when the work is done, or call it
                  off to give the parts straight back.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {workable ? (
            <FormSection
              title="How many actually came out"
              description="Leave it alone if the run went to plan. A batch of 100 that yielded 96 is completed for 96, and the parts used scale with it."
            >
              <Field>
                <FieldLabel>Finished units</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={1}
                      max={planned}
                      inputMode="numeric"
                      className="w-32 text-right tabular-nums"
                      placeholder={String(planned)}
                      aria-label="Finished units"
                      value={madeQuantity}
                      onChange={(event) => {
                        setMadeQuantity(event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  Planned for {plural(planned, 'unit', 'units')}. To make more than that, plan
                  another run — a run that quietly grew is one nobody scheduled the parts for.
                </FieldDescription>
              </Field>
            </FormSection>
          ) : null}

          <FormSection
            title={isMaking ? 'What goes in' : 'What comes out'}
            description={
              data.status === 'completed'
                ? 'What actually moved, and what it cost.'
                : 'Worked out from the recipe when this run was planned — editing the recipe now will not change it.'
            }
          >
            {data.lines.length === 0 ? (
              <Text className="text-sm">
                This run has no parts against it. That happens when it was recorded against a recipe
                that has since been retired.
              </Text>
            ) : (
              <Table size="sm">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th className="text-right whitespace-nowrap">Planned</th>
                    {data.status === 'completed' ? (
                      <>
                        <th className="text-right whitespace-nowrap">Actually used</th>
                        <th className="hidden text-right whitespace-nowrap @md:table-cell">Cost</th>
                      </>
                    ) : (
                      <th className="hidden text-right whitespace-nowrap @md:table-cell">
                        Waste allowed
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="w-full max-w-0">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">
                            {line.productTitle ?? 'Untitled product'}
                          </span>
                          <span className="truncate font-mono text-sm">
                            {line.variantSku ?? 'No code'}
                          </span>
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{line.quantityRequired}</td>
                      {data.status === 'completed' ? (
                        <>
                          <td className="text-right tabular-nums">
                            {line.quantityConsumed === line.quantityRequired ? (
                              line.quantityConsumed
                            ) : (
                              // A difference between plan and reality is the
                              // number a production manager wants, so it is
                              // called out rather than shown as another figure.
                              <Badge color="info" variant="soft" size="sm">
                                {line.quantityConsumed}
                              </Badge>
                            )}
                          </td>
                          <td className="hidden text-right tabular-nums @md:table-cell">
                            {formatCents(Math.abs(line.costConsumedCents))}
                          </td>
                        </>
                      ) : (
                        <td className="hidden text-right tabular-nums @md:table-cell">
                          {line.scrapPercent > 0 ? `${String(line.scrapPercent)}%` : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </FormSection>

          {data.notes ? (
            <FormSection title="Notes">
              <Text className="text-sm whitespace-pre-line">{data.notes}</Text>
            </FormSection>
          ) : null}

          {data.status === 'cancelled' ? (
            <Alert color="neutral" variant="soft">
              <AlertContent>
                <AlertTitle>This run was called off</AlertTitle>
                <AlertDescription>
                  {data.cancelledReason ?? 'No reason was recorded.'} Nothing was consumed and any
                  hold was released.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────── */

export function AssemblyDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  if (id === 'new' || id === '') return <PlanRun ctx={ctx} />;
  return <ViewRun ctx={ctx} id={id} />;
}
