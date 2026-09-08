'use client';

// Removing a rule, and the warning that has to go with it.
//
// Split from `redirects-list.tsx` under RULE #0.5 when the list learned to open
// a rule as well as delete one. One responsibility: the confirm, the mutation,
// and which row is spinning — a surface should not have to hold three pieces of
// state to ask one question.

import { useState } from 'react';
import { useToast } from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { redirectErrorMessage, useDeleteRedirect, type Redirect } from './redirects-data';

export interface RemoveRedirect {
  /** Ask, then remove. Safe to hand straight to a row's button. */
  onDelete: (row: Redirect) => void;
  /** Which row is mid-delete, so only its own button spins. */
  removingId: string | null;
  busy: boolean;
}

export function useRemoveRedirect(): RemoveRedirect {
  const toast = useToast();
  const confirm = useConfirm();
  const remove = useDeleteRedirect();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const onDelete = (row: Redirect) => {
    void (async () => {
      // Names both addresses and the real cost. Removing a rule is not the same
      // as repointing it — this one puts the old link back to being a dead end.
      const ok = await confirm({
        title: 'Remove this redirect?',
        description: `Anyone still using ${row.from_path} will hit a dead end again instead of being sent to ${row.to_path}. You can add it back later, but any search-engine standing it was passing on is lost.`,
        confirmLabel: 'Remove it',
        cancelLabel: 'Keep it',
        color: 'danger',
      });
      if (!ok) return;
      setRemovingId(row.id);
      remove.mutate(row.id, {
        onSuccess: () => {
          toast.add({ title: 'Redirect removed', type: 'success' });
        },
        onError: (err) => {
          toast.add({
            title: 'Could not remove that redirect',
            description: redirectErrorMessage(err, 'Nothing was changed.'),
            type: 'error',
          });
        },
        onSettled: () => {
          setRemovingId(null);
        },
      });
    })();
  };

  return { onDelete, removingId, busy: remove.isPending };
}
