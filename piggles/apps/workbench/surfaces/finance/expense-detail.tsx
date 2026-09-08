'use client';

// ONE COST — the full record behind a row in Spending.
//
// ── Create and manage are ONE pane ────────────────────────────────────────
//
// `{id:'new'}` is this form before the cost exists, `{id}` is it after. Same
// fields, same validation, one file. The quick-entry row on the Spending list
// covers the three-field case; this is where a bill with a due date, a receipt
// and a job to charge it to gets recorded.
//
// ── Two dates, never one ──────────────────────────────────────────────────
//
// `incurredAt` is the day the cost BELONGS to and `paidAt` is the day money
// actually left. Collapsing them is the single most consequential error this
// form could make: profit is bucketed on the former, cash on the latter, so a
// January invoice paid in March is January's cost and March's payment. The form
// therefore keeps them visibly separate and never derives one from the other.
//
// ── A derived row is READ-ONLY here, on purpose ───────────────────────────
//
// A cost that came from a purchase order or a repeating template is corrected at
// its source — editing the copy would either be silently overwritten by the next
// derivation or leave two records disagreeing. The pane says so in words and
// offers the source instead of a dead Save button.
//
// ── Allocation is the whole point of the module ───────────────────────────
//
// Spend pinned to a job is what makes "did THIS job make money" answerable, and
// the unallocated remainder is overhead. Both halves are shown live as the
// allocations change, because an owner splitting a £900 parts bill across three
// repairs needs to see what is left before they save, not after.

import { useEffect, useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Input,
  NativeSelect,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import {
  faCircleDollar,
  faFloppyDisk,
  faMoneyBill,
  faPaperclip,
  faPlus,
  faTrashCan,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import { useDebouncedValue, useRecordSearch } from '../../lib/api/search';
import { MediaPickerProvider, useMediaMultiPicker } from '../cms/media-picker';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  centsToInput,
  isNotFound,
  parseMoneyToCents,
  spendErrorMessage,
  useDeleteExpense,
  useExpense,
  useExpenseCategories,
  useSaveExpense,
  useSetExpensePaid,
  useVendors,
  type Expense,
  type ExpenseDraft,
} from './spend-data';
import { billState, formatCents, formatDate, kindColor, sourceLabel } from './format';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/** The payment methods the API accepts, in the owner's words. */
const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: '', label: 'Not recorded' },
  { value: 'card', label: 'Card' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'other', label: 'Something else' },
];

/** Which record types a cost can be charged to, and what to call each. `site` is
 *  deliberately absent from the PICKER — an unallocated cost already means "the
 *  business, not a job", so offering it as a choice would be two ways to say the
 *  same thing with different arithmetic. */
const TARGET_LABELS: Record<string, string> = {
  order: 'Order',
  booking: 'Appointment',
  customer: 'Customer',
  product: 'Product',
  site: 'The business',
};

const PICKABLE_TARGETS = new Set(['order', 'booking', 'customer', 'product']);

interface AllocationRow {
  targetType: string;
  targetId: string;
  targetLabel: string | null;
  amountCents: number;
}

