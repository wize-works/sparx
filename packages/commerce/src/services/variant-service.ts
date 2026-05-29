// variantService — variants are the purchasable SKU. They hang off a
// Product but can be queried independently (storefront PDP, inventory
// adjustments, dropship sync). The option lattice (Color × Size × …)
// lives in ProductOption + ProductOptionValue; a variant's position on
// the lattice is recorded in ProductVariantOptionValue. Per-variant
// imagery is pinned through VariantImage + VariantImageOptionValue.
//
// Phase 1.2 wires the full Prisma surface: list / get / create / update /
// archive / restore / setDefault for variants; setOptions + listOptions
// for the lattice; addImage / removeImage / setImageBindings for media.
//
// All writes follow the locked pattern:
//   1. Validate input via @sparx/commerce-schemas
//   2. withTenant() transaction with RLS context
//   3. writeAuditLog inside the same transaction
//   4. publishCommerceEvent AFTER commit

import {
  AssignVariantOptionValuesInput,
  CreateVariantImageInput,
  CreateVariantInput,
  RenameVariantSkuInput,
  SetProductOptionsInput,
  SetVariantImageBindingsInput,
  UpdateVariantInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type {
  Prisma,
  ProductOption,
  ProductOptionValue,
  ProductVariant,
  VariantImage,
} from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

// ─── Public shapes ────────────────────────────────────────────────────

export interface OptionValueRow {
  id: string;
  optionId: string;
  value: string;
  swatchHex: string | null;
  swatchImageId: string | null;
  position: number;
}

export interface OptionRow {
  id: string;
  productId: string;
  name: string;
  displayType: string;
  position: number;
  values: OptionValueRow[];
}

export interface VariantImageRow {
  id: string;
  variantId: string | null;
  mediaAssetId: string;
  position: number;
  alt: string | null;
  optionValueIds: string[];
}

export interface VariantRow {
  id: string;
  productId: string;
  sku: string;
  barcode: string | null;
  title: string | null;
  priceCents: number;
  compareAtPriceCents: number | null;
  costCents: number | null;
  currency: string;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  inventoryPolicy: string;
  requiresShipping: boolean;
  fulfillmentType: string | null;
  dropshipSourceId: string | null;
  isDefault: boolean;
  position: number;
  metadata: Record<string, unknown>;
  optionValueIds: string[];
  imageCount: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// ─── Reads ────────────────────────────────────────────────────────────

export async function listOptions(ctx: ServiceContext, productId: string): Promise<OptionRow[]> {
  return withTenant(ctx, async (tx) => {
    const options = await tx.productOption.findMany({
      where: { productId },
      orderBy: { position: 'asc' },
      include: { values: { orderBy: { position: 'asc' } } },
    });
    return options.map(toOptionRow);
  });
}

export async function listForProduct(
  ctx: ServiceContext,
  productId: string,
  args: { includeArchived?: boolean } = {}
): Promise<VariantRow[]> {
  return withTenant(ctx, async (tx) => {
    const variants = await tx.productVariant.findMany({
      where: {
        productId,
        ...(args.includeArchived ? {} : { deletedAt: null }),
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: {
        optionAssignments: { select: { optionValueId: true } },
        _count: { select: { images: true } },
      },
    });
    return variants.map(toVariantRow);
  });
}

export async function get(ctx: ServiceContext, variantId: string): Promise<VariantRow> {
  const variant = await withTenant(ctx, (tx) =>
    tx.productVariant.findFirst({
      where: { id: variantId, deletedAt: null },
      include: {
        optionAssignments: { select: { optionValueId: true } },
        _count: { select: { images: true } },
      },
    })
  );
  if (!variant) throw new CommerceNotFoundError('Variant', variantId);
  return toVariantRow(variant);
}

export async function getBySku(ctx: ServiceContext, sku: string): Promise<VariantRow> {
  const variant = await withTenant(ctx, (tx) =>
    tx.productVariant.findFirst({
      where: { sku, deletedAt: null },
      include: {
        optionAssignments: { select: { optionValueId: true } },
        _count: { select: { images: true } },
      },
    })
  );
  if (!variant) throw new CommerceNotFoundError('Variant', sku);
  return toVariantRow(variant);
}

export async function listImagesForProduct(
  ctx: ServiceContext,
  productId: string
): Promise<VariantImageRow[]> {
  return withTenant(ctx, async (tx) => {
    const images = await tx.variantImage.findMany({
      where: { productId },
      orderBy: { position: 'asc' },
      include: { optionValueLinks: { select: { optionValueId: true } } },
    });
    return images.map(toImageRow);
  });
}

// ─── Option lattice writes ────────────────────────────────────────────

/**
 * Replace the product's full option lattice. Existing options + values
 * cascade-delete (along with the variant-option-value assignments and
 * variant-image-option-value bindings that referenced them). Variant
 * rows themselves are kept — the merchant rebinds them via
 * `assignOptionValues` once the new lattice is in place.
 *
 * Returns the inserted options + values so the caller (typically the
 * dashboard variants tab) can map its local row identifiers to the new
 * DB ids without a follow-up read.
 */
export async function setOptions(
  ctx: ServiceContext,
  productId: string,
  rawInput: unknown
): Promise<OptionRow[]> {
  const input = SetProductOptionsInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new CommerceNotFoundError('Product', productId);

    // Name uniqueness — the (productId, name) unique constraint would
    // also catch this, but a clean ValidationError beats a Prisma P2002.
    const names = new Set<string>();
    for (const option of input.options) {
      const key = option.name.toLowerCase();
      if (names.has(key)) {
        throw new CommerceValidationError(`Duplicate option name "${option.name}"`, [
          { field: 'options', message: `Option "${option.name}" appears twice` },
        ]);
      }
      names.add(key);

      const seen = new Set<string>();
      for (const value of option.values) {
        const valueKey = value.value.toLowerCase();
        if (seen.has(valueKey)) {
          throw new CommerceValidationError(
            `Duplicate value "${value.value}" in option "${option.name}"`,
            [
              {
                field: `options.${option.name}.values`,
                message: `Value "${value.value}" appears twice`,
              },
            ]
          );
        }
        seen.add(valueKey);
      }
    }

    await tx.productOption.deleteMany({ where: { productId } });

    const created: (ProductOption & { values: ProductOptionValue[] })[] = [];
    for (const [i, option] of input.options.entries()) {
      const optionRow = await tx.productOption.create({
        data: {
          tenantId: ctx.tenantId,
          productId,
          name: option.name,
          displayType: option.displayType,
          position: option.position || i,
        },
      });
      const valueRows: ProductOptionValue[] = [];
      for (const [j, v] of option.values.entries()) {
        valueRows.push(
          await tx.productOptionValue.create({
            data: {
              tenantId: ctx.tenantId,
              optionId: optionRow.id,
              value: v.value,
              swatchHex: v.swatchHex ?? null,
              swatchImageId: v.swatchImageId ?? null,
              position: v.position || j,
            },
          })
        );
      }
      created.push({ ...optionRow, values: valueRows });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.product.options_replaced',
      entityType: 'Product',
      entityId: productId,
      diff: { after: { optionCount: created.length } },
    });

    return created;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { productId, change: 'options', optionCount: result.length },
  });

  return result.map(toOptionRow);
}

