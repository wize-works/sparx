'use client';

// One bundle — create it, then manage it.
//
// Create and manage are the same surface: `{ id: 'new' }` builds it, `{ id }`
// manages it. The one thing fixed at creation is WHICH product the bundle is
// sold as — its wrapper — because the server has no way to move a bundle onto a
// different product afterwards. Everything else (the parts inside, how it is
// priced, how stock is counted) is editable for the life of the bundle.

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  SearchInput,
  Select,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Blocks, Trash2 } from 'lucide-react';
import { useQuery } from '@wizeworks/query';
import { api } from '../../lib/api/client';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { type ProductRow } from './products-data';
import { VariantPicker } from './variant-picker';
import { SaveFailure } from '@/components/save-failure';
import {
  bundleErrorMessage,
  useBundle,
  useCreateBundle,
  useDeleteBundle,
  useUpdateBundle,
  type BundleComponentInput,
  type BundleDetail,
  type BundleInventoryMode,
  type BundlePricingMode,
} from './bundles-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const PRICING_LABELS: Record<BundlePricingMode, string> = {
  sum_of_components: 'Add up the parts',
  fixed: 'A flat price I set',
  percent_off_sum: 'A percentage off the parts’ total',
};

const INVENTORY_LABELS: Record<BundleInventoryMode, string> = {
  decrement_components: 'Take a unit of each part out of stock',
  decrement_bundle_sku: 'Track stock on the bundle itself',
};

function dollarsToCents(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

function centsToDollars(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2);
}

/* ── Draft ──────────────────────────────────────────────────────────────── */

interface ComponentDraft {
  variantId: string;
  label: string;
  sku: string;
  defaultQuantity: number;
  isRequired: boolean;
  isSwappable: boolean;
}

interface Draft {
  bundleProductId: string;
  bundleProductTitle: string;
  pricingMode: BundlePricingMode;
  fixedPriceDollars: string;
  percentOffSum: string;
  inventoryMode: BundleInventoryMode;
  components: ComponentDraft[];
}

function emptyDraft(): Draft {
  return {
    bundleProductId: '',
    bundleProductTitle: '',
    pricingMode: 'sum_of_components',
    fixedPriceDollars: '',
    percentOffSum: '',
    inventoryMode: 'decrement_components',
    components: [],
  };
}

function toDraft(bundle: BundleDetail): Draft {
  return {
    bundleProductId: bundle.bundleProductId,
    bundleProductTitle: bundle.bundleProductTitle,
    pricingMode: bundle.pricingMode as BundlePricingMode,
    fixedPriceDollars: centsToDollars(bundle.fixedPriceCents),
    percentOffSum: bundle.percentOffSum === null ? '' : String(bundle.percentOffSum),
    inventoryMode: bundle.inventoryMode as BundleInventoryMode,
    components: bundle.components.map((c) => ({
      variantId: c.variantId,
      label: c.productTitle,
      sku: c.variantSku,
      defaultQuantity: c.defaultQuantity,
      isRequired: c.isRequired,
      isSwappable: c.isSwappable,
    })),
  };
}

/* ── Surface ────────────────────────────────────────────────────────────── */

export function BundleDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <BundleEditor ctx={ctx} id="new" /> : <BundleLoader ctx={ctx} id={id} />;
}

function BundleLoader({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { data: bundle, isPending, isError, error, refetch } = useBundle(id);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="bundle"
        title="Could not load this bundle"
        description="This is a problem reaching the server. The bundle itself is unaffected."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !bundle) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return <BundleEditor ctx={ctx} id={id} bundle={bundle} />;
}

