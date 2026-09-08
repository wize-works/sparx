'use client';

// The Media tab — the photos, and WHEN each one is shown.
//
// Two jobs live here, and only the first is obvious.
//
// The obvious one is the gallery: upload photos, put them in an order, pick the
// main one, take one off. Each of those is a single server write with an
// immediately visible result, so they happen the moment you click — there is no
// draft of "the gallery" to save.
//
// The second is the one that had no interface anywhere in the platform until
// this tab. `VariantImageOptionValue` has had a table, a service and a live
// endpoint (`PUT /v1/commerce/variant-image-bindings`) since Phase 1.2, and
// nothing has ever written to it: a merchant could upload twelve photos of a
// jacket in four colors and had no way to say which photo went with which
// color. The storefront has always been ready for the answer — it shows an
// image whose pinned option-value set is a SUBSET of what the shopper has
// chosen — it just never received one. "Where this photo shows" below is that
// answer, and because it is a form rather than a click it is the ONE thing on
// this tab that is a draft — so it is the only thing this tab hands to the
// toolbar's Save (see product-tab-save.tsx). Everything else here commits on
// click and is never "unsaved work".
//
// ── Why the three modes, rather than the two fields underneath ───────────
//
// The endpoint takes `variantId` AND `optionValueIds`, and the storefront
// resolves them in that priority order. Exposed literally that is two controls
// that can contradict each other, and no owner of a shop should have to know
// which one wins. They collapse without loss into three mutually exclusive
// answers to one question — every version, one version, or a set of choices —
// so that is what is on screen, and `toBinding()` turns the answer back into
// the pair the server wants.
//
// ── Why the main photo cannot be moved ───────────────────────────────────
//
// The server returns images ordered `isPrimary DESC, position ASC`, so the hero
// is first whatever its position says. Offering "move earlier" on it would do
// nothing visible, which is worse than not offering it — so the control is
// absent and the section says why in one line.

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dropzone,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  RadioGroup,
  RadioOption,
  Select,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { ChevronLeft, ChevronRight, ImageOff, Star, Trash2, Upload } from 'lucide-react';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useTabSave } from './product-tab-save';
import { SaveFailure } from '@/components/save-failure';
import {
  productErrorMessage,
  useAddProductImage,
  useMediaAssets,
  useProductMedia,
  useProductOptions,
  useProductVariants,
  useRemoveProductImage,
  useReorderProductImages,
  useSetImageBindings,
  useSetPrimaryImage,
  useUploadMedia,
  type MediaAsset,
  type Product,
  type ProductImage,
  type ProductOption,
  type Variant,
} from './products-data';

/** 8 MB. Bigger than any real product photo and far under the server's 200 MB
 *  ceiling — rejecting a 40 MB camera original HERE means the operator finds out
 *  instantly instead of after a minute of upload. */
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/avif,image/gif';

/* ── The binding, as three answers rather than two fields ───────────────── */

type ShowMode = 'always' | 'variant' | 'choices';

interface Binding {
  mode: ShowMode;
  /** Set when `mode` is `variant`. */
  variantId: string | null;
  /** One entry per option axis, `''` meaning "any value of this one". Kept as a
   *  full map rather than a sparse list so the controls are stable — an axis
   *  never disappears from the form because nothing is pinned on it. */
  byOption: Record<string, string>;
  alt: string;
}

function toBindingDraft(image: ProductImage, options: ProductOption[]): Binding {
  const byOption: Record<string, string> = {};
  for (const option of options) {
    const chosen = option.values.find((value) => image.optionValueIds.includes(value.id));
    byOption[option.id] = chosen?.id ?? '';
  }
  const mode: ShowMode = image.variantId
    ? 'variant'
    : image.optionValueIds.length > 0
      ? 'choices'
      : 'always';
  return { mode, variantId: image.variantId, byOption, alt: image.alt ?? '' };
}

/** What the endpoint actually wants. `variantId`/`optionValueIds` are
 *  authoritative — an omitted one CLEARS — so every mode names both explicitly.
 *  `alt` is patch-style, and an emptied field means "clear it", not "blank
 *  string". */
