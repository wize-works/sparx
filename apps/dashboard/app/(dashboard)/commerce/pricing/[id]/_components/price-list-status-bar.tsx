'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Stack, Text } from '@sparx/ui';

import { archivePriceListAction, updatePriceListAction } from '../../../pricing-actions';

export function PriceListStatusBar({
  priceListId,
  status,
}: {
  priceListId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [armed, setArmed] = React.useState(false);

  function transition(next: 'active' | 'draft') {
    setError(null);
    startTransition(async () => {
      const result = await updatePriceListAction(priceListId, { status: next });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function archive() {
    setError(null);
    startTransition(async () => {
      const result = await archivePriceListAction(priceListId);
      if (!result.ok) {
        setError(result.error.message);
        setArmed(false);
        return;
      }
      router.push('/commerce/pricing');
    });
  }

  return (
    <Stack direction="row" gap={2} align="center">
      {error && (
        <Text size="xs" className="text-[var(--color-danger)]">
          {error}
        </Text>
      )}
      {status === 'draft' && (
        <Button size="sm" disabled={pending} onClick={() => transition('active')}>
          Activate
        </Button>
      )}
      {status === 'active' && (
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => transition('draft')}
        >
          Move to draft
        </Button>
      )}
      {status !== 'archived' &&
        (armed ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setArmed(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={archive} disabled={pending}>
              {pending ? 'Archiving…' : 'Confirm archive'}
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setArmed(true)}>
            Archive
          </Button>
        ))}
    </Stack>
  );
}