interface FormState {
  description: string;
  amount: string;
  tax: string;
  currency: string;
  categoryId: string;
  vendorId: string;
  incurredAt: string;
  dueAt: string;
  paidAt: string;
  paymentMethod: string;
  reference: string;
  notes: string;
  allocations: AllocationRow[];
  attachmentAssetIds: string[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

/** A `<input type="date">` value back to an instant. Midnight UTC, matching how
 *  the server buckets `incurredAt` — a local-midnight instant would land on the
 *  previous day for anyone east of UTC and quietly move the cost's month. */
function dateValue(value: string): string | null {
  return value === '' ? null : new Date(`${value}T00:00:00.000Z`).toISOString();
}

const EMPTY_FORM: FormState = {
  description: '',
  amount: '',
  tax: '',
  currency: 'USD',
  categoryId: '',
  vendorId: '',
  incurredAt: today(),
  dueAt: '',
  paidAt: '',
  paymentMethod: '',
  reference: '',
  notes: '',
  allocations: [],
  attachmentAssetIds: [],
};

function formFrom(expense: Expense): FormState {
  return {
    description: expense.description,
    amount: centsToInput(expense.amountCents),
    tax: expense.taxCents === 0 ? '' : centsToInput(expense.taxCents),
    currency: expense.currency,
    categoryId: expense.category?.id ?? '',
    vendorId: expense.vendor?.id ?? '',
    incurredAt: dateInput(expense.incurredAt),
    dueAt: dateInput(expense.dueAt),
    paidAt: dateInput(expense.paidAt),
    paymentMethod: expense.paymentMethod ?? '',
    reference: expense.reference ?? '',
    notes: expense.notes ?? '',
    allocations: expense.allocations.map((a) => ({
      targetType: a.targetType,
      targetId: a.targetId,
      targetLabel: a.targetLabel,
      amountCents: a.amountCents,
    })),
    attachmentAssetIds: expense.attachments.map((a) => a.assetId),
  };
}

function toDraft(form: FormState): ExpenseDraft | null {
  const amountCents = parseMoneyToCents(form.amount);
  if (amountCents === null || amountCents <= 0) return null;
  const taxCents = form.tax.trim() === '' ? 0 : parseMoneyToCents(form.tax);
  if (taxCents === null || taxCents < 0) return null;
  const incurredAt = dateValue(form.incurredAt);
  if (!incurredAt) return null;

  return {
    categoryId: form.categoryId,
    vendorId: form.vendorId === '' ? null : form.vendorId,
    description: form.description.trim(),
    amountCents,
    currency: form.currency.trim().toUpperCase() || 'USD',
    taxCents,
    incurredAt,
    paidAt: dateValue(form.paidAt),
    dueAt: dateValue(form.dueAt),
    paymentMethod: form.paymentMethod === '' ? null : form.paymentMethod,
    reference: form.reference.trim() === '' ? null : form.reference.trim(),
    notes: form.notes.trim() === '' ? null : form.notes.trim(),
    allocations: form.allocations,
    attachmentAssetIds: form.attachmentAssetIds,
  };
}

/* ── Charging the cost to jobs ──────────────────────────────────────────────*/

function AllocationEditor({
  allocations,
  totalCents,
  currency,
  onChange,
}: {
  allocations: AllocationRow[];
  totalCents: number;
  currency: string;
  onChange: (next: AllocationRow[]) => void;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 250);
  const { hits, isLoading } = useRecordSearch(debounced);

  const allocated = allocations.reduce((sum, a) => sum + a.amountCents, 0);
  const remaining = totalCents - allocated;
  const overAllocated = remaining < 0;

  const candidates = useMemo(
    () =>
      hits
        .filter((hit) => PICKABLE_TARGETS.has(hit.entityType))
        .filter((hit) => !allocations.some((a) => a.targetId === hit.recordId))
        .slice(0, 8),
    [hits, allocations]
  );

  return (
    <FormSection
      title="What this cost was for"
      description="Charge some or all of it to the jobs it belongs to, and the rest counts as the cost of being open. This is what makes a job's profit answerable."
    >
      {allocations.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {allocations.map((allocation, index) => (
            <li
              key={`${allocation.targetType}:${allocation.targetId}`}
              className="border-base-300 flex flex-wrap items-center gap-2 rounded-lg border p-3"
            >
              <Badge color="module" variant="soft" size="sm">
                {TARGET_LABELS[allocation.targetType] ?? allocation.targetType}
              </Badge>
              <Text className="min-w-0 flex-1 truncate font-medium">
                {allocation.targetLabel ?? 'Untitled record'}
              </Text>
              <Input
                color="module"
                size="sm"
                inputMode="decimal"
                aria-label={`Amount charged to ${allocation.targetLabel ?? 'this record'}`}
                className="w-28 text-right tabular-nums"
                value={centsToInput(allocation.amountCents)}
                onChange={(event) => {
                  const cents = parseMoneyToCents(event.target.value);
                  const next = [...allocations];
                  next[index] = { ...allocation, amountCents: cents ?? 0 };
                  onChange(next);
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                shape="square"
                aria-label={`Stop charging this cost to ${allocation.targetLabel ?? 'this record'}`}
                onClick={() => {
                  onChange(allocations.filter((_, i) => i !== index));
                }}
              >
                <Icon glyph={faTrashCan} className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* The two halves of the money, always both visible. "Left on the business"
          is not an error state — it is the normal home of rent and insurance —
          so it reads as a fact, and only an OVER-allocation is colored as a
          problem. */}
      <div className="border-base-300 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
        <Text className="text-sm">
          {allocated === 0
            ? 'None of this is charged to a job yet.'
            : `${formatCents(allocated, currency)} charged to ${
                allocations.length === 1 ? '1 job' : `${String(allocations.length)} jobs`
              }.`}
        </Text>
        <Badge color={overAllocated ? 'danger' : 'neutral'} variant="soft" size="sm">
          {overAllocated
            ? `${formatCents(-remaining, currency)} over the total`
            : `${formatCents(remaining, currency)} left on the business`}
        </Badge>
      </div>

      {overAllocated ? (
        <Alert color="danger" variant="soft">
          <AlertContent>
            <AlertDescription>
              You have charged out more than the cost itself. Reduce one of the amounts above, or
              raise the total.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <Field>
        <FieldLabel>Charge it to a job</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              size="sm"
              value={query}
              placeholder="Search an order, appointment, customer or product…"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
          }
        />
        <FieldDescription>
          Whatever you leave unassigned counts as a running cost of the business.
        </FieldDescription>
      </Field>

      {query.trim().length >= 2 ? (
        <div className="border-base-300 flex flex-col gap-1 rounded-lg border p-2">
          {isLoading ? (
            <Text className="p-2 text-sm">Searching…</Text>
          ) : candidates.length === 0 ? (
            <Text className="p-2 text-sm">
              Nothing matches that. Try an order number, a customer name, or part of a product
              title.
            </Text>
          ) : (
            candidates.map((hit) => (
              <button
                key={hit.key}
                type="button"
                className="hover:bg-base-200 flex items-center gap-2 rounded-md p-2 text-left"
                onClick={() => {
                  onChange([
                    ...allocations,
                    {
                      targetType: hit.entityType,
                      targetId: hit.recordId,
                      targetLabel: hit.title,
                      // Seed with whatever is left, which is the whole cost for
                      // the first job — the common case is one job, and typing
                      // the same number you just typed above is pure friction.
                      amountCents: Math.max(remaining, 0),
                    },
                  ]);
                  setQuery('');
                }}
              >
                <Badge color="module" variant="soft" size="sm">
                  {TARGET_LABELS[hit.entityType] ?? hit.entityType}
                </Badge>
                <span className="min-w-0 flex-1 truncate font-medium">{hit.title}</span>
                {hit.subtitle ? (
                  <span className="hidden truncate text-sm @lg:inline">{hit.subtitle}</span>
                ) : null}
                <Icon glyph={faPlus} className="size-4 shrink-0" aria-hidden />
              </button>
            ))
          )}
        </div>
      ) : null}
    </FormSection>
  );
}

/* ── Receipts ───────────────────────────────────────────────────────────────*/

function Receipts({
  expense,
  assetIds,
  onChange,
}: {
  expense: Expense | undefined;
  assetIds: string[];
  onChange: (next: string[]) => void;
}) {
  const pickMany = useMediaMultiPicker();

  // Filenames are only known for attachments the server already returned; a
  // just-picked one carries the picker's name until the next save. Both are
  // real, so both get a row — never a bare uuid.
  const known = new Map((expense?.attachments ?? []).map((a) => [a.assetId, a.filename]));
  const [pickedNames, setPickedNames] = useState<Record<string, string>>({});

  const add = async () => {
    const picked = await pickMany();
    if (!picked || picked.length === 0) return;
    setPickedNames((current) => {
      const next = { ...current };
      for (const asset of picked) next[asset.id] = asset.filename;
      return next;
    });
    const ids = new Set(assetIds);
    onChange([...assetIds, ...picked.map((a) => a.id).filter((id) => !ids.has(id))]);
  };

  return (
    <FormSection
      title="Receipts"
      description="Attach a photo or scan so the paperwork lives with the cost."
      action={
        <Button
          size="sm"
          variant="outline"
          color="neutral"
          onClick={() => {
            void add();
          }}
        >
          <Icon glyph={faPaperclip} className="size-4" aria-hidden />
          Attach
        </Button>
      }
    >
      {assetIds.length === 0 ? (
        <Text className="text-sm">
          Nothing attached. A receipt here is what turns a line in a list into something you can
          hand to an accountant.
        </Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {assetIds.map((assetId) => (
            <li
              key={assetId}
              className="border-base-300 flex items-center gap-2 rounded-lg border p-3"
            >
              <Icon glyph={faPaperclip} className="size-4 shrink-0" aria-hidden />
              <Text className="min-w-0 flex-1 truncate">
                {known.get(assetId) ?? pickedNames[assetId] ?? 'Attached file'}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                shape="square"
                aria-label="Remove this receipt"
                onClick={() => {
                  onChange(assetIds.filter((id) => id !== assetId));
                }}
              >
                <Icon glyph={faTrashCan} className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </FormSection>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────────*/

function ExpenseDetail({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const isNew = id === 'new';

  const toast = useToast();
  const confirm = useConfirm();
  const expense = useExpense(id);
  const categories = useExpenseCategories();
  const vendors = useVendors();
  const save = useSaveExpense(id);
  const setPaid = useSetExpensePaid();
  const remove = useDeleteExpense();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<FormState>(EMPTY_FORM);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isNew) {
      setLoaded(true);
      return;
    }
    if (expense.data && !loaded) {
      const next = formFrom(expense.data);
      setForm(next);
      setBaseline(next);
      setLoaded(true);
    }
  }, [isNew, expense.data, loaded]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New cost' : (expense.data?.description ?? 'Cost'));
  }, [ctx, isNew, expense.data?.description]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);
  const draft = useMemo(() => toDraft(form), [form]);

  const amountCents = parseMoneyToCents(form.amount);
  const amountOk = amountCents !== null && amountCents > 0;
  const allocated = form.allocations.reduce((sum, a) => sum + a.amountCents, 0);
  const overAllocated = amountCents !== null && allocated > amountCents;

  // A cost that came from somewhere else is corrected at its source.
  const readOnly = expense.data ? !expense.data.editable : false;

  const canSave =
    !readOnly &&
    draft !== null &&
    form.description.trim() !== '' &&
    form.categoryId !== '' &&
    amountOk &&
    !overAllocated &&
    (isNew || dirty);

  useDirtySource(
    dirty && loaded && !readOnly,
    isNew
      ? 'This cost has not been saved yet. Close anyway?'
      : `Changes to "${form.description || 'this cost'}" have not been saved. Close anyway?`
  );

  const onSave = () => {
    if (!canSave || !draft) return;
    save.mutate(draft, {
      onSuccess: (result) => {
        if (isNew) {
          ctx.open('finance.expense.detail', { id: result.id }, { target: 'replace' });
        } else {
          setBaseline(form);
        }
        afterPaneChange(() => {
          toast.add({ title: isNew ? 'Cost recorded' : 'Cost saved', type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: isNew ? 'Could not record that cost' : 'Could not save that cost',
          description: spendErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const togglePaid = () => {
    if (!expense.data) return;
    const nowPaid = expense.data.paidAt === null;
    setPaid.mutate(
      { id: expense.data.id, paidAt: nowPaid ? new Date().toISOString() : null },
      {
        onSuccess: (updated) => {
          const next = formFrom(updated);
          setForm(next);
          setBaseline(next);
          afterPaneChange(() => {
            toast.add({
              title: nowPaid ? 'Marked as paid' : 'Marked as not paid',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not change that',
            description: spendErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onDelete = async () => {
    if (!expense.data) return;
    const ok = await confirm({
      title: `Delete "${expense.data.description}"?`,
      description: `This removes ${formatCents(expense.data.amountCents, expense.data.currency)} from your spending, and your profit figures for that period will change. Anything charged to a job is uncharged. This cannot be undone.`,
      confirmLabel: 'Delete this cost',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(expense.data.id, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: 'Cost deleted', type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete that cost',
          description: spendErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  if (!isNew && expense.isError) {
    const gone = isNotFound(expense.error);
    return (
      <div className={PANE_SHELL}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            reason={gone ? 'missing' : 'unreachable'}
            title={gone ? 'This cost no longer exists' : 'Could not load this cost'}
            description={
              gone
                ? 'It may have been deleted. Your other records are unaffected.'
                : 'This is a problem reaching the server. The record itself is unaffected.'
            }
            onRetry={() => {
              void expense.refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (!isNew && (expense.isPending || !loaded)) {
    return (
      <div className={PANE_SHELL}>
        <PaneWaiting />
      </div>
    );
  }

  const state = expense.data ? billState(expense.data.paidAt, expense.data.dueAt) : null;
  const currency = form.currency || 'USD';
  const selectedCategory = (categories.data ?? []).find((c) => c.id === form.categoryId);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Cost actions"
        status={
          <>
            {state ? (
              <Badge color={state.tone} variant="soft" size="sm">
                {state.label}
              </Badge>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Icon glyph={faCircleDollar} className="size-4" aria-hidden />
                <Text as="span" className="text-sm font-medium">
                  New cost
                </Text>
              </span>
            )}
            {selectedCategory ? (
              <Badge color={kindColor(selectedCategory.kind)} variant="soft" size="sm">
                {selectedCategory.name}
              </Badge>
            ) : null}
          </>
        }
        primary={
          readOnly ? null : (
            <Button
              size="sm"
              color="module"
              className="ml-auto shrink-0"
              disabled={!canSave}
              loading={save.isPending}
              onClick={onSave}
            >
              <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
              {isNew ? 'Record cost' : 'Save'}
            </Button>
          )
        }
        controls={
          expense.data && !readOnly ? (
            <Button
              size="sm"
              variant="outline"
              color={expense.data.paidAt ? 'neutral' : 'success'}
              loading={setPaid.isPending}
              onClick={togglePaid}
            >
              <Icon glyph={faMoneyBill} className="size-4" aria-hidden />
              {expense.data.paidAt ? 'Mark as not paid' : 'Mark as paid'}
            </Button>
          ) : null
        }
        refresh={
          isNew ? null : (
            <RefreshButton
              isFetching={expense.isFetching}
              updatedAt={expense.data ? expense.dataUpdatedAt : undefined}
              onRefresh={() => {
                void expense.refetch();
              }}
            />
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {readOnly && expense.data ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>
                  This cost came from {sourceLabel(expense.data.source).toLowerCase()}
                </AlertTitle>
                <AlertDescription>
                  It is kept in step with wherever it came from, so it is not edited here — change
                  it at the source and this updates with it. You can still see everything about it
                  below.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <FormSection title="The cost">
            <div className="grid gap-3 @md:grid-cols-2">
              <Field className="@md:col-span-2">
                <FieldLabel required>What was it for</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.description}
                      disabled={readOnly}
                      placeholder="Brake pads for the Henderson job"
                      onChange={(event) => {
                        set('description', event.target.value);
                      }}
                    />
                  }
                />
                {form.description.trim() === '' && !readOnly ? (
                  <FieldStatus status="error">Say what the money was spent on.</FieldStatus>
                ) : (
                  <FieldDescription>
                    Write it the way you would say it out loud — this is what you will scan for
                    later.
                  </FieldDescription>
                )}
              </Field>

              <Field>
                <FieldLabel required>Amount</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      inputMode="decimal"
                      value={form.amount}
                      disabled={readOnly}
                      placeholder="0.00"
                      className="text-right tabular-nums"
                      onChange={(event) => {
                        set('amount', event.target.value);
                      }}
                    />
                  }
                />
                {form.amount.trim() !== '' && !amountOk ? (
                  <FieldStatus status="error">
                    Enter an amount greater than zero, like 42.50.
                  </FieldStatus>
                ) : null}
              </Field>

              <Field>
                <FieldLabel>Tax included</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      inputMode="decimal"
                      value={form.tax}
                      disabled={readOnly}
                      placeholder="0.00"
                      className="text-right tabular-nums"
                      onChange={(event) => {
                        set('tax', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>
                  Part of the amount above, not on top of it. Leave blank if you are not tracking
                  it.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel required>Category</FieldLabel>
                <FieldControl
                  render={
                    <NativeSelect
                      color="module"
                      value={form.categoryId}
                      disabled={readOnly}
                      onChange={(event) => {
                        set('categoryId', event.target.value);
                      }}
                    >
                      <option value="">Choose a category…</option>
                      {(categories.data ?? []).map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </NativeSelect>
                  }
                />
                <FieldDescription>
                  Decides where this lands in your profit — cost of the work, wages, or a running
                  cost.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Who you paid</FieldLabel>
                <FieldControl
                  render={
                    <NativeSelect
                      color="module"
                      value={form.vendorId}
                      disabled={readOnly}
                      onChange={(event) => {
                        set('vendorId', event.target.value);
                      }}
                    >
                      <option value="">Not recorded</option>
                      {(vendors.data ?? []).map((vendor) => (
                        <option key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </option>
                      ))}
                    </NativeSelect>
                  }
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            title="Dates"
            description="The day the cost belongs to and the day money actually left are different things, and both matter — a January bill paid in March is January's cost."
          >
            <div className="grid gap-3 @md:grid-cols-3">
              <Field>
                <FieldLabel required>Date of the cost</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="date"
                      value={form.incurredAt}
                      disabled={readOnly}
                      onChange={(event) => {
                        set('incurredAt', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Which month it counts against.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Due by</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="date"
                      value={form.dueAt}
                      disabled={readOnly}
                      onChange={(event) => {
                        set('dueAt', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Puts it on Bills to pay until it is settled.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Paid on</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="date"
                      value={form.paidAt}
                      disabled={readOnly}
                      onChange={(event) => {
                        set('paidAt', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Leave blank until the money has gone.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>How you paid</FieldLabel>
                <FieldControl
                  render={
                    <NativeSelect
                      color="module"
                      value={form.paymentMethod}
                      disabled={readOnly}
                      onChange={(event) => {
                        set('paymentMethod', event.target.value);
                      }}
                    >
                      {PAYMENT_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </NativeSelect>
                  }
                />
              </Field>
              <Field className="@md:col-span-2">
                <FieldLabel>Reference</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.reference}
                      disabled={readOnly}
                      placeholder="Invoice number, check number…"
                      spellCheck={false}
                      onChange={(event) => {
                        set('reference', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
            </div>
          </FormSection>

          {readOnly ? (
            expense.data && expense.data.allocations.length > 0 ? (
              <FormSection title="What this cost was for">
                <ul className="flex flex-col gap-2">
                  {expense.data.allocations.map((allocation) => (
                    <li
                      key={allocation.id}
                      className="border-base-300 flex items-center gap-2 rounded-lg border p-3"
                    >
                      <Badge color="module" variant="soft" size="sm">
                        {TARGET_LABELS[allocation.targetType] ?? allocation.targetType}
                      </Badge>
                      <Text className="min-w-0 flex-1 truncate font-medium">
                        {allocation.targetLabel ?? 'Untitled record'}
                      </Text>
                      <Text className="tabular-nums">
                        {formatCents(allocation.amountCents, currency)}
                      </Text>
                    </li>
                  ))}
                </ul>
              </FormSection>
            ) : null
          ) : (
            <AllocationEditor
              allocations={form.allocations}
              totalCents={amountCents ?? 0}
              currency={currency}
              onChange={(next) => {
                set('allocations', next);
              }}
            />
          )}

          {readOnly ? null : (
            <Receipts
              expense={expense.data}
              assetIds={form.attachmentAssetIds}
              onChange={(next) => {
                set('attachmentAssetIds', next);
              }}
            />
          )}

          <FormSection title="Notes">
            <Field>
              <FieldLabel>Anything worth remembering</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={3}
                    value={form.notes}
                    disabled={readOnly}
                    placeholder="Warranty period, who authorized it, what it replaced…"
                    onChange={(event) => {
                      set('notes', event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </FormSection>

          {expense.data ? (
            <div className="border-base-300 flex flex-col gap-3 border-t pt-4">
              <Text className="text-sm">
                Recorded {formatDate(expense.data.createdAt)}
                {expense.data.exportedAt
                  ? ` · sent to your accounting system ${formatDate(expense.data.exportedAt)}`
                  : ''}
              </Text>

              {readOnly ? null : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <Text className="font-medium">Delete this cost</Text>
                    <Text className="text-sm">
                      Your profit for that period will change. This cannot be undone.
                    </Text>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    color="danger"
                    loading={remove.isPending}
                    onClick={() => {
                      void onDelete();
                    }}
                  >
                    <Icon glyph={faTrashCan} className="size-4" aria-hidden />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ExpenseDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  // The receipt picker is the shared media browser, which needs its provider in
  // the tree. `content` files an uploaded receipt into the general library
  // rather than Brand or Product, which is where a scan of a fuel docket belongs.
  return (
    <MediaPickerProvider source="content">
      <ExpenseDetail ctx={ctx} />
    </MediaPickerProvider>
  );
}
