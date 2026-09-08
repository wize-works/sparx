'use client';

// One price tier — create it, then manage it. Create and manage are the SAME
// surface: `{ id: 'new' }` builds it, `{ id }` manages it.
//
// A tier has two parts: the standing discount everyone on it gets, and — once it
// exists — a set of per-product prices that override that discount on specific
// items. The tier fields save with the Save button; the per-product overrides
// are managed live, each its own add or remove, because that is how the server
// models them.

import { useEffect, useMemo, useState } from 'react';
import {
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
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Trash2 } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { MoneyInput } from '@/components/money-input';
import { VariantPicker } from '../commerce/variant-picker';
import type { VariantChoice } from '../commerce/bundles-data';
import { SaveFailure } from '@/components/save-failure';
import {
  formatCents,
  tierErrorMessage,
  useAddOverride,
  useCreateTier,
  useDeleteOverride,
  useDeleteTier,
  useTier,
  useTierOverrides,
  useUpdateTier,
  type DiscountType,
  type ProductScope,
  type TierOverride,
  type TierRow,
  type TierWriteInput,
} from './pricing-tiers-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const SCOPE_OPTIONS: { value: ProductScope; label: string }[] = [
  { value: 'all', label: 'Everything you sell' },
  { value: 'collections', label: 'Only certain collections' },
  { value: 'products', label: 'Only certain products' },
];

interface Draft {
  name: string;
  description: string;
  discountType: DiscountType;
  discountValue: number;
  productScope: ProductScope;
  minOrder: number; // dollars while editing
}

function emptyDraft(): Draft {
  return {
    name: '',
    description: '',
    discountType: 'percentage',
    discountValue: 0,
    productScope: 'all',
    minOrder: 0,
  };
}

function toDraft(tier: TierRow): Draft {
  return {
    name: tier.name,
    description: tier.description ?? '',
    discountType: tier.discountType,
    discountValue: tier.discountValue,
    productScope: tier.productScope,
    minOrder: tier.minOrderCents / 100,
  };
}

export function PricingTierDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <TierEditor ctx={ctx} id="new" /> : <TierLoader ctx={ctx} id={id} />;
}

function TierLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const tierQuery = useTier(id);

  if (tierQuery.isError) {
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          error={tierQuery.error}
          noun="tier"
          title="Could not load this tier"
          description="This is a problem reaching the server. The tier itself is unaffected — nothing has been lost."
          onRetry={() => {
            void tierQuery.refetch();
          }}
        />
      </div>
    );
  }

  if (tierQuery.isPending || !tierQuery.data) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  return <TierEditor ctx={ctx} id={id} tier={tierQuery.data} />;
}

