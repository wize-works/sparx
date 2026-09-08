'use client';

// The Media tab — the photos, and WHEN each one is shown.
//
// Two jobs live here, and only the first is obvious.
//
// The obvious one is the gallery: upload photos, put them in an order, pick the
// main one, take one off. Each of those is a single server write with an
// immediately visible result, so they happen the moment you click — there is no
// draft of "the gallery" to save. They live in product-media-actions.ts.
//
// The second had no interface anywhere in the platform until this tab.
// `VariantImageOptionValue` has had a table, a service and a live endpoint
// (`PUT /v1/commerce/variant-image-bindings`) since Phase 1.2, and nothing has
// ever written to it: a merchant could upload twelve photos of a jacket in four
// colors and had no way to say which photo went with which color. The storefront
// has always been ready for the answer — it shows an image whose pinned
// option-value set is a SUBSET of what the shopper has chosen — it just never
// received one. "Where this photo shows" is that answer, and because it is a form
// rather than a click it is the ONE thing here that is a draft, so it is the only
// thing handed to the toolbar's Save (see product-tab-save.tsx).
//
// The main photo cannot be moved: the server returns images ordered
// `isPrimary DESC, position ASC`, so the hero is first whatever its position
// says, and a "move earlier" that does nothing visible is worse than none.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
} from '@wizeworks/silicaui-react';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useConfirm } from '../../lib/confirm';
import { useTabSave } from './product-tab-save';
import { MediaPickerProvider } from '../cms/media-picker';
import { PhotoGallery } from './product-media-gallery';
import { ImageDetails } from './product-media-details';
import { useGalleryActions } from './product-media-actions';
import { sameBinding, toBinding, toBindingDraft, type Binding } from './product-media-binding';
import { SaveFailure } from '@/components/save-failure';
import {
  useMediaAssets,
  useProductMedia,
  useProductOptions,
  useProductVariants,
  useSetImageBindings,
  type MediaAsset,
  type Product,
} from './products-data';