function toBinding(draft: Binding): {
  variantId: string | null;
  optionValueIds: string[];
  alt: string | null;
} {
  const alt = draft.alt.trim() === '' ? null : draft.alt.trim();
  if (draft.mode === 'variant') {
    return { variantId: draft.variantId, optionValueIds: [], alt };
  }
  if (draft.mode === 'choices') {
    return {
      variantId: null,
      optionValueIds: Object.values(draft.byOption).filter((id) => id !== ''),
      alt,
    };
  }
  return { variantId: null, optionValueIds: [], alt };
}

function sameBinding(a: Binding, b: Binding): boolean {
  const left = toBinding(a);
  const right = toBinding(b);
  return (
    left.variantId === right.variantId &&
    left.alt === right.alt &&
    left.optionValueIds.length === right.optionValueIds.length &&
    left.optionValueIds.every((id) => right.optionValueIds.includes(id))
  );
}

/* ── Saying what a photo is, in one line ────────────────────────────────── */

function variantLabel(variant: Variant): string {
  return variant.title?.trim() ? variant.title : variant.sku;
}

/** What this photo is currently pinned to, in the owner's words. Used on the
 *  tile so the gallery answers "which of these is the red one" without anything
 *  being selected first. */
function bindingSummary(
  image: ProductImage,
  variants: Variant[],
  options: ProductOption[]
): string | null {
  if (image.variantId) {
    const variant = variants.find((row) => row.id === image.variantId);
    return variant ? variantLabel(variant) : 'One version';
  }
  if (image.optionValueIds.length === 0) return null;
  const names = options.flatMap((option) =>
    option.values.filter((value) => image.optionValueIds.includes(value.id)).map((v) => v.value)
  );
  return names.length > 0 ? names.join(' · ') : null;
}

/* ── The tab ────────────────────────────────────────────────────────────── */

