'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Input, Stack, Text } from '@sparx/ui';

import { formBool, formString } from '../../../../../../lib/forms';
import { approveReturnAction } from '../../../return-actions';

interface ReturnLineItem {
  id: string;
  orderItemId: string;
  quantity: number;
  approvedQuantity: number;
  reasonCode: string;
}

export function ReturnApprovalForm({
  returnId,
  items,
}: {
  returnId: string;
  items: ReturnLineItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [approved, setApproved] = React.useState<Record<string, number>>(
    Object.fromEntries(items.map((it) => [it.id, it.quantity]))
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const staffNote = formString(form, 'staffNote').trim();
    const generateLabel = formBool(form, 'generateLabel');

    const itemDecisions = items.map((it) => ({
      returnLineItemId: it.id,
      approvedQuantity: approved[it.id] ?? it.quantity,
    }));

    startTransition(async () => {
      const result = await approveReturnAction({
        returnId,
        itemDecisions,
        generateLabel,
        ...(staffNote ? { staffNote } : {}),
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
        {items.map((it) => (
          <Stack key={it.id} direction="row" gap={3} align="center">
            <Text size="xs" className="w-32 font-mono">
              {it.orderItemId.slice(0, 8)}
            </Text>
            <Text size="xs" variant="muted" className="w-20">
              req {it.quantity}
            </Text>
            <Input
              type="number"
              min={0}
              max={it.quantity}
              value={approved[it.id] ?? it.quantity}
              onChange={(e) =>
                setApproved((prev) => ({ ...prev, [it.id]: Number(e.target.value) }))
              }
              className="w-24"
            />
            <Text size="xs" variant="muted">
              approved qty
            </Text>
          </Stack>
        ))}
        <Stack gap={1}>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="generateLabel" defaultChecked />
            <Text size="sm">Generate return label (when ShippingProvider is installed)</Text>
          </label>
        </Stack>
        <Stack gap={1}>
          <Text size="xs" variant="muted">
            Staff note (optional)
          </Text>
          <Input name="staffNote" placeholder="Optional internal note" />
        </Stack>
        {error && (
          <Text size="sm" className="text-[var(--color-danger)]">
            {error}
          </Text>
        )}
        <Stack direction="row" gap={2} justify="end">
          <Button type="submit" disabled={pending}>
            {pending ? 'Approving…' : 'Approve return'}
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
