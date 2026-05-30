'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

import { Button, useConfirm } from '@sparx/ui';

import { deleteTaxZoneAction } from '../../../../tax-actions';

export function TaxZoneDeleteButton({ zoneId }: { zoneId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();

  function onDelete() {
    void (async () => {
      const ok = await confirm({
        title: 'Delete tax zone?',
        description:
          'Removes the zone and all rates beneath it. Active checkouts in this jurisdiction will fall through to "no nexus" tax (zero).',
        confirmLabel: 'Delete zone',
        tone: 'danger',
      });
      if (!ok) return;
      startTransition(async () => {
        const result = await deleteTaxZoneAction(zoneId);
        if (!result.ok) {
          console.error('Failed to delete zone', result.error);
          return;
        }
        router.push('/commerce/tax');
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
