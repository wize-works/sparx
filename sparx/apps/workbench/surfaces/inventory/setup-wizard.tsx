'use client';

// THE FIRST THIRTY MINUTES (docs/146 Phase 11.1).
//
// Five steps: where you keep stock, bring in what you have, say what your
// columns mean, count what is actually there, decide when to be told.
//
// ── Why this screen shows a clock ────────────────────────────────────────
//
// docs/146 promises setup inside half an hour. A promise nobody measures is a
// slogan, so this measures — and shows the measurement to the person it was made
// to, which is the only version of that promise anyone can check.
//
// Two numbers, not one. Hands-on time excludes any gap longer than a sitting,
// because a person who starts setup, serves a customer and comes back after
// lunch has not spent ninety minutes on setup — and silently discarding those
// ninety minutes without saying so would be the dishonest version of the same
// fix. So both are shown: time at the screen, and how many visits it took.
//
// Before anything has happened there is no measurement, and the screen says
// "not measured yet" rather than "0 minutes". A setup nobody has started has not
// taken no time.
//
// ── Why each step shows the world as well as the tick ────────────────────
//
// A checklist that only knows what it was told is a checklist that lies. Someone
// who made their locations from the locations screen should not be asked to do
// it again, and someone who ticked a step and then deleted what it produced
// should not be told they are finished. Where the record and the account
// disagree the screen shows BOTH — "you marked this done, and there are no
// locations" is the sentence that helps.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Heading,
  Progress,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Check, CircleDashed, SkipForward, Undo2 } from 'lucide-react';
import { FormSection } from '../../components/form-section';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterCommit } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural, stockErrorMessage } from './data';
import {
  formatDuration,
  useCompleteSetupStep,
  useSetupProgress,
  type SetupStepKey,
  type SetupStepView,
} from './onboarding-data';

/** Where each step's work actually happens. The wizard does not reimplement the
 *  locations screen or the importer — it sends people to the real ones, which is
 *  what stops setup and the rest of the app from drifting into two products. */
const STEP_SURFACE: Record<SetupStepKey, { key: string; label: string }> = {
  locations: { key: 'inventory.warehouses.list', label: 'Open locations' },
  import: { key: 'inventory.stock.import', label: 'Open the importer' },
  mapping: { key: 'inventory.stock.import', label: 'Open the importer' },
  opening_balance: { key: 'inventory.counts.list', label: 'Open counts' },
  alerts: { key: 'inventory.stock.grid', label: 'Open the stock grid' },
};

