'use client';

// Restore-revision button. Confirms first because a restore is a real
// state change (it copies the old body onto the entry and creates a new
// revision — history isn't lost, but the live entry changes). After
// success we router.push back to /cms/[id] so the editor reloads with
// the restored content.

import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  toast,
} from '@sparx/ui';
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
  const [open, setOpen] = React.useState(false);

  function execute() {
    setOpen(false);
    startTransition(async () => {
      const result = await restoreRevision(entryId, revisionNumber);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not restore revision.');
        return;
      }
      toast.success(`Revision #${revisionNumber} restored.`);
      router.push(`/cms/${entryId}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant="module-outline"
        leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
        onClick={() => setOpen(true)}
        disabled={pending}
        loading={pending}
      >
        Restore
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore revision #{revisionNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              The current entry body and SEO will be replaced with the contents of this revision.
              History is preserved — a new revision is created at the top of the stack, so you can
              undo by restoring the previous revision.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={execute}>Restore revision</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
