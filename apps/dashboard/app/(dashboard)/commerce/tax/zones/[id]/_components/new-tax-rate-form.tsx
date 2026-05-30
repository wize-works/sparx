'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Input, Label, Stack, Text } from '@sparx/ui';

import { formBool, formNumber, formString } from '../../../../../../../lib/forms';
import { createTaxRateAction } from '../../../../tax-actions';

export function NewTaxRateForm({ zoneId }: { zoneId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = formString(form, 'name').trim();
    const percent = formNumber(form, 'percent');
    const appliesToShipping = formBool(form, 'appliesToShipping');
    const productTaxClass = formString(form, 'productTaxClass').trim();

    if (percent < 0 || percent > 100) {
      setError('Rate must be between 0 and 100%');
      return;
    }

    startTransition(async () => {
      const result = await createTaxRateAction({
        zoneId,
        name,
        rateBasisPoints: Math.round(percent * 100),
        appliesToShipping,
        ...(productTaxClass ? { productTaxClass } : {}),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={3}>
        <Stack direction="row" gap={3} wrap>
          <Stack gap={1} className="min-w-[14rem]">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" name="name" required placeholder="California sales tax" />
          </Stack>
          <Stack gap={1} className="w-32">
            <Label htmlFor="percent">Rate (%) *</Label>
            <Input
              id="percent"
              name="percent"
              type="number"
              step="0.01"
              min="0"
              max="100"
              required
              placeholder="8.25"
            />
          </Stack>
          <Stack gap={1} className="min-w-[10rem]">
            <Label htmlFor="productTaxClass">Product tax class</Label>
            <Input
              id="productTaxClass"
              name="productTaxClass"
              placeholder="prepared_food"
              maxLength={63}
            />
          </Stack>
        </Stack>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="appliesToShipping" />
          <Text size="sm">Apply this rate to shipping charges too</Text>
        </label>
        {error && (
          <Text size="sm" className="text-[var(--color-danger)]">
            {error}
          </Text>
        )}
        <Stack direction="row" gap={2} justify="end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add rate'}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
