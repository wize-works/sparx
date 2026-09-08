'use client';

// ONE SUPPLIER — set them up, keep their details current, record what you buy
// from them, and retire them when you stop.
//
// ── Create and manage are ONE pane ────────────────────────────────────────
//
// Adding a supplier and editing one are the same form, so this is a single
// surface in two states: `{id:'new'}` is it before the supplier exists, `{id}`
// is it after. A separate "new supplier" modal would mean writing this form
// twice forever, and a modal cannot show a dirty dot or survive a reload.
//
// ── Not EditorLayout ──────────────────────────────────────────────────────
//
// A supplier is a handful of grouped fields with no running summary worth
// standing beside them, so this is one centred, capped column — not a form
// chassis with an empty rail floating next to it.
//
// ── Explicit save; retire is a plain row at the end ───────────────────────
//
// One Save button, last-write-wins, with a leave-guard while there are unsaved
// edits — like every other editor. The purchasing links save on their own,
// because each is its own record. Retiring a supplier is rare and hard to
// reverse, so it sits in a quiet row under a divider after the work, never as a
// loud card competing with the details someone came in to change.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  FieldStatus,
  Heading,
  Input,
  Textarea,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Archive, ClipboardList, Plus, Save, Star, Trash2, Truck } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents } from './data';
import { PriceLadders, SupplierScorecardPanel } from './supplier-performance-panels';
import {
  outstandingUnits,
  purchaseOrderState,
  usePurchaseOrders,
  type PurchaseOrder,
} from './purchase-orders-data';
import {
  buyingErrorMessage,
  isNotFound,
  supplierState,
  useArchiveSupplier,
  useCreateSupplier,
  useRemoveSupplierVariant,
  useSupplier,
  useUpdateSupplier,
  useUpsertSupplierVariant,
  useVariantLookup,
  type SupplierDetail,
  type SupplierInput,
  type SupplierVariant,
} from './suppliers-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

interface FormState {
  name: string;
  code: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  paymentTerms: string;
  leadTimeDays: string;
  currency: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  code: '',
  contactName: '',
  email: '',
  phone: '',
  website: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: '',
  paymentTerms: '',
  leadTimeDays: '',
  currency: 'USD',
  notes: '',
};

function formFrom(supplier: SupplierDetail): FormState {
  return {
    name: supplier.name,
    code: supplier.code,
    contactName: supplier.contactName ?? '',
    email: supplier.email ?? '',
    phone: supplier.phone ?? '',
    website: supplier.website ?? '',
    line1: supplier.line1 ?? '',
    line2: supplier.line2 ?? '',
    city: supplier.city ?? '',
    region: supplier.region ?? '',
    postalCode: supplier.postalCode ?? '',
    country: supplier.country ?? '',
    paymentTerms: supplier.paymentTerms ?? '',
    leadTimeDays: supplier.leadTimeDays === null ? '' : String(supplier.leadTimeDays),
    currency: supplier.currency,
    notes: supplier.notes ?? '',
  };
}

/** Only the keys the API accepts, with blanks dropped so an empty optional field
 *  is omitted rather than sent as "". Country must be exactly two letters or not
 *  sent at all. */
function toInput(form: FormState): SupplierInput {
  const trimmed = (value: string) => value.trim();
  const optional = (value: string) => (value.trim() === '' ? undefined : value.trim());
  const lead = Number.parseInt(form.leadTimeDays, 10);
  return {
    name: trimmed(form.name),
    code: trimmed(form.code),
    ...(optional(form.contactName) ? { contactName: trimmed(form.contactName) } : {}),
    ...(optional(form.email) ? { email: trimmed(form.email) } : {}),
    ...(optional(form.phone) ? { phone: trimmed(form.phone) } : {}),
    ...(optional(form.website) ? { website: trimmed(form.website) } : {}),
    ...(optional(form.line1) ? { line1: trimmed(form.line1) } : {}),
    ...(optional(form.line2) ? { line2: trimmed(form.line2) } : {}),
    ...(optional(form.city) ? { city: trimmed(form.city) } : {}),
    ...(optional(form.region) ? { region: trimmed(form.region) } : {}),
    ...(optional(form.postalCode) ? { postalCode: trimmed(form.postalCode) } : {}),
    ...(form.country.trim().length === 2 ? { country: form.country.trim().toUpperCase() } : {}),
    ...(optional(form.paymentTerms) ? { paymentTerms: trimmed(form.paymentTerms) } : {}),
    ...(Number.isFinite(lead) && lead >= 0 ? { leadTimeDays: lead } : {}),
    currency: form.currency.trim() === '' ? 'USD' : form.currency.trim().toUpperCase(),
    ...(optional(form.notes) ? { notes: trimmed(form.notes) } : {}),
  };
}

