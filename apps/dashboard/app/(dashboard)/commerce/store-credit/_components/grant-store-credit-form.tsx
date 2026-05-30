'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Input, Label, Stack, Text } from '@sparx/ui';

import { grantStoreCreditAction } from '../../discount-actions';

export interface CustomerOption {
  id: string;
  name: string;
  email: string | null;
}

export function GrantStoreCreditForm({ customers }: { customers: CustomerOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(null);

    const form = new FormData(e.currentTarget);
    const customerId = stringOr(form.get('customerId'), '');
    if (!customerId) {
      setError('Pick a customer');
      return;
    }
    const dollars = Number(stringOr(form.get('amount'), '0'));
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError('Amount must be positive');
      return;
    }
    const note = nonEmpty(form.get('note'));

    const input: Record<string, unknown> = {
      customerId,
      amountCents: Math.round(dollars * 100),
      currency: stringOr(form.get('currency'), 'USD').toUpperCase(),
      reason: 'grant',
    };
    if (note) input.note = note;

    startTransition(async () => {
      const result = await grantStoreCreditAction(input);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDone(`new balance ${(result.data.newBalanceCents / 100).toFixed(2)}`);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={4}>
        <Stack direction="row" gap={3} wrap align="end">
          <Stack gap={1} className="min-w-[18rem] flex-1">
            <Label htmlFor="customerId">Customer</Label>
            <select
              id="customerId"
              name="customerId"
              defaultValue=""
              className="h-9 rounded border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 text-sm"
            >
              <option value="">— pick —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.email && c.email !== c.name ? ` · ${c.email}` : ''}
                </option>
              ))}
            </select>
          </Stack>
          <Stack gap={1} className="w-[8rem]">
            <Label htmlFor="amount">Amount ($)</Label>
            <Input id="amount" name="amount" defaultValue="25" />
          </Stack>
          <Stack gap={1} className="w-[6rem]">
            <Label htmlFor="currency">Currency</Label>
            <Input id="currency" name="currency" defaultValue="USD" maxLength={3} />
          </Stack>
        </Stack>
        <Stack gap={1}>
          <Label htmlFor="note">Note (shows in the customer&apos;s ledger)</Label>
          <Input id="note" name="note" placeholder="Goodwill credit after shipping delay" />
        </Stack>
        <Stack direction="row" gap={2} align="center" className="pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Granting…' : 'Grant credit'}
          </Button>
          {error && (
            <Text size="sm" className="text-[var(--color-danger)]">
              {error}
            </Text>
          )}
          {done && (
            <Text size="sm" className="text-[var(--color-success)]">
              Granted — {done}
            </Text>
          )}
        </Stack>
      </Stack>
    </form>
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
