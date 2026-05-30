'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

import { Button, useConfirm } from '@sparx/ui';

import { deleteBundleAction } from '../../../configurator-actions';

export function BundleDeleteButton({ bundleId }: { bundleId: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = React.useTransition();

  function onDelete() {
    void (async () => {
      const ok = await confirm({
        title: 'Delete bundle?',
        description:
          'Removes the bundle wrapper. The wrapper product and component variants stay intact.',
        confirmLabel: 'Delete bundle',
        tone: 'danger',
      });
      if (!ok) return;
      startTransition(async () => {
        const result = await deleteBundleAction(bundleId);
        if (!result.ok) {
          console.error('Failed to delete bundle', result.error);
          return;
        }
        router.push('/commerce/bundles');
      });
    })();
  }

  return (
    <Button variant="ghost" onClick={onDelete} disabled={pending}>
      <Trash2 className="h-4 w-4" />
      Delete
    </Button>
  );
}
