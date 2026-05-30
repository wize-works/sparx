'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

import {
  Badge,
  Button,
  Input,
  Label,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@sparx/ui';

import { createBundleAction, updateBundleAction } from '../../configurator-actions';

export interface BundleProductOption {
  id: string;
  title: string;
  handle: string;
  status: string;
}

export interface VariantOption {
  id: string;
  sku: string;
  title: string | null;
  priceCents: number;
  productId: string;
  productTitle: string;
}

export interface ComponentDraft {
  variantId: string;
  defaultQuantity: number;
  isRequired: boolean;
  isSwappable: boolean;
  swappableProductId: string | null;
  position: number;
}

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function BundleEditor({
  products,
  variants,
  bundleId,
  initialBundleProductId,
  initialPricingMode = 'sum_of_components',
  initialFixedPriceCents = null,
  initialPercentOffSum = null,
  initialInventoryMode = 'decrement_components',
  initialComponents = [],
}: {
  products: BundleProductOption[];
  variants: VariantOption[];
  bundleId?: string;
  initialBundleProductId?: string;
  initialPricingMode?: 'sum_of_components' | 'fixed' | 'percent_off_sum';
  initialFixedPriceCents?: number | null;
  initialPercentOffSum?: number | null;
  initialInventoryMode?: 'decrement_components' | 'decrement_bundle_sku';
  initialComponents?: ComponentDraft[];
}) {
  const router = useRouter();
  const isEdit = Boolean(bundleId);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [bundleProductId, setBundleProductId] = React.useState(initialBundleProductId ?? '');
  const [pricingMode, setPricingMode] = React.useState<
    'sum_of_components' | 'fixed' | 'percent_off_sum'
  >(initialPricingMode);
  const [fixedPriceDollars, setFixedPriceDollars] = React.useState<string>(
    initialFixedPriceCents != null ? (initialFixedPriceCents / 100).toFixed(2) : ''
  );
  const [percentOff, setPercentOff] = React.useState<string>(
    initialPercentOffSum != null ? String(initialPercentOffSum) : ''
  );
  const [inventoryMode, setInventoryMode] = React.useState<
    'decrement_components' | 'decrement_bundle_sku'
  >(initialInventoryMode);
  const [components, setComponents] = React.useState<ComponentDraft[]>(initialComponents);
  const [variantPick, setVariantPick] = React.useState<string>('');

  const variantById = React.useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  const sumOfComponentsCents = components.reduce((acc, c) => {
    const v = variantById.get(c.variantId);
    return acc + (v ? v.priceCents * c.defaultQuantity : 0);
  }, 0);

  function addComponent() {
    if (!variantPick) return;
    if (components.some((c) => c.variantId === variantPick)) {
      setError('That variant is already a component');
      return;
    }
    setComponents((prev) => [
      ...prev,
      {
        variantId: variantPick,
        defaultQuantity: 1,
        isRequired: true,
        isSwappable: false,
        swappableProductId: null,
        position: prev.length,
      },
    ]);
    setVariantPick('');
    setError(null);
  }

  function updateComponent(index: number, patch: Partial<ComponentDraft>) {
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function removeComponent(index: number) {
    setComponents((prev) =>
      prev.filter((_, i) => i !== index).map((c, i) => ({ ...c, position: i }))
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!bundleProductId && !isEdit) {
      setError('Pick a wrapper product');
      return;
    }
    if (components.length === 0) {
      setError('Add at least one component');
      return;
    }
    let fixedPriceCents: number | undefined;
    if (pricingMode === 'fixed') {
      const dollars = Number(fixedPriceDollars);
      if (!Number.isFinite(dollars) || dollars <= 0) {
        setError('Fixed price must be a positive amount');
        return;
      }
      fixedPriceCents = Math.round(dollars * 100);
    }
    let percentOffSum: number | undefined;
    if (pricingMode === 'percent_off_sum') {
      const p = Number(percentOff);
      if (!Number.isFinite(p) || p <= 0 || p >= 100) {
        setError('Percent off must be between 0 and 100');
        return;
      }
      percentOffSum = p;
    }

    const payload = {
      pricingMode,
      fixedPriceCents,
      percentOffSum,
      inventoryMode,
      components: components.map((c, i) => ({
        variantId: c.variantId,
        defaultQuantity: c.defaultQuantity,
        isRequired: c.isRequired,
        isSwappable: c.isSwappable,
        swappableProductId: c.swappableProductId ?? undefined,
        position: i,
      })),
    };

    startTransition(async () => {
      if (isEdit && bundleId) {
        const result = await updateBundleAction(bundleId, payload);
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        router.refresh();
      } else {
        const result = await createBundleAction({ ...payload, bundleProductId });
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        router.push(`/commerce/bundles/${result.data.id}`);
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={6}>
        {!isEdit && (
          <Stack gap={1}>
            <Label htmlFor="bundleProductId">Bundle wrapper product *</Label>
            <select
              id="bundleProductId"
              value={bundleProductId}
              onChange={(e) => setBundleProductId(e.target.value)}
              className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
            >
              <option value="">— select a product —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.status})
                </option>
              ))}
            </select>
            <Text size="xs" variant="muted">
              The product the customer sees on the storefront. Cannot already be a bundle wrapper.
            </Text>
          </Stack>
        )}

        <Stack direction="row" gap={4} wrap>
          <Stack gap={1} className="min-w-[12rem] flex-1">
            <Label htmlFor="pricingMode">Pricing mode</Label>
            <select
              id="pricingMode"
              value={pricingMode}
              onChange={(e) =>
                setPricingMode(e.target.value as 'sum_of_components' | 'fixed' | 'percent_off_sum')
              }
              className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
            >
              <option value="sum_of_components">Sum of components</option>
              <option value="fixed">Fixed price</option>
              <option value="percent_off_sum">Percent off sum</option>
            </select>
          </Stack>
          {pricingMode === 'fixed' && (
            <Stack gap={1} className="min-w-[10rem] flex-1">
              <Label htmlFor="fixedPrice">Fixed price (USD)</Label>
              <Input
                id="fixedPrice"
                type="number"
                step="0.01"
                min="0.01"
                value={fixedPriceDollars}
                onChange={(e) => setFixedPriceDollars(e.target.value)}
              />
            </Stack>
          )}
          {pricingMode === 'percent_off_sum' && (
            <Stack gap={1} className="min-w-[10rem] flex-1">
              <Label htmlFor="percentOff">Percent off sum</Label>
              <Input
                id="percentOff"
                type="number"
                step="1"
                min="1"
                max="99"
                value={percentOff}
                onChange={(e) => setPercentOff(e.target.value)}
              />
            </Stack>
          )}
          <Stack gap={1} className="min-w-[12rem] flex-1">
            <Label htmlFor="inventoryMode">Inventory mode</Label>
            <select
              id="inventoryMode"
              value={inventoryMode}
              onChange={(e) =>
                setInventoryMode(e.target.value as 'decrement_components' | 'decrement_bundle_sku')
              }
              className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
            >
              <option value="decrement_components">Decrement components</option>
              <option value="decrement_bundle_sku">Decrement bundle SKU</option>
            </select>
            <Text size="xs" variant="muted">
              Choose &ldquo;bundle SKU&rdquo; when the wrapper product itself carries assembled
              stock.
            </Text>
          </Stack>
        </Stack>

        <Stack gap={3}>
          <Stack direction="row" align="center" justify="between" wrap gap={2}>
            <Stack gap={0}>
              <Heading3>Components</Heading3>
              <Text size="xs" variant="muted">
                Sum of components: {moneyFmt.format(sumOfComponentsCents / 100)}
              </Text>
            </Stack>
            <Stack direction="row" gap={2} align="center">
              <select
                value={variantPick}
                onChange={(e) => setVariantPick(e.target.value)}
                className="h-9 max-w-[20rem] rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
              >
                <option value="">— pick variant —</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.productTitle} · {v.sku}
                    {v.title ? ` (${v.title})` : ''} — {moneyFmt.format(v.priceCents / 100)}
                  </option>
                ))}
              </select>
              <Button type="button" variant="secondary" onClick={addComponent}>
                Add
              </Button>
            </Stack>
          </Stack>

          {components.length === 0 ? (
            <Text size="sm" variant="muted">
              No components yet — pick a variant above to add one.
            </Text>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead>Default qty</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Swappable</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {components.map((c, i) => {
                  const v = variantById.get(c.variantId);
                  return (
                    <TableRow key={c.variantId}>
                      <TableCell>
                        <Stack gap={0}>
                          <Text size="sm">{v?.productTitle ?? '—'}</Text>
                          <Text size="xs" variant="muted">
                            {v?.sku ?? c.variantId.slice(0, 8) + '…'}
                          </Text>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={c.defaultQuantity}
                          onChange={(e) =>
                            updateComponent(i, {
                              defaultQuantity: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={c.isRequired}
                          onChange={(e) => updateComponent(i, { isRequired: e.target.checked })}
                        />
                      </TableCell>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={c.isSwappable}
                          onChange={(e) => updateComponent(i, { isSwappable: e.target.checked })}
                        />
                        {c.isSwappable && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            same product
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeComponent(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Stack>

        {error && (
          <Text size="sm" className="text-[var(--color-danger)]">
            {error}
          </Text>
        )}

        <Stack direction="row" gap={2} justify="end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save bundle' : 'Create bundle'}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}

function Heading3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-medium">{children}</h3>;
}
