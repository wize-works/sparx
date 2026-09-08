'use client';

// Saving a location, and archiving one. Both are here rather than in the editor
// because each is a several-branch decision about what to send and what to say
// afterwards, and neither is about how the form looks.

import { shownInPlace } from '@wizeworks/query';
import { useToast } from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { addressChanged, addressInput, type Draft } from './location-draft';
import { locationErrorMessage, type Location } from './locations-data';
import type { useArchiveLocation, useCreateLocation, useUpdateLocation } from './locations-data';

export function useLocationSave({
  ctx,
  isNew,
  draft,
  initial,
  existing,
  canSave,
  create,
  update,
  archive,
}: {
  ctx: SurfaceContext;
  isNew: boolean;
  draft: Draft;
  initial: Draft;
  existing: Location | null;
  canSave: boolean;
  create: ReturnType<typeof useCreateLocation>;
  update: ReturnType<typeof useUpdateLocation>;
  archive: ReturnType<typeof useArchiveLocation>;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  /** A new location becomes the manage view for the location that now exists,
   *  rather than a spent form beside a list that has moved on. */
  const createLocation = () => {
    create.mutate(
      {
        name: draft.name.trim(),
        code: draft.code.trim(),
        type: draft.type,
        address: addressInput(draft),
        isActive: draft.isActive,
      },
      {
        onSuccess: (result) => {
          // Toast follows the swap rather than sharing its commit — see
          // afterPaneChange.
          ctx.open('inventory.warehouses.detail', { id: result.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${draft.name.trim()} added`, type: 'success' });
          });
        },
        onError: shownInPlace,
      }
    );
  };

  const submit = () => {
    if (!canSave) return;

    if (isNew) {
      createLocation();
      return;
    }

    update.mutate(
      {
        ...(draft.name !== initial.name ? { name: draft.name.trim() } : {}),
        ...(draft.code !== initial.code ? { code: draft.code.trim() } : {}),
        ...(draft.type !== initial.type ? { type: draft.type } : {}),
        ...(draft.isActive !== initial.isActive ? { isActive: draft.isActive } : {}),
        ...(addressChanged(draft, initial) ? { address: addressInput(draft) } : {}),
      },
      {
        onSuccess: () => {
          toast.add({ title: 'Location saved', type: 'success' });
        },
        // The editor draws both failures in its own banner, with the code
        // conflict moved under the field it belongs to.
        onError: shownInPlace,
      }
    );
  };

  const onArchive = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: `Archive ${existing.name}?`,
      description:
        'This removes it from your locations. Its past movements are kept, but you will not be able to send stock here or count against it. A location can only be archived once it holds no stock.',
      confirmLabel: 'Archive this location',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    archive.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${existing.name} archived`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not archive this location',
          // The server names the real reason ("still holds stock…"); show it.
          description: locationErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return { submit, onArchive };
}
