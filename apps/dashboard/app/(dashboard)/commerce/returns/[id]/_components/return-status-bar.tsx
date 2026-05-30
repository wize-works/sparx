'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Package } from 'lucide-react';

import { Button, Stack, Text, useConfirm } from '@sparx/ui';

import { denyReturnAction, markReturnReceivedAction } from '../../../return-actions';

export function ReturnStatusBar({ returnId, status }: { returnId: string; status: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onMarkReceived() {
    startTransition(async () => {
      const result = await markReturnReceivedAction(returnId);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function onDeny() {
    void (async () => {
      const ok = await confirm({
        title: 'Deny return?',
        description:
          'The customer is notified the return was rejected. They may re-open if circumstances change.',
        confirmLabel: 'Deny',
        tone: 'danger',
      });
      if (!ok) return;
      const reason = window.prompt('Reason for denial (shown to customer)?') ?? '';
      if (!reason.trim()) return;
      startTransition(async () => {
        const result = await denyReturnAction({ returnId, reason: reason.trim() });
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        router.refresh();
      });
    })();
  }

  const canDeny = status === 'requested';
  const canMarkReceived =
    status === 'approved' || status === 'awaiting_shipment' || status === 'in_transit';

  return (
    <Stack gap={1} align="end">
      <Stack direction="row" gap={2}>
        {canMarkReceived && (
          <Button variant="secondary" disabled={pending} onClick={onMarkReceived}>
            <Package className="h-4 w-4" />
            Mark received
          </Button>
        )}
        {canDeny && (
          <Button variant="ghost" disabled={pending} onClick={onDeny}>
            Deny
          </Button>
        )}
      </Stack>
      {error && (
        <Text size="xs" className="text-[var(--color-danger)]">
          {error}
        </Text>
      )}
    </Stack>
  );
}
