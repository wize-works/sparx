'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Input, Label, Stack, Text } from '@sparx/ui';
import type { CreateShippingRateInput } from '@sparx/commerce-schemas';

import { formNumber, formString } from '../../../../../../../lib/forms';
import { createShippingRateAction } from '../../../../shipping-actions';

interface ProfileOption {
  id: string;
  name: string;
}

const TYPES: CreateShippingRateInput['type'][] = [
  'flat',
  'by_weight',
  'by_price',
  'by_item_count',
  'free_above_threshold',
];

export function NewRateForm({ zoneId, profiles }: { zoneId: string; profiles: ProfileOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [type, setType] = React.useState<CreateShippingRateInput['type']>('flat');

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (profiles.length === 0) {
      setError('Create a shipping profile first.');
      return;
    }
    const form = new FormData(e.currentTarget);
    const profileId = formString(form, 'profileId');
    const name = formString(form, 'name').trim();
    const currency = formString(form, 'currency', 'USD').toUpperCase();
    const amount = formNumber(form, 'amount');
    const freeAbove = formNumber(form, 'freeAbove');
    const carrier = formString(form, 'carrier').trim();
    const etaDays = formNumber(form, 'etaDays');

    const input: CreateShippingRateInput = {
      zoneId,
      profileId,
      name,
      type,
      currency,
      ...(carrier ? { carrier } : {}),
      ...(etaDays > 0 ? { estimatedDeliveryDays: etaDays } : {}),
    };
    if (type === 'flat') {
      input.amountCents = Math.round(amount * 100);
    } else if (type === 'free_above_threshold') {
      input.amountCents = Math.round(amount * 100);
      input.freeAboveCents = Math.round(freeAbove * 100);
    } else {
      // by_weight | by_price | by_item_count → single starter band; the
      // detail page lets merchants add more later.
      input.bands = [{ min: 0, amountCents: Math.round(amount * 100) }];
    }

    startTransition(async () => {
      const result = await createShippingRateAction(input);
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
          <Stack gap={1} className="min-w-[12rem]">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" name="name" required placeholder="Ground" />
          </Stack>
          <Stack gap={1} className="min-w-[12rem]">
            <Label htmlFor="profileId">Profile *</Label>
            <select
              id="profileId"
              name="profileId"
              required
              className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Stack>
          <Stack gap={1} className="min-w-[8rem]">
            <Label htmlFor="type">Type *</Label>
            <select
              id="type"
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as CreateShippingRateInput['type'])}
              className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Stack>
        </Stack>
        <Stack direction="row" gap={3} wrap>
          <Stack gap={1} className="min-w-[8rem]">
            <Label htmlFor="amount">
              {type === 'flat' || type === 'free_above_threshold'
                ? 'Amount (dollars)'
                : 'First-band amount'}
              *
            </Label>
            <Input id="amount" name="amount" type="number" step="0.01" min="0" required />
          </Stack>
          {type === 'free_above_threshold' && (
            <Stack gap={1} className="min-w-[8rem]">
              <Label htmlFor="freeAbove">Free above (dollars)</Label>
              <Input id="freeAbove" name="freeAbove" type="number" step="0.01" min="0" required />
            </Stack>
          )}
          <Stack gap={1} className="w-24">
            <Label htmlFor="currency">Currency</Label>
            <Input id="currency" name="currency" defaultValue="USD" maxLength={3} />
          </Stack>
          <Stack gap={1} className="min-w-[8rem]">
            <Label htmlFor="carrier">Carrier label</Label>
            <Input id="carrier" name="carrier" placeholder="USPS Priority" />
          </Stack>
          <Stack gap={1} className="w-24">
            <Label htmlFor="etaDays">ETA (days)</Label>
            <Input id="etaDays" name="etaDays" type="number" min={0} max={60} />
          </Stack>
        </Stack>
        {error && (
          <Text size="sm" className="text-[var(--color-danger)]">
            {error}
          </Text>
        )}
        <Stack direction="row" gap={2} justify="end">
          <Button color="module" type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add rate'}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
