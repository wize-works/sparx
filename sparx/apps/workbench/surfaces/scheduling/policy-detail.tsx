'use client';

// ONE RULE SET — the deposit, cancellation and no-show terms a service applies.
//
// Create and edit are the SAME surface. One centred, capped column: there is a
// real form here but no running summary to justify a rail beside it.
//
// The money controls change shape with the choice above them — a "deposit" asks
// how much (a set amount or a share of the price); a cancellation fee asks the
// same in its own row. Only the controls that apply to the current choice are
// shown, so nobody sets a percentage on a policy that takes no deposit.

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Save, ShieldCheck, Trash2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  DEPOSIT_TYPES,
  REMINDER_OFFSETS,
  isNotFound,
  schedulingErrorMessage,
  useCreatePolicy,
  useDeletePolicy,
  usePolicy,
  useUpdatePolicy,
  type BookingPolicy,
  type DepositType,
  type FeeType,
  type PolicyInput,
} from './setup-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-2xl flex-col gap-4';

const DETAIL_KEY = 'scheduling.policies.detail';

type FeeMode = 'none' | 'fixed' | 'percent';

interface FeeDraft {
  mode: FeeMode;
  /** Dollars, for a fixed fee. */
  amount: string;
  /** 0–100, for a percentage fee. */
  percent: string;
}

interface Draft {
  name: string;
  depositType: DepositType;
  /** For a "deposit": a set amount, or a share of the price. */
  depositMode: 'amount' | 'percent';
  depositAmount: string;
  depositPercent: string;
  cancellationWindowHours: number;
  lateCancel: FeeDraft;
  noShow: FeeDraft;
  policyText: string;
  reminders: number[];
}

const BLANK: Draft = {
  name: '',
  depositType: 'none',
  depositMode: 'amount',
  depositAmount: '',
  depositPercent: '',
  cancellationWindowHours: 24,
  lateCancel: { mode: 'none', amount: '', percent: '' },
  noShow: { mode: 'none', amount: '', percent: '' },
  policyText: '',
  reminders: [1440, 120],
};

function dollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function centsToDollars(cents: number | null): string {
  return cents != null && cents > 0 ? (cents / 100).toFixed(2) : '';
}

function percentOrEmpty(value: number | null): string {
  return value != null ? String(value) : '';
}

function feeFrom(type: FeeType | null, value: number | null): FeeDraft {
  if (type === 'fixed') return { mode: 'fixed', amount: centsToDollars(value), percent: '' };
  if (type === 'percent') return { mode: 'percent', amount: '', percent: percentOrEmpty(value) };
  return { mode: 'none', amount: '', percent: '' };
}

function feePayload(fee: FeeDraft): { type: FeeType | null; value: number | null } {
  if (fee.mode === 'fixed') return { type: 'fixed', value: dollarsToCents(fee.amount) ?? 0 };
  if (fee.mode === 'percent') {
    const parsed = Number(fee.percent.trim());
    const value = Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
    return { type: 'percent', value };
  }
  return { type: null, value: null };
}

function draftFrom(policy: BookingPolicy): Draft {
  const hasPercent = policy.depositPercent != null;
  return {
    name: policy.name,
    depositType: policy.depositType,
    depositMode: hasPercent ? 'percent' : 'amount',
    depositAmount: centsToDollars(policy.depositAmountCents),
    depositPercent: percentOrEmpty(policy.depositPercent),
    cancellationWindowHours: policy.cancellationWindowHours,
    lateCancel: feeFrom(policy.lateCancelFeeType, policy.lateCancelFeeValue),
    noShow: feeFrom(policy.noShowFeeType, policy.noShowFeeValue),
    policyText: policy.policyText ?? '',
    reminders: [...policy.reminderOffsetsMin].sort((a, b) => b - a),
  };
}

