'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Input, Stack, Text } from '@sparx/ui';

import { formBool, formNumber } from '../../../../../../lib/forms';
import { issueReturnRefundAction } from '../../../return-actions';

export function ReturnRefundForm({
  returnId,
  preferredOutcome,
}: {
  returnId: string;
  preferredOutcome: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const amount = formNumber(form, 'amount');
    const restockingFee = formNumber(form, 'restockingFee');
    const asStoreCredit = formBool(form, 'asStoreCredit');

    if (amount <= 0) {
      setError('Refund amount must be greater than zero.');
      return;
    }

    startTransition(async () => {
      const result = await issueReturnRefundAction({
        returnId,
        refundAmountCents: Math.round(amount * 100),
        ...(restockingFee > 0 ? { restockingFeeCents: Math.round(restockingFee * 100) } : {}),
        asStoreCredit,
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
          <Stack gap={1} className="w-40">
            <Text size="xs" variant="muted">
              Refund amount (dollars) *
            </Text>
            <Input name="amount" type="number" step="0.01" min="0" required />
          </Stack>
          <Stack gap={1} className="w-40">
            <Text size="xs" variant="muted">
              Restocking fee (dollars)
            </Text>
            <Input name="restockingFee" type="number" step="0.01" min="0" />
          </Stack>
        </Stack>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="asStoreCredit"
            defaultChecked={preferredOutcome === 'store_credit'}
          />
          <Text size="sm">Issue as store credit instead of refunding to original payment</Text>
        </label>
        {error && (
          <Text size="sm" className="text-[var(--color-danger)]">
            {error}
          </Text>
        )}
        <Stack direction="row" gap={2} justify="end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Issuing…' : 'Issue refund'}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
