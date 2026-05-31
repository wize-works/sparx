'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Input, Label, Stack, Text, Textarea } from '@sparx/ui';

import { formNumber, formString } from '../../../../../../../lib/forms';
import { createShippingZoneAction } from '../../../../shipping-actions';

export function NewZoneForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = formString(form, 'name').trim();
    const priority = formNumber(form, 'priority', 0);
    const countriesRaw = formString(form, 'countries').trim();
    const regionsRaw = formString(form, 'regions').trim();

    const countries = countriesRaw
      .split(/[,\s]+/)
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);
    const regions = regionsRaw
      .split(/[,\s]+/)
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);

    startTransition(async () => {
      const result = await createShippingZoneAction({
        name,
        priority,
        targeting: { countries, regions, postalCodeRanges: [] },
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(`/commerce/shipping/zones/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={4}>
        <Stack gap={1}>
          <Label htmlFor="name">Name *</Label>
          <Input id="name" name="name" required placeholder="Domestic US" />
        </Stack>
        <Stack gap={1}>
          <Label htmlFor="priority">Priority</Label>
          <Input id="priority" name="priority" type="number" defaultValue={0} min={0} />
          <Text size="xs" variant="muted">
            Higher numbers evaluate first. Use catch-all zones at priority 0.
          </Text>
        </Stack>
        <Stack gap={1}>
          <Label htmlFor="countries">Countries</Label>
          <Textarea
            id="countries"
            name="countries"
            rows={2}
            placeholder="US, CA"
            className="font-mono text-xs"
          />
          <Text size="xs" variant="muted">
            ISO 3166-1 alpha-2 codes. Leave empty to match any country.
          </Text>
        </Stack>
        <Stack gap={1}>
          <Label htmlFor="regions">Regions (optional)</Label>
          <Textarea
            id="regions"
            name="regions"
            rows={2}
            placeholder="US-CA, US-OR"
            className="font-mono text-xs"
          />
          <Text size="xs" variant="muted">
            ISO 3166-2 subdivision codes for narrower targeting.
          </Text>
        </Stack>
        {error && (
          <Text size="sm" className="text-[var(--color-danger)]">
            {error}
          </Text>
        )}
        <Stack direction="row" gap={2} justify="end">
          <Button color="module" type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create zone'}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