/* ── Money helpers for the purchasing links ─────────────────────────────── */

function inputToCents(value: string): number | null {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

/* ── What you buy from this supplier ────────────────────────────────────── */

function PurchasingLinks({
  supplierId,
  variants,
  currency,
}: {
  supplierId: string;
  variants: SupplierVariant[];
  currency: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const lookup = useVariantLookup();
  const upsert = useUpsertSupplierVariant(supplierId);
  const remove = useRemoveSupplierVariant(supplierId);

  const [adding, setAdding] = useState(false);
  const [sku, setSku] = useState('');
  const [cost, setCost] = useState('');
  const [supplierSku, setSupplierSku] = useState('');
  const [preferred, setPreferred] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setSku('');
    setCost('');
    setSupplierSku('');
    setPreferred(false);
    setError(null);
    setAdding(false);
  };

  const addLink = async () => {
    setError(null);
    const code = sku.trim();
    if (code === '') return;
    let resolved;
    try {
      resolved = await lookup.mutateAsync(code);
    } catch (err) {
      setError(
        isNotFound(err)
          ? `No item in your catalog has the code "${code}". Check the code and try again.`
          : buyingErrorMessage(err, 'Could not look that code up.')
      );
      return;
    }
    const costCents = inputToCents(cost);
    upsert.mutate(
      {
        variantId: resolved.variantId,
        ...(costCents !== null ? { unitCostCents: costCents } : {}),
        ...(supplierSku.trim() ? { supplierSku: supplierSku.trim() } : {}),
        isPreferred: preferred,
      },
      {
        onSuccess: () => {
          const title = resolved.productTitle ?? resolved.sku;
          resetForm();
          afterPaneChange(() => {
            toast.add({ title: `${title} added to what you buy here`, type: 'success' });
          });
        },
        onError: (err) => {
          setError(buyingErrorMessage(err, 'Could not save that item.'));
        },
      }
    );
  };

  const removeLink = async (link: SupplierVariant) => {
    const label = link.productTitle ?? link.variantSku ?? 'this item';
    const ok = await confirm({
      title: `Stop buying ${label} from this supplier?`,
      description:
        'This only removes the record that you source it here — your stock, your product and any past orders are untouched. You can add it back at any time.',
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(link.variantId, {
      onSuccess: () => {
        afterPaneChange(() => {
          toast.add({ title: `${label} removed`, type: 'success' });
        });
      },
      onError: (err) => {
        toast.add({
          title: 'Could not remove that item',
          description: buyingErrorMessage(err, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <FormSection
      title="What you buy from this supplier"
      description="The items you source here, with the code and price this supplier charges. A purchase order to them starts from this list."
      action={
        adding ? null : (
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add an item
          </Button>
        )
      }
    >
      {variants.length === 0 && !adding ? (
        <Text className="text-sm">
          Nothing recorded yet. Add the items you buy here so their supplier code and price fill in
          automatically on a purchase order.
        </Text>
      ) : null}

      {variants.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {variants.map((link) => (
            <li
              key={link.id}
              className="border-base-300 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Text className="truncate font-medium">
                    {link.productTitle ?? link.variantSku ?? 'Item'}
                  </Text>
                  {link.isPreferred ? (
                    <Badge color="module" variant="soft" size="sm">
                      <Star className="size-3" aria-hidden />
                      Preferred
                    </Badge>
                  ) : null}
                </div>
                <Text className="text-sm">
                  {link.variantSku ? `Your code ${link.variantSku}` : 'No product code'}
                  {link.supplierSku ? ` · Their code ${link.supplierSku}` : ''}
                  {link.unitCostCents !== null
                    ? ` · ${formatCents(link.unitCostCents, currency)} each`
                    : ''}
                </Text>
              </div>
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                shape="square"
                aria-label={`Stop buying ${link.productTitle ?? link.variantSku ?? 'this item'} here`}
                onClick={() => {
                  void removeLink(link);
                }}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {adding ? (
        <div className="border-base-300 bg-base-200 flex flex-col gap-3 rounded-lg border p-3">
          <Heading level={4} className="text-base font-semibold">
            Add an item you buy here
          </Heading>
          <div className="grid gap-3 @md:grid-cols-2">
            <Field>
              <FieldLabel>Your product code</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    size="sm"
                    value={sku}
                    placeholder="The code you gave the item"
                    spellCheck={false}
                    onChange={(event) => {
                      setSku(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>We find the item in your catalog by its code.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Their code (optional)</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    size="sm"
                    value={supplierSku}
                    placeholder="What the supplier calls it"
                    spellCheck={false}
                    onChange={(event) => {
                      setSupplierSku(event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <Field>
              <FieldLabel>What they charge (each)</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    size="sm"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={cost}
                    placeholder="0.00"
                    className="text-right tabular-nums"
                    onChange={(event) => {
                      setCost(event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <div className="flex items-end">
              <label className="flex items-center gap-2 pb-1">
                <Checkbox
                  color="module"
                  checked={preferred}
                  aria-label="My go-to supplier for this item"
                  onChange={(event) => {
                    setPreferred(event.target.checked);
                  }}
                />
                <Text as="span" className="text-sm">
                  My go-to supplier for this item
                </Text>
              </label>
            </div>
          </div>

          {error ? (
            <Alert color="danger" variant="soft">
              <AlertContent>
                <AlertDescription>{error}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              color="module"
              disabled={sku.trim() === ''}
              loading={lookup.isPending || upsert.isPending}
              onClick={() => {
                void addLink();
              }}
            >
              Add item
            </Button>
            <Button size="sm" variant="ghost" color="neutral" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </FormSection>
  );
}

/* ── Purchase orders from this supplier ─────────────────────────────────── */

function SupplierPurchaseOrders({ supplierId, ctx }: { supplierId: string; ctx: SurfaceContext }) {
  const { data, isLoading } = usePurchaseOrders({ supplierId, take: 10, skip: 0 });
  const rows = data?.items ?? [];

  if (isLoading || rows.length === 0) return null;

  const openPo = (po: PurchaseOrder, event: { shiftKey: boolean }) => {
    ctx.open(
      'inventory.purchase-orders.detail',
      { id: po.id },
      { target: event.shiftKey ? 'beside' : 'tab' }
    );
  };

  return (
    <FormSection
      title="Purchase orders to this supplier"
      description="The most recent orders you have placed with them."
    >
      <ul className="flex flex-col gap-2">
        {rows.map((po) => {
          const state = purchaseOrderState(po);
          const outstanding = outstandingUnits(po);
          return (
            <li key={po.id}>
              <button
                type="button"
                className="border-base-300 hover:border-module flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors"
                onClick={(event) => {
                  openPo(po, event);
                }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ClipboardList className="size-4 shrink-0" aria-hidden />
                  <Text className="font-mono font-medium">{po.number}</Text>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {outstanding > 0 ? (
                    <Text className="text-sm tabular-nums">
                      {String(outstanding)} still to come
                    </Text>
                  ) : null}
                  <Text className="text-sm tabular-nums">
                    {formatCents(po.totalCents, po.currency)}
                  </Text>
                  <Badge color={state.tone} variant="soft" size="sm">
                    {state.label}
                  </Badge>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </FormSection>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────── */

export function SupplierDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const isNew = id === 'new';

  const toast = useToast();
  const confirm = useConfirm();
  const supplier = useSupplier(id);
  const create = useCreateSupplier();
  const update = useUpdateSupplier(id);
  const archive = useArchiveSupplier(id);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<FormState>(EMPTY_FORM);
  const [loaded, setLoaded] = useState(false);

  // Seed the form once the record lands, and remember that snapshot as the
  // baseline so "dirty" means "different from what is saved", not "non-empty".
  useEffect(() => {
    if (isNew) {
      setLoaded(true);
      return;
    }
    if (supplier.data && !loaded) {
      const next = formFrom(supplier.data);
      setForm(next);
      setBaseline(next);
      setLoaded(true);
    }
  }, [isNew, supplier.data, loaded]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New supplier' : (supplier.data?.name ?? 'Supplier'));
  }, [ctx, isNew, supplier.data?.name]);

  const set = <K extends keyof FormState>(key: K, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline]);

  const nameOk = form.name.trim() !== '';
  const codeOk = form.code.trim() !== '' && CODE_PATTERN.test(form.code.trim());
  const canSave = nameOk && codeOk && (isNew || dirty);

  useDirtySource(
    dirty && loaded,
    isNew
      ? 'This supplier has not been saved yet. Close anyway?'
      : `Changes to ${form.name || 'this supplier'} have not been saved. Close anyway?`
  );

  const save = () => {
    if (!canSave) return;
    const input = toInput(form);
    if (isNew) {
      create.mutate(input, {
        onSuccess: (result) => {
          ctx.open('inventory.suppliers.detail', { id: result.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({
              title: `${input.name} added`,
              description: 'You can now record what you buy from them and raise orders.',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not add that supplier',
            description: buyingErrorMessage(error, 'Nothing was saved.'),
            type: 'error',
          });
        },
      });
      return;
    }
    update.mutate(input, {
      onSuccess: () => {
        setBaseline(form);
        afterPaneChange(() => {
          toast.add({ title: `${input.name} saved`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not save that supplier',
          description: buyingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onArchive = async () => {
    if (!supplier.data) return;
    const ok = await confirm({
      title: `Retire ${supplier.data.name}?`,
      description:
        'They stop showing in your active suppliers and you can no longer raise new orders to them. Past orders and everything you have received stay exactly as they are. You can still find them by including archived suppliers.',
      confirmLabel: 'Retire this supplier',
      cancelLabel: 'Keep them active',
      color: 'danger',
    });
    if (!ok) return;
    archive.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${supplier.data?.name ?? 'Supplier'} retired`, type: 'success' });
        });
      },
      onError: (error) => {
        // The server refuses while an open PO references them, and its sentence
        // names the exact order — worth showing verbatim.
        toast.add({
          title: 'Could not retire that supplier',
          description: buyingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  // A failed load REPLACES the form — never an empty one beside a dead Save.
  if (!isNew && supplier.isError) {
    const gone = isNotFound(supplier.error);
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          reason={gone ? 'missing' : 'unreachable'}
          title={gone ? 'This supplier no longer exists' : 'Could not load this supplier'}
          description={
            gone
              ? 'It may have been removed. Its past orders are unaffected.'
              : 'This is a problem reaching the server. The supplier record is unaffected.'
          }
          onRetry={() => {
            void supplier.refetch();
          }}
        />
      </div>
    );
  }

  if (!isNew && (supplier.isPending || !loaded)) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  const state = supplier.data ? supplierState(supplier.data) : null;
  const saving = create.isPending || update.isPending;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Supplier actions"
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto shrink-0"
            disabled={!canSave}
            loading={saving}
            onClick={save}
          >
            <Save className="size-4" aria-hidden />
            {isNew ? 'Add supplier' : 'Save'}
          </Button>
        }
        controls={
          <>
            {state ? (
              <Badge color={state.tone} variant="soft" size="sm">
                {state.label}
              </Badge>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Truck className="size-4" aria-hidden />
                <Text as="span" className="text-sm font-medium">
                  New supplier
                </Text>
              </span>
            )}
          </>
        }
        refresh={
          isNew ? null : (
            <RefreshButton
              isFetching={supplier.isFetching}
              updatedAt={supplier.data ? supplier.dataUpdatedAt : undefined}
              onRefresh={() => {
                void supplier.refetch();
              }}
            />
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <FormSection title="Who they are">
            <div className="grid gap-3 @md:grid-cols-2">
              <Field>
                <FieldLabel required>Name</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.name}
                      placeholder="Acme Wholesale"
                      onChange={(event) => {
                        set('name', event.target.value);
                      }}
                    />
                  }
                />
                {form.name.trim() === '' ? (
                  <FieldStatus status="error">A supplier needs a name.</FieldStatus>
                ) : null}
              </Field>
              <Field>
                <FieldLabel required>Short code</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.code}
                      placeholder="ACME"
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(event) => {
                        set('code', event.target.value);
                      }}
                    />
                  }
                />
                {form.code.trim() !== '' && !codeOk ? (
                  <FieldStatus status="error">
                    Use only letters, numbers, hyphens or underscores.
                  </FieldStatus>
                ) : (
                  <FieldDescription>
                    A short handle printed on orders — like ACME. Must be unique.
                  </FieldDescription>
                )}
              </Field>
            </div>
          </FormSection>

          <FormSection title="How to reach them">
            <div className="grid gap-3 @md:grid-cols-2">
              <Field>
                <FieldLabel>Contact name</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.contactName}
                      placeholder="Who you deal with"
                      onChange={(event) => {
                        set('contactName', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Email</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="email"
                      value={form.email}
                      placeholder="orders@acme.com"
                      spellCheck={false}
                      onChange={(event) => {
                        set('email', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Phone</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.phone}
                      placeholder="(555) 010-0100"
                      onChange={(event) => {
                        set('phone', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Website</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.website}
                      placeholder="acme.com"
                      spellCheck={false}
                      onChange={(event) => {
                        set('website', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            title="Default terms"
            description="What usually applies when you order from them. You can change any of it on an individual order."
          >
            <div className="grid gap-3 @md:grid-cols-3">
              <Field>
                <FieldLabel>How you pay</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.paymentTerms}
                      placeholder="net 30"
                      onChange={(event) => {
                        set('paymentTerms', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>e.g. net 30, cash on delivery.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Days to arrive</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={form.leadTimeDays}
                      placeholder="7"
                      onChange={(event) => {
                        set('leadTimeDays', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Sets an order&apos;s expected date.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Currency</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.currency}
                      placeholder="USD"
                      spellCheck={false}
                      maxLength={3}
                      className="uppercase"
                      onChange={(event) => {
                        set('currency', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Three-letter code.</FieldDescription>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Address">
            <div className="grid gap-3 @md:grid-cols-2">
              <Field className="@md:col-span-2">
                <FieldLabel>Street</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.line1}
                      placeholder="1 Trade Park Way"
                      onChange={(event) => {
                        set('line1', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field className="@md:col-span-2">
                <FieldLabel>Street line 2</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.line2}
                      placeholder="Unit 4"
                      onChange={(event) => {
                        set('line2', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Town or city</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.city}
                      onChange={(event) => {
                        set('city', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Region or state</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.region}
                      onChange={(event) => {
                        set('region', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Postal code</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.postalCode}
                      onChange={(event) => {
                        set('postalCode', event.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Country</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={form.country}
                      placeholder="US"
                      spellCheck={false}
                      maxLength={2}
                      className="uppercase"
                      onChange={(event) => {
                        set('country', event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Two-letter country code.</FieldDescription>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Notes">
            <Field>
              <FieldLabel>Anything worth remembering</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={4}
                    value={form.notes}
                    placeholder="Minimum order, delivery days, who to ask for…"
                    onChange={(event) => {
                      set('notes', event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>Only you see this — it never appears on an order.</FieldDescription>
            </Field>
          </FormSection>

          {/* Everything below needs a saved supplier to hang off, so it only
              appears once the record exists. */}
          {isNew || !supplier.data ? null : (
            <>
              {/* How they have ACTUALLY behaved (docs/146 Phase 8.1), directly
                  under the terms somebody typed in when the record was set up —
                  because the point of the panel is the gap between the two. */}
              <SupplierScorecardPanel supplierId={id} />

              <PurchasingLinks
                supplierId={id}
                variants={supplier.data.variants}
                currency={supplier.data.currency}
              />

              <PriceLadders variants={supplier.data.variants} currency={supplier.data.currency} />

              <SupplierPurchaseOrders supplierId={id} ctx={ctx} />

              {/* Rare and hard to reverse: a quiet row under a divider, never a
                  card competing with the details above. */}
              {supplier.data.isActive ? (
                <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div className="flex min-w-0 flex-col">
                    <Text className="font-medium">Retire this supplier</Text>
                    <Text className="text-sm">
                      Stop ordering from them without losing any history.
                    </Text>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    color="danger"
                    loading={archive.isPending}
                    onClick={() => {
                      void onArchive();
                    }}
                  >
                    <Archive className="size-4" aria-hidden />
                    Retire
                  </Button>
                </div>
              ) : (
                <Alert color="neutral" variant="soft">
                  <AlertContent>
                    <AlertTitle>This supplier is retired</AlertTitle>
                    <AlertDescription>
                      You can no longer raise new orders to them. Their details above stay editable,
                      and all past orders are kept.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
