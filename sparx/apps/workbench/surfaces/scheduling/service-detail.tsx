'use client';

// ONE SERVICE — set it up, change it, switch it off, or remove it.
//
// Create and edit are the SAME surface. A new service and an existing one are the
// same object at two ages, and the form is identical either way — so this is one
// pane in two states: `{id:'new'}` renders a blank draft, `{id}` renders the same
// fields hydrated. Splitting them is how a field ends up owned by two components.
//
// Not EditorLayout: there is no running summary to put beside the fields, so a
// summary rail would float half-empty. One centred, capped column instead.
//
// Removing a service is rare and hard to undo, so it sits at the bottom under a
// divider — a quiet row after the work, never a card competing with the fields.

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
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
import { Briefcase, Plus, Save, Trash2, X } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  ASSIGNMENT_STRATEGIES,
  BOOKING_TYPES,
  RESOURCE_KINDS,
  bookingTypeLabel,
  isNotFound,
  schedulingErrorMessage,
  serviceState,
  useCreateService,
  useDeleteService,
  usePolicies,
  useService,
  useUpdateService,
  type AssignmentStrategy,
  type BookingType,
  type ResourceKind,
  type ResourceRequirement,
  type SchedulingService,
} from './setup-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const DETAIL_KEY = 'scheduling.services.detail';

/** The currencies offered, lowercase to match the 3-char ISO the service stores. */
const CURRENCIES = ['usd', 'cad', 'eur', 'gbp', 'aud', 'nzd', 'jpy'] as const;

interface Draft {
  name: string;
  description: string;
  bookingType: BookingType;
  durationMinutes: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  slotIntervalMin: number;
  price: string;
  currency: string;
  capacity: number;
  policyId: string;
  assignmentStrategy: AssignmentStrategy;
  requirements: ResourceRequirement[];
  minLeadMinutes: number;
  maxAdvanceDays: number;
  bookableOnline: boolean;
  requiresApproval: boolean;
  requiresAsset: boolean;
  isActive: boolean;
}

const BLANK: Draft = {
  name: '',
  description: '',
  bookingType: 'appointment',
  durationMinutes: 60,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  slotIntervalMin: 15,
  price: '',
  currency: 'usd',
  capacity: 1,
  policyId: '',
  assignmentStrategy: 'any_available',
  requirements: [],
  minLeadMinutes: 0,
  maxAdvanceDays: 365,
  bookableOnline: true,
  requiresApproval: false,
  requiresAsset: false,
  isActive: true,
};

function centsToPrice(cents: number): string {
  return cents > 0 ? (cents / 100).toFixed(2) : '';
}