function TierEditor({ ctx, id, tier }: { ctx: SurfaceContext; id: string; tier?: TierRow }) {
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const create = useCreateTier();
  const update = useUpdateTier(id);
  const remove = useDeleteTier(id);

  const saved = useMemo(() => (tier ? toDraft(tier) : emptyDraft()), [tier]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New price tier' : (tier?.name ?? 'Price tier'));
  }, [ctx, isNew, tier]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const nameError = draft.name.trim() === '' ? 'Give this tier a name.' : null;
  const valueError =
    draft.discountType === 'percentage' && (draft.discountValue < 0 || draft.discountValue > 100)
      ? 'A percentage discount has to be between 0% and 100%.'
      : draft.discountValue < 0
        ? 'The discount cannot be negative.'
        : null;
  const blocking = nameError ?? valueError;

  const dirty = isNew
    ? draft.name.trim() !== '' ||
      draft.description.trim() !== '' ||
      draft.discountValue !== 0 ||
      draft.productScope !== 'all' ||
      draft.minOrder !== 0
    : draft.name !== saved.name ||
      draft.description !== saved.description ||
      draft.discountType !== saved.discountType ||
      draft.discountValue !== saved.discountValue ||
      draft.productScope !== saved.productScope ||
      draft.minOrder !== saved.minOrder;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This tier has not been created yet. Close anyway?'
      : 'This tier has unsaved changes. Close anyway?'
  );

  const writePayload = (): TierWriteInput => ({
    name: draft.name.trim(),
    description: draft.description.trim() === '' ? null : draft.description.trim(),
    discountType: draft.discountType,
    discountValue: draft.discountValue,
    productScope: draft.productScope,
    minOrderCents: Math.round(draft.minOrder * 100),
  });

  const submit = () => {
    if (blocking) return;
    setFailure(null);
    if (isNew) {
      create.mutate(writePayload(), {
        onSuccess: (created) => {
          ctx.open('b2b.pricing-tier.detail', { id: created.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${draft.name.trim()} created`, type: 'success' });
          });
        },
        onError: (error) => {
          setFailure(tierErrorMessage(error, 'Could not create this tier.'));
        },
      });
      return;
    }
    update.mutate(writePayload(), {
      onSuccess: () => {
        setTouched(false);
        toast.add({ title: 'Tier saved', type: 'success' });
      },
      onError: (error) => {
        setFailure(tierErrorMessage(error, 'Could not save this tier. Nothing was changed.'));
      },
    });
  };

  const onDelete = async () => {
    if (!tier) return;
    const ok = await confirm({
      title: `Remove ${tier.name}?`,
      description:
        'Accounts on this tier go back to your normal prices. Their orders already placed are unaffected. This cannot be undone.',
      confirmLabel: 'Remove this tier',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${tier.name} removed`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove this tier',
          description: tierErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Price tier actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={create.isPending || update.isPending}
            disabled={Boolean(nameError) || (!isNew && !dirty)}
            onClick={submit}
          >
            {isNew ? 'Create tier' : 'Save'}
          </Button>
        }
        controls={
          <>
            {tier?.accountCount !== undefined ? (
              <Badge color="neutral" variant="soft" size="sm">
                {tier.accountCount === 1 ? '1 account' : `${String(tier.accountCount)} accounts`}
              </Badge>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {isNew ? (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                Add a price tier
              </Heading>
              <Text>
                Set a discount once and give it to every account you put on this tier — instead of
                setting one per customer.
              </Text>
            </div>
          ) : null}

          <SaveFailure title="Could not save this tier" message={failure} />

          <FormSection title="The tier">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color={nameError && touched ? 'error' : 'module'}
                    value={draft.name}
                    placeholder="Trade"
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
                  What you call this level — Trade, Distributor, Key account.
                </FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>Note</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={2}
                    value={draft.description}
                    placeholder="A reminder of who this tier is for."
                    onChange={(event) => {
                      set('description', event.target.value);
                    }}
                  />
                }
              />
            </Field>
          </FormSection>

          <FormSection
            title="The discount"
            description="How much this tier takes off your normal prices, before any per-product prices below."
          >
            <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
              <Field>
                <FieldLabel>How it discounts</FieldLabel>
                <FieldControl
                  render={
                    <Select
                      color="module"
                      aria-label="How this tier discounts"
                      value={draft.discountType}
                      items={[
                        { value: 'percentage', label: 'A percentage off' },
                        { value: 'fixed', label: 'A fixed amount off' },
                      ]}
                      onValueChange={(next) => {
                        set('discountType', (next as DiscountType | null) ?? 'percentage');
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>
                  {draft.discountType === 'percentage' ? 'Percent off' : 'Amount off'}
                </FieldLabel>
                <FieldControl
                  render={
                    draft.discountType === 'percentage' ? (
                      <div className="flex max-w-40 items-center gap-1">
                        <Input
                          color={valueError && touched ? 'error' : 'module'}
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          inputMode="numeric"
                          className="text-right tabular-nums"
                          aria-label="Percent off"
                          value={String(draft.discountValue)}
                          onChange={(event) => {
                            set('discountValue', Number(event.target.value) || 0);
                          }}
                        />
                        <Text as="span" className="text-sm">
                          %
                        </Text>
                      </div>
                    ) : (
                      <div className="max-w-40">
                        <MoneyInput
                          color="module"
                          value={draft.discountValue}
                          aria-label="Amount off"
                          onValueChange={(next) => {
                            set('discountValue', next);
                          }}
                        />
                      </div>
                    )
                  }
                />
                {valueError && touched ? (
                  <FieldStatus status="error">{valueError}</FieldStatus>
                ) : null}
              </Field>
            </div>

            <Field>
              <FieldLabel>What it applies to</FieldLabel>
              <FieldControl
                render={
                  <div className="max-w-sm">
                    <Select
                      color="module"
                      aria-label="What the discount applies to"
                      value={draft.productScope}
                      items={SCOPE_OPTIONS}
                      onValueChange={(next) => {
                        set('productScope', (next as ProductScope | null) ?? 'all');
                      }}
                    />
                  </div>
                }
              />
              <FieldDescription>
                Keep it on everything unless this tier only discounts part of your range. Use the
                per-product prices below to set specific items.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Minimum order</FieldLabel>
              <FieldControl
                render={
                  <div className="max-w-40">
                    <MoneyInput
                      color="module"
                      value={draft.minOrder}
                      aria-label="Minimum order"
                      onValueChange={(next) => {
                        set('minOrder', next);
                      }}
                    />
                  </div>
                }
              />
              <FieldDescription>
                The smallest order this tier&apos;s prices apply to. Leave at zero for no minimum.
              </FieldDescription>
            </Field>
          </FormSection>

          {isNew ? (
            <FormSection title="Per-product prices">
              <Text className="text-sm">
                Save the tier first, then set special prices on individual products for it.
              </Text>
            </FormSection>
          ) : tier ? (
            <OverridesSection tierId={tier.id} />
          ) : null}

          {tier ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Text className="text-sm">
                Remove this tier. Accounts on it go back to your normal prices.
              </Text>
              <Button
                size="sm"
                variant="outline"
                color="danger"
                loading={remove.isPending}
                onClick={() => {
                  void onDelete();
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                Remove tier
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── Overrides ──────────────────────────────────────────────────────────── */

type OverrideMode = 'fixed' | 'percent';

function OverridesSection({ tierId }: { tierId: string }) {
  const toast = useToast();
  const overridesQuery = useTierOverrides(tierId);
  const addOverride = useAddOverride(tierId);
  const deleteOverride = useDeleteOverride(tierId);

  const [pending, setPending] = useState<VariantChoice | null>(null);
  const [mode, setMode] = useState<OverrideMode>('fixed');
  const [price, setPrice] = useState(0);
  const [percent, setPercent] = useState(10);

  const overrides = overridesQuery.data ?? [];
  const existingIds = useMemo(
    () =>
      (overridesQuery.data ?? [])
        .map((override) => override.variant?.id)
        .filter((value): value is string => Boolean(value)),
    [overridesQuery.data]
  );

  const onPick = (variant: VariantChoice) => {
    setPending(variant);
    setMode('fixed');
    setPrice(variant.priceCents / 100);
    setPercent(10);
  };

  const onAdd = () => {
    if (!pending) return;
    addOverride.mutate(
      mode === 'fixed'
        ? { variantId: pending.id, priceCents: Math.round(price * 100) }
        : { variantId: pending.id, discountPercentage: percent },
      {
        onSuccess: () => {
          setPending(null);
          toast.add({ title: `${pending.productTitle} priced`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not add that price',
            description: tierErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <FormSection
      title="Per-product prices"
      description="Set a fixed price or a bigger cut on specific products for this tier. Anything not listed uses the tier discount above."
    >
      {overridesQuery.isError ? (
        <Text className="text-sm">The per-product prices could not be loaded just now.</Text>
      ) : overridesQuery.isPending ? (
        <Text className="text-sm" role="status">
          Loading…
        </Text>
      ) : overrides.length === 0 ? (
        <Text className="text-sm">
          No per-product prices yet. Add a product below to give it a special price on this tier.
        </Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {overrides.map((override) => (
            <OverrideRow
              key={override.id}
              override={override}
              busy={deleteOverride.isPending}
              onRemove={() => {
                deleteOverride.mutate(override.id);
              }}
            />
          ))}
        </ul>
      )}

      <div className="border-base-300 flex flex-col gap-3 border-t pt-4">
        <Heading level={3} className="text-base font-semibold">
          Add a product
        </Heading>
        {pending ? (
          <div className="border-base-300 flex flex-col gap-3 rounded border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 flex-1 font-medium">{pending.productTitle}</span>
              <Button
                size="sm"
                variant="ghost"
                color="neutral"
                onClick={() => {
                  setPending(null);
                }}
              >
                Cancel
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-44 shrink-0">
                <Select
                  size="sm"
                  color="module"
                  aria-label="How to price this product"
                  value={mode}
                  items={[
                    { value: 'fixed', label: 'A fixed price' },
                    { value: 'percent', label: 'A percentage off' },
                  ]}
                  onValueChange={(next) => {
                    setMode((next as OverrideMode | null) ?? 'fixed');
                  }}
                />
              </div>
              {mode === 'fixed' ? (
                <div className="w-32 shrink-0">
                  <MoneyInput
                    color="module"
                    value={price}
                    aria-label="Fixed price"
                    onValueChange={setPrice}
                  />
                </div>
              ) : (
                <div className="flex w-32 shrink-0 items-center gap-1">
                  <Input
                    size="sm"
                    color="module"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    className="text-right tabular-nums"
                    aria-label="Percentage off"
                    value={String(percent)}
                    onChange={(event) => {
                      setPercent(Number(event.target.value) || 0);
                    }}
                  />
                  <Text as="span" className="text-sm">
                    % off
                  </Text>
                </div>
              )}
              <Button size="sm" color="module" loading={addOverride.isPending} onClick={onAdd}>
                Add
              </Button>
            </div>
          </div>
        ) : (
          <VariantPicker
            onPick={onPick}
            excludeIds={existingIds}
            placeholder="Search your products…"
          />
        )}
      </div>
    </FormSection>
  );
}

function OverrideRow({
  override,
  busy,
  onRemove,
}: {
  override: TierOverride;
  busy: boolean;
  onRemove: () => void;
}) {
  const name =
    override.variant?.title ?? override.variant?.sku ?? override.collection?.name ?? 'A product';
  const value =
    override.priceCents != null
      ? formatCents(override.priceCents)
      : override.discountPercentage != null
        ? `${String(override.discountPercentage)}% off`
        : '—';

  return (
    <li className="border-base-300 flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 last:border-b-0 last:pb-0">
      <span className="min-w-0 flex-1 font-medium">{name}</span>
      <Text as="span" className="text-sm tabular-nums">
        {value}
      </Text>
      <Button
        size="sm"
        variant="ghost"
        color="danger"
        shape="square"
        disabled={busy}
        aria-label={`Remove ${name}`}
        onClick={onRemove}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </li>
  );
}