export function ProductMediaTab({ product }: { ctx: SurfaceContext; product: Product }) {
  const confirm = useConfirm();

  const media = useProductMedia(product.id);
  const variantsQuery = useProductVariants(product.id);
  const optionsQuery = useProductOptions(product.id);

  const images = useMemo(() => media.data ?? [], [media.data]);
  const variants = useMemo(() => variantsQuery.data ?? [], [variantsQuery.data]);
  const options = useMemo(() => optionsQuery.data ?? [], [optionsQuery.data]);

  // One request for every file behind the gallery, keyed on the id SET — see
  // useMediaAssets. Memoised so a re-render with the same images does not mint a
  // new array and re-key the query.
  const assetIds = useMemo(() => images.map((image) => image.mediaAssetId), [images]);
  const assetsQuery = useMediaAssets(assetIds);
  const assets = useMemo(() => {
    const map = new Map<string, MediaAsset>();
    for (const asset of assetsQuery.data ?? []) map.set(asset.id, asset);
    return map;
  }, [assetsQuery.data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const gallery = useGalleryActions(product, images, assets, () => {
    setSelectedId(null);
  });

  // A photo removed elsewhere (or by us) must not leave the details panel open
  // on a row that no longer exists.
  useEffect(() => {
    if (selectedId && !images.some((image) => image.id === selectedId)) setSelectedId(null);
  }, [images, selectedId]);

  const selected = images.find((image) => image.id === selectedId) ?? null;
  const selectedIndex = selected ? images.findIndex((row) => row.id === selected.id) : -1;

  // The one thing on this tab that is a DRAFT. It is held HERE rather than in the
  // details panel because the tab may register exactly one save with the toolbar,
  // and a registration living in a conditionally-rendered child would come and go
  // with the selection.
  const setBindings = useSetImageBindings(product.id);
  const [edit, setEdit] = useState<{ imageId: string; binding: Binding } | null>(null);
  const savedBinding = useMemo(
    () => (selected ? toBindingDraft(selected, options) : null),
    [selected, options]
  );
  // Keyed on the photo, so a stale edit can never be shown against a different
  // one after the selection moves.
  const binding = edit?.imageId === selected?.id ? (edit?.binding ?? null) : savedBinding;
  const bindingDirty = Boolean(binding && savedBinding && !sameBinding(binding, savedBinding));

  useTabSave({
    dirty: bindingDirty,
    saving: setBindings.isPending,
    save: async () => {
      // Safe with nothing selected and nothing changed — the toolbar disables its
      // button, but a keyboard shortcut can still reach this.
      if (!selected || !binding || !bindingDirty) return;
      // Rejects on failure, on purpose: the toolbar reports the server's own
      // sentence. Swallowing it here would let the button claim a write that
      // never landed.
      await setBindings.mutateAsync({ variantImageId: selected.id, ...toBinding(binding) });
      setEdit(null);
    },
  });

  /** Moving off a photo with unsaved settings would drop them with no dialog, so
   *  it asks. Selecting is otherwise free. */
  const selectImage = async (imageId: string | null) => {
    if (bindingDirty && imageId !== selectedId) {
      const ok = await confirm({
        title: 'Discard the changes to this photo?',
        description:
          'The description and the rules for when it shows have not been saved yet. Moving to another photo loses them.',
        confirmLabel: 'Discard them',
        cancelLabel: 'Stay on this photo',
        color: 'warning',
      });
      if (!ok) return;
      setEdit(null);
    }
    setSelectedId(imageId);
  };

  // A failed load REPLACES the tab. An empty gallery beside a live upload box
  // would invite someone to re-upload photos that are already there.
  if (media.isError) {
    return (
      <Alert color="error">
        <AlertContent>
          <AlertTitle>Could not load this product&apos;s photos</AlertTitle>
          <AlertDescription>
            This is a problem reaching the server. Nothing about the photos has changed — they just
            could not be read just now.
          </AlertDescription>
        </AlertContent>
        <Button
          size="sm"
          color="error"
          variant="soft"
          onClick={() => {
            void media.refetch();
          }}
        >
          Try again
        </Button>
      </Alert>
    );
  }

  return (
    // `source="product"` so the picker OPENS on this shop's product photographs
    // rather than everything it has ever uploaded.
    <MediaPickerProvider source="product">
      <div className="flex flex-col gap-4">
        {/* ONE message, the most specific one — the server's own sentence when it
          gave us one. Sits above the gallery because every action below can
          raise it. */}
        <SaveFailure title="That did not work" message={gallery.failure} />

        <PhotoGallery
          productTitle={product.title}
          images={images}
          assets={assets}
          variants={variants}
          options={options}
          selectedId={selectedId}
          loading={media.isPending || variantsQuery.isPending}
          uploading={gallery.uploading}
          onSelect={(imageId) => {
            void selectImage(imageId);
          }}
          onFiles={(files) => {
            void gallery.addFiles(files);
          }}
          onChooseExisting={(assets) => {
            void gallery.addExisting(assets);
          }}
          onReject={gallery.setFailure}
        />

        {selected && binding ? (
          <ImageDetails
            image={selected}
            index={selectedIndex}
            total={images.length}
            canMoveEarlier={
              !selected.isPrimary && selectedIndex > 0 && !images[selectedIndex - 1]?.isPrimary
            }
            canMoveLater={!selected.isPrimary && selectedIndex < images.length - 1}
            asset={assets.get(selected.mediaAssetId) ?? null}
            variants={variants}
            options={options}
            draft={binding}
            busy={gallery.busy}
            onDraftChange={(next) => {
              setEdit({ imageId: selected.id, binding: next });
            }}
            onMove={(delta) => {
              gallery.move(selectedIndex, delta);
            }}
            onSetPrimary={() => {
              gallery.makeMain(selected.id);
            }}
            onRemove={() => {
              void gallery.takeOff(selected);
            }}
          />
        ) : null}
      </div>
    </MediaPickerProvider>
  );
}
