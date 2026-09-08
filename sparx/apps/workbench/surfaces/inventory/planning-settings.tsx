'use client';

// PLANNING SETTINGS — the handful of things a business genuinely chooses.
//
// ── Why these four and nothing else ───────────────────────────────────────
//
// Everything else on the planning surfaces is MEASURED: how fast a line sells,
// how long a supplier actually takes, what a shelf is worth. These four cannot
// be measured because they are judgements about appetite — how often you are
// willing to disappoint someone, what capital costs you, how much cover counts
// as too much, and whether the overnight run may set a reorder level for you.
// The statistical knobs behind the classes (where the A/B cut falls, what
// counts as a steady coefficient of variation) are deliberately NOT here: they
// have defensible defaults and no owner has an opinion about them.
//
// ── A form, not a report ──────────────────────────────────────────────────
//
// So it does not use PlanningShell. It is the same shape as "How stock is
// valued", its sibling in this module: one centred column, grouped sections,
// an explicit Save in the toolbar, last-write-wins, and the leave-guard
// registered so closing the pane mid-edit asks first. Save-on-change was the
// first cut and was wrong — it made a mis-click a silent change to how the
// whole catalogue is planned.
//
// Tenant-wide, so there is no location picker: a control that looks per-location
// but is not would be worse than no control at all.

import { useEffect, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Field,
  FieldDescription,
  FieldLabel,
  Heading,
  NativeSelect,
  RadioGroup,
  RadioOption,
  Switch,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { Calculator, Save, SlidersHorizontal } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterCommit } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural, stockErrorMessage } from './data';
import {
  usePlanningPolicy,
  useRecomputePlanning,
  useUpdatePlanningPolicy,
  type ServiceLevel,
} from './planning-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

// Ordered cheapest-cushion first, so the list reads as a dial being turned up
// and the price of the last few points is visible as you go.
const SERVICE_LEVELS: { value: ServiceLevel; label: string; hint: string }[] = [
  {
    value: 'p50',
    label: 'About half the time',
    hint: 'Almost no spare stock. Cheapest to hold, and you will run out often.',
  },
  {
    value: 'p80',
    label: '4 times out of 5',
    hint: 'A light cushion. Fine for easy-to-reorder items.',
  },
  { value: 'p90', label: '9 times out of 10', hint: 'A sensible middle for most stock.' },
  {
    value: 'p95',
    label: '19 times out of 20',
    hint: 'The usual choice, and what you get if you never come here.',
  },
  {
    value: 'p99',
    label: '99 times out of 100',
    hint: 'Costs roughly 40% more spare stock than 19 out of 20, to save four disappointments in a hundred.',
  },
];

interface Form {
  serviceLevel: ServiceLevel;
  holdingCostRatePct: number;
  overstockCoverDays: number;
  deadStockDays: number;
  autoApplyReorderPoints: boolean;
}