export async function assignOptionValues(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = AssignVariantOptionValuesInput.parse(rawInput);

  await withTenant(ctx, async (tx) => {
    const variant = await tx.productVariant.findFirst({
      where: { id: input.variantId, deletedAt: null },
      include: { product: { include: { options: true } } },
    });
    if (!variant) throw new CommerceNotFoundError('Variant', input.variantId);

    await validateOptionValueSet(tx, variant.product.id, input.optionValueIds);

    await tx.productVariantOptionValue.deleteMany({
      where: { variantId: input.variantId },
    });
    if (input.optionValueIds.length > 0) {
      await tx.productVariantOptionValue.createMany({
        data: input.optionValueIds.map((optionValueId) => ({
          variantId: input.variantId,
          optionValueId,
        })),
      });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.variant.options_assigned',
      entityType: 'Variant',
      entityId: input.variantId,
      diff: { after: { optionValueIds: input.optionValueIds } },
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'variant.updated',
    data: { variantId: input.variantId, change: 'optionValues' },
  });
}

// ─── Variant writes ───────────────────────────────────────────────────

export async function create(
  ctx: ServiceContext,
  productId: string,
  rawInput: unknown
): Promise<{ id: string; sku: string }> {
  const input = CreateVariantInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new CommerceNotFoundError('Product', productId);

    const skuCollision = await tx.productVariant.findFirst({
      where: { tenantId: ctx.tenantId, sku: input.sku },
      select: { id: true },
    });
    if (skuCollision) {
      throw new CommerceConflictError(`SKU "${input.sku}" already exists`, 'sku');
    }

    await validateOptionValueSet(tx, productId, input.optionValueIds);

    // If marked default, demote any existing default first so the
    // single-default invariant survives.
    if (input.isDefault) {
      await tx.productVariant.updateMany({
        where: { productId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
    }

    const variant = await tx.productVariant.create({
      data: {
        tenantId: ctx.tenantId,
        productId,
        sku: input.sku,
        barcode: input.barcode ?? null,
        title: input.title ?? null,
        priceCents: input.priceCents,
        compareAtPriceCents: input.compareAtPriceCents ?? null,
        costCents: input.costCents ?? null,
        currency: input.currency,
        weightGrams: input.weight ?? null,
        lengthMm: input.dimensions?.lengthMm ?? null,
        widthMm: input.dimensions?.widthMm ?? null,
        heightMm: input.dimensions?.heightMm ?? null,
        inventoryPolicy: input.inventoryPolicy,
        requiresShipping: input.requiresShipping,
        fulfillmentType: input.fulfillmentType ?? null,
        dropshipSourceId: input.dropshipSourceId ?? null,
        isDefault: input.isDefault,
        position: input.position,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    if (input.optionValueIds.length > 0) {
      await tx.productVariantOptionValue.createMany({
        data: input.optionValueIds.map((optionValueId) => ({
          variantId: variant.id,
          optionValueId,
        })),
      });
    }

    await refreshProductPriceRange(tx, productId);

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.variant.created',
      entityType: 'Variant',
      entityId: variant.id,
      diff: { before: null, after: serializeVariant(variant) },
    });

    return variant;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'variant.created',
    data: { variantId: result.id, productId, sku: result.sku },
  });

  return { id: result.id, sku: result.sku };
}

export async function update(
  ctx: ServiceContext,
  variantId: string,
  rawInput: unknown
): Promise<void> {
  const input = UpdateVariantInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.productVariant.findFirst({
      where: { id: variantId, deletedAt: null },
    });
    if (!before) throw new CommerceNotFoundError('Variant', variantId);

    if (input.isDefault === true && !before.isDefault) {
      await tx.productVariant.updateMany({
        where: { productId: before.productId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
    }

    const updated = await tx.productVariant.update({
      where: { id: variantId },
      data: {
        ...(input.barcode !== undefined ? { barcode: input.barcode } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
        ...(input.compareAtPriceCents !== undefined
          ? { compareAtPriceCents: input.compareAtPriceCents }
          : {}),
        ...(input.costCents !== undefined ? { costCents: input.costCents } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.weight !== undefined ? { weightGrams: input.weight } : {}),
        ...(input.dimensions !== undefined
          ? {
              lengthMm: input.dimensions?.lengthMm ?? null,
              widthMm: input.dimensions?.widthMm ?? null,
              heightMm: input.dimensions?.heightMm ?? null,
            }
          : {}),
        ...(input.inventoryPolicy !== undefined ? { inventoryPolicy: input.inventoryPolicy } : {}),
        ...(input.requiresShipping !== undefined
          ? { requiresShipping: input.requiresShipping }
          : {}),
        ...(input.fulfillmentType !== undefined ? { fulfillmentType: input.fulfillmentType } : {}),
        ...(input.dropshipSourceId !== undefined
          ? { dropshipSourceId: input.dropshipSourceId }
          : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.metadata !== undefined
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });

    if (input.priceCents !== undefined) {
      await refreshProductPriceRange(tx, before.productId);
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.variant.updated',
      entityType: 'Variant',
      entityId: updated.id,
      diff: { before: serializeVariant(before), after: serializeVariant(updated) },
    });

    return updated;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'variant.updated',
    data: { variantId: result.id, productId: result.productId },
  });
}

export async function renameSku(
  ctx: ServiceContext,
  variantId: string,
  rawInput: unknown
): Promise<void> {
  const input = RenameVariantSkuInput.parse(rawInput);

  await withTenant(ctx, async (tx) => {
    const before = await tx.productVariant.findFirst({
      where: { id: variantId, deletedAt: null },
    });
    if (!before) throw new CommerceNotFoundError('Variant', variantId);
    if (before.sku === input.sku) return;

    const collision = await tx.productVariant.findFirst({
      where: {
        tenantId: ctx.tenantId,
        sku: input.sku,
        NOT: { id: variantId },
      },
      select: { id: true },
    });
    if (collision) {
      throw new CommerceConflictError(`SKU "${input.sku}" already exists`, 'sku');
    }

    await tx.productVariant.update({
      where: { id: variantId },
      data: { sku: input.sku },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.variant.sku_renamed',
      entityType: 'Variant',
      entityId: variantId,
      diff: { before: { sku: before.sku }, after: { sku: input.sku } },
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'variant.updated',
    data: { variantId, change: 'sku' },
  });
}

export async function setDefault(ctx: ServiceContext, variantId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const variant = await tx.productVariant.findFirst({
      where: { id: variantId, deletedAt: null },
    });
    if (!variant) throw new CommerceNotFoundError('Variant', variantId);
    if (variant.isDefault) return;

    await tx.productVariant.updateMany({
      where: { productId: variant.productId, isDefault: true, deletedAt: null },
      data: { isDefault: false },
    });
    await tx.productVariant.update({
      where: { id: variantId },
      data: { isDefault: true },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.variant.set_default',
      entityType: 'Variant',
      entityId: variantId,
      diff: { after: { isDefault: true } },
    });
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'variant.updated',
    data: { variantId, change: 'isDefault' },
  });
}

export async function archive(ctx: ServiceContext, variantId: string): Promise<void> {
  await transitionDeletedAt(ctx, variantId, new Date(), 'commerce.variant.archived');
  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'variant.deleted',
    data: { variantId },
  });
}

export async function restore(ctx: ServiceContext, variantId: string): Promise<void> {
  await transitionDeletedAt(ctx, variantId, null, 'commerce.variant.restored');
  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'variant.updated',
    data: { variantId, change: 'restored' },
  });
}

// ─── Image writes ─────────────────────────────────────────────────────

export async function addImage(ctx: ServiceContext, rawInput: unknown): Promise<{ id: string }> {
  const input = CreateVariantImageInput.parse(rawInput);

  const result = await withTenant(ctx, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new CommerceNotFoundError('Product', input.productId);

    if (input.variantId) {
      const variant = await tx.productVariant.findFirst({
        where: { id: input.variantId, productId: input.productId, deletedAt: null },
        select: { id: true },
      });
      if (!variant) throw new CommerceNotFoundError('Variant', input.variantId);
    }

    if (input.optionValueIds.length > 0) {
      await validateOptionValueSet(tx, input.productId, input.optionValueIds, {
        strictSpanning: false,
      });
    }

    const image = await tx.variantImage.create({
      data: {
        tenantId: ctx.tenantId,
        productId: input.productId,
        variantId: input.variantId ?? null,
        mediaAssetId: input.mediaAssetId,
        position: input.position,
        alt: input.alt ?? null,
      },
    });

    if (input.optionValueIds.length > 0) {
      await tx.variantImageOptionValue.createMany({
        data: input.optionValueIds.map((optionValueId) => ({
          variantImageId: image.id,
          optionValueId,
        })),
      });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.variant.image_added',
      entityType: 'VariantImage',
      entityId: image.id,
      diff: {
        after: {
          productId: image.productId,
          variantId: image.variantId,
          mediaAssetId: image.mediaAssetId,
          optionValueIds: input.optionValueIds,
        },
      },
    });

    return image;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'variant.updated',
    data: {
      variantImageId: result.id,
      productId: result.productId,
      variantId: result.variantId,
    },
  });

  return { id: result.id };
}