function draftsEqual(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function intOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

/* ── A reusable fee row (late cancel / no-show) ─────────────────────────── */

function FeeRow({
  label,
  description,
  fee,
  onChange,
}: {
  label: string;
  description: string;
  fee: FeeDraft;
  onChange: (next: FeeDraft) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldControl
        render={
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              className="max-w-48"
              value={fee.mode}
              aria-label={label}
              onChange={(event) => {
                onChange({ ...fee, mode: event.target.value as FeeMode });
              }}
            >
              <option value="none">No charge</option>
              <option value="fixed">A set amount</option>
              <option value="percent">A share of the price</option>
            </NativeSelect>

            {fee.mode === 'fixed' ? (
              <Input
                color="module"
                type="number"
                min={0}
                step={0.01}
                className="max-w-32 tabular-nums"
                aria-label={`${label} — amount`}
                value={fee.amount}
                placeholder="0.00"
                onChange={(event) => {
                  onChange({ ...fee, amount: event.target.value });
                }}
              />
            ) : null}

            {fee.mode === 'percent' ? (
              <div className="flex items-center gap-1">
                <Input
                  color="module"
                  type="number"
                  min={0}
                  max={100}
                  className="max-w-24 tabular-nums"
                  aria-label={`${label} — percentage`}
                  value={fee.percent}
                  placeholder="50"
                  onChange={(event) => {
                    onChange({ ...fee, percent: event.target.value });
                  }}
                />
                <Text as="span" className="text-sm">
                  % of the price
                </Text>
              </div>
            ) : null}
          </div>
        }
      />
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
}

/* ── The shared form ────────────────────────────────────────────────────── */

function PolicyEditor({
  ctx,
  id,
  initial,
  existing,
}: {
  ctx: SurfaceContext;
  id: string;
  initial: Draft;
  existing: BookingPolicy | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = id === 'new';

  const create = useCreatePolicy();
  const update = useUpdatePolicy(id);
  const remove = useDeletePolicy(id);

  const [draft, setDraft] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    ctx.setTitle(isNew ? 'New rule set' : draft.name.trim() || 'Rule set');
  }, [ctx, isNew, draft.name]);

  const nameOk = draft.name.trim() !== '';
  const changed = useMemo(() => !draftsEqual(draft, initial), [draft, initial]);
  const busy = create.isPending || update.isPending;
  const canSave = nameOk && changed && !busy;

  useDirtySource(
    changed && !create.isSuccess,
    isNew
      ? 'This new rule set has not been saved yet. Close anyway?'
      : `${initial.name || 'This rule set'} has unsaved changes. Close anyway?`
  );

  const saveError =
    create.isError || update.isError
      ? schedulingErrorMessage(
          create.error ?? update.error,
          'Nothing was saved. Try again in a moment.'
        )
      : null;

  const takesDeposit = draft.depositType === 'deposit';

  const payload = (): PolicyInput => {
    const late = feePayload(draft.lateCancel);
    const noShow = feePayload(draft.noShow);
    return {
      name: draft.name.trim(),
      depositType: draft.depositType,
      depositAmountCents:
        takesDeposit && draft.depositMode === 'amount' ? dollarsToCents(draft.depositAmount) : null,
      depositPercent:
        takesDeposit && draft.depositMode === 'percent'
          ? Math.max(0, Math.min(100, Math.round(Number(draft.depositPercent.trim()) || 0)))
          : null,
      cancellationWindowHours: draft.cancellationWindowHours,
      lateCancelFeeType: late.type,
      lateCancelFeeValue: late.value,
      noShowFeeType: noShow.type,
      noShowFeeValue: noShow.value,
      policyText: draft.policyText.trim() === '' ? null : draft.policyText.trim(),
      reminderOffsetsMin: [...draft.reminders].sort((a, b) => b - a),
    };
  };

  const submit = () => {
    if (!canSave) return;
    const body = payload();
    if (isNew) {
      create.mutate(body, {
        onSuccess: (row) => {
          ctx.open(DETAIL_KEY, { id: row.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${body.name ?? 'Rule set'} added`, type: 'success' });
          });
        },
      });
      return;
    }
    update.mutate(body, {
      onSuccess: () => {
        toast.add({ title: 'Rule set saved', type: 'success' });
      },
    });
  };

  const onRemove = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: `Delete ${existing.name}?`,
      description:
        'Any service using this rule set will fall back to having no deposit or cancellation terms. Bookings already made keep the terms they were made under. This cannot be undone.',
      confirmLabel: 'Delete this rule set',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${existing.name} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this rule set',
          description: schedulingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const toggleReminder = (minutes: number, on: boolean) => {
    set(
      'reminders',
      on ? [...draft.reminders, minutes] : draft.reminders.filter((m) => m !== minutes)
    );
  };

  const depositHint = DEPOSIT_TYPES.find((d) => d.value === draft.depositType)?.hint;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={isNew ? 'New rule set actions' : 'Rule set actions'}
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            disabled={!canSave}
            loading={busy}
            onClick={submit}
          >
            <Save className="size-4" aria-hidden />
            {isNew ? 'Create rule set' : 'Save'}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {existing ? (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="flex min-w-0 items-center gap-2 text-2xl font-semibold">
                <ShieldCheck className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{existing.name}</span>
              </Heading>
            </div>
          ) : null}

          <SaveFailure title="Could not save this rule set" message={saveError} />

          <FormSection
            title={isNew ? 'New rule set' : 'Name'}
            description={
              isNew
                ? 'Name this set of rules so you can pick it out when you attach it to a service.'
                : undefined
            }
          >
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.name}
                    placeholder="Standard terms"
                    onChange={(event) => {
                      set('name', event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>Just for you — customers never see this name.</FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="Deposit"
            description="What, if anything, a customer pays when they book."
          >
            <Field>
              <FieldLabel>When someone books</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    value={draft.depositType}
                    aria-label="Deposit"
                    onChange={(event) => {
                      set('depositType', event.target.value as DepositType);
                    }}
                  >
                    {DEPOSIT_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                }
              />
              {depositHint ? <FieldDescription>{depositHint}</FieldDescription> : null}
            </Field>

            {takesDeposit ? (
              <Field>
                <FieldLabel>How much of a deposit</FieldLabel>
                <FieldControl
                  render={
                    <div className="flex flex-wrap items-center gap-2">
                      <NativeSelect
                        className="max-w-48"
                        value={draft.depositMode}
                        aria-label="How the deposit is worked out"
                        onChange={(event) => {
                          set('depositMode', event.target.value as 'amount' | 'percent');
                        }}
                      >
                        <option value="amount">A set amount</option>
                        <option value="percent">A share of the price</option>
                      </NativeSelect>

                      {draft.depositMode === 'amount' ? (
                        <Input
                          color="module"
                          type="number"
                          min={0}
                          step={0.01}
                          className="max-w-32 tabular-nums"
                          aria-label="Deposit amount"
                          value={draft.depositAmount}
                          placeholder="0.00"
                          onChange={(event) => {
                            set('depositAmount', event.target.value);
                          }}
                        />
                      ) : (
                        <div className="flex items-center gap-1">
                          <Input
                            color="module"
                            type="number"
                            min={0}
                            max={100}
                            className="max-w-24 tabular-nums"
                            aria-label="Deposit percentage"
                            value={draft.depositPercent}
                            placeholder="25"
                            onChange={(event) => {
                              set('depositPercent', event.target.value);
                            }}
                          />
                          <Text as="span" className="text-sm">
                            % of the price
                          </Text>
                        </div>
                      )}
                    </div>
                  }
                />
                <FieldDescription>Paid at booking; the rest is due on the day.</FieldDescription>
              </Field>
            ) : null}
          </FormSection>

          <FormSection
            title="Cancelling & missed bookings"
            description="How much notice you ask for, and what happens if a customer cancels late or does not turn up."
          >
            <Field>
              <FieldLabel>Notice needed to cancel free (hours)</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    type="number"
                    min={0}
                    className="max-w-32 tabular-nums"
                    value={String(draft.cancellationWindowHours)}
                    onChange={(event) => {
                      set('cancellationWindowHours', intOr(Number(event.target.value), 24));
                    }}
                  />
                }
              />
              <FieldDescription>
                Cancel more than this many hours ahead and there is no charge. Set to 0 to allow
                free cancellation any time.
              </FieldDescription>
            </Field>

            <FeeRow
              label="If they cancel too late"
              description="Charged when a customer cancels inside the notice window above."
              fee={draft.lateCancel}
              onChange={(next) => {
                set('lateCancel', next);
              }}
            />

            <FeeRow
              label="If they do not turn up"
              description="Charged when a customer misses the booking without cancelling."
              fee={draft.noShow}
              onChange={(next) => {
                set('noShow', next);
              }}
            />
          </FormSection>

          <FormSection
            title="Reminders"
            description="When to remind a customer about their booking, before it happens."
          >
            <div className="flex flex-col gap-3">
              {REMINDER_OFFSETS.map((offset) => (
                <label key={offset.minutes} className="flex items-center gap-3">
                  <Checkbox
                    color="module"
                    checked={draft.reminders.includes(offset.minutes)}
                    aria-label={offset.label}
                    onChange={(event) => {
                      toggleReminder(offset.minutes, event.target.checked);
                    }}
                  />
                  <Text as="span">{offset.label}</Text>
                </label>
              ))}
            </div>
          </FormSection>

          <FormSection
            title="The terms customers agree to"
            description="Shown at booking and kept as a record of what the customer accepted. Write it in plain words."
          >
            <Field>
              <FieldLabel>Terms (optional)</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={4}
                    value={draft.policyText}
                    placeholder="Please give at least 24 hours’ notice to cancel or reschedule. Missed bookings may be charged in full."
                    onChange={(event) => {
                      set('policyText', event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </FormSection>

          {existing ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Text className="text-sm">
                Deleting this rule set leaves any service that used it with no deposit or
                cancellation terms.
              </Text>
              <Button
                size="sm"
                variant="outline"
                color="danger"
                disabled={remove.isPending}
                onClick={() => {
                  void onRemove();
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                {remove.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────── */

export function PolicyDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const isNew = id === 'new';
  const policy = usePolicy(id);

  if (isNew) {
    return <PolicyEditor ctx={ctx} id="new" initial={BLANK} existing={null} />;
  }

  if (policy.isError) {
    const gone = isNotFound(policy.error);
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          reason={gone ? 'missing' : 'unreachable'}
          title={gone ? 'This rule set no longer exists' : 'Could not load this rule set'}
          description={
            gone
              ? 'It has been deleted. Any service that used it now has no deposit or cancellation terms.'
              : 'This is a problem reaching the server. Nothing about the rule set has changed.'
          }
          onRetry={() => {
            void policy.refetch();
          }}
        />
      </div>
    );
  }

  if (policy.isPending || !policy.data) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <PolicyEditor
      key={policy.data.id}
      ctx={ctx}
      id={id}
      initial={draftFrom(policy.data)}
      existing={policy.data}
    />
  );
}
