'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import type { inventoryService } from '@sparx/commerce';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Heading,
  Input,
  Label,
  Stack,
  Text,
} from '@sparx/ui';

import { updateWarehouseAction } from '../../../inventory-actions';

const CHANNELS = ['storefront', 'b2b_portal', 'admin', 'subscription'] as const;

type WarehouseRow = Awaited<ReturnType<typeof inventoryService.getWarehouse>>;

export function WarehouseEditForm({ warehouse }: { warehouse: WarehouseRow }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSavedAt(null);

    const form = new FormData(e.currentTarget);
    const checked = (key: string) => form.get(key) === 'on';
    const input = {
      name: stringField(form.get('name'), warehouse.name),
      address: {
        line1: stringField(form.get('line1'), warehouse.line1 ?? ''),
        line2: nonEmpty(form.get('line2')),
        city: stringField(form.get('city'), warehouse.city ?? ''),
        region: nonEmpty(form.get('region')),
        postalCode: nonEmpty(form.get('postalCode')),
        country: stringField(form.get('country'), warehouse.country ?? '').toUpperCase(),
      },
      defaultForChannel: CHANNELS.filter((c) => checked(`channel:${c}`)),
      isActive: checked('isActive'),
    };

    startTransition(async () => {
      const result = await updateWarehouseAction(warehouse.id, input);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <Stack gap={1}>
            <Heading level={3}>Address + defaults</Heading>
            <CardDescription>
              Code + type are fixed at creation. Need a different code? Archive this warehouse
              and create a fresh one.
            </CardDescription>
          </Stack>
        </CardHeader>
        <CardContent>
          <Stack gap={4}>
            <Stack gap={1}>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={warehouse.name} required />
            </Stack>
            <Stack gap={1}>
              <Label htmlFor="line1">Address line 1</Label>
              <Input id="line1" name="line1" defaultValue={warehouse.line1 ?? ''} required />
            </Stack>
            <Stack gap={1}>
              <Label htmlFor="line2">Address line 2</Label>
              <Input id="line2" name="line2" defaultValue={warehouse.line2 ?? ''} />
            </Stack>
            <Stack direction="row" gap={3} wrap>
              <Stack gap={1} className="min-w-[12rem] flex-1">
                <Label htmlFor="city">City</Label>
                <Input id="city" name="city" defaultValue={warehouse.city ?? ''} required />
              </Stack>
              <Stack gap={1} className="min-w-[8rem]">
                <Label htmlFor="region">Region</Label>
                <Input id="region" name="region" defaultValue={warehouse.region ?? ''} />
              </Stack>
              <Stack gap={1} className="min-w-[8rem]">
                <Label htmlFor="postalCode">Postal code</Label>
                <Input
                  id="postalCode"
                  name="postalCode"
                  defaultValue={warehouse.postalCode ?? ''}
                />
              </Stack>
              <Stack gap={1} className="w-[6rem]">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  name="country"
                  defaultValue={warehouse.country ?? ''}
                  maxLength={2}
                  required
                />
              </Stack>
            </Stack>
            <Stack gap={2} className="pt-2">
              <Text size="sm">Default for channel</Text>
              <Stack direction="row" gap={4} wrap>
                {CHANNELS.map((c) => (
                  <label key={c} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name={`channel:${c}`}
                      defaultChecked={warehouse.defaultForChannel.includes(c)}
                    />
                    <Text size="sm">{c}</Text>
                  </label>
                ))}
              </Stack>
              <label className="flex items-center gap-2 pt-2">
                <input type="checkbox" name="isActive" defaultChecked={warehouse.isActive} />
                <Text size="sm">Active</Text>
              </label>
            </Stack>
          </Stack>
        </CardContent>
        <CardFooter>
          <Stack direction="row" gap={2} justify="between" align="center" className="w-full">
            {error && (
              <Text size="sm" className="text-[var(--color-danger)]">
                {error}
              </Text>
            )}
            {savedAt && !error && (
              <Text size="xs" variant="muted">
                Saved {savedAt}
              </Text>
            )}
            <Button type="submit" disabled={pending} className="ml-auto">
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </Stack>
        </CardFooter>
      </Card>
    </form>
  );
}

function nonEmpty(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function stringField(value: FormDataEntryValue | null, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}