export async function setImageBindings(ctx: ServiceContext, rawInput: unknown): Promise<void> {
  const input = SetVariantImageBindingsInput.parse(rawInput);

  await withTenant(ctx, async (tx) => {
    const image = await tx.variantImage.findFirst({
      where: { id: input.variantImageId },
      select: { id: true, productId: true },
    });
    if (!image) throw new CommerceNotFoundError('VariantImage', input.variantImageId);

    if (input.optionValueIds.length > 0) {
      await validateOptionValueSet(tx, image.productId, input.optionValueIds, {
        strictSpanning: false,
      });
    }

    await tx.variantImageOptionValue.deleteMany({
      where: { variantImageId: input.variantImageId },
    });
    if (input.optionValueIds.length > 0) {
      await tx.variantImageOptionValue.createMany({
        data: input.optionValueIds.map((optionValueId) => ({
          variantImageId: input.variantImageId,
          optionValueId,
        })),
      });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.variant.image_bindings_set',
      entityType: 'VariantImage',
      entityId: input.variantImageId,
      diff: { after: { optionValueIds: input.optionValueIds } },
    });
  });
}

export async function removeImage(ctx: ServiceContext, variantImageId: string): Promise<void> {
  const result = await withTenant(ctx, async (tx) => {
    const image = await tx.variantImage.findFirst({
      where: { id: variantImageId },
      select: { id: true, productId: true, variantId: true, mediaAssetId: true },
    });
    if (!image) throw new CommerceNotFoundError('VariantImage', variantImageId);

    await tx.variantImage.delete({ where: { id: variantImageId } });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.variant.image_removed',
      entityType: 'VariantImage',
      entityId: variantImageId,
      diff: {
        before: { mediaAssetId: image.mediaAssetId, variantId: image.variantId },
      },
    });
    return image;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'variant.updated',
    data: { productId: result.productId, variantId: result.variantId, change: 'image_removed' },
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────

type VariantWithIncludes = ProductVariant & {
  optionAssignments: { optionValueId: string }[];
  _count: { images: number };
};

type ImageWithIncludes = VariantImage & {
  optionValueLinks: { optionValueId: string }[];
};

function toOptionRow(o: ProductOption & { values: ProductOptionValue[] }): OptionRow {
  return {
    id: o.id,
    productId: o.productId,
    name: o.name,
    displayType: o.displayType,
    position: o.position,
    values: o.values.map((v) => ({
      id: v.id,
      optionId: v.optionId,
      value: v.value,
      swatchHex: v.swatchHex,
      swatchImageId: v.swatchImageId,
      position: v.position,
    })),
  };
}

function toVariantRow(v: VariantWithIncludes): VariantRow {
  return {
    id: v.id,
    productId: v.productId,
    sku: v.sku,
    barcode: v.barcode,
    title: v.title,
    priceCents: v.priceCents,
    compareAtPriceCents: v.compareAtPriceCents,
    costCents: v.costCents,
    currency: v.currency,
    weightGrams: v.weightGrams,
    lengthMm: v.lengthMm,
    widthMm: v.widthMm,
    heightMm: v.heightMm,
    inventoryPolicy: v.inventoryPolicy,
    requiresShipping: v.requiresShipping,
    fulfillmentType: v.fulfillmentType,
    dropshipSourceId: v.dropshipSourceId,
    isDefault: v.isDefault,
    position: v.position,
    metadata: (v.metadata ?? {}) as Record<string, unknown>,
    optionValueIds: v.optionAssignments.map((oa) => oa.optionValueId),
    imageCount: v._count.images,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    deletedAt: v.deletedAt?.toISOString() ?? null,
  };
}

function toImageRow(i: ImageWithIncludes): VariantImageRow {
  return {
    id: i.id,
    variantId: i.variantId,
    mediaAssetId: i.mediaAssetId,
    position: i.position,
    alt: i.alt,
    optionValueIds: i.optionValueLinks.map((l) => l.optionValueId),
  };
}

function serializeVariant(v: ProductVariant): Record<string, unknown> {
  return {
    id: v.id,
    productId: v.productId,
    sku: v.sku,
    title: v.title,
    priceCents: v.priceCents,
    compareAtPriceCents: v.compareAtPriceCents,
    costCents: v.costCents,
    currency: v.currency,
    inventoryPolicy: v.inventoryPolicy,
    requiresShipping: v.requiresShipping,
    isDefault: v.isDefault,
    position: v.position,
    dropshipSourceId: v.dropshipSourceId,
    deletedAt: v.deletedAt?.toISOString() ?? null,
  };
}

/**
 * Verify that every supplied optionValueId belongs to the product, and
 * (when `strictSpanning` is true) that the set covers every option
 * exactly once — the lattice invariant for a purchasable variant.
 */
async function validateOptionValueSet(
  tx: Prisma.TransactionClient,
  productId: string,
  optionValueIds: string[],
  { strictSpanning = true }: { strictSpanning?: boolean } = {}
): Promise<void> {
  if (optionValueIds.length === 0) {
    if (strictSpanning) {
      const options = await tx.productOption.findMany({
        where: { productId },
        select: { id: true },
      });
      if (options.length > 0) {
        throw new CommerceValidationError(
          'Variant must reference every product option',
          options.map((o) => ({ field: 'optionValueIds', message: `Missing option ${o.id}` }))
        );
      }
    }
    return;
  }

  const values = await tx.productOptionValue.findMany({
    where: { id: { in: optionValueIds }, option: { productId } },
    select: { id: true, optionId: true },
  });
  if (values.length !== optionValueIds.length) {
    const found = new Set(values.map((v) => v.id));
    const missing = optionValueIds.filter((id) => !found.has(id));
    throw new CommerceValidationError('Unknown option-value id(s)', [
      { field: 'optionValueIds', message: `Not part of product: ${missing.join(', ')}` },
    ]);
  }

  const byOption = new Map<string, number>();
  for (const v of values) {
    byOption.set(v.optionId, (byOption.get(v.optionId) ?? 0) + 1);
  }
  for (const count of byOption.values()) {
    if (count > 1) {
      throw new CommerceValidationError('Variant cannot reference two values from the same option');
    }
  }

  if (strictSpanning) {
    const productOptions = await tx.productOption.findMany({
      where: { productId },
      select: { id: true },
    });
    if (productOptions.length !== byOption.size) {
      const missing = productOptions.filter((o) => !byOption.has(o.id)).map((o) => o.id);
      throw new CommerceValidationError(
        'Variant does not cover every product option',
        missing.map((id) => ({ field: 'optionValueIds', message: `Missing option ${id}` }))
      );
    }
  }
}

async function refreshProductPriceRange(
  tx: Prisma.TransactionClient,
  productId: string
): Promise<void> {
  const range = await tx.productVariant.aggregate({
    where: { productId, deletedAt: null },
    _min: { priceCents: true },
    _max: { priceCents: true },
  });
  await tx.product.update({
    where: { id: productId },
    data: {
      priceMinCents: range._min.priceCents ?? null,
      priceMaxCents: range._max.priceCents ?? null,
    },
  });
}

async function transitionDeletedAt(
  ctx: ServiceContext,
  variantId: string,
  deletedAt: Date | null,
  auditAction: string
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.productVariant.findFirst({ where: { id: variantId } });
    if (!before) throw new CommerceNotFoundError('Variant', variantId);
    if (
      (deletedAt === null && before.deletedAt === null) ||
      (deletedAt !== null && before.deletedAt !== null)
    ) {
      return;
    }

    await tx.productVariant.update({
      where: { id: variantId },
      data: { deletedAt, ...(deletedAt !== null ? { isDefault: false } : {}) },
    });

    await refreshProductPriceRange(tx, before.productId);

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: auditAction,
      entityType: 'Variant',
      entityId: variantId,
      diff: {
        before: { deletedAt: before.deletedAt?.toISOString() ?? null },
        after: { deletedAt: deletedAt?.toISOString() ?? null },
      },
    });
  });
}
