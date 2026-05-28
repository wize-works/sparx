'use client';

// Restore-revision button. Confirms first because a restore is a real
// state change (it copies the old body onto the entry and creates a new
// revision — history isn't lost, but the live entry changes). After
// success we router.push back to /cms/[id] so the editor reloads with
// the restored content.

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Button } from '@sparx/ui';
import { RotateCcw } from 'lucide-react';
import { restoreRevision } from '../../actions';

export function RestoreButton({
  entryId,
  revisionNumber,
}: {
  entryId: string;
  revisionNumber: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function onRestore() {
    if (
      !confirm(
        `Restore revision #${revisionNumber}? A new revision will be created — history is preserved.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await restoreRevision(entryId, revisionNumber);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      router.push(`/cms/${entryId}`);
      router.refresh();
    });
  }

  return (
    <Button
      size="sm"
      variant="module-outline"
      leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
      onClick={onRestore}
      disabled={pending}
      loading={pending}
    >
      Restore
    </Button>
  );
}