function StepRow({
  step,
  index,
  isCurrent,
  onOpen,
  onComplete,
  onSkip,
  onReopen,
  busy,
}: {
  step: SetupStepView;
  index: number;
  isCurrent: boolean;
  onOpen: () => void;
  onComplete: () => void;
  onSkip: () => void;
  onReopen: () => void;
  busy: boolean;
}) {
  const done = step.completedAt !== null;
  const skipped = step.skippedAt !== null;

  return (
    <div
      className={`border-base-300 rounded-box flex flex-col gap-3 border p-4 ${
        isCurrent ? 'bg-module bg-soft' : 'bg-base-100'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">
          {done ? (
            <Check className="text-success size-5" aria-label="Done" />
          ) : skipped ? (
            <SkipForward className="text-warning size-5" aria-label="Skipped" />
          ) : (
            <CircleDashed className="text-module size-5" aria-label="Still to do" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level={3} className="text-base font-semibold">
              {step.title}
            </Heading>
            {done ? (
              <Badge color="success" variant="soft" size="sm">
                Done
              </Badge>
            ) : skipped ? (
              <Badge color="warning" variant="soft" size="sm">
                Skipped
              </Badge>
            ) : isCurrent ? (
              <Badge color="module" size="sm">
                Next
              </Badge>
            ) : null}
          </div>
          <Text>{step.summary}</Text>
          {!done && !skipped ? <Text className="text-sm">{step.why}</Text> : null}
          {skipped && step.skipCost ? <Text className="text-sm">{step.skipCost}</Text> : null}
          {step.discrepancy ? (
            <Alert color="warning" className="mt-1">
              <AlertContent>
                <AlertDescription>{step.discrepancy}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}
        </div>
        <Text className="text-2xl font-semibold tabular-nums">{index + 1}</Text>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button color="module" size="sm" onClick={onOpen}>
          {STEP_SURFACE[step.key].label}
        </Button>
        {done || skipped ? (
          <Button color="neutral" variant="outline" size="sm" disabled={busy} onClick={onReopen}>
            <Undo2 className="size-4" aria-hidden />
            Put it back
          </Button>
        ) : (
          <>
            <Button
              color="success"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onComplete}
            >
              <Check className="size-4" aria-hidden />
              Mark it done
            </Button>
            {step.skippable ? (
              <Button color="neutral" variant="ghost" size="sm" disabled={busy} onClick={onSkip}>
                Skip for now
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function InventorySetupSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const setup = useSetupProgress();
  const step = useCompleteSetupStep();

  const data = setup.data;
  const steps = data?.stepViews ?? [];
  const total = steps.length || 5;
  const settled = (data?.completedCount ?? 0) + (data?.skippedCount ?? 0);

  const handsOn = formatDuration(data?.timing.handsOnMs ?? null);
  const target = formatDuration(data?.timing.targetMs ?? null);

  const act = (key: SetupStepKey, action: 'complete' | 'skip' | 'reopen'): void => {
    step.mutate(
      { step: key, action },
      {
        onError: (error) => {
          afterCommit(() => {
            toast.add({
              title: 'Could not record that',
              description: stockErrorMessage(error, 'Nothing was changed.'),
              type: 'error',
            });
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Setup controls"
        refresh={
          <RefreshButton
            isFetching={setup.isFetching}
            updatedAt={setup.data ? setup.dataUpdatedAt : undefined}
            onRefresh={() => {
              void setup.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <FormSection
            title="Getting your stock into sparx"
            description="Five steps. You can do them in any order, and you can come back."
          >
            <Progress
              color="module"
              value={settled}
              max={total}
              aria-label={`${settled} of ${total} steps settled`}
            />
            <div className="grid grid-cols-1 gap-4 @md:grid-cols-3">
              <div className="flex flex-col">
                <Text className="text-2xl font-semibold tabular-nums">
                  {settled} of {total}
                </Text>
                <Text className="text-sm">Steps done or deliberately skipped</Text>
              </div>
              <div className="flex flex-col">
                {/* "Not measured yet" and never "0 minutes" — a setup nobody has
                    started has not taken no time. */}
                <Text className="text-2xl font-semibold">{handsOn ?? 'Not measured yet'}</Text>
                <Text className="text-sm">
                  Time at the screen
                  {data && data.timing.sittings > 1
                    ? `, across ${plural(data.timing.sittings, 'visit', 'visits')}`
                    : ''}
                </Text>
              </div>
              <div className="flex flex-col">
                <Text className="text-2xl font-semibold">{target ?? '30 minutes'}</Text>
                <Text className="text-sm">
                  What we aim for. {data?.timing.withinTarget === true ? 'You beat it.' : null}
                  {data?.timing.withinTarget === false
                    ? 'This one took longer — tell us where it dragged.'
                    : null}
                </Text>
              </div>
            </div>

            {data?.isComplete ? (
              <Alert color="success" variant="soft">
                <AlertContent>
                  <AlertTitle>Your stock is set up</AlertTitle>
                  <AlertDescription>
                    Every step is settled.{' '}
                    {data.skippedCount > 0
                      ? `${plural(data.skippedCount, 'step was', 'steps were')} skipped — you can come back to ${data.skippedCount === 1 ? 'it' : 'them'} at any point.`
                      : 'Nothing was skipped.'}
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
          </FormSection>

          <div className="flex flex-col gap-3">
            {steps.map((view, index) => (
              <StepRow
                key={view.key}
                step={view}
                index={index}
                isCurrent={data?.currentStep === view.key}
                busy={step.isPending}
                onOpen={() => {
                  ctx.open(STEP_SURFACE[view.key].key, {}, { target: 'tab' });
                }}
                onComplete={() => {
                  act(view.key, 'complete');
                }}
                onSkip={() => {
                  act(view.key, 'skip');
                }}
                onReopen={() => {
                  act(view.key, 'reopen');
                }}
              />
            ))}
          </div>

          <FormSection
            title="What sparx can already see"
            description="Counted from your account, not from what has been ticked off."
          >
            <div className="grid grid-cols-2 gap-3 @md:grid-cols-3">
              <Figure label="Locations" value={data?.readiness.locations} />
              <Figure label="Items" value={data?.readiness.items} />
              <Figure label="Stocked positions" value={data?.readiness.stockedPositions} />
              <Figure label="Files imported" value={data?.readiness.importsApplied} />
              <Figure label="Opening counts posted" value={data?.readiness.openingCounts} />
              <Figure
                label="Items with a low-stock alert"
                value={data?.readiness.levelsWithAlerts}
              />
            </div>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex flex-col">
      {/* Undefined is "not loaded", zero is "none" — an em dash for the first is
          what stops a loading screen from reporting an empty business. */}
      <Text className="text-2xl font-semibold tabular-nums">
        {value === undefined ? '—' : value.toLocaleString()}
      </Text>
      <Text className="text-sm">{label}</Text>
    </div>
  );
}
