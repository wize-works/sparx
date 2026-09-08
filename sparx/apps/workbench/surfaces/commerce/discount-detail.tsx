'use client';

// One discount — create it, then manage it.
//
// Create and manage are the same surface: `{ id: 'new' }` builds it, `{ id }`
// manages it. A discount is one of two things, chosen with a single switch and
// changeable at any time: a CODE a shopper types, or an AUTOMATIC saving that
// applies on its own. What it takes off (a percentage, an amount, free delivery),
// who qualifies, when it runs and how often it can be used are the rest of the
// job.
//
// A discount has a real lifecycle the editor respects: it is created switched
// OFF, switched ON as a separate deliberate act, and RETIRED for good when done
// (retiring is permanent — the server keeps its usage history but the discount
// can never be reopened, so it sits behind a confirm).

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Heading,
  Input,
  Select,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Power, Trash2 } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { SiteScopeField } from '../../components/site-scope-field';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  discountErrorMessage,
  discountState,
  parseDiscountInput,
  useActivateDiscount,
  useArchiveDiscount,
  useCreateDiscount,
  useDiscount,
  useUpdateDiscount,
  type Discount,
  type DiscountCondition,
  type DiscountInput,
  type DiscountType,
} from './discounts-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/** The saving types this editor sets up. Others (buy-one-get-one, bundle deals)
 *  are kept and shown if a discount already uses one, but need product pickers to
 *  build, so they are not offered here. */
const CREATABLE_TYPES: DiscountType[] = ['percent', 'fixed', 'free_shipping'];

const TYPE_LABELS: Record<DiscountType, string> = {
  percent: 'A percentage off',
  fixed: 'A set amount off',
  free_shipping: 'Free delivery',
  buy_x_get_y: 'Buy one, get one',
  bundle: 'Bundle deal',
};

/* ── Money + date helpers ───────────────────────────────────────────────── */

function centsToDollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

function dollarsToCents(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

/** ISO ⇄ the `datetime-local` control's "YYYY-MM-DDTHH:mm" in the viewer's zone. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(local: string): string | undefined {
  if (local.trim() === '') return undefined;
  const date = new Date(local);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/* ── Draft ──────────────────────────────────────────────────────────────── */

interface Draft {
  name: string;
  description: string;
  hasCode: boolean;
  code: string;
  type: DiscountType;
  percentValue: string;
  amountDollars: string;
  minSpendDollars: string;
  minItems: string;
  firstOrderOnly: boolean;
  startLocal: string;
  endLocal: string;
  totalUsageLimit: string;
  perCustomerLimit: string;
  combine: boolean;
  /** Conditions this editor does not build (product/collection/segment targeting,
   *  buy-x-get-y). Carried whole and sent back untouched so editing the simple
   *  conditions never silently deletes the complex ones. */
  preservedConditions: DiscountCondition[];
  /** Preserved so a scope set elsewhere survives a save from here. */
  scope: Discount['scope'];
  priority: number;
  /** The sites this offer runs on. EMPTY = all of them. */
  propertyIds: string[];
}

const SIMPLE_KINDS = new Set(['min_subtotal_cents', 'min_item_count', 'first_order_only']);

function conditionValue(
  conditions: DiscountCondition[],
  kind: 'min_subtotal_cents' | 'min_item_count'
): number | undefined {
  const found = conditions.find((c) => c.kind === kind);
  return found && 'value' in found && typeof found.value === 'number' ? found.value : undefined;
}

function emptyDraft(): Draft {
  return {
    name: '',
    description: '',
    hasCode: true,
    code: '',
    type: 'percent',
    percentValue: '',
    amountDollars: '',
    minSpendDollars: '',
    minItems: '',
    firstOrderOnly: false,
    startLocal: '',
    endLocal: '',
    totalUsageLimit: '',
    perCustomerLimit: '1',
    combine: false,
    preservedConditions: [],
    scope: 'order',
    priority: 0,
    propertyIds: [],
  };
}

function toDraft(discount: Discount): Draft {
  const minSpend = conditionValue(discount.conditions, 'min_subtotal_cents');
  const minItems = conditionValue(discount.conditions, 'min_item_count');
  const firstOrder = discount.conditions.some((c) => c.kind === 'first_order_only');
  return {
    name: discount.name,
    description: discount.description ?? '',
    hasCode: discount.code !== null,
    code: discount.code ?? '',
    type: discount.type,
    percentValue: discount.valuePercent === null ? '' : String(discount.valuePercent),
    amountDollars: centsToDollars(discount.valueCents),
    minSpendDollars: centsToDollars(minSpend),
    minItems: minItems === undefined ? '' : String(minItems),
    firstOrderOnly: firstOrder,
    startLocal: isoToLocalInput(discount.startAt),
    endLocal: isoToLocalInput(discount.endAt),
    totalUsageLimit: discount.totalUsageLimit === null ? '' : String(discount.totalUsageLimit),
    perCustomerLimit: String(discount.perCustomerLimit),
    combine: discount.stacking !== 'none',
    preservedConditions: discount.conditions.filter((c) => !SIMPLE_KINDS.has(c.kind)),
    scope: discount.scope,
    priority: discount.priority,
    // Sorted so the dirty check (a JSON compare) can't fire on ordering alone.
    propertyIds: [...discount.propertyIds].sort(),
  };
}

/* ── Surface ────────────────────────────────────────────────────────────── */

export function DiscountDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? (
    <DiscountEditor ctx={ctx} id="new" />
  ) : (
    <DiscountLoader ctx={ctx} id={id} />
  );
}

function DiscountLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { data: discount, isPending, isError, error, refetch } = useDiscount(id);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="discount"
        title="Could not load this discount"
        description="This is a problem reaching the server, or the discount has been retired. Nothing has been changed."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !discount) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return <DiscountEditor ctx={ctx} id={id} discount={discount} />;
}

function DiscountEditor({
  ctx,
  id,
  discount,
}: {
  ctx: SurfaceContext;
  id: string;
  discount?: Discount;
}) {
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const create = useCreateDiscount();
  const update = useUpdateDiscount(id);
  const activate = useActivateDiscount(id);
  const archive = useArchiveDiscount(id);

  const saved = useMemo(() => (discount ? toDraft(discount) : emptyDraft()), [discount]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New discount' : (discount?.name ?? 'Discount'));
  }, [ctx, isNew, discount]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const dirty = touched && JSON.stringify(draft) !== JSON.stringify(saved);
  const saving = create.isPending || update.isPending;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This discount has not been created yet. Close anyway?'
      : 'This discount has unsaved changes. Close anyway?'
  );

  /* ── Validation ───────────────────────────────────────────────────────── */

  const nameError = draft.name.trim() === '' ? 'Give the discount a name.' : null;
  const codeError =
    draft.hasCode && draft.code.trim() === '' ? 'Enter the code shoppers will type.' : null;
  const percentError =
    draft.type === 'percent' &&
    (draft.percentValue.trim() === '' || Number(draft.percentValue) <= 0)
      ? 'Enter how many percent to take off.'
      : null;
  const amountError =
    draft.type === 'fixed' && dollarsToCents(draft.amountDollars) === undefined
      ? 'Enter the amount to take off.'
      : null;
  const blocked = nameError ?? codeError ?? percentError ?? amountError;

  const failure =
    create.isError || update.isError
      ? discountErrorMessage(
          create.error ?? update.error,
          'Could not save this discount. Nothing was changed.'
        )
      : null;

  /* ── Build the payload ────────────────────────────────────────────────── */

  const buildInput = (): DiscountInput | null => {
    const conditions: DiscountCondition[] = [...draft.preservedConditions];
    const minSpend = dollarsToCents(draft.minSpendDollars);
    if (minSpend !== undefined && minSpend > 0) {
      conditions.push({ kind: 'min_subtotal_cents', value: minSpend });
    }
    const minItems = Number(draft.minItems);
    if (draft.minItems.trim() !== '' && Number.isInteger(minItems) && minItems > 0) {
      conditions.push({ kind: 'min_item_count', value: minItems });
    }
    if (draft.firstOrderOnly) {
      conditions.push({ kind: 'first_order_only', value: true });
    }

    const totalLimit = Number(draft.totalUsageLimit);
    const perCustomer = Number(draft.perCustomerLimit);

    const candidate: DiscountInput = {
      name: draft.name.trim(),
      code: draft.hasCode ? draft.code.trim().toUpperCase() : null,
      description: draft.description.trim() === '' ? undefined : draft.description.trim(),
      type: draft.type,
      scope: draft.scope,
      ...(draft.type === 'percent' ? { valuePercent: Number(draft.percentValue) } : {}),
      ...(draft.type === 'fixed' ? { valueCents: dollarsToCents(draft.amountDollars) } : {}),
      conditions,
      ...(localInputToIso(draft.startLocal) ? { startAt: localInputToIso(draft.startLocal) } : {}),
      ...(localInputToIso(draft.endLocal) ? { endAt: localInputToIso(draft.endLocal) } : {}),
      ...(draft.totalUsageLimit.trim() !== '' && Number.isInteger(totalLimit) && totalLimit > 0
        ? { totalUsageLimit: totalLimit }
        : {}),
      perCustomerLimit: Number.isInteger(perCustomer) && perCustomer > 0 ? perCustomer : 1,
      stacking: draft.combine ? 'combine_with_all' : 'none',
      priority: draft.priority,
      propertyIds: draft.propertyIds,
    };

    const parsed = parseDiscountInput(candidate);
    return parsed.ok ? parsed.value : null;
  };

  const submit = () => {
    if (blocked) return;
    const input = buildInput();
    if (!input) return;

    if (isNew) {
      create.mutate(input, {
        onSuccess: (created) => {
          ctx.open('commerce.discount.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${input.name} created`, type: 'success' });
          });
        },
      });
      return;
    }

    update.mutate(input, {
      onSuccess: () => {
        setTouched(false);
        toast.add({ title: 'Discount saved', type: 'success' });
      },
    });
  };

  const onActivate = () => {
    activate.mutate(undefined, {
      onSuccess: () => {
        toast.add({ title: 'Discount switched on', type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not switch it on',
          description: discountErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onRetire = async () => {
    if (!discount) return;
    const ok = await confirm({
      title: `Retire ${discount.name}?`,
      description:
        'This switches the discount off for good — it stops applying immediately and cannot be reopened. Its record of how many times it was used is kept. To pause it temporarily instead, keep it and remove its end date another time.',
      confirmLabel: 'Retire this discount',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    archive.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${discount.name} retired`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not retire this discount',
          description: discountErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const state = discount ? discountState(discount) : null;
  const canCreateType = CREATABLE_TYPES.includes(draft.type);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Discount actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={saving}
            disabled={Boolean(blocked) || (!isNew && !dirty)}
            onClick={submit}
          >
            {isNew ? 'Create discount' : 'Save'}
          </Button>
        }
        controls={
          <>
            {state ? (
              <Badge color={state.tone} variant="soft" size="sm">
                {state.label}
              </Badge>
            ) : null}
            {discount && discount.usageCount > 0 ? (
              <Text as="span" className="hidden shrink-0 text-sm @md:inline">
                Used {discount.usageCount === 1 ? 'once' : `${String(discount.usageCount)} times`}
              </Text>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Add a discount
              </Heading>
              <Text>
                A discount lowers what a shopper pays. Give it a code they type at checkout, or make
                it automatic so it applies on its own to every order that qualifies.
              </Text>
            </div>
          ) : null}

          <SaveFailure title="Could not save this discount" message={failure} />

          {!canCreateType ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>This is a {TYPE_LABELS[draft.type].toLowerCase()}</AlertTitle>
                <AlertDescription>
                  That kind of offer is set up with product choices this screen does not show. You
                  can still edit its name, code, schedule and limits here — the offer itself is kept
                  exactly as it is.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <FormSection title="Name">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={nameError && touched ? 'error' : 'module'}
                    value={draft.name}
                    placeholder="Summer sale"
                    onChange={(event) => {
                      set('name', event.target.value);
                    }}
                  />
                }
              />
              {nameError && touched ? (
                <FieldStatus status="error">{nameError}</FieldStatus>
              ) : (
                <FieldDescription>
                  For you — how you tell one discount from another.
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>Note (optional)</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={2}
                    value={draft.description}
                    placeholder="Anything worth remembering about this offer."
                    onChange={(event) => {
                      set('description', event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </FormSection>

          <FormSection
            title="How shoppers get it"
            description="A code they type, or automatically on any qualifying order."
          >
            <Field>
              <FieldLabel>Shoppers type a code</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={draft.hasCode}
                    onCheckedChange={(next: boolean) => {
                      set('hasCode', next);
                    }}
                  />
                }
              />
              <FieldDescription>
                {draft.hasCode
                  ? 'Only orders that enter this code get the discount.'
                  : 'The discount applies on its own — no code needed.'}
              </FieldDescription>
            </Field>

            {draft.hasCode ? (
              <Field>
                <FieldLabel>Code</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color={codeError && touched ? 'error' : 'module'}
                      value={draft.code}
                      placeholder="SUMMER10"
                      spellCheck={false}
                      autoComplete="off"
                      className="font-mono uppercase"
                      onChange={(event) => {
                        set('code', event.target.value.toUpperCase());
                      }}
                    />
                  }
                />
                {codeError && touched ? (
                  <FieldStatus status="error">{codeError}</FieldStatus>
                ) : (
                  <FieldDescription>
                    What shoppers type at checkout. Letters and numbers work best.
                  </FieldDescription>
                )}
              </Field>
            ) : null}
          </FormSection>

          <FormSection title="What it takes off">
            <Field>
              <FieldLabel>Kind of saving</FieldLabel>
              <Select
                color="module"
                aria-label="Kind of saving"
                value={draft.type}
                disabled={!canCreateType}
                items={Object.fromEntries(
                  (canCreateType ? CREATABLE_TYPES : [draft.type]).map((type) => [
                    type,
                    TYPE_LABELS[type],
                  ])
                )}
                onValueChange={(next) => {
                  set('type', next as DiscountType);
                }}
              />
            </Field>

            {draft.type === 'percent' ? (
              <Field>
                <FieldLabel>Percentage off</FieldLabel>
                <FieldControl
                  render={
                    <div className="flex max-w-[10rem] items-center gap-2">
                      <Input
                        color={percentError && touched ? 'error' : 'module'}
                        type="number"
                        min={0}
                        max={100}
                        inputMode="decimal"
                        value={draft.percentValue}
                        placeholder="10"
                        onChange={(event) => {
                          set('percentValue', event.target.value);
                        }}
                      />
                      <Text as="span" className="text-lg">
                        %
                      </Text>
                    </div>
                  }
                />
                {percentError && touched ? (
                  <FieldStatus status="error">{percentError}</FieldStatus>
                ) : null}
              </Field>
            ) : draft.type === 'fixed' ? (
              <Field>
                <FieldLabel>Amount off</FieldLabel>
                <FieldControl
                  render={
                    <div className="flex max-w-[12rem] items-center gap-2">
                      <Text as="span" className="text-lg">
                        $
                      </Text>
                      <Input
                        color={amountError && touched ? 'error' : 'module'}
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={draft.amountDollars}
                        placeholder="5.00"
                        onChange={(event) => {
                          set('amountDollars', event.target.value);
                        }}
                      />
                    </div>
                  }
                />
                {amountError && touched ? (
                  <FieldStatus status="error">{amountError}</FieldStatus>
                ) : null}
              </Field>
            ) : draft.type === 'free_shipping' ? (
              <Text className="text-sm">
                Qualifying orders pay nothing for delivery. Use the conditions below to require a
                minimum spend if you like.
              </Text>
            ) : null}
          </FormSection>

          <FormSection
            title="Who qualifies"
            description="Leave these empty to let every order use it."
          >
            <Field>
              <FieldLabel>Minimum spend</FieldLabel>
              <FieldControl
                render={
                  <div className="flex max-w-[12rem] items-center gap-2">
                    <Text as="span" className="text-lg">
                      $
                    </Text>
                    <Input
                      color="module"
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={draft.minSpendDollars}
                      placeholder="0.00"
                      onChange={(event) => {
                        set('minSpendDollars', event.target.value);
                      }}
                    />
                  </div>
                }
              />
              <FieldDescription>The basket must total at least this much.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Minimum number of items</FieldLabel>
              <FieldControl
                render={
                  <div className="max-w-[8rem]">
                    <Input
                      color="module"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={draft.minItems}
                      placeholder="0"
                      onChange={(event) => {
                        set('minItems', event.target.value);
                      }}
                    />
                  </div>
                }
              />
            </Field>

            <Field>
              <FieldLabel>First order only</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={draft.firstOrderOnly}
                    onCheckedChange={(next: boolean) => {
                      set('firstOrderOnly', next);
                    }}
                  />
                }
              />
              <FieldDescription>
                Only a customer&apos;s very first order can use it.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="When it runs"
            description="Leave a date empty to have no start or no end."
          >
            <div className="grid gap-3 @md:grid-cols-2">
              <Field>
                <FieldLabel>Starts</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="datetime-local"
                      value={draft.startLocal}
                      onChange={(event) => {
                        set('startLocal', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Ends</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="datetime-local"
                      value={draft.endLocal}
                      onChange={(event) => {
                        set('endLocal', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            title="How often it can be used"
            description="Leave the total empty for no overall cap."
          >
            <div className="grid gap-3 @md:grid-cols-2">
              <Field>
                <FieldLabel>Total uses allowed</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={draft.totalUsageLimit}
                      placeholder="No limit"
                      onChange={(event) => {
                        set('totalUsageLimit', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Uses per customer</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={draft.perCustomerLimit}
                      onChange={(event) => {
                        set('perCustomerLimit', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
            </div>

            <Field>
              <FieldLabel>Can combine with other discounts</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={draft.combine}
                    onCheckedChange={(next: boolean) => {
                      set('combine', next);
                    }}
                  />
                }
              />
              <FieldDescription>
                {draft.combine
                  ? 'A shopper can use this alongside other offers on the same order.'
                  : 'This is used on its own — no other discount stacks with it.'}
              </FieldDescription>
            </Field>
          </FormSection>

          <SiteScopeField
            value={draft.propertyIds}
            onChange={(next) => {
              set('propertyIds', next);
            }}
            title="Which of your sites the offer runs on"
            description="You run more than one website. Keep an offer to the business it was meant for, and the code will not work at the other one's checkout."
            everyLabel="Run it on every site"
          />

          {!isNew && discount ? (
            <div className="border-base-300 flex flex-col gap-4 border-t pt-4">
              {discount.status === 'draft' ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Text className="text-sm">
                    This discount is switched off. Switch it on when you are ready for shoppers to
                    use it.
                  </Text>
                  <Button
                    size="sm"
                    color="module"
                    loading={activate.isPending}
                    onClick={onActivate}
                  >
                    <Power className="size-4" aria-hidden />
                    Switch on
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text className="text-sm">
                  Retiring switches this discount off for good — it cannot be reopened afterwards.
                </Text>
                <Button
                  size="sm"
                  variant="outline"
                  color="danger"
                  loading={archive.isPending}
                  onClick={() => {
                    void onRetire();
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Retire this discount
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