export function ProductMediaTab({ product }: { ctx: SurfaceContext; product: Product }) {
  const toast = useToast();
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

  const upload = useUploadMedia();
  const addImage = useAddProductImage(product.id);
  const reorder = useReorderProductImages(product.id);
  const setPrimary = useSetPrimaryImage(product.id);
  const removeImage = useRemoveProductImage(product.id);
  const setBindings = useSetImageBindings(product.id);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The last thing that went wrong, in the server's own words. One message, on
  // the panel it belongs to — never stacked with a generic "something failed".
  // Save failures do NOT land here: `useTabSave`'s promise rejects and the
  // toolbar reports, so catching one here would print the same problem twice.
  const [failure, setFailure] = useState<string | null>(null);

  // A photo removed elsewhere (or by us) must not leave the details panel open
  // on a row that no longer exists.
  useEffect(() => {
    if (selectedId && !images.some((image) => image.id === selectedId)) setSelectedId(null);
  }, [images, selectedId]);

  const selected = images.find((image) => image.id === selectedId) ?? null;

  // ── The one thing on this tab that is a DRAFT ────────────────────────────
  //
  // Uploading, reordering, set-primary and remove each commit on their own the
  // moment they are clicked — they are actions, not unsaved changes, so none of
  // them goes through the toolbar's Save. What IS a draft is the selected
  // photo's description and the rules for when it shows: a form someone fills
  // in and then commits.
  //
  // It is held HERE rather than inside the details panel because the tab may
  // register exactly one save with the toolbar, and a registration living in a
  // conditionally-rendered child would come and go with the selection.
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
      // Safe with nothing selected and nothing changed — the toolbar disables
      // its button, but a keyboard shortcut can still reach this.
      if (!selected || !binding || !bindingDirty) return;
      // Rejects on failure, on purpose: the toolbar reports the server's own
      // sentence. Swallowing it here would let the button claim a write that
      // never landed.
      await setBindings.mutateAsync({ variantImageId: selected.id, ...toBinding(binding) });
      setEdit(null);
    },
  });

  const uploading = upload.isPending || addImage.isPending;
  const selectedIndex = selected ? images.findIndex((row) => row.id === selected.id) : -1;

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

  const onFiles = async (files: File[]) => {
    setFailure(null);
    // Sequential, not parallel: `position` is assigned from the count so far, and
    // three concurrent adds would all claim the same slot. Ten photos at a time
    // is not a throughput problem worth a batching endpoint.
    let position = images.length;
    for (const file of files) {
      try {
        const mediaAssetId = await upload.mutateAsync(file);
        await addImage.mutateAsync({ mediaAssetId, position });
        position += 1;
      } catch (error) {
        setFailure(
          productErrorMessage(
            error,
            `“${file.name}” could not be added. Any photos before it were saved.`
          )
        );
        return;
      }
    }
    toast.add({
      title: files.length === 1 ? 'Photo added' : `${String(files.length)} photos added`,
      type: 'success',
    });
  };

  const move = (index: number, delta: number) => {
    const next = [...images];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(index + delta, 0, moved);
    setFailure(null);
    reorder.mutate(
      next.map((image) => image.id),
      {
        onError: (error) => {
          setFailure(productErrorMessage(error, 'The new order could not be saved.'));
        },
      }
    );
  };

  const onSetPrimary = (imageId: string) => {
    setFailure(null);
    setPrimary.mutate(imageId, {
      onSuccess: () => {
        toast.add({ title: 'Main photo changed', type: 'success' });
      },
      onError: (error) => {
        setFailure(productErrorMessage(error, 'The main photo could not be changed.'));
      },
    });
  };

  const onRemove = async (image: ProductImage) => {
    const asset = assets.get(image.mediaAssetId);
    const name = asset?.filename ?? 'this photo';
    const ok = await confirm({
      title: `Take ${name} off ${product.title}?`,
      description: image.isPrimary
        ? 'This is the main photo, so lists, cards and search results will fall back to the next one. The file itself stays in your media library and can be added again.'
        : 'It stops showing on your website. The file itself stays in your media library and can be added again.',
      confirmLabel: 'Take it off',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    setFailure(null);
    removeImage.mutate(image.id, {
      onSuccess: () => {
        setSelectedId(null);
        toast.add({ title: 'Photo removed', type: 'success' });
      },
      onError: (error) => {
        setFailure(productErrorMessage(error, 'The photo could not be removed.'));
      },
    });
  };

  const loading = media.isPending || variantsQuery.isPending;

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
    <div className="flex flex-col gap-4">
      {/* ONE message, the most specific one — the server's own sentence when it
          gave us one. Sits above the gallery because every action below can
          raise it. */}
      <SaveFailure title="That did not work" message={failure} />

      <FormSection
        title="Photos"
        description={
          images.length > 0
            ? 'Shoppers see these in this order. Your main photo always comes first — it is the one used in lists, on cards and in search results.'
            : 'The pictures shoppers see on this product’s page.'
        }
      >
        {loading ? (
          <p className="text-sm" role="status">
            Loading…
          </p>
        ) : images.length === 0 ? (
          <EmptyState
            icon={<ImageOff className="size-6" aria-hidden />}
            title="No photos yet"
            description="A product with a photo sells; a product without one looks unfinished. Drag pictures onto the box below, or click it to choose files."
            size="sm"
          />
        ) : (
          <>
            {/* Says how to reach everything else on this tab, and sits INSIDE
                the card rather than on the bare pane below it — a line of text
                floating on the recessed surface is anchored to nothing and reads
                as belonging to neither card. */}
            {selected ? null : (
              <Text className="text-sm">
                Choose a photo to give it a description, say when it shows, move it, or make it the
                main one.
              </Text>
            )}
            <ul className="grid grid-cols-2 gap-3 @md:grid-cols-3 @3xl:grid-cols-4">
              {images.map((image, index) => {
                const asset = assets.get(image.mediaAssetId);
                const pinned = bindingSummary(image, variants, options);
                const isSelected = image.id === selectedId;
                return (
                  <li key={image.id} className="flex flex-col gap-1.5">
                    {/* A real <button>, not a div with a handler — this is the
                      selection control for the panel below it. */}
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      className={`bg-base-200 rounded-box relative aspect-square w-full overflow-hidden ${
                        isSelected ? 'ring-2 ring-[color:var(--color-module)] ring-offset-2' : ''
                      }`}
                      onClick={() => {
                        void selectImage(isSelected ? null : image.id);
                      }}
                    >
                      {asset?.url ? (
                        <Image
                          src={asset.url}
                          alt={
                            image.alt ??
                            asset.altText ??
                            `Photo ${String(index + 1)} of ${product.title}`
                          }
                          fill
                          sizes="(min-width: 1024px) 200px, 45vw"
                          className="object-cover"
                          unoptimized={!asset.canOptimize || asset.mimeType === 'image/gif'}
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center p-2 text-sm">
                          {asset?.status === 'uploading' ? 'Still processing…' : 'No preview'}
                        </span>
                      )}
                      {image.isPrimary ? (
                        <span className="absolute top-1.5 left-1.5">
                          <Badge color="success" variant="soft" size="sm">
                            Main
                          </Badge>
                        </span>
                      ) : null}
                    </button>
                    {pinned ? (
                      <Text as="span" className="truncate text-sm">
                        {pinned}
                      </Text>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <Dropzone
          accept={ACCEPTED}
          maxSize={MAX_PHOTO_BYTES}
          disabled={uploading}
          icon={<Upload className="size-5" aria-hidden />}
          title={uploading ? 'Adding your photos…' : 'Drop photos here, or click to choose files'}
          hint="JPEG, PNG, WebP, AVIF or GIF, up to 8 MB each."
          onFiles={(files) => {
            void onFiles(files);
          }}
          onReject={(rejections) => {
            // The server would reject these too, but only after the bytes had
            // gone up. Saying which file and why, here, is the useful version.
            setFailure(
              rejections
                .map(
                  (rejection) =>
                    `“${rejection.file.name}” was not added — it is either too large or not a picture.`
                )
                .join(' ')
            );
          }}
        />
      </FormSection>

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
          busy={{
            reorder: reorder.isPending,
            primary: setPrimary.isPending,
            remove: removeImage.isPending,
          }}
          onDraftChange={(next) => {
            setEdit({ imageId: selected.id, binding: next });
          }}
          onMove={(delta) => {
            move(selectedIndex, delta);
          }}
          onSetPrimary={() => {
            onSetPrimary(selected.id);
          }}
          onRemove={() => {
            void onRemove(selected);
          }}
        />
      ) : null}
    </div>
  );
}

/* ── One photo: what it is, where it sits, when it shows ────────────────── */

function ImageDetails({
  image,
  index,
  total,
  canMoveEarlier,
  canMoveLater,
  asset,
  variants,
  options,
  draft,
  busy,
  onDraftChange,
  onMove,
  onSetPrimary,
  onRemove,
}: {
  image: ProductImage;
  index: number;
  total: number;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  asset: MediaAsset | null;
  variants: Variant[];
  options: ProductOption[];
  /** Fully controlled. The draft lives in the tab, because the tab is what
   *  registers the save with the pane toolbar and this panel comes and goes with
   *  the selection. */
  draft: Binding;
  busy: { reorder: boolean; primary: boolean; remove: boolean };
  onDraftChange: (next: Binding) => void;
  onMove: (delta: number) => void;
  onSetPrimary: () => void;
  onRemove: () => void;
}) {
  const setDraft = (update: (current: Binding) => Binding) => {
    onDraftChange(update(draft));
  };

  const hasOptions = options.length > 0;
  const firstOptionName = options[0]?.name ?? 'choice';
  const firstValueName = options[0]?.values[0]?.value ?? '';

  return (
    <FormSection
      title="This photo"
      description={`Number ${String(index + 1)} of ${String(total)} in the gallery.`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Text className="min-w-0 flex-1 truncate text-sm">
          {asset?.filename ?? 'Photo'}
          {asset?.width && asset.height
            ? ` · ${String(asset.width)} × ${String(asset.height)}`
            : ''}
        </Text>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            shape="square"
            aria-label="Move this photo earlier"
            title="Move earlier"
            disabled={!canMoveEarlier}
            loading={busy.reorder}
            onClick={() => {
              onMove(-1);
            }}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            shape="square"
            aria-label="Move this photo later"
            title="Move later"
            disabled={!canMoveLater}
            loading={busy.reorder}
            onClick={() => {
              onMove(1);
            }}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="outline"
            color={image.isPrimary ? 'neutral' : 'module'}
            disabled={image.isPrimary}
            loading={busy.primary}
            onClick={onSetPrimary}
          >
            <Star className="size-4" aria-hidden />
            {image.isPrimary ? 'Main photo' : 'Make it the main photo'}
          </Button>
        </div>
      </div>

      <Field>
        <FieldLabel>Description for screen readers</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={draft.alt}
              placeholder={asset?.altText ?? 'A navy canvas backpack, seen from the front'}
              onChange={(event) => {
                setDraft((current) => ({ ...current, alt: event.target.value }));
              }}
            />
          }
        />
        <FieldDescription>
          Read aloud to shoppers who cannot see the picture, and shown if it fails to load. Describe
          what is in it, not that it is a photo.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>When this photo shows</FieldLabel>
        <FieldControl
          render={
            <RadioGroup
              color="module"
              value={draft.mode}
              onValueChange={(next) => {
                setDraft((current) => ({ ...current, mode: next as ShowMode }));
              }}
            >
              <RadioOption value="always">Always — whatever the shopper picks</RadioOption>
              <RadioOption value="variant" disabled={variants.length === 0}>
                Only on one particular version
              </RadioOption>
              <RadioOption value="choices" disabled={!hasOptions}>
                Whenever a certain choice is picked
              </RadioOption>
            </RadioGroup>
          }
        />
        {/* Named with THIS product's own option and one of its real values.
            Generic guidance ("show the red photos when someone picks red") asks
            the reader to map an example onto their own catalogue; naming Cobalt
            on a mug that comes in Cobalt does not. */}
        <FieldDescription>
          {hasOptions
            ? `Use the last one to show this photo whenever someone picks a particular ${firstOptionName.toLowerCase()}${firstValueName ? ` — ${firstValueName}, say` : ''}, without tying it to one version.`
            : 'This product has no size or color choices yet, so every photo shows for everyone. Add choices on the Options tab to pin a photo to one of them.'}
        </FieldDescription>
      </Field>

      {draft.mode === 'variant' ? (
        <Field>
          <FieldLabel>Which version</FieldLabel>
          <FieldControl
            render={
              <Select
                color="module"
                aria-label="Which version this photo is of"
                placeholder="Choose a version"
                value={draft.variantId ?? ''}
                items={Object.fromEntries(
                  variants.map((variant) => [variant.id, variantLabel(variant)])
                )}
                onValueChange={(next) => {
                  setDraft((current) => ({ ...current, variantId: String(next) }));
                }}
              />
            }
          />
          <FieldDescription>
            This photo shows only when the shopper has settled on exactly this version.
          </FieldDescription>
        </Field>
      ) : null}

      {draft.mode === 'choices' ? (
        <div className="flex flex-col gap-4">
          {options.map((option) => (
            <Field key={option.id}>
              <FieldLabel>{option.name}</FieldLabel>
              <FieldControl
                render={
                  <Select
                    color="module"
                    aria-label={option.name}
                    placeholder={`Any ${option.name.toLowerCase()}`}
                    value={draft.byOption[option.id] ?? ''}
                    items={{
                      '': `Any ${option.name.toLowerCase()}`,
                      ...Object.fromEntries(option.values.map((value) => [value.id, value.value])),
                    }}
                    onValueChange={(next) => {
                      setDraft((current) => ({
                        ...current,
                        byOption: { ...current.byOption, [option.id]: String(next) },
                      }));
                    }}
                  />
                }
              />
            </Field>
          ))}
          <Text className="text-sm">
            {Object.values(draft.byOption).filter((id) => id !== '').length === 0
              ? 'Nothing is pinned yet, so this photo will keep showing for everyone. Pick a value above to tie it to one.'
              : 'The photo shows as soon as the shopper has picked everything named above. Leave anything on “any” to ignore it.'}
          </Text>
        </div>
      ) : null}

      {/* Rare and one-way, so it sits after the work, under a divider, as a
          plain row — never a card competing with the settings above it. */}
      <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Text className="text-sm">
          Taking this photo off the product leaves the file in your media library.
        </Text>
        <Button size="sm" variant="outline" color="danger" loading={busy.remove} onClick={onRemove}>
          <Trash2 className="size-4" aria-hidden />
          Take it off
        </Button>
      </div>
    </FormSection>
  );
}
