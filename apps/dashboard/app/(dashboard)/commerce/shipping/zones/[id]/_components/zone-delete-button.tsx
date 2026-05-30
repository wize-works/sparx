'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

import { Button, useConfirm } from '@sparx/ui';

import { deleteShippingZoneAction } from '../../../../shipping-actions';

export function ZoneDeleteButton({ zoneId }: { zoneId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();

  function onDelete() {
    void (async () => {
      const ok = await confirm({
        title: 'Delete shipping zone?',
        description:
          'All rates attached to this zone are removed. Active checkouts will lose this rate option.',
        confirmLabel: 'Delete zone',
        tone: 'danger',
      });
      if (!ok) return;
      startTransition(async () => {
        const result = await deleteShippingZoneAction(zoneId);
        if (!result.ok) {
          console.error('Failed to delete zone', result.error);
          return;
        }
        router.push('/commerce/shipping');
      });
    })();
  }

  return (
    <Button variant="ghost" onClick={onDelete} disabled={pending}>
      <Trash2 className="h-4 w-4" />
      Delete zone
    </Button>
  );
}
