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
  Textarea,
} from '@sparx/ui';

import { createDiscountAction } from '../../discount-actions';

const TYPES = ['percent', 'fixed', 'free_shipping'] as const;
const STACKING = [
  'none',
  'combine_with_subscribe_and_save',
  'combine_with_loyalty',
  'combine_with_all',
] as const;

export default function NewDiscountPage() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [type, setType] = React.useState<'percent' | 'fixed' | 'free_shipping'>('percent');
  const [isAutomatic, setIsAutomatic] = React.useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = new FormData(e.currentTarget);
    const input: Record<string, unknown> = {
      name: stringOr(form.get('name'), ''),
      description: nonEmpty(form.get('description')),
      type,
      code: isAutomatic ? null : stringOr(form.get('code'), '').toUpperCase(),
      stacking: stringOr(form.get('stacking'), 'none'),
      priority: Number(stringOr(form.get('priority'), '0')) || 0,
      perCustomerLimit: Number(stringOr(form.get('perCustomerLimit'), '1')) || 1,
    };

    if (type === 'percent') {
      const percent = Number(stringOr(form.get('valuePercent'), '0'));
      if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
        setError('Percent must be between 1 and 100');
        return;
      }
      input.valuePercent = percent;
    } else if (type === 'fixed') {
      const dollars = Number(stringOr(form.get('valueDollars'), '0'));
      if (!Number.isFinite(dollars) || dollars <= 0) {
        setError('Amount must be positive');
        return;
      }
      input.valueCents = Math.round(dollars * 100);
      input.currency = stringOr(form.get('currency'), 'USD').toUpperCase();
    }

    const totalLimit = stringOr(form.get('totalUsageLimit'), '');
    if (totalLimit) {
      const limit = Number(totalLimit);
      if (Number.isFinite(limit) && limit > 0) input.totalUsageLimit = limit;
    }

    startTransition(async () => {
      const result = await createDiscountAction(input);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push('/commerce/discounts');
    });
  }

  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New discount"
          description="BOGO and bundle types land in Phase 4 (configurator). Conditions can be added on the detail page after creation."
        />

        <form onSubmit={onSubmit}>
          <Card>
            <CardHeader>
              <Heading level={3}>Basics</Heading>
            </CardHeader>
            <CardContent>
              <Stack gap={4}>
                <Stack gap={1}>
                  <Label htmlFor="name">
                    Internal name<span className="text-[var(--color-danger)]">*</span>
                  </Label>
                  <Input id="name" name="name" placeholder="Welcome 10% off" required />
                  <Text size="xs" variant="muted">
                    Shown in reports; never to customers.
                  </Text>
                </Stack>
                <Stack gap={1}>
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" rows={2} />
                </Stack>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isAutomatic}
                    onChange={(e) => setIsAutomatic(e.target.checked)}
                  />
                  <Text size="sm">Automatic — apply without a code</Text>
                </label>
                {!isAutomatic && (
                  <Stack gap={1}>
                    <Label htmlFor="code">
                      Code<span className="text-[var(--color-danger)]">*</span>
                    </Label>
                    <Input
                      id="code"
                      name="code"
                      pattern="[A-Za-z0-9_-]+"
                      placeholder="WELCOME10"
                      required
                    />
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <Heading level={3}>Discount value</Heading>
            </CardHeader>
            <CardContent>
              <Stack gap={4}>
                <Stack gap={1}>
                  <Label htmlFor="type">Type</Label>
                  <select
                    id="type"
                    name="type"
                    value={type}
                    onChange={(e) => setType(e.target.value as typeof type)}
                    className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Stack>
                {type === 'percent' && (
                  <Stack gap={1} className="w-[8rem]">
                    <Label htmlFor="valuePercent">% off</Label>
                    <Input id="valuePercent" name="valuePercent" defaultValue="10" />
                  </Stack>
                )}
                {type === 'fixed' && (
                  <Stack direction="row" gap={3} wrap>
                    <Stack gap={1} className="w-[8rem]">
                      <Label htmlFor="valueDollars">Amount ($)</Label>
                      <Input id="valueDollars" name="valueDollars" defaultValue="10" />
                    </Stack>
                    <Stack gap={1} className="w-[6rem]">
                      <Label htmlFor="currency">Currency</Label>
                      <Input id="currency" name="currency" defaultValue="USD" maxLength={3} />
                    </Stack>
                  </Stack>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <Heading level={3}>Limits + stacking</Heading>
              <CardDescription>
                perCustomerLimit defaults to 1 — set higher to allow repeat redemptions per shopper.
                Total limit caps redemptions across all customers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Stack direction="row" gap={3} wrap>
                <Stack gap={1} className="w-[8rem]">
                  <Label htmlFor="perCustomerLimit">Per customer</Label>
                  <Input id="perCustomerLimit" name="perCustomerLimit" defaultValue="1" />
                </Stack>
                <Stack gap={1} className="w-[8rem]">
                  <Label htmlFor="totalUsageLimit">Total cap</Label>
                  <Input id="totalUsageLimit" name="totalUsageLimit" placeholder="unlimited" />
                </Stack>
                <Stack gap={1} className="w-[8rem]">
                  <Label htmlFor="priority">Priority</Label>
                  <Input id="priority" name="priority" defaultValue="0" />
                </Stack>
                <Stack gap={1} className="min-w-[16rem]">
                  <Label htmlFor="stacking">Stacking</Label>
                  <select
                    id="stacking"
                    name="stacking"
                    defaultValue="none"
                    className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
                  >
                    {STACKING.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
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
                <Stack direction="row" gap={2} className="ml-auto">
                  <Button variant="ghost" asChild>
                    <Link href="/commerce/discounts">Cancel</Link>
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? 'Saving…' : 'Create discount'}
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

function nonEmpty(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function stringOr(value: FormDataEntryValue | null, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}