export function PlanningSettingsSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const policy = usePlanningPolicy();
  const save = useUpdatePlanningPolicy();
  const recompute = useRecomputePlanning();

  const [form, setForm] = useState<Form | null>(null);
  const [baseline, setBaseline] = useState('');

  useEffect(() => {
    ctx.setTitle('Planning settings');
  }, [ctx]);

  // Seed once the record lands. Re-seeding on every refetch would throw away
  // whatever the user was in the middle of choosing.
  useEffect(() => {
    if (!policy.data || form !== null) return;
    const next: Form = {
      serviceLevel: policy.data.serviceLevel,
      holdingCostRatePct: policy.data.holdingCostRatePct,
      overstockCoverDays: policy.data.overstockCoverDays,
      deadStockDays: policy.data.deadStockDays,
      autoApplyReorderPoints: policy.data.autoApplyReorderPoints,
    };
    setForm(next);
    setBaseline(JSON.stringify(next));
  }, [policy.data, form]);

  const dirty = form !== null && JSON.stringify(form) !== baseline;
  useDirtySource(dirty, 'You have not saved your planning settings. Close anyway?');

  // Turning automation ON is the one change here that lets the system write to
  // something an operator owns, so it is called out at the moment it is chosen.
  const turningAutomationOn =
    form !== null && form.autoApplyReorderPoints && !policy.data?.autoApplyReorderPoints;

  const onSave = () => {
    if (!form) return;
    save.mutate(form, {
      onSuccess: (saved) => {
        const next: Form = {
          serviceLevel: saved.serviceLevel,
          holdingCostRatePct: saved.holdingCostRatePct,
          overstockCoverDays: saved.overstockCoverDays,
          deadStockDays: saved.deadStockDays,
          autoApplyReorderPoints: saved.autoApplyReorderPoints,
        };
        setForm(next);
        setBaseline(JSON.stringify(next));
        afterCommit(() => {
          toast.add({
            title: 'Saved',
            description:
              'Your figures are worked out this way from the next overnight run — or press “Work these out now”.',
            type: 'success',
          });
        });
      },
      onError: (error) => {
        afterCommit(() => {
          toast.add({
            title: 'Could not save that',
            description: stockErrorMessage(error, 'Nothing was changed. Please try again.'),
            type: 'error',
          });
        });
      },
    });
  };

  const onRecompute = () => {
    recompute.mutate(
      {},
      {
        onSuccess: (result) => {
          const failed = result.stages.filter((s) => !s.ok);
          afterCommit(() => {
            toast.add({
              title: failed.length === 0 ? 'Numbers brought up to date' : 'Finished with problems',
              description:
                failed.length === 0
                  ? `${plural(result.levelsPlanned, 'stock line', 'stock lines')} re-measured.`
                  : `${plural(failed.length, 'step', 'steps')} could not finish — those figures are from the last good run.`,
              type: failed.length === 0 ? 'success' : 'warning',
            });
          });
        },
        onError: (error) => {
          afterCommit(() => {
            toast.add({
              title: 'Could not work the numbers out',
              description: stockErrorMessage(error, 'Nothing was changed. Please try again.'),
              type: 'error',
            });
          });
        },
      }
    );
  };

  const body = () => {
    if (policy.isError) {
      return (
        <Alert color="danger" variant="soft" className="m-4">
          <AlertContent>
            <AlertTitle>Could not load these settings</AlertTitle>
            <AlertDescription>
              This is a problem reaching the server. Your settings are unaffected.
            </AlertDescription>
          </AlertContent>
        </Alert>
      );
    }
    if (!form) {
      return (
        <p className="p-4 text-base" role="status">
          Loading…
        </p>
      );
    }

    return (
      <div className={COLUMN}>
        <div className="flex flex-col gap-1">
          <Heading level={1} className="text-2xl font-semibold">
            How your stock is planned
          </Heading>
          <Text>
            Four judgements the figures cannot make for you. Everything else on the planning screens
            is measured from your own sales and your own deliveries.
          </Text>
        </div>

        {policy.data && !policy.data.configured ? (
          <Alert color="info">
            <AlertContent>
              <AlertTitle>You are on the standard settings</AlertTitle>
              <AlertDescription>
                Nobody has chosen here yet, so planning uses the figures most businesses land on
                anyway. They are sensible defaults, not placeholders — change one when you know your
                own answer is different.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <FormSection
          title="How often you want to be in stock"
          description="The higher you set this, the more spare stock is kept to absorb a busy week or a late delivery — and the more money sits on the shelf."
        >
          <RadioGroup
            color="module"
            value={form.serviceLevel}
            onValueChange={(value) => {
              setForm({ ...form, serviceLevel: value as ServiceLevel });
            }}
          >
            {SERVICE_LEVELS.map((option) => (
              <RadioOption key={option.value} value={option.value} className="items-start py-1">
                <span className="flex flex-col gap-0.5">
                  <span className="text-base font-medium">{option.label}</span>
                  <span className="text-sm">{option.hint}</span>
                </span>
              </RadioOption>
            ))}
          </RadioGroup>
        </FormSection>

        <FormSection
          title="What it costs you to keep stock"
          description="Storage, insurance, the money tied up, breakage and things going out of date, together, as a share of what the stock is worth each year."
        >
          <Field>
            <FieldLabel>Yearly carrying cost</FieldLabel>
            <NativeSelect
              color="module"
              className="max-w-44"
              aria-label="Yearly cost of keeping stock"
              value={String(form.holdingCostRatePct)}
              onChange={(event) => {
                setForm({ ...form, holdingCostRatePct: Number(event.target.value) });
              }}
            >
              {[10, 15, 20, 25, 30, 35, 40].map((pct) => (
                <option key={pct} value={pct}>
                  {pct}% a year
                </option>
              ))}
            </NativeSelect>
            <FieldDescription>
              The trade generally reckons about 25%. Every figure on “Cost to keep” follows this
              one.
            </FieldDescription>
          </Field>
        </FormSection>

        <FormSection
          title="When stock counts as too much, and when it counts as dead"
          description="Two different problems. Too much is stock that sells but that you hold far more of than you need; dead is anything at all of something that has stopped selling."
        >
          <div className="flex flex-wrap gap-6">
            <Field>
              <FieldLabel>Too much if cover is over</FieldLabel>
              <NativeSelect
                color="module"
                className="max-w-40"
                aria-label="Cover beyond which stock counts as too much"
                value={String(form.overstockCoverDays)}
                onChange={(event) => {
                  setForm({ ...form, overstockCoverDays: Number(event.target.value) });
                }}
              >
                {[60, 90, 120, 180, 270, 365].map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </NativeSelect>
              <FieldDescription>Only the excess counts, not the whole holding.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Dead if nothing has sold for</FieldLabel>
              <NativeSelect
                color="module"
                className="max-w-40"
                aria-label="Idle period beyond which stock counts as dead"
                value={String(form.deadStockDays)}
                onChange={(event) => {
                  setForm({ ...form, deadStockDays: Number(event.target.value) });
                }}
              >
                {[90, 120, 180, 270, 365].map((days) => (
                  <option key={days} value={days}>
                    {days} days
                  </option>
                ))}
              </NativeSelect>
              <FieldDescription>Every unit of it counts, not just the excess.</FieldDescription>
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Let reorder levels look after themselves"
          description="Off by default, and deliberately."
        >
          <Text className="text-sm">
            Any reorder level you have set by hand is left exactly as you set it, whatever this says
            — the worked-out figure is shown beside it so you can see the difference and take it if
            you want. Turning this on lets the overnight run set the level itself, but{' '}
            <strong>only</strong> for items that have never had one.
          </Text>
          <Field>
            <div className="flex items-center gap-3">
              <Switch
                color="module"
                checked={form.autoApplyReorderPoints}
                aria-label="Set reorder levels automatically for items that have none"
                onCheckedChange={(checked) => {
                  setForm({ ...form, autoApplyReorderPoints: checked });
                }}
              />
              <FieldLabel className="mb-0">
                Set reorder levels automatically for items that have none
              </FieldLabel>
            </div>
          </Field>
        </FormSection>

        {turningAutomationOn ? (
          <Alert color="warning">
            <AlertContent>
              <AlertTitle>From the moment you save, this can order differently</AlertTitle>
              <AlertDescription>
                Items with no reorder level will start getting one each night, worked out from how
                fast they sell and how long their supplier takes. Nothing you typed yourself is
                touched, and you can turn this off again at any time.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <FormSection
          title="When the numbers were last worked out"
          description="Planning reads your whole sales and delivery history, so it runs overnight rather than while you wait."
          action={
            <Button
              size="sm"
              variant="outline"
              color="module"
              className="shrink-0"
              loading={recompute.isPending}
              onClick={onRecompute}
            >
              <Calculator className="size-4" aria-hidden />
              Work these out now
            </Button>
          }
        >
          <Text className="text-sm">
            {policy.data?.lastSweepAt ? (
              <>
                Last run <Timestamp value={policy.data.lastSweepAt} format="relative" />. Changing a
                setting here takes effect on the next run — nothing is recalculated while you are
                reading it.
              </>
            ) : (
              <>
                It has never run, so every planning figure is absent rather than wrong. Work them
                out now, or wait for tonight.
              </>
            )}
          </Text>
        </FormSection>
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Planning settings actions"
        status={
          <span className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className="size-4" aria-hidden />
            <Text as="span" className="text-sm font-medium">
              Planning settings
            </Text>
          </span>
        }
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto shrink-0"
            disabled={!dirty}
            loading={save.isPending}
            onClick={onSave}
          >
            <Save className="size-4" aria-hidden />
            Save
          </Button>
        }
        controls={
          <>
            {policy.data ? (
              <Badge color={policy.data.configured ? 'module' : 'neutral'} variant="soft" size="sm">
                {policy.data.configured ? 'Your settings' : 'Standard settings'}
              </Badge>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            isFetching={policy.isFetching}
            updatedAt={policy.dataUpdatedAt}
            onRefresh={() => {
              void policy.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </div>
  );
}
