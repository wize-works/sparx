'use client';

import * as React from 'react';

import { Button, Heading, Input, Label, NativeSelect, Stack, Text } from '@sparx/ui';

import { createVariantAction } from '../../../variant-actions';

import type { OptionRow } from './variants-panel';

interface Props {
  productId: string;
  options: OptionRow[];
  onCreated: () => void;
  onCancel: () => void;
}

// Single-variant create form. For products with options, the merchant
// picks one value per option (the service requires the set to span the
// whole lattice). For option-less products, the form drops to just SKU +
// price + policy.

export function NewVariantForm({ productId, options, onCreated, onCancel }: Props) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  // One <NativeSelect> per option; tracks the currently picked value id.
  const [picked, setPicked] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const o of options) {
      if (o.values[0]) initial[o.id] = o.values[0].id;
    }
    return initial;
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const sku = stringField(form.get('sku')).trim();
    const priceCentsRaw = stringField(form.get('priceCents')).trim();
    const priceCents = Number.parseInt(priceCentsRaw, 10);
    const inventoryPolicy = stringField(form.get('inventoryPolicy'), 'deny');
    const isDefault = form.get('isDefault') === 'on';
    const barcode = stringField(form.get('barcode')).trim();

    if (!sku) {
      setFieldErrors({ sku: 'SKU is required.' });
      return;
    }
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setFieldErrors({ priceCents: 'Price (cents) must be a non-negative integer.' });
      return;
    }
    if (options.length > 0) {
      const missing = options.filter((o) => !picked[o.id]);
      if (missing.length > 0) {
        setFieldErrors({
          options: `Pick a value for: ${missing.map((o) => o.name).join(', ')}`,
        });
        return;
      }
    }

    const payload = {
      sku,
      priceCents,
      inventoryPolicy,
      isDefault,
      ...(barcode && barcode.length > 0 ? { barcode } : {}),
      optionValueIds: options.map((o) => picked[o.id]!).filter(Boolean),
    };

    startTransition(async () => {
      const result = await createVariantAction(productId, payload);
      if (!result.ok) {
        if (result.error.code === 'VALIDATION_ERROR' && result.error.details?.length) {
          const fe: Record<string, string> = {};
          for (const d of result.error.details) fe[d.field] = d.message;
          setFieldErrors(fe);
        }
        setError(result.error.message);
        return;
      }
      onCreated();
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap={4}>
        <Stack gap={1}>
          <Heading level={4}>New variant</Heading>
          <Text size="sm" variant="muted">
            {options.length === 0
              ? 'This product has no options — fill the SKU + price to add the default purchasable row.'
              : 'Pick one value per option, then set SKU + price.'}
          </Text>
        </Stack>

        {options.length > 0 && (
          <Stack gap={3}>
            {options.map((o) => (
              <Stack key={o.id} gap={2}>
                <Label htmlFor={`pick-${o.id}`}>{o.name}</Label>
                <NativeSelect
                  id={`pick-${o.id}`}
                  value={picked[o.id] ?? ''}
                  onChange={(e) => setPicked((p) => ({ ...p, [o.id]: e.target.value }))}
                >
                  {o.values.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.value}
                    </option>
                  ))}
                </NativeSelect>
              </Stack>
            ))}
            {fieldErrors.options && (
              <Text size="xs" variant="danger">
                {fieldErrors.options}
              </Text>
            )}
          </Stack>
        )}

        <Stack direction="row" gap={3}>
          <Stack gap={2} className="flex-1">
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" name="sku" required placeholder="TS-RED-S" />
            {fieldErrors.sku && (
              <Text size="xs" variant="danger">
                {fieldErrors.sku}
              </Text>
            )}
          </Stack>
          <Stack gap={2} className="w-40">
            <Label htmlFor="priceCents">Price (cents)</Label>
            <Input
              id="priceCents"
              name="priceCents"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              required
              placeholder="1999"
            />
            {fieldErrors.priceCents && (
              <Text size="xs" variant="danger">
                {fieldErrors.priceCents}
              </Text>
            )}
          </Stack>
        </Stack>

        <Stack direction="row" gap={3}>
          <Stack gap={2} className="flex-1">
            <Label htmlFor="barcode">Barcode (optional)</Label>
            <Input id="barcode" name="barcode" placeholder="UPC / EAN / GTIN" />
          </Stack>
          <Stack gap={2} className="flex-1">
            <Label htmlFor="inventoryPolicy">Inventory policy</Label>
            <NativeSelect id="inventoryPolicy" name="inventoryPolicy" defaultValue="deny">
              <option value="deny">Deny when out</option>
              <option value="continue">Continue selling</option>
              <option value="preorder">Preorder</option>
            </NativeSelect>
          </Stack>
        </Stack>

        <Stack direction="row" align="center" gap={2}>
          <input type="checkbox" id="isDefault" name="isDefault" className="h-4 w-4" />
          <Label htmlFor="isDefault">Make this the default variant</Label>
        </Stack>

        {error && (
          <Text size="sm" variant="danger" role="alert" aria-live="polite">
            {error}
          </Text>
        )}

        <Stack direction="row" gap={2} justify="end">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" color="module" disabled={pending} loading={pending}>
            Add variant
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}

// FormData.get() returns string | File | null. We only ever submit text
// fields here, but the union forces a guard before .trim() — otherwise
// typescript-eslint's no-base-to-string flags it. This helper centralizes
// the narrowing.
function stringField(value: FormDataEntryValue | null, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
