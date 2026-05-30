// Product → ProductSearchDocument projection.
//
// The commerce-indexer worker calls this every time a product, variant,
// fitment, or inventory level changes. Reads through @sparx/db's
// withTenant() so the RLS context is set the same way as every other
// commerce service call.
//
// The shape is dictated by packages/search/src/schemas/products.ts —
// keep them in sync; a missing/typo'd field is a runtime failure at
// `documents().upsert()`.

import type { ProductSearchDocument } from '@sparx/search';
import { withTenant } from '@sparx/db';

import type { ServiceContext } from './errors';

export interface ProjectionResult {
  /** Null when the product no longer exists (caller should delete from index). */
  document: ProductSearchDocument | null;
}

/**
 * Project a single product into its search document. Returns null when
 * the product is gone (deleted or archived past retention) — the caller
 * should `deleteProduct(tenantId, productId)` from the index in that
 * case. Archived but still-present products are intentionally still
 * projected (with status='archived') so admin searches can find them.
 */
export async function projectProduct(
  ctx: ServiceContext,
  productId: string
): Promise<ProjectionResult> {
  const projection = await withTenant(ctx, async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        variants: {
          where: { deletedAt: null },
          select: {
            id: true,
            sku: true,
            priceCents: true,
            isDefault: true,
          },
        },
        fitments: {
          select: {
            category: { select: { name: true } },
            item: { select: { name: true } },
            variant: { select: { name: true } },
            rangeMin: true,
            rangeMax: true,
          },
        },
        categoryLinks: { select: { categoryId: true } },
        collectionLinks: { select: { collectionId: true } },
        images: {
          where: { variantId: null },
          orderBy: { position: 'asc' },
          take: 1,
          select: { mediaAssetId: true },
        },
      },
    });

    if (!product) return null;

    const settings = await tx.storefrontSettings.findFirst({
      where: { tenantId: ctx.tenantId },
      select: { defaultCurrency: true },
    });

    const activeVariants = product.variants;
    const priceCentsList = activeVariants.map((v) => v.priceCents);

    // Fall back to the product's denormalized price range when there are
    // no active variants. A product with no variants is itself the "one
    // variant" — the dashboard's create flow stamps priceMinCents on the
    // product row in that case.
    const priceMinCents =
      priceCentsList.length > 0 ? Math.min(...priceCentsList) : (product.priceMinCents ?? 0);
    const priceMaxCents =
      priceCentsList.length > 0
        ? Math.max(...priceCentsList)
        : (product.priceMaxCents ?? priceMinCents);

    // Fitment denormalized. Distinct L1/L2/L3 name lists power the
    // storefront facets without a join. The field names stay
    // `fitment_makes/models/engines` for storage-format stability across
    // the indexer — they're generic buckets at the index layer. Range
    // pairs flatten into a numeric list (year for vehicle, weight for
    // pet, etc.); open-ended ranges are capped to a sensible window.
    const categories = new Set<string>();
    const items = new Set<string>();
    const variants = new Set<string>();
    const rangeValues = new Set<number>();
    for (const f of product.fitments) {
      categories.add(f.category.name);
      if (f.item) items.add(f.item.name);
      if (f.variant) variants.add(f.variant.name);
      const lo = f.rangeMin === null ? 0 : Number(f.rangeMin);
      const hi = f.rangeMax === null ? (lo > 0 ? lo + 30 : 0) : Number(f.rangeMax);
      if (lo > 0 && hi >= lo) {
        for (let y = lo; y <= Math.min(hi, lo + 50); y++) rangeValues.add(y);
      }
    }

    const firstImageAssetId = product.images[0]?.mediaAssetId;
    let firstImageKey: string | undefined;
    if (firstImageAssetId) {
      const asset = await tx.mediaAsset.findFirst({
        where: { id: firstImageAssetId, deletedAt: null },
        select: { key: true },
      });
      firstImageKey = asset?.key;
    }

    const doc: ProductSearchDocument = {
      id: `${ctx.tenantId}:${product.id}`,
      tenant_id: ctx.tenantId,
      product_id: product.id,
      title: product.title,
      description: product.description ?? undefined,
      handle: product.handle,
      status: product.status as 'draft' | 'active' | 'archived',
      product_type: product.productType ?? undefined,
      vendor: product.vendor ?? undefined,
      tags: product.tags.length > 0 ? product.tags : undefined,
      category_ids:
        product.categoryLinks.length > 0
          ? product.categoryLinks.map((l) => l.categoryId)
          : undefined,
      collection_ids:
        product.collectionLinks.length > 0
          ? product.collectionLinks.map((l) => l.collectionId)
          : undefined,
      price_min_cents: priceMinCents,
      price_max_cents: priceMaxCents,
      in_stock: product.inStock,
      currency: settings?.defaultCurrency ?? 'USD',
      skus:
        activeVariants.length > 0
          ? activeVariants.map((v) => v.sku).filter((s): s is string => !!s)
          : undefined,
      fitment_makes: categories.size > 0 ? [...categories] : undefined,
      fitment_models: items.size > 0 ? [...items] : undefined,
      fitment_engines: variants.size > 0 ? [...variants] : undefined,
      fitment_years: rangeValues.size > 0 ? [...rangeValues] : undefined,
      image_url: firstImageKey ? mediaPublicUrl(firstImageKey) : undefined,
      created_at: Math.floor(product.createdAt.getTime() / 1000),
      updated_at: Math.floor(product.updatedAt.getTime() / 1000),
    };

    return doc;
  });

  return { document: projection };
}

/**
 * Project many products in one call. The indexer batches by tenant so
 * the RLS context flips once per batch, not per row.
 */
export async function projectProducts(
  ctx: ServiceContext,
  productIds: string[]
): Promise<ProductSearchDocument[]> {
  const out: ProductSearchDocument[] = [];
  for (const id of productIds) {
    const { document } = await projectProduct(ctx, id);
    if (document) out.push(document);
  }
  return out;
}

// Public CDN URL builder. The media-worker writes variants into the
// public bucket fronted by cdn.sparx.works. The indexer can stamp the
// URL directly since image keys are stable.
function mediaPublicUrl(key: string): string {
  const cdn = process.env.SPARX_MEDIA_CDN_URL;
  if (cdn) return `${cdn.replace(/\/$/, '')}/${key.replace(/^\//, '')}`;
  const bucket = process.env.GCS_MEDIA_PUBLIC_BUCKET ?? process.env.GCS_MEDIA_BUCKET;
  if (bucket) return `https://storage.googleapis.com/${bucket}/${key.replace(/^\//, '')}`;
  return key;
}
