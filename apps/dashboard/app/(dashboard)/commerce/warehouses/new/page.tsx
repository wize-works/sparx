'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Container,
  Heading,
  Input,
  Label,
  PageHeader,
  Stack,
  Text,
} from '@sparx/ui';

import { createWarehouseAction } from '../../inventory-actions';

const CHANNELS = ['storefront', 'b2b_portal', 'admin', 'subscription'] as const;
const TYPES = ['owned', '3pl', 'dropship', 'virtual'] as const;

export default function NewWarehousePage() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const checked = (key: string) => form.get(key) === 'on';
    const input = {
      name: stringField(form.get('name'), ''),
      code: stringField(form.get('code'), '').toUpperCase(),
      type: stringField(form.get('type'), 'owned'),
      address: {
        line1: stringField(form.get('line1'), ''),
        line2: nonEmpty(form.get('line2')),
        city: stringField(form.get('city'), ''),
        region: nonEmpty(form.get('region')),
        postalCode: nonEmpty(form.get('postalCode')),
        country: stringField(form.get('country'), '').toUpperCase(),
      },
      defaultForChannel: CHANNELS.filter((c) => checked(`channel:${c}`)),
      isActive: checked('isActive'),
    };

    startTransition(async () => {
      const result = await createWarehouseAction(input);
      if (!result.ok) {
        setError(result.error.message);
        const map: Record<string, string> = {};
        for (const d of result.error.details ?? []) map[d.field] = d.message;
        setFieldErrors(map);
        return;
      }
      router.push(`/commerce/warehouses/${result.data.id}`);
    });
  }

  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New warehouse"
          description="Set the basics now; reorder defaults + hours of operation can be edited after the warehouse exists."
        />

        <form onSubmit={onSubmit}>
          <Card>
            <CardHeader>
              <Stack gap={1}>
                <Heading level={3}>Basics</Heading>
                <CardDescription>
                  Name shows in the dashboard; code is the SKU prefix.
                </CardDescription>
              </Stack>
            </CardHeader>
            <CardContent>
              <Stack gap={4}>
                <Field label="Name" name="name" required error={fieldErrors.name} />
                <Field
                  label="Code"
                  name="code"
                  required
                  hint="A-Z, 0-9, _, -. Used as the SKU prefix. Examples: MAIN, EAST, 3PL-NYC."
                  pattern="[A-Za-z0-9_-]+"
                  error={fieldErrors.code}
                />
                <Stack gap={1}>
                  <Label htmlFor="type">Type</Label>
                  <select
                    id="type"
                    name="type"
                    defaultValue="owned"
                    className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <Text size="xs" variant="muted">
                    `dropship` warehouses are populated by supplier feeds; `virtual` is a
                    placeholder for digital-only catalogs.
                  </Text>
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <Stack gap={1}>
                <Heading level={3}>Address</Heading>
                <CardDescription>
                  Country is required and ISO 3166-1 alpha-2 (US, CA, GB…).
                </CardDescription>
              </Stack>
            </CardHeader>
            <CardContent>
              <Stack gap={4}>
                <Field label="Line 1" name="line1" required error={fieldErrors['address.line1']} />
                <Field label="Line 2" name="line2" />
                <Stack direction="row" gap={3} wrap>
                  <Field label="City" name="city" required error={fieldErrors['address.city']} />
                  <Field label="Region / State" name="region" />
                  <Field label="Postal code" name="postalCode" />
                  <Field
                    label="Country"
                    name="country"
                    required
                    maxLength={2}
                    placeholder="US"
                    error={fieldErrors['address.country']}
                  />
                </Stack>
              </Stack>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <Stack gap={1}>
                <Heading level={3}>Default channels</Heading>
                <CardDescription>
                  When a cart on the named channel has no explicit warehouse, the picker uses this
                  as a fallback. Optional — leave empty if you want every channel routed the same
                  way.
                </CardDescription>
              </Stack>
            </CardHeader>
            <CardContent>
              <Stack gap={2}>
                {CHANNELS.map((c) => (
                  <label key={c} className="flex items-center gap-2">
                    <input type="checkbox" name={`channel:${c}`} />
                    <Text size="sm">{c}</Text>
                  </label>
                ))}
                <label className="flex items-center gap-2 pt-2">
                  <input type="checkbox" name="isActive" defaultChecked />
                  <Text size="sm">Active</Text>
                </label>
              </Stack>
            </CardContent>
            <CardFooter>
              <Stack direction="row" gap={2} justify="between" align="center" className="w-full">
                {error && (
                  <Text size="sm" className="text-[var(--color-danger)]">
                    {error}
                  </Text>
                )}
                <Stack direction="row" gap={2} className="ml-auto">
                  <Button variant="ghost" asChild>
                    <Link href="/commerce/warehouses">Cancel</Link>
                  </Button>
                  <Button color="module" type="submit" disabled={pending}>
                    {pending ? 'Saving…' : 'Create warehouse'}
                  </Button>
                </Stack>
              </Stack>
            </CardFooter>
          </Card>
        </form>
      </Stack>
    </Container>
  );
}

function Field({
  label,
  name,
  required,
  hint,
  error,
  pattern,
  maxLength,
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  hint?: string;
  error?: string;
  pattern?: string;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <Stack gap={1}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-[var(--color-danger)]">*</span>}
      </Label>
      <Input
        id={name}
        name={name}
        required={required}
        pattern={pattern}
        maxLength={maxLength}
        placeholder={placeholder}
      />
      {hint && (
        <Text size="xs" variant="muted">
          {hint}
        </Text>
      )}
      {error && (
        <Text size="xs" className="text-[var(--color-danger)]">
          {error}
        </Text>
      )}
    </Stack>
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
