'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Input, Label, Stack, Text, Textarea } from '@sparx/ui';

import { formBool, formString } from '../../../../../../../lib/forms';
import { createShippingProfileAction } from '../../../../shipping-actions';

const HAZMAT_CLASSES = [
  'none',
  'class_1_explosive',
  'class_2_gas',
  'class_3_flammable_liquid',
  'class_4_flammable_solid',
  'class_5_oxidizer',
  'class_6_toxic',
  'class_7_radioactive',
  'class_8_corrosive',
  'class_9_misc',
] as const;

export function NewProfileForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [hazmat, setHazmat] = React.useState<Set<string>>(new Set(['none']));

  function toggleHazmat(cls: string) {
    setHazmat((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      if (next.size === 0) next.add('none');
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const name = formString(form, 'name').trim();
    const description = formString(form, 'description').trim();
    const carriersRaw = formString(form, 'carriers').trim();
    const carriers = carriersRaw
      .split(/[,\s]+/)
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);
    const requiresSignature = formBool(form, 'requiresSignature');
    const requiresFreight = formBool(form, 'requiresFreight');

    startTransition(async () => {
      const result = await createShippingProfileAction({
        name,
        ...(description ? { description } : {}),
        allowedCarrierServices: carriers,
        hazmatClassesAllowed: Array.from(hazmat) as (typeof HAZMAT_CLASSES)[number][],
        requiresSignature,
        requiresFreight,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(`/commerce/shipping/profiles/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={4}>
        <Stack gap={1}>
          <Label htmlFor="name">Name *</Label>
          <Input id="name" name="name" required placeholder="General goods" />
        </Stack>
        <Stack gap={1}>
          <Label htmlFor="description">Description</Label>
          <Input id="description" name="description" />
        </Stack>
        <Stack gap={1}>
          <Label htmlFor="carriers">Allowed carrier services</Label>
          <Textarea
            id="carriers"
            name="carriers"
            rows={2}
            placeholder="usps_priority, ups_ground"
            className="font-mono text-xs"
          />
          <Text size="xs" variant="muted">
            Carrier service slugs separated by commas. Leave empty to allow any.
          </Text>
        </Stack>
        <Stack gap={2}>
          <Label>Hazmat classes allowed</Label>
          <Stack direction="row" gap={2} wrap>
            {HAZMAT_CLASSES.map((cls) => (
              <label key={cls} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={hazmat.has(cls)}
                  onChange={() => toggleHazmat(cls)}
                />
                <Text size="xs">{cls}</Text>
              </label>
            ))}
          </Stack>
        </Stack>
        <Stack direction="row" gap={4}>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="requiresSignature" />
            <Text size="sm">Requires signature</Text>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="requiresFreight" />
            <Text size="sm">Freight only</Text>
          </label>
        </Stack>
        {error && (
          <Text size="sm" className="text-[var(--color-danger)]">
            {error}
          </Text>
        )}
        <Stack direction="row" gap={2} justify="end">
          <Button color="module" type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create profile'}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
