'use client';

// The writes that are not the Save button: retiring a version, bringing one
// back, choosing which is shown first, and pricing the combinations that have
// never had a version. Each commits on its own and reports on its own.

import { useToast } from '@wizeworks/silicaui-react';

import { useConfirm } from '../../../lib/confirm';
import { slotLabel, suggestSlotSku, type Slot } from './slots';
import {
  formatCents,
  productErrorMessage,
  useArchiveVariant,
  useAssignVariantOptions,
  useCreateVariant,
  useRestoreVariant,
  useSetDefaultVariant,
  type Product,
  type Variant,
} from '../products-data';

export function useVariantActions(
  product: Product,
  all: Variant[],
  live: Variant[],
  /** The code this product already carries. Worked out once in
   *  `useVariantsTab` and handed down, never re-derived here. */
  stem: string
) {
  const toast = useToast();
  const confirm = useConfirm();

  const create = useCreateVariant(product.id);
  const archive = useArchiveVariant(product.id);
  const restore = useRestoreVariant(product.id);
  const setDefault = useSetDefaultVariant(product.id);
  const assign = useAssignVariantOptions(product.id);

  const onRetire = async (variant: Variant) => {
    const ok = await confirm({
      title: `Stop selling ${variant.sku}?`,
      description: `This version comes off your website immediately and nobody can buy it. Its price of ${formatCents(variant.priceCents, variant.currency)} and its code are kept, orders that already contain it are unaffected, and you can bring it back at any time. Its code stays reserved while it is retired, so you cannot give the same code to something else.`,
      confirmLabel: 'Stop selling it',
      cancelLabel: 'Keep selling it',
      color: 'warning',
    });
    if (!ok) return;
    archive.mutate(variant.id, {
      onSuccess: () => {
        toast.add({ title: `${variant.sku} is no longer sold`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not retire that version',
          description: productErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onRestore = (variant: Variant) => {
    restore.mutate(variant.id, {
      onSuccess: () => {
        toast.add({ title: `${variant.sku} is on sale again`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not bring that back',
          description: productErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  /** Gives a version that belongs to no combination one to belong to. Works on a
   *  stopped version as well as one on sale — where it sits and whether it is
   *  being sold are two different facts (issue 305). */
  const onPlace = (variant: Variant, slot: Slot) => {
    assign.mutate(
      {
        variantId: variant.id,
        optionValueIds: slot.coordinate.map((point) => point.valueId),
      },
      {
        onSuccess: () => {
          toast.add({
            title: `${variant.sku} is now ${slotLabel(slot)}`,
            description:
              variant.deletedAt === null
                ? 'Shoppers can reach it again.'
                : 'It is back in the grid, ready to sell again whenever you want it.',
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not put that version in the grid',
            description: productErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onMakeDefault = (variant: Variant) => {
    setDefault.mutate(variant.id, {
      onSuccess: () => {
        toast.add({ title: `${variant.sku} is now the one shown first`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not change that',
          description: productErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const makeEach = async (empty: Slot[], price: number) => {
    const taken = new Set(all.map((variant) => variant.sku.toLowerCase()));
    let made = 0;
    for (const slot of empty) {
      const sku = suggestSlotSku(stem, slot, taken);
      taken.add(sku.toLowerCase());
      try {
        await create.mutateAsync({
          sku,
          priceCents: price,
          optionValueIds: slot.coordinate.map((point) => point.valueId),
        });
        made += 1;
      } catch (error) {
        toast.add({
          title:
            made === 0
              ? 'Could not create those versions'
              : `Created ${String(made)}, then stopped`,
          description: productErrorMessage(error, `${slotLabel(slot)} could not be created.`),
          type: 'error',
        });
        return;
      }
    }
    toast.add({ title: `${String(made)} combinations now have a price`, type: 'success' });
  };

  /** Only ever handed combinations that have never held a version — a retired
   *  one is brought back in place instead (issue 305). */
  const fillTheRest = async (empty: Slot[]) => {
    const price = live.find((variant) => variant.isDefault)?.priceCents ?? product.priceMinCents;
    if (price === null) {
      toast.add({
        title: 'There is no price to copy',
        description: 'Set a price on one combination first, then this can copy it to the rest.',
        type: 'warning',
      });
      return;
    }
    const ok = await confirm({
      title: `Give the other ${String(empty.length)} combinations a price?`,
      description: `Each one is created at ${formatCents(price)} with a code made from its choices, ready for you to change. Nothing goes on sale that was not already on sale.`,
      confirmLabel: 'Create them',
      cancelLabel: 'Not now',
      color: 'primary',
    });
    if (!ok) return;
    await makeEach(empty, price);
  };

  return {
    create,
    restoring: restore.isPending,
    placingId: assign.isPending ? (assign.variables?.variantId ?? null) : null,
    onRetire,
    onRestore,
    onPlace,
    onMakeDefault,
    fillTheRest,
  };
}
