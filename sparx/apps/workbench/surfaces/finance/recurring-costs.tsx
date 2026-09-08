'use client';

// RECURRING COSTS — the bills that land whether or not anyone types them in.
//
// Rent, insurance, the software subscriptions, the van lease. They are the most
// predictable spend a business has and the most commonly missing from its
// numbers, because nobody wants to key the same figure in twelve times a year.
// A template here turns that into one decision.
//
// A TEMPLATE IS NOT A COST. It generates them. That distinction drives the whole
// surface: editing the amount changes what FUTURE occurrences will be, and never
// rewrites the ones already generated — last quarter's rent was what it was, and
// a raise applied retroactively would silently move a profit figure someone has
// already read. Deleting a template likewise leaves its history alone.
//
// "Generate now" exists because the worker runs on its own clock and an owner who
// has just entered rent starting in January wants this year's rows immediately.
// It is idempotent, so pressing it twice costs nothing.

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Heading,
  Input,
  NativeSelect,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { CalendarClock, Pencil, Play, Plus, Save, Trash2, X } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import {
  centsToInput,
  parseMoneyToCents,
  spendErrorMessage,
  useDeleteRecurring,
  useExpenseCategories,
  useGenerateRecurring,
  useRecurring,
  useSaveRecurring,
  useVendors,
  type RecurringExpense,
} from './spend-data';
import { cadenceLabel, formatCents, formatDay, kindColor } from './format';

const CADENCES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annual'] as const;

interface FormState {
  name: string;
  categoryId: string;
  vendorId: string;
  amount: string;
  cadence: string;
  dayOfMonth: string;
  startsOn: string;
  endsOn: string;
  autoGenerate: boolean;
  isActive: boolean;
  notes: string;
}

function emptyForm(): FormState {
  return {
    name: '',
    categoryId: '',
    vendorId: '',
    amount: '',
    cadence: 'monthly',
    dayOfMonth: '',
    startsOn: new Date().toISOString().slice(0, 10),
    endsOn: '',
    autoGenerate: true,
    isActive: true,
    notes: '',
  };
}

function formFrom(template: RecurringExpense): FormState {
  return {
    name: template.name,
    categoryId: template.categoryId,
    vendorId: template.vendorId ?? '',
    amount: centsToInput(template.amountCents),
    cadence: template.cadence,
    dayOfMonth: template.dayOfMonth === null ? '' : String(template.dayOfMonth),
    startsOn: template.startsOn.slice(0, 10),
    endsOn: template.endsOn ? template.endsOn.slice(0, 10) : '',
    autoGenerate: template.autoGenerate,
    isActive: template.isActive,
    notes: template.notes ?? '',
  };
}

/** Midnight UTC, matching how the server stores a schedule date — a local
 *  midnight would shift "the 1st" to the 31st for anyone west of UTC. */
function dateValue(value: string): string | null {
  return value === '' ? null : new Date(`${value}T00:00:00.000Z`).toISOString();
}

/* ── The editor ─────────────────────────────────────────────────────────────*/

