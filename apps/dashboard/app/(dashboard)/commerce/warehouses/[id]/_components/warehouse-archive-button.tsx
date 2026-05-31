'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { Button, Text } from '@sparx/ui';

import { archiveWarehouseAction } from '../../../inventory-actions';

export function WarehouseArchiveButton({
  warehouseId,
  isActive,
}: {
  warehouseId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // Inline confirm — keeps us off the Dialog primitive (not in @sparx/ui)
  // and matches the deletion confirm style on collection-membership-editor.
  const [armed, setArmed] = React.useState(false);

  function onArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveWarehouseAction(warehouseId);
      if (!result.ok) {
        setError(result.error.message);
        setArmed(false);
        return;
      }
      router.push('/commerce/warehouses');
    });
  }

  if (!isActive) {
    return (
      <Text size="xs" variant="muted">
        Already inactive
      </Text>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && (
        <Text size="xs" className="text-[var(--color-danger)]">
          {error}
        </Text>
      )}
      {armed ? (
        <>
          <Button variant="ghost" size="sm" onClick={() => setArmed(false)} disabled={pending}>
            Cancel
          </Button>
          <Button color="danger" size="sm" onClick={onArchive} disabled={pending}>
            {pending ? 'Archiving…' : 'Confirm archive'}
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setArmed(true)}>
          Archive
        </Button>
      )}
    </div>
  );
}