/** A typed price → integer cents. Empty or unparseable reads as free (0). */
function priceToCents(value: string): number {
  const trimmed = value.trim();
  if (trimmed === '') return 0;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function draftFrom(service: SchedulingService): Draft {
  return {
    name: service.name,
    description: service.description ?? '',
    bookingType: service.bookingType,
    durationMinutes: service.durationMinutes,
    bufferBeforeMin: service.bufferBeforeMin,
    bufferAfterMin: service.bufferAfterMin,
    slotIntervalMin: service.slotIntervalMin,
    price: centsToPrice(service.priceCents),
    currency: service.currency,
    capacity: service.capacity,
    policyId: service.policyId ?? '',
    assignmentStrategy: service.assignmentStrategy,
    requirements: service.resourceRequirements.map((requirement) => ({ ...requirement })),
    minLeadMinutes: service.minLeadMinutes,
    maxAdvanceDays: service.maxAdvanceDays,
    bookableOnline: service.bookableOnline,
    requiresApproval: service.requiresApproval,
    requiresAsset: service.requiresAsset,
    isActive: service.isActive,
  };
}

/** A whole-object comparison — the requirements are an array, so a field-by-field
 *  check would miss a reorder or a tag edit. */
function draftsEqual(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A non-negative integer from a number input, falling back when it is cleared. */
function intOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

/* ── The shared form ────────────────────────────────────────────────────── */

function ServiceEditor({
  ctx,
  id,
  initial,
  existing,
}: {
  ctx: SurfaceContext;
  id: string;
  initial: Draft;
  existing: SchedulingService | null;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = id === 'new';

  const create = useCreateService();
  const update = useUpdateService(id);
  const remove = useDeleteService(id);
  const policies = usePolicies({ take: 250, skip: 0 });

  const [draft, setDraft] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    ctx.setTitle(isNew ? 'New service' : draft.name.trim() || 'Service');
  }, [ctx, isNew, draft.name]);

  const nameOk = draft.name.trim() !== '';
  const durationOk = draft.durationMinutes >= 1;
  const changed = useMemo(() => !draftsEqual(draft, initial), [draft, initial]);
  const busy = create.isPending || update.isPending;
  const canSave = nameOk && durationOk && changed && !busy;

  useDirtySource(
    changed && !create.isSuccess,
    isNew
      ? 'This new service has not been saved yet. Close anyway?'
      : `${initial.name || 'This service'} has unsaved changes. Close anyway?`
  );

  const saveError =
    create.isError || update.isError
      ? schedulingErrorMessage(
          create.error ?? update.error,
          'Nothing was saved. Try again in a moment.'
        )
      : null;

  /** The full object every write sends — the create route fills defaults, and the
   *  edit route replaces the whole service, so sending it whole keeps the two
   *  paths identical rather than diffing. */
  const payload = () => ({
    name: draft.name.trim(),
    description: draft.description.trim() === '' ? null : draft.description.trim(),
    bookingType: draft.bookingType,
    durationMinutes: draft.durationMinutes,
    bufferBeforeMin: draft.bufferBeforeMin,
    bufferAfterMin: draft.bufferAfterMin,
    slotIntervalMin: Math.max(1, draft.slotIntervalMin),
    priceCents: priceToCents(draft.price),
    currency: draft.currency,
    capacity: draft.bookingType === 'class' ? Math.max(1, draft.capacity) : 1,
    policyId: draft.policyId === '' ? null : draft.policyId,
    assignmentStrategy: draft.assignmentStrategy,
    resourceRequirements: draft.requirements.map((requirement) => ({
      role: requirement.role.trim(),
      kind: requirement.kind,
      skillTags: requirement.skillTags.map((tag) => tag.trim()).filter(Boolean),
      count: Math.max(1, requirement.count),
    })),
    minLeadMinutes: draft.minLeadMinutes,
    maxAdvanceDays: draft.maxAdvanceDays,
    bookableOnline: draft.bookableOnline,
    requiresApproval: draft.requiresApproval,
    requiresAsset: draft.requiresAsset,
    isActive: draft.isActive,
  });

  const submit = () => {
    if (!canSave) return;
    // A requirement with no role name can't be matched — drop the empties rather
    // than let the server reject the whole save.
    const body = payload();
    body.resourceRequirements = body.resourceRequirements.filter((r) => r.role !== '');

    if (isNew) {
      create.mutate(body, {
        onSuccess: (row) => {
          ctx.open(DETAIL_KEY, { id: row.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${body.name} added`, type: 'success' });
          });
        },
      });
      return;
    }

    update.mutate(body, {
      onSuccess: () => {
        toast.add({ title: 'Service saved', type: 'success' });
      },
    });
  };

  const onRemove = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: `Remove ${existing.name}?`,
      description:
        'This takes the service off your booking page and out of this list. Bookings already made against it are kept. This cannot be undone — you would have to set it up again.',
      confirmLabel: 'Remove this service',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${existing.name} removed`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove this service',
          description: schedulingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const addRequirement = () => {
    set('requirements', [
      ...draft.requirements,
      { role: '', kind: 'staff', skillTags: [], count: 1 },
    ]);
  };
  const updateRequirement = (index: number, patch: Partial<ResourceRequirement>) => {
    set(
      'requirements',
      draft.requirements.map((requirement, i) =>
        i === index ? { ...requirement, ...patch } : requirement
      )
    );
  };
  const removeRequirement = (index: number) => {
    set(
      'requirements',
      draft.requirements.filter((_, i) => i !== index)
    );
  };

  const state = existing ? serviceState(existing) : null;
  const typeHint = BOOKING_TYPES.find((t) => t.value === draft.bookingType)?.hint;
  const strategyHint = ASSIGNMENT_STRATEGIES.find(
    (s) => s.value === draft.assignmentStrategy
  )?.hint;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={isNew ? 'New service actions' : 'Service actions'}
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
            {isNew ? 'Create service' : 'Save'}
          </Button>
        }
        controls={
          <>
            {state ? (
              <Badge color={state.tone} variant="soft" size="sm">
                {state.label}
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {existing ? (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="flex min-w-0 items-center gap-2 text-2xl font-semibold">
                <Briefcase className="size-5 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{existing.name}</span>
              </Heading>
              <Text className="text-sm">{bookingTypeLabel(existing.bookingType)}</Text>
            </div>
          ) : null}

          <SaveFailure title="Could not save this service" message={saveError} />

          <FormSection
            title={isNew ? 'New service' : 'What it is'}
            description={
              isNew
                ? 'Give the service a name a customer will recognise, and say what kind of booking it is.'
                : undefined
            }
          >
            <Field>
              <FieldLabel>Service name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.name}
                    placeholder="Full color & cut"
                    onChange={(event) => {
                      set('name', event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>What a customer sees when they book.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>What kind of booking</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    value={draft.bookingType}
                    aria-label="What kind of booking"
                    onChange={(event) => {
                      set('bookingType', event.target.value as BookingType);
                    }}
                  >
                    {BOOKING_TYPES.map((kind) => (
                      <option key={kind.value} value={kind.value}>
                        {kind.label}
                      </option>
                    ))}
                  </NativeSelect>
                }
              />
              {typeHint ? <FieldDescription>{typeHint}</FieldDescription> : null}
            </Field>

            <Field>
              <FieldLabel>Description (optional)</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={3}
                    value={draft.description}
                    placeholder="What is included, what to bring, anything a customer should know."
                    onChange={(event) => {
                      set('description', event.target.value);
                    }}
                  />
                }
              />
            </Field>

            {draft.bookingType === 'class' ? (
              <Field>
                <FieldLabel>How many people can book each session</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={1}
                      className="max-w-32 tabular-nums"
                      value={String(draft.capacity)}
                      onChange={(event) => {
                        set('capacity', intOr(Number(event.target.value), 1) || 1);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  The most people who can join one session — the class fills up at this number.
                </FieldDescription>
              </Field>
            ) : null}
          </FormSection>

          <FormSection
            title="How long it takes"
            description="How long the booking lasts, and any gap you need before or after it."
          >
            <div className="grid gap-4 @md:grid-cols-2">
              <Field>
                <FieldLabel>Length (minutes)</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color={durationOk ? 'module' : 'error'}
                      type="number"
                      min={1}
                      className="max-w-32 tabular-nums"
                      value={String(draft.durationMinutes)}
                      onChange={(event) => {
                        set('durationMinutes', intOr(Number(event.target.value), 0));
                      }}
                    />
                  }
                />
                <FieldDescription>How long the booking itself runs.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Offer start times every (minutes)</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={1}
                      className="max-w-32 tabular-nums"
                      value={String(draft.slotIntervalMin)}
                      onChange={(event) => {
                        set('slotIntervalMin', intOr(Number(event.target.value), 15) || 15);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  How far apart the bookable slots sit — every 15 minutes, on the hour, and so on.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Gap before (minutes)</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={0}
                      className="max-w-32 tabular-nums"
                      value={String(draft.bufferBeforeMin)}
                      onChange={(event) => {
                        set('bufferBeforeMin', intOr(Number(event.target.value), 0));
                      }}
                    />
                  }
                />
                <FieldDescription>Time to set up, kept free before the booking.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Gap after (minutes)</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={0}
                      className="max-w-32 tabular-nums"
                      value={String(draft.bufferAfterMin)}
                      onChange={(event) => {
                        set('bufferAfterMin', intOr(Number(event.target.value), 0));
                      }}
                    />
                  }
                />
                <FieldDescription>Time to tidy up, kept free after the booking.</FieldDescription>
              </Field>
            </div>
          </FormSection>

          <FormSection
            title="What it costs"
            description="The price a customer pays, and which deposit rules apply."
          >
            <div className="grid gap-4 @md:grid-cols-2">
              <Field>
                <FieldLabel>Price</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={0}
                      step={0.01}
                      className="max-w-40 tabular-nums"
                      value={draft.price}
                      placeholder="0.00"
                      onChange={(event) => {
                        set('price', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Leave blank for a free booking.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Currency</FieldLabel>
                <FieldControl
                  render={
                    <NativeSelect
                      className="max-w-32"
                      value={draft.currency}
                      aria-label="Currency"
                      onChange={(event) => {
                        set('currency', event.target.value);
                      }}
                    >
                      {CURRENCIES.map((code) => (
                        <option key={code} value={code}>
                          {code.toUpperCase()}
                        </option>
                      ))}
                    </NativeSelect>
                  }
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>Booking rules</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    value={draft.policyId}
                    aria-label="Booking rules"
                    disabled={policies.isPending}
                    onChange={(event) => {
                      set('policyId', event.target.value);
                    }}
                  >
                    <option value="">No deposit or cancellation rules</option>
                    {(policies.data?.items ?? []).map((policy) => (
                      <option key={policy.id} value={policy.id}>
                        {policy.name}
                      </option>
                    ))}
                  </NativeSelect>
                }
              />
              <FieldDescription>
                The deposit and cancellation terms a customer agrees to when booking this service.
                Set these up under Booking rules.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="Who or what it needs"
            description="What a booking uses up — a member of staff, a room, a machine. Two bookings can never claim the same one at the same time. Leave this empty if a booking needs nothing set aside."
          >
            {draft.requirements.length > 0 ? (
              <Field>
                <FieldLabel>When more than one is needed</FieldLabel>
                <FieldControl
                  render={
                    <NativeSelect
                      value={draft.assignmentStrategy}
                      aria-label="How resources are picked"
                      onChange={(event) => {
                        set('assignmentStrategy', event.target.value as AssignmentStrategy);
                      }}
                    >
                      {ASSIGNMENT_STRATEGIES.map((strategy) => (
                        <option key={strategy.value} value={strategy.value}>
                          {strategy.label}
                        </option>
                      ))}
                    </NativeSelect>
                  }
                />
                {strategyHint ? <FieldDescription>{strategyHint}</FieldDescription> : null}
              </Field>
            ) : null}

            <div className="flex flex-col gap-3">
              {draft.requirements.map((requirement, index) => (
                <div
                  key={index}
                  className="border-base-300 flex flex-col gap-3 rounded-lg border p-3 @md:flex-row @md:items-end"
                >
                  <Field className="min-w-0 flex-1">
                    <FieldLabel>What it is</FieldLabel>
                    <FieldControl
                      render={
                        <Input
                          color="module"
                          value={requirement.role}
                          placeholder="Stylist"
                          onChange={(event) => {
                            updateRequirement(index, { role: event.target.value });
                          }}
                        />
                      }
                    />
                  </Field>
                  <Field className="min-w-0 @md:w-44">
                    <FieldLabel>Kind</FieldLabel>
                    <FieldControl
                      render={
                        <NativeSelect
                          value={requirement.kind}
                          aria-label="Kind of resource needed"
                          onChange={(event) => {
                            updateRequirement(index, {
                              kind: event.target.value as ResourceKind,
                            });
                          }}
                        >
                          {RESOURCE_KINDS.map((kind) => (
                            <option key={kind.value} value={kind.value}>
                              {kind.label}
                            </option>
                          ))}
                        </NativeSelect>
                      }
                    />
                  </Field>
                  <Field className="@md:w-24">
                    <FieldLabel>How many</FieldLabel>
                    <FieldControl
                      render={
                        <Input
                          color="module"
                          type="number"
                          min={1}
                          className="tabular-nums"
                          value={String(requirement.count)}
                          onChange={(event) => {
                            updateRequirement(index, {
                              count: intOr(Number(event.target.value), 1) || 1,
                            });
                          }}
                        />
                      }
                    />
                  </Field>
                  <Button
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    shape="square"
                    aria-label={`Remove ${requirement.role.trim() || 'this requirement'}`}
                    className="shrink-0"
                    onClick={() => {
                      removeRequirement(index);
                    }}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              ))}

              <div>
                <Button size="sm" variant="soft" color="module" onClick={addRequirement}>
                  <Plus className="size-4" aria-hidden />
                  Add something it needs
                </Button>
              </div>
            </div>
          </FormSection>

          <FormSection title="Booking window">
            <div className="grid gap-4 @md:grid-cols-2">
              <Field>
                <FieldLabel>Least notice needed (minutes)</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={0}
                      className="max-w-32 tabular-nums"
                      value={String(draft.minLeadMinutes)}
                      onChange={(event) => {
                        set('minLeadMinutes', intOr(Number(event.target.value), 0));
                      }}
                    />
                  }
                />
                <FieldDescription>
                  How far ahead a customer must book. 0 lets them book right up to the start.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>How far ahead people can book (days)</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={0}
                      className="max-w-32 tabular-nums"
                      value={String(draft.maxAdvanceDays)}
                      onChange={(event) => {
                        set('maxAdvanceDays', intOr(Number(event.target.value), 365));
                      }}
                    />
                  }
                />
                <FieldDescription>
                  The furthest into the future a booking can be made.
                </FieldDescription>
              </Field>
            </div>
          </FormSection>

          {/* Quiet option rows and the remove action, after the work — never a
              card competing with the fields someone came to change. */}
          <div className="border-base-300 flex flex-col gap-4 border-t pt-4">
            <label className="flex items-start gap-3">
              <Checkbox
                color="module"
                checked={draft.bookableOnline}
                aria-label="Customers can book this themselves online"
                onChange={(event) => {
                  set('bookableOnline', event.target.checked);
                }}
              />
              <span className="flex flex-col gap-0.5">
                <Text as="span" className="font-medium">
                  Customers can book this themselves online
                </Text>
                <Text as="span" className="text-sm">
                  Off, only your team can add this booking — it never appears on your public booking
                  page.
                </Text>
              </span>
            </label>

            <label className="flex items-start gap-3">
              <Checkbox
                color="module"
                checked={draft.requiresApproval}
                aria-label="You approve each booking before it is confirmed"
                onChange={(event) => {
                  set('requiresApproval', event.target.checked);
                }}
              />
              <span className="flex flex-col gap-0.5">
                <Text as="span" className="font-medium">
                  You approve each booking before it is confirmed
                </Text>
                <Text as="span" className="text-sm">
                  Bookings come in as requests for you to accept, rather than being confirmed on the
                  spot.
                </Text>
              </span>
            </label>

            <label className="flex items-start gap-3">
              <Checkbox
                color="module"
                checked={draft.requiresAsset}
                aria-label="This booking is about a specific item the customer names"
                onChange={(event) => {
                  set('requiresAsset', event.target.checked);
                }}
              />
              <span className="flex flex-col gap-0.5">
                <Text as="span" className="font-medium">
                  The customer names a specific item when booking
                </Text>
                <Text as="span" className="text-sm">
                  For work done on a customer’s own thing — their vehicle, their bike, their
                  instrument. They tell you which one when they book.
                </Text>
              </span>
            </label>

            <label className="flex items-start gap-3">
              <Checkbox
                color="module"
                checked={draft.isActive}
                aria-label="This service is switched on"
                onChange={(event) => {
                  set('isActive', event.target.checked);
                }}
              />
              <span className="flex flex-col gap-0.5">
                <Text as="span" className="font-medium">
                  This service is switched on
                </Text>
                <Text as="span" className="text-sm">
                  Switch it off to stop taking bookings for it without removing it — turn it back on
                  any time.
                </Text>
              </span>
            </label>

            {existing ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text className="text-sm">
                  Removing this service takes it off your booking page for good. Bookings already
                  made against it are kept.
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
                  {remove.isPending ? 'Removing…' : 'Remove'}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────── */

export function ServiceDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const isNew = id === 'new';
  const service = useService(id);

  if (isNew) {
    return <ServiceEditor ctx={ctx} id="new" initial={BLANK} existing={null} />;
  }

  if (service.isError) {
    const gone = isNotFound(service.error);
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          reason={gone ? 'missing' : 'unreachable'}
          title={gone ? 'This service no longer exists' : 'Could not load this service'}
          description={
            gone
              ? 'It has been removed. Any bookings already made against it are unaffected.'
              : 'This is a problem reaching the server. Nothing about the service has changed.'
          }
          onRetry={() => {
            void service.refetch();
          }}
        />
      </div>
    );
  }

  if (service.isPending || !service.data) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <ServiceEditor
      key={service.data.id}
      ctx={ctx}
      id={id}
      initial={draftFrom(service.data)}
      existing={service.data}
    />
  );
}