function BundleEditor({
  ctx,
  id,
  bundle,
}: {
  ctx: SurfaceContext;
  id: string;
  bundle?: BundleDetail;
}) {
  const isNew = id === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const create = useCreateBundle();
  const update = useUpdateBundle(id);
  const remove = useDeleteBundle(id);

  const saved = useMemo(() => (bundle ? toDraft(bundle) : emptyDraft()), [bundle]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setDraft(saved);
  }, [saved, touched]);

  useEffect(() => {
    ctx.setTitle(isNew ? 'New bundle' : (bundle?.bundleProductTitle ?? 'Bundle'));
  }, [ctx, isNew, bundle]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setTouched(true);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const dirty = touched && JSON.stringify(draft) !== JSON.stringify(saved);
  const saving = create.isPending || update.isPending;

  useDirtySource(
    dirty && !create.isSuccess,
    isNew
      ? 'This bundle has not been created yet. Close anyway?'
      : 'This bundle has unsaved changes. Close anyway?'
  );

  /* ── Validation ───────────────────────────────────────────────────────── */

  const productError =
    isNew && draft.bundleProductId === '' ? 'Choose the product this bundle is sold as.' : null;
  const componentsError =
    draft.components.length === 0 ? 'Add at least one product to the bundle.' : null;
  const fixedError =
    draft.pricingMode === 'fixed' && dollarsToCents(draft.fixedPriceDollars) === undefined
      ? 'Enter the flat price for the set.'
      : null;
  const percentError =
    draft.pricingMode === 'percent_off_sum' &&
    (draft.percentOffSum.trim() === '' ||
      Number(draft.percentOffSum) < 0 ||
      Number(draft.percentOffSum) > 100)
      ? 'Enter a discount between 0 and 100 percent.'
      : null;
  const blocked = productError ?? componentsError ?? fixedError ?? percentError;

  const failure =
    create.isError || update.isError
      ? bundleErrorMessage(
          create.error ?? update.error,
          'Could not save this bundle. Nothing was changed.'
        )
      : null;

  const componentsPayload = (): BundleComponentInput[] =>
    draft.components.map((c, index) => ({
      variantId: c.variantId,
      defaultQuantity: c.defaultQuantity,
      isRequired: c.isRequired,
      isSwappable: c.isSwappable,
      position: index,
    }));

  const submit = () => {
    if (blocked) return;
    if (isNew) {
      create.mutate(
        {
          bundleProductId: draft.bundleProductId,
          pricingMode: draft.pricingMode,
          ...(draft.pricingMode === 'fixed'
            ? { fixedPriceCents: dollarsToCents(draft.fixedPriceDollars) }
            : {}),
          ...(draft.pricingMode === 'percent_off_sum'
            ? { percentOffSum: Number(draft.percentOffSum) }
            : {}),
          inventoryMode: draft.inventoryMode,
          components: componentsPayload(),
        },
        {
          onSuccess: (created) => {
            ctx.open('commerce.bundle.detail', { id: created.id }, { target: 'replace' });
            afterPaneChange(() => {
              toast.add({ title: `${draft.bundleProductTitle} bundle created`, type: 'success' });
            });
          },
        }
      );
      return;
    }

    update.mutate(
      {
        pricingMode: draft.pricingMode,
        fixedPriceCents:
          draft.pricingMode === 'fixed' ? (dollarsToCents(draft.fixedPriceDollars) ?? null) : null,
        percentOffSum: draft.pricingMode === 'percent_off_sum' ? Number(draft.percentOffSum) : null,
        inventoryMode: draft.inventoryMode,
        components: componentsPayload(),
      },
      {
        onSuccess: () => {
          setTouched(false);
          toast.add({ title: 'Bundle saved', type: 'success' });
        },
      }
    );
  };

  const onDelete = async () => {
    if (!bundle) return;
    const ok = await confirm({
      title: `Delete the ${bundle.bundleProductTitle} bundle?`,
      description:
        'This removes the bundle grouping. The products in it, and the wrapper product it was sold as, are all kept — only the way they were packaged together goes. This cannot be undone.',
      confirmLabel: 'Delete this bundle',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${bundle.bundleProductTitle} bundle deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this bundle',
          description: bundleErrorMessage(error, 'Nothing was removed.'),
          type: 'error',
        });
      },
    });
  };

  const addComponent = (variant: {
    id: string;
    productTitle: string;
    title: string | null;
    sku: string;
    isDefault: boolean;
  }) => {
    set('components', [
      ...draft.components,
      {
        variantId: variant.id,
        label:
          variant.isDefault || !variant.title
            ? variant.productTitle
            : `${variant.productTitle} — ${variant.title}`,
        sku: variant.sku,
        defaultQuantity: 1,
        isRequired: true,
        isSwappable: false,
      },
    ]);
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Bundle actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            loading={saving}
            disabled={Boolean(blocked) || (!isNew && !dirty)}
            onClick={submit}
          >
            {isNew ? 'Create bundle' : 'Save'}
          </Button>
        }
        controls={
          <>
            {!isNew ? (
              <Badge color="info" variant="soft" size="sm">
                <Blocks className="size-3" aria-hidden />
                <span className="hidden @md:inline">Bundle</span>
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
                Add a bundle
              </Heading>
              <Text>
                A bundle sells several products together as one item. Pick the product it is sold
                as, add the products that go inside, and choose how it is priced.
              </Text>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                {draft.bundleProductTitle}
              </Heading>
              <Text>Sold as one item, made up of the products below.</Text>
            </div>
          )}

          <SaveFailure title="Could not save this bundle" message={failure} />

          {isNew ? (
            <FormSection
              title="Sold as"
              description="The product shoppers see and buy. This cannot be changed later, so choose it now."
            >
              {draft.bundleProductId === '' ? (
                <WrapperProductPicker
                  onPick={(product) => {
                    setTouched(true);
                    setDraft((current) => ({
                      ...current,
                      bundleProductId: product.id,
                      bundleProductTitle: product.title,
                    }));
                  }}
                />
              ) : (
                <div className="border-base-300 flex items-center justify-between gap-2 rounded border px-3 py-2">
                  <Text className="font-medium">{draft.bundleProductTitle}</Text>
                  <Button
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    onClick={() => {
                      setDraft((current) => ({
                        ...current,
                        bundleProductId: '',
                        bundleProductTitle: '',
                      }));
                    }}
                  >
                    Change
                  </Button>
                </div>
              )}
            </FormSection>
          ) : null}

          <FormSection
            title="What is in it"
            description="The products that make up the set. Each can be required or optional, and you can allow a shopper to swap one for another version."
          >
            {componentsError ? (
              <Text className="text-sm">
                Nothing added yet. Search below and add the products that belong in this bundle.
              </Text>
            ) : (
              <ul className="flex flex-col gap-2">
                {draft.components.map((component, index) => (
                  <li
                    key={component.variantId}
                    className="border-base-300 flex flex-col gap-2 rounded border p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-col">
                        <Text className="font-medium">{component.label}</Text>
                        <Text className="text-sm">{component.sku}</Text>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        color="danger"
                        shape="square"
                        aria-label={`Remove ${component.label}`}
                        title="Remove from the bundle"
                        onClick={() => {
                          set(
                            'components',
                            draft.components.filter((_, i) => i !== index)
                          );
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2">
                        <Text as="span" className="text-sm">
                          How many
                        </Text>
                        <div className="w-20">
                          <Input
                            color="module"
                            size="sm"
                            type="number"
                            min={1}
                            inputMode="numeric"
                            aria-label={`How many of ${component.label}`}
                            value={String(component.defaultQuantity)}
                            onChange={(event) => {
                              const value = Math.max(
                                1,
                                Math.round(Number(event.target.value) || 1)
                              );
                              set(
                                'components',
                                draft.components.map((c, i) =>
                                  i === index ? { ...c, defaultQuantity: value } : c
                                )
                              );
                            }}
                          />
                        </div>
                      </label>
                      <div className="flex items-center gap-2">
                        <Switch
                          color="module"
                          size="sm"
                          checked={component.isRequired}
                          aria-label={`${component.label} is required`}
                          onCheckedChange={(next: boolean) => {
                            set(
                              'components',
                              draft.components.map((c, i) =>
                                i === index ? { ...c, isRequired: next } : c
                              )
                            );
                          }}
                        />
                        <Text as="span" className="text-sm">
                          Required
                        </Text>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          color="module"
                          size="sm"
                          checked={component.isSwappable}
                          aria-label={`${component.label} can be swapped`}
                          onCheckedChange={(next: boolean) => {
                            set(
                              'components',
                              draft.components.map((c, i) =>
                                i === index ? { ...c, isSwappable: next } : c
                              )
                            );
                          }}
                        />
                        <Text as="span" className="text-sm">
                          Can be swapped
                        </Text>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-base-300 border-t pt-3">
              <VariantPicker
                onPick={addComponent}
                excludeIds={draft.components.map((c) => c.variantId)}
                placeholder="Search products to add…"
              />
            </div>
          </FormSection>

          <FormSection title="How it is priced">
            <Field>
              <FieldLabel>Price of the set</FieldLabel>
              <Select
                color="module"
                aria-label="Price of the set"
                value={draft.pricingMode}
                items={PRICING_LABELS}
                onValueChange={(next) => {
                  set('pricingMode', next as BundlePricingMode);
                }}
              />
            </Field>

            {draft.pricingMode === 'fixed' ? (
              <Field>
                <FieldLabel>Flat price</FieldLabel>
                <FieldControl
                  render={
                    <div className="flex max-w-[12rem] items-center gap-2">
                      <Text as="span" className="text-lg">
                        $
                      </Text>
                      <Input
                        color={fixedError && touched ? 'error' : 'module'}
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={draft.fixedPriceDollars}
                        placeholder="0.00"
                        onChange={(event) => {
                          set('fixedPriceDollars', event.target.value);
                        }}
                      />
                    </div>
                  }
                />
                <FieldDescription>
                  Shoppers pay exactly this, whatever the parts add up to.
                </FieldDescription>
              </Field>
            ) : draft.pricingMode === 'percent_off_sum' ? (
              <Field>
                <FieldLabel>Discount off the parts</FieldLabel>
                <FieldControl
                  render={
                    <div className="flex max-w-[10rem] items-center gap-2">
                      <Input
                        color={percentError && touched ? 'error' : 'module'}
                        type="number"
                        min={0}
                        max={100}
                        inputMode="decimal"
                        value={draft.percentOffSum}
                        placeholder="10"
                        onChange={(event) => {
                          set('percentOffSum', event.target.value);
                        }}
                      />
                      <Text as="span" className="text-lg">
                        %
                      </Text>
                    </div>
                  }
                />
                <FieldDescription>
                  The set costs this much less than buying the parts on their own.
                </FieldDescription>
              </Field>
            ) : (
              <Text className="text-sm">
                The set costs whatever its parts add up to at their normal prices.
              </Text>
            )}
          </FormSection>

          <FormSection
            title="How stock is counted"
            description="When someone buys the bundle, where does the stock come off?"
          >
            <Field>
              <FieldLabel>Take stock from</FieldLabel>
              <Select
                color="module"
                aria-label="Take stock from"
                value={draft.inventoryMode}
                items={INVENTORY_LABELS}
                onValueChange={(next) => {
                  set('inventoryMode', next as BundleInventoryMode);
                }}
              />
              <FieldDescription>
                {draft.inventoryMode === 'decrement_bundle_sku'
                  ? 'You keep a separate stock count for the bundle as its own item.'
                  : 'Selling one bundle removes a unit of each part from stock.'}
              </FieldDescription>
            </Field>
          </FormSection>

          {!isNew && bundle ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Text className="text-sm">
                Deleting removes only the bundle grouping — the products and the wrapper are kept.
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
                Delete this bundle
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── Wrapper product picker (create only) ───────────────────────────────── */

function WrapperProductPicker({ onPick }: { onPick: (product: ProductRow) => void }) {
  const [search, setSearch] = useState('');
  const { data, isPending, isError } = useQuery({
    queryKey: ['commerce', 'products', 'bundle-wrapper-search', { q: search }],
    queryFn: () =>
      api.list<ProductRow>('/v1/commerce/products', {
        ...(search.trim() ? { q: search.trim() } : {}),
        take: 30,
      }),
    staleTime: 30_000,
  });
  const results = data?.items ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-sm min-w-0">
        <SearchInput
          size="sm"
          aria-label="Search products to sell the bundle as"
          placeholder="Search your products…"
          value={search}
          onValueChange={setSearch}
        />
      </div>
      {isError ? (
        <Text className="text-sm">
          Your products could not be searched just now. Try again in a moment.
        </Text>
      ) : isPending ? (
        <Text className="text-sm" role="status">
          Searching…
        </Text>
      ) : results.length === 0 ? (
        <Text className="text-sm">
          {search.trim()
            ? `No product matches “${search.trim()}”.`
            : 'Start typing to find the product to sell this bundle as.'}
        </Text>
      ) : (
        <div className="border-base-300 max-h-72 overflow-y-auto rounded border p-1">
          {results.map((product) => (
            <button
              key={product.id}
              type="button"
              className="hover:bg-base-200 flex w-full items-center gap-3 rounded px-2 py-2 text-left"
              onClick={() => {
                onPick(product);
              }}
            >
              <span className="min-w-0 flex-1 font-medium">{product.title}</span>
              {product.status === 'archived' ? (
                <Badge color="neutral" variant="soft" size="sm">
                  Retired
                </Badge>
              ) : product.status === 'draft' ? (
                <Badge color="info" variant="soft" size="sm">
                  Not on sale
                </Badge>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
