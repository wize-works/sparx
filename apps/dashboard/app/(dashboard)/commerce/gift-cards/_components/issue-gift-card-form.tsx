'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Input, Label, Stack, Text } from '@sparx/ui';

import { issueGiftCardAction } from '../../discount-actions';

export function IssueGiftCardForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [issuedCode, setIssuedCode] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIssuedCode(null);

    const form = new FormData(e.currentTarget);
    const dollars = Number(stringOr(form.get('amount'), '0'));
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError('Amount must be positive');
      return;
    }

    const input: Record<string, unknown> = {
      initialBalanceCents: Math.round(dollars * 100),
      currency: stringOr(form.get('currency'), 'USD').toUpperCase(),
    };

    const email = nonEmpty(form.get('recipientEmail'));
    const name = nonEmpty(form.get('recipientName'));
    const message = nonEmpty(form.get('message'));
    const custom = nonEmpty(form.get('customCode'));
    if (email) input.recipientEmail = email;
    if (name) input.recipientName = name;
    if (message) input.message = message;
    if (custom) input.customCode = custom.toUpperCase();

    startTransition(async () => {
      const result = await issueGiftCardAction(input);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setIssuedCode(result.data.code);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={4}>
        <Stack direction="row" gap={3} wrap>
          <Stack gap={1} className="w-[8rem]">
            <Label htmlFor="amount">Amount ($)</Label>
            <Input id="amount" name="amount" defaultValue="25" />
          </Stack>
          <Stack gap={1} className="w-[6rem]">
            <Label htmlFor="currency">Currency</Label>
            <Input id="currency" name="currency" defaultValue="USD" maxLength={3} />
          </Stack>
          <Stack gap={1} className="min-w-[12rem] flex-1">
            <Label htmlFor="recipientEmail">Recipient email</Label>
            <Input id="recipientEmail" name="recipientEmail" type="email" />
          </Stack>
          <Stack gap={1} className="min-w-[12rem] flex-1">
            <Label htmlFor="recipientName">Recipient name</Label>
            <Input id="recipientName" name="recipientName" />
          </Stack>
        </Stack>
        <Stack gap={1}>
          <Label htmlFor="message">Message (optional)</Label>
          <Input id="message" name="message" placeholder="Happy birthday!" />
        </Stack>
        <Stack gap={1} className="w-[16rem]">
          <Label htmlFor="customCode">Custom code (optional)</Label>
          <Input
            id="customCode"
            name="customCode"
            placeholder="auto-generated when empty"
            pattern="[A-Za-z0-9-]+"
          />
        </Stack>
        <Stack direction="row" gap={2} align="center" className="pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Issuing…' : 'Issue gift card'}
          </Button>
          {error && (
            <Text size="sm" className="text-[var(--color-danger)]">
              {error}
            </Text>
          )}
          {issuedCode && (
            <Text size="sm" className="text-[var(--color-success)]">
              Issued <span className="font-mono">{issuedCode}</span>
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
