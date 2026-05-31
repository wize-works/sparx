'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Input, Label, Stack, Text } from '@sparx/ui';

import { formString } from '../../../../../../../lib/forms';
import { createTaxZoneAction } from '../../../../tax-actions';

const NEXUS = ['physical', 'economic', 'voluntary'] as const;

export function NewTaxZoneForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const country = formString(form, 'country').toUpperCase().trim();
    const region = formString(form, 'region').toUpperCase().trim();
    const nexusType = formString(form, 'nexusType', 'physical') as (typeof NEXUS)[number];
    const registrationNumber = formString(form, 'registrationNumber').trim();

    startTransition(async () => {
      const result = await createTaxZoneAction({
        country,
        ...(region ? { region } : {}),
        nexusType,
        ...(registrationNumber ? { registrationNumber } : {}),
        isActive: true,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(`/commerce/tax/zones/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={4}>
        <Stack direction="row" gap={3} wrap>
          <Stack gap={1} className="w-24">
            <Label htmlFor="country">Country *</Label>
            <Input id="country" name="country" required maxLength={2} placeholder="US" />
          </Stack>
          <Stack gap={1} className="w-32">
            <Label htmlFor="region">Region</Label>
            <Input id="region" name="region" maxLength={6} placeholder="US-CA" />
          </Stack>
          <Stack gap={1} className="min-w-[10rem]">
            <Label htmlFor="nexusType">Nexus *</Label>
            <select
              id="nexusType"
              name="nexusType"
              defaultValue="physical"
              className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
            >
              {NEXUS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Stack>
        </Stack>
        <Stack gap={1}>
          <Label htmlFor="registrationNumber">Registration number</Label>
          <Input id="registrationNumber" name="registrationNumber" maxLength={63} />
          <Text size="xs" variant="muted">
            Sales-tax permit, VAT ID, or equivalent.
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