function TemplateEditor({
  template,
  categories,
  vendors,
  onDone,
}: {
  template: RecurringExpense | null;
  categories: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  onDone: () => void;
}) {
  const toast = useToast();
  const save = useSaveRecurring(template?.id ?? null);
  const [form, setForm] = useState<FormState>(() => (template ? formFrom(template) : emptyForm()));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const amountCents = parseMoneyToCents(form.amount);
  const amountOk = amountCents !== null && amountCents > 0;
  const datesOk = form.endsOn === '' || form.endsOn >= form.startsOn;
  const canSave = form.name.trim() !== '' && form.categoryId !== '' && amountOk && datesOk;

  // Only monthly-and-longer cadences land on a day of the month; asking a weekly
  // template which date it falls on is a question with no answer.
  const usesDayOfMonth =
    form.cadence === 'monthly' || form.cadence === 'quarterly' || form.cadence === 'annual';

  const onSave = () => {
    if (!canSave || amountCents === null) return;
    const day = Number.parseInt(form.dayOfMonth, 10);
    save.mutate(
      {
        name: form.name.trim(),
        categoryId: form.categoryId,
        vendorId: form.vendorId === '' ? null : form.vendorId,
        amountCents,
        currency: 'USD',
        cadence: form.cadence,
        dayOfMonth: usesDayOfMonth && Number.isFinite(day) && day >= 1 && day <= 31 ? day : null,
        startsOn: dateValue(form.startsOn),
        endsOn: dateValue(form.endsOn),
        autoGenerate: form.autoGenerate,
        isActive: form.isActive,
        notes: form.notes.trim() === '' ? null : form.notes.trim(),
      },
      {
        onSuccess: () => {
          onDone();
          afterPaneChange(() => {
            toast.add({
              title: template ? `${form.name.trim()} saved` : `${form.name.trim()} added`,
              description: template
                ? 'Costs already generated keep the amount they were generated with.'
                : undefined,
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save that repeating cost',
            description: spendErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <FormSection
      title={template ? `Edit ${template.name}` : 'Add a repeating cost'}
      action={
        <Button
          size="sm"
          variant="ghost"
          color="neutral"
          shape="square"
          aria-label="Cancel"
          onClick={onDone}
        >
          <X className="size-4" aria-hidden />
        </Button>
      }
    >
      <div className="grid gap-3 @md:grid-cols-2">
        <Field className="@md:col-span-2">
          <FieldLabel required>What is it</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={form.name}
                placeholder="Workshop rent"
                onChange={(event) => {
                  set('name', event.target.value);
                }}
              />
            }
          />
        </Field>

        <Field>
          <FieldLabel required>Amount each time</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                inputMode="decimal"
                value={form.amount}
                placeholder="0.00"
                className="text-right tabular-nums"
                onChange={(event) => {
                  set('amount', event.target.value);
                }}
              />
            }
          />
          {form.amount.trim() !== '' && !amountOk ? (
            <FieldStatus status="error">Enter an amount greater than zero.</FieldStatus>
          ) : null}
        </Field>

        <Field>
          <FieldLabel required>How often</FieldLabel>
          <FieldControl
            render={
              <NativeSelect
                color="module"
                value={form.cadence}
                onChange={(event) => {
                  set('cadence', event.target.value);
                }}
              >
                {CADENCES.map((cadence) => (
                  <option key={cadence} value={cadence}>
                    {cadenceLabel(cadence)}
                  </option>
                ))}
              </NativeSelect>
            }
          />
        </Field>

        <Field>
          <FieldLabel required>Category</FieldLabel>
          <FieldControl
            render={
              <NativeSelect
                color="module"
                value={form.categoryId}
                onChange={(event) => {
                  set('categoryId', event.target.value);
                }}
              >
                <option value="">Choose a category…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </NativeSelect>
            }
          />
        </Field>

        <Field>
          <FieldLabel>Who you pay</FieldLabel>
          <FieldControl
            render={
              <NativeSelect
                color="module"
                value={form.vendorId}
                onChange={(event) => {
                  set('vendorId', event.target.value);
                }}
              >
                <option value="">Not recorded</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </NativeSelect>
            }
          />
        </Field>

        <Field>
          <FieldLabel required>Starting</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                type="date"
                value={form.startsOn}
                onChange={(event) => {
                  set('startsOn', event.target.value);
                }}
              />
            }
          />
          <FieldDescription>
            Set this in the past and use Catch up to fill in what you missed.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Ending</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                type="date"
                value={form.endsOn}
                onChange={(event) => {
                  set('endsOn', event.target.value);
                }}
              />
            }
          />
          {!datesOk ? (
            <FieldStatus status="error">The end date cannot be before the start.</FieldStatus>
          ) : (
            <FieldDescription>Leave blank for something with no end — like rent.</FieldDescription>
          )}
        </Field>

        {usesDayOfMonth ? (
          <Field>
            <FieldLabel>Day of the month</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  type="number"
                  min={1}
                  max={31}
                  inputMode="numeric"
                  value={form.dayOfMonth}
                  placeholder="1"
                  onChange={(event) => {
                    set('dayOfMonth', event.target.value);
                  }}
                />
              }
            />
            <FieldDescription>
              Pick 31 and a short month lands on its last day — the following month goes back to the
              31st.
            </FieldDescription>
          </Field>
        ) : null}

        <Field className="@md:col-span-2">
          <FieldLabel>Notes</FieldLabel>
          <FieldControl
            render={
              <Textarea
                color="module"
                rows={2}
                value={form.notes}
                placeholder="Contract reference, review date, who to call…"
                onChange={(event) => {
                  set('notes', event.target.value);
                }}
              />
            }
          />
        </Field>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <Switch
            id="recurring-auto-generate"
            color="module"
            checked={form.autoGenerate}
            onCheckedChange={(next) => {
              set('autoGenerate', next);
            }}
          />
          <label htmlFor="recurring-auto-generate" className="flex flex-col">
            <span className="font-medium">Record it for me</span>
            <span className="text-sm">
              A cost is created automatically each time this is due. Turn it off to keep the
              schedule as a reminder you enter by hand.
            </span>
          </label>
        </div>

        <div className="flex items-start gap-3">
          <Switch
            id="recurring-is-active"
            color="module"
            checked={form.isActive}
            onCheckedChange={(next) => {
              set('isActive', next);
            }}
          />
          <label htmlFor="recurring-is-active" className="flex flex-col">
            <span className="font-medium">Still running</span>
            <span className="text-sm">
              Switch off to stop it without deleting it. Everything it has already recorded stays.
            </span>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          color="module"
          disabled={!canSave}
          loading={save.isPending}
          onClick={onSave}
        >
          <Save className="size-4" aria-hidden />
          {template ? 'Save' : 'Add it'}
        </Button>
        <Button size="sm" variant="ghost" color="neutral" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </FormSection>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────────*/

export function RecurringCostsSurface() {
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useRecurring(true);
  const categories = useExpenseCategories();
  const vendors = useVendors();
  const generate = useGenerateRecurring();
  const remove = useDeleteRecurring();

  // Same reason as the job list: a bare `data ?? []` mints a new array each
  // render and defeats every useMemo downstream of it.
  const templates = useMemo(() => data ?? [], [data]);
  const kindById = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c.kind])),
    [categories.data]
  );
  const nameById = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c.name])),
    [categories.data]
  );

  /** What the active templates commit the business to in a year. The single most
   *  useful number on this screen and one nobody works out by hand. */
  const annualCents = useMemo(() => {
    const perYear: Record<string, number> = {
      weekly: 52,
      biweekly: 26,
      monthly: 12,
      quarterly: 4,
      annual: 1,
    };
    return templates
      .filter((template) => template.isActive)
      .reduce((sum, t) => sum + t.amountCents * (perYear[t.cadence] ?? 0), 0);
  }, [templates]);

  const runGenerate = () => {
    generate.mutate(undefined, {
      onSuccess: (result) => {
        afterPaneChange(() => {
          toast.add({
            title:
              result.generated === 0
                ? 'Nothing was due'
                : `${String(result.generated)} ${result.generated === 1 ? 'cost' : 'costs'} recorded`,
            description:
              result.generated === 0
                ? 'Every repeating cost is already up to date.'
                : 'They are in your spending list now, and counted against your profit.',
            type: 'success',
          });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not catch up',
          description: spendErrorMessage(error, 'Nothing was recorded.'),
          type: 'error',
        });
      },
    });
  };

  const onDelete = async (template: RecurringExpense) => {
    const ok = await confirm({
      title: `Delete the ${template.name} schedule?`,
      description:
        'This stops it repeating. Every cost it has already recorded stays exactly as it is — your history and past profit figures do not change.',
      confirmLabel: 'Delete the schedule',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(template.id, {
      onSuccess: () => {
        afterPaneChange(() => {
          toast.add({ title: `${template.name} schedule deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete that schedule',
          description: spendErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Repeating cost actions"
        controls={
          <>
            <Button
              size="sm"
              color="module"
              onClick={() => {
                setAdding(true);
                setEditing(null);
              }}
            >
              <Plus className="size-4" aria-hidden />
              Add a repeating cost
            </Button>
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              loading={generate.isPending}
              disabled={templates.length === 0}
              onClick={runGenerate}
            >
              <Play className="size-4" aria-hidden />
              Catch up now
            </Button>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            icon={<CalendarClock className="size-6" aria-hidden />}
            title="Could not load your repeating costs"
            description="The server could not be reached. Your schedules are unaffected."
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
        ) : isPending || !data ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {templates.length > 0 ? (
              <Card className="p-4">
                <Text className="text-sm">Committed each year</Text>
                <Heading level={2} className="mt-1 text-3xl font-semibold tabular-nums">
                  {formatCents(annualCents)}
                </Heading>
                <Text className="mt-1 text-sm">
                  What the schedules still running add up to over twelve months, before anything you
                  buy on the day.
                </Text>
              </Card>
            ) : null}

            {adding ? (
              <TemplateEditor
                template={null}
                categories={categories.data ?? []}
                vendors={vendors.data ?? []}
                onDone={() => {
                  setAdding(false);
                }}
              />
            ) : null}

            {templates.length === 0 && !adding ? (
              <Card>
                <EmptyState
                  icon={<CalendarClock className="size-6" aria-hidden />}
                  title="No repeating costs yet"
                  description="Rent, insurance, subscriptions, a lease — set each one up once and it is counted every month without anyone typing it in. This is usually the biggest chunk of spending a business forgets to record."
                  actions={
                    <Button
                      size="sm"
                      color="module"
                      onClick={() => {
                        setAdding(true);
                      }}
                    >
                      <Plus className="size-4" aria-hidden />
                      Add a repeating cost
                    </Button>
                  }
                />
              </Card>
            ) : null}

            {templates.map((template) =>
              editing === template.id ? (
                <TemplateEditor
                  key={template.id}
                  template={template}
                  categories={categories.data ?? []}
                  vendors={vendors.data ?? []}
                  onDone={() => {
                    setEditing(null);
                  }}
                />
              ) : (
                <Card key={template.id} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Text className="font-medium">{template.name}</Text>
                        {template.isActive ? null : (
                          <Badge color="neutral" variant="soft" size="sm">
                            Stopped
                          </Badge>
                        )}
                        {kindById.has(template.categoryId) ? (
                          <Badge
                            color={kindColor(kindById.get(template.categoryId)!)}
                            variant="soft"
                            size="sm"
                          >
                            {nameById.get(template.categoryId)}
                          </Badge>
                        ) : null}
                        {template.autoGenerate ? null : (
                          <Badge color="warning" variant="soft" size="sm">
                            You record it
                          </Badge>
                        )}
                      </div>
                      <Text className="text-sm">
                        {formatCents(template.amountCents, template.currency)} ·{' '}
                        {cadenceLabel(template.cadence).toLowerCase()}
                        {template.isActive && template.nextRunOn
                          ? ` · next on ${formatDay(template.nextRunOn)}`
                          : ''}
                        {template.endsOn ? ` · ends ${formatDay(template.endsOn)}` : ''}
                      </Text>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        color="neutral"
                        shape="square"
                        aria-label={`Edit ${template.name}`}
                        onClick={() => {
                          setEditing(template.id);
                          setAdding(false);
                        }}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        color="danger"
                        shape="square"
                        aria-label={`Delete the ${template.name} schedule`}
                        onClick={() => {
                          void onDelete(template);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>

                  {template.notes ? <Text className="text-sm">{template.notes}</Text> : null}
                </Card>
              )
            )}

            {templates.length > 0 && templates.every((t) => !t.autoGenerate) ? (
              <Alert color="info">
                <AlertContent>
                  <AlertDescription>
                    None of these record themselves, so nothing will appear in your spending until
                    you enter it. Turn on &ldquo;Record it for me&rdquo; on the ones you want
                    handled automatically.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
