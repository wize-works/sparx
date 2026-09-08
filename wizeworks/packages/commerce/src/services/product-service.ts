// productService — read/write API for products + their variant tree.
//
// Phase 1.1 wires the catalog spine: list, get, create, update, archive,
// restore, publish, unpublish, plus bulk status/tag operations.
// Variant + option creation lands in Phase 1.2 (variantService); product
// create accepts options/variants in the schema but currently rejects
// non-empty arrays so partial wiring never produces a half-built product.
//
// Every state change:
//   1. Validates input via @wizeworks/commerce-schemas
//   2. Runs DB work inside withTenant() (RLS context set per transaction)
//   3. Writes an audit_logs row in the same transaction
//   4. Publishes a Pub/Sub event AFTER commit — never inside

import {
  BulkTagProductsInput,
  BulkDeleteProductsInput,
  BulkUpdateProductStatusInput,
  CreateProductInput,
  type ProductDeposit,
  type ProductStatus,
  UpdateProductInput,
} from '@wizeworks/commerce-schemas';
import { withTenant } from '@wizeworks/db';
import type { Prisma, Product } from '@wizeworks/db';

import { writeAuditLog } from '../audit';
import { depositFromColumns, depositToColumns } from '../made-to-order';
import { productSiteVisibility } from './site-visibility';
import { resolveAndValidateAttributes } from './product-types-service';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';
import { mediaPublicUrl } from '../media-url';

// ─── Reads ────────────────────────────────────────────────────────────

export interface ListProductsFilter {
  status?: ProductStatus;
  categoryId?: string;
  collectionId?: string;
  vendor?: string;
  tag?: string;
  productType?: string;
  q?: string;
  hasFitment?: boolean;
  includeArchived?: boolean;
  includeDeleted?: boolean;
  // Model B (docs/49 §3): restrict to products visible on this web PROPERTY —
  // i.e. products with NO site scope (visible on all) OR scoped to this site.
  // Omit (storefront default for the primary / single-site) → no restriction.
  propertyId?: string;
  take?: number;
  skip?: number;
  sortBy?: 'updatedAt' | 'createdAt' | 'title' | 'priceMinCents';
  /** Sort direction. Defaults to `desc`, which is right for the date + price
   *  sorts ("newest", "most expensive") but wrong for `title` — a catalog sorted
   *  by name is read A→Z, and without this the only available answer was Z→A. */
  order?: 'asc' | 'desc';
}

export interface ProductListItem {
  id: string;
  title: string;
  handle: string;
  status: ProductStatus;
  vendor: string | null;
  productType: string | null;
  variantCount: number;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  imageUrl: string | null;
  tags: string[];
  updatedAt: string;
}

export async function list(
  ctx: ServiceContext,
  filter: ListProductsFilter = {}
): Promise<{ items: ProductListItem[]; total: number }> {
  return withTenant(ctx, async (tx) => {
    const status: Prisma.ProductWhereInput['status'] =
      filter.status ?? (filter.includeArchived ? undefined : { not: 'archived' });

    const where: Prisma.ProductWhereInput = {
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
      ...(status !== undefined ? { status } : {}),
      ...(filter.vendor ? { vendor: filter.vendor } : {}),
      ...(filter.productType ? { productType: filter.productType } : {}),
      ...(filter.tag ? { tags: { has: filter.tag } } : {}),
      ...(filter.categoryId ? { categoryLinks: { some: { categoryId: filter.categoryId } } } : {}),
      ...(filter.collectionId
        ? { collectionLinks: { some: { collectionId: filter.collectionId } } }
        : {}),
      ...(filter.hasFitment ? { fitments: { some: {} } } : {}),
      ...(filter.q
        ? {
            OR: [
              { title: { contains: filter.q, mode: 'insensitive' } },
              { handle: { contains: filter.q, mode: 'insensitive' } },
              { vendor: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      // Model B: restrict to products visible on the active site (none = global).
      ...(filter.propertyId ? productSiteVisibility(filter.propertyId) : {}),
    };

    const sortField = filter.sortBy ?? 'updatedAt';
    const sortDirection = filter.order ?? 'desc';
    const [rows, total] = await Promise.all([
      tx.product.findMany({
        where,
        orderBy: { [sortField]: sortDirection },
        take: Math.min(filter.take ?? 50, 250),
        skip: filter.skip ?? 0,
        select: {
          id: true,
          title: true,
          handle: true,
          status: true,
          vendor: true,
          productType: true,
          tags: true,
          priceMinCents: true,
          priceMaxCents: true,
          updatedAt: true,
          _count: { select: { variants: true } },
          // The hero image's asset id: explicit primary first, else the first
          // product-level image by position. URL resolved in one batched lookup
          // below to avoid an N+1 over the page.
          images: {
            where: { variantId: null },
            orderBy: [{ isPrimary: 'desc' }, { position: 'asc' }],
            take: 1,
            select: { mediaAssetId: true },
          },
        },
      }),
      tx.product.count({ where }),
    ]);

    // Batch-resolve the chosen images' public URLs (one query, not one per row).
    // A soft-deleted asset is absent from the map → that product shows no thumbnail.
    const assetIds = [
      ...new Set(
        rows.map((r) => r.images[0]?.mediaAssetId).filter((id): id is string => Boolean(id))
      ),
    ];
    const keyByAsset = new Map<string, string>();
    if (assetIds.length > 0) {
      const assets = await tx.mediaAsset.findMany({
        where: { id: { in: assetIds }, deletedAt: null },
        select: { id: true, key: true },
      });
      for (const a of assets) keyByAsset.set(a.id, a.key);
    }

    const items: ProductListItem[] = rows.map((row) => {
      const assetId = row.images[0]?.mediaAssetId;
      const key = assetId ? keyByAsset.get(assetId) : undefined;
      return {
        id: row.id,
        title: row.title,
        handle: row.handle,
        status: row.status as ProductStatus,
        vendor: row.vendor,
        productType: row.productType,
        variantCount: row._count.variants,
        priceMinCents: row.priceMinCents,
        priceMaxCents: row.priceMaxCents,
        imageUrl: key ? mediaPublicUrl(key) : null,
        tags: row.tags,
        updatedAt: row.updatedAt.toISOString(),
      };
    });

    return { items, total };
  });
}

export interface ProductDetail {
  id: string;
  tenantId: string;
  title: string;
  handle: string;
  description: string | null;
  status: ProductStatus;
  productType: string | null;
  productTypeKey: string | null;
  attributes: Record<string, unknown>;
  vendor: string | null;
  tags: string[];
  fulfillmentType: string;
  weightGrams: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  hazmatClass: string;
  requiresShipping: boolean;
  taxClass: string | null;
  originCountry: string | null;
  hsCode: string | null;
  metadata: Record<string, unknown>;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageId: string | null;
  defaultWarehouseId: string | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  inStock: boolean;
  averageRating: number | null;
  reviewCount: number;
  variantCount: number;
  optionCount: number;
  categoryIds: string[];
  collectionIds: string[];
  /** The delivery group this product ships under, or null for the standard
   *  way. At most one — see shipping-profile-match.ts. */
  shippingProfileId: string | null;
  /**
   * WHY this product is in each collection it belongs to.
   *
   * `collectionIds` above is every membership regardless of origin, which is
   * ambiguous in the one way that matters: a product can be in a collection
   * because someone put it there (`manual`) OR because that collection's rule
   * matched it (`rule`, written by the commerce-indexer's
   * `projectCollectionRules`). The two behave completely differently — a rule
   * membership is recomputed on every reprojection, so it cannot be removed
   * from the product side and must not be re-saved as a manual pin.
   *
   * Without this field a client that round-trips `collectionIds` through
   * `update()` silently CONVERTS every rule membership into a manual one (the
   * write below stamps `addedBy: 'manual'`), which pins the product into the
   * collection forever even after it stops matching. Carrying the origin is
   * what lets an editor send back only the manual set and say, honestly, that
   * the rest is not its to change.
   */
  collectionMemberships: { collectionId: string; addedBy: 'manual' | 'rule' }[];
  // sparx.market opt-in (docs/106 §4.7). `marketListed` is the tenant-set flag;
  // `marketCategory` is the catalog aisle. The product editor's sparx.market
  // section reads these to seed its List/Category controls.
  marketListed: boolean;
  marketCategory: string | null;
  // Made to order (issue 026) — how much notice this needs, how much of the
  // money is taken up front, and how many can be turned out in a day. Absent on
  // an ordinary product taken off a shelf, which is most of them.
  orderAheadDays: number | null;
  deposit: ProductDeposit;
  dailyLimit: number | null;
  // Model B (docs/49 §3): web PROPERTIES this product is scoped to. EMPTY =
  // visible on ALL sites (the default).
  propertyIds: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export async function get(ctx: ServiceContext, productId: string): Promise<ProductDetail> {
  const product = await withTenant(ctx, (tx) =>
    tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        categoryLinks: { select: { categoryId: true } },
        collectionLinks: { select: { collectionId: true, addedBy: true } },
        shippingProfileLinks: { select: { profileId: true } },
        propertyLinks: { select: { propertyId: true } },
        _count: { select: { variants: true, options: true } },
      },
    })
  );
  if (!product) throw new CommerceNotFoundError('Product', productId);
  return toProductDetail(product);
}

export async function getByHandle(
  ctx: ServiceContext,
  handle: string,
  // Model B (docs/49 §3): when set (storefront on a non-primary site), a product
  // not visible on that site 404s by URL too — not just hidden from the list.
  propertyId?: string
): Promise<ProductDetail> {
  const product = await withTenant(ctx, (tx) =>
    tx.product.findFirst({
      where: {
        handle,
        deletedAt: null,
        ...(propertyId ? productSiteVisibility(propertyId) : {}),
      },
      include: {
        categoryLinks: { select: { categoryId: true } },
        collectionLinks: { select: { collectionId: true, addedBy: true } },
        shippingProfileLinks: { select: { profileId: true } },
        propertyLinks: { select: { propertyId: true } },
        _count: { select: { variants: true, options: true } },
      },
    })
  );
  if (!product) throw new CommerceNotFoundError('Product', handle);
  return toProductDetail(product);
}

export interface ProductFacets {
  /** Industry-agnostic baseline product types UNION the tenant's own, sorted. */
  productTypes: string[];
  /** The tenant's own distinct vendors, sorted. A vendor is a tenant's own
   *  supplier/brand — there is no sensible platform-wide vendor list, so this is
   *  organic (no baseline): empty until the tenant adds products. */
  vendors: string[];
  /** Distinct tags across the tenant's products, sorted. */
  tags: string[];
  /** Standard tax-class names UNION the ones the tenant already uses on products
   *  AND the ones their tax rates match against (docs/45 — the tax engine pairs
   *  `product.taxClass` with `TaxRate.productTaxClass`), so the lookup stays
   *  aligned with what will actually be taxed. */
  taxClasses: string[];
}

/** Platform-curated, vertical-neutral product-type baseline. Data-as-code (not
 *  seeded rows): available to EVERY tenant — including a brand-new one with zero
 *  products — without imposing any one vertical's bias. The lookup stays
 *  creatable, so a tenant whose taxonomy differs just types their own. Keep this
 *  spanning common startup-ecommerce verticals, NOT any single industry. */
const COMMON_PRODUCT_TYPES = [
  'Apparel',
  'Footwear',
  'Accessories',
  'Jewelry',
  'Bags & Luggage',
  'Beauty & Personal Care',
  'Health & Wellness',
  'Home & Living',
  'Kitchen & Dining',
  'Furniture',
  'Electronics',
  'Office & Stationery',
  'Food & Beverage',
  'Toys & Games',
  'Baby & Kids',
  'Pet Supplies',
  'Sports & Outdoors',
  'Arts & Crafts',
  'Books & Media',
  'Digital Product',
  'Service',
  'Subscription',
] as const;

/** Conventional tax-rate classes, used as a baseline so the lookup is never
 *  empty before a tenant defines rates. Jurisdiction-specific classes the tenant
 *  actually uses merge in from their products + tax rates. */
const STANDARD_TAX_CLASSES = ['standard', 'reduced', 'zero', 'exempt'] as const;

/** Case-insensitive union of a tenant's own values with a code baseline, sorted.
 *  The tenant's stored casing wins on collision so suggestions match their data. */
function mergeDistinct(primary: string[], baseline: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of [...primary, ...baseline]) {
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, value);
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

/** Open-ended option sets for the product editor's smart lookups (type, vendor,
 *  tags, tax class). Product type + tax class merge a platform baseline with the
 *  tenant's own distinct values; vendor + tags are purely the tenant's own. The
 *  lookups stay creatable, so this seeds suggestions, never constrains. */
export async function getFacets(ctx: ServiceContext): Promise<ProductFacets> {
  return withTenant(ctx, async (tx) => {
    const [typeRows, vendorRows, tagRows, productTaxRows, rateTaxRows] = await Promise.all([
      tx.product.findMany({
        where: { deletedAt: null, productType: { not: null } },
        select: { productType: true },
        distinct: ['productType'],
        orderBy: { productType: 'asc' },
      }),
      tx.product.findMany({
        where: { deletedAt: null, vendor: { not: null } },
        select: { vendor: true },
        distinct: ['vendor'],
        orderBy: { vendor: 'asc' },
      }),
      // Tags are a String[] column — flatten + dedupe in SQL via unnest. RLS
      // scopes the raw query to the active tenant exactly like the ORM reads.
      tx.$queryRaw<{ tag: string }[]>`
        SELECT DISTINCT unnest(tags) AS tag
        FROM commerce_products
        WHERE deleted_at IS NULL
        ORDER BY tag ASC
      `,
      tx.product.findMany({
        where: { deletedAt: null, taxClass: { not: null } },
        select: { taxClass: true },
        distinct: ['taxClass'],
      }),
      tx.taxRate.findMany({
        where: { productTaxClass: { not: null } },
        select: { productTaxClass: true },
        distinct: ['productTaxClass'],
      }),
    ]);

    const tenantTaxClasses = [
      ...productTaxRows.map((r) => r.taxClass).filter((v): v is string => !!v),
      ...rateTaxRows.map((r) => r.productTaxClass).filter((v): v is string => !!v),
    ];

    return {
      productTypes: mergeDistinct(
        typeRows.map((r) => r.productType).filter((v): v is string => !!v),
        COMMON_PRODUCT_TYPES
      ),
      vendors: vendorRows.map((r) => r.vendor).filter((v): v is string => !!v),
      tags: tagRows.map((r) => r.tag).filter((v) => v.length > 0),
      taxClasses: mergeDistinct(tenantTaxClasses, STANDARD_TAX_CLASSES),
    };
  });
}

// ─── Writes ───────────────────────────────────────────────────────────

export async function create(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string; handle: string }> {
  const input = CreateProductInput.parse(rawInput);

  // Variants + options land in Phase 1.2. Fail fast rather than silently
  // dropping them — a wizard that fed them in would think they saved.
  if (input.options.length > 0 || input.variants.length > 0) {
    throw new CommerceValidationError(
      'Options and variants are managed via variantService — Phase 1.2'
    );
  }

  const handleSeed = input.handle ?? slugify(input.title);

  const result = await withTenant(ctx, async (tx) => {
    const handle = await ensureUniqueHandle(tx, ctx.tenantId, handleSeed);

    // Typed attributes (docs/143): if a product type is set, its `attributes` bag
    // is validated against the resolved type's schema (422 on mismatch); with no
    // type, attributes are ignored (an untyped product has none). Empty bag when
    // typed-but-omitted so the column stays {} rather than null.
    const attributes = input.productTypeKey
      ? await resolveAndValidateAttributes(tx, input.productTypeKey, input.attributes ?? {})
      : {};

    const product = await tx.product.create({
      data: {
        tenantId: ctx.tenantId,
        title: input.title,
        handle,
        description: input.description ?? null,
        status: input.status,
        productType: input.productType ?? null,
        productTypeKey: input.productTypeKey ?? null,
        attributes: attributes as Prisma.InputJsonValue,
        vendor: input.vendor ?? null,
        tags: input.tags,
        fulfillmentType: input.fulfillmentType,
        weightGrams: input.weight ?? null,
        lengthMm: input.dimensions?.lengthMm ?? null,
        widthMm: input.dimensions?.widthMm ?? null,
        heightMm: input.dimensions?.heightMm ?? null,
        hazmatClass: input.hazmatClass,
        requiresShipping: input.requiresShipping,
        taxClass: input.taxClass ?? null,
        originCountry: input.originCountry ?? null,
        hsCode: input.hsCode ?? null,
        defaultWarehouseId: input.defaultWarehouseId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        orderAheadDays: input.orderAheadDays ?? null,
        dailyLimit: input.dailyLimit ?? null,
        ...depositToColumns(input.deposit ?? { type: 'none' }),
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        ogImageId: input.ogImageId ?? null,
        publishedAt: input.status === 'active' ? new Date() : null,
      },
    });

    if (input.categoryIds.length > 0) {
      await tx.categoryProduct.createMany({
        data: input.categoryIds.map((categoryId, idx) => ({
          categoryId,
          productId: product.id,
          isPrimary: idx === 0,
          position: idx,
        })),
        skipDuplicates: true,
      });
    }
    if (input.collectionIds.length > 0) {
      await tx.collectionProduct.createMany({
        data: input.collectionIds.map((collectionId, idx) => ({
          collectionId,
          productId: product.id,
          position: idx,
          addedBy: 'manual',
        })),
        skipDuplicates: true,
      });
    }
    // Model B site scoping (docs/49 §3): empty = visible on all sites, so we only
    // write rows when the caller pins specific sites.
    if (input.propertyIds.length > 0) {
      await tx.productProperty.createMany({
        data: input.propertyIds.map((propertyId) => ({ propertyId, productId: product.id })),
        skipDuplicates: true,
      });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.product.created',
      entityType: 'Product',
      entityId: product.id,
      diff: { before: null, after: serializeProduct(product) },
    });

    return product;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.created',
    data: { productId: result.id, handle: result.handle, status: result.status },
  });

  return { id: result.id, handle: result.handle };
}

export async function update(
  ctx: ServiceContext,
  productId: string,
  rawInput: unknown
): Promise<ProductDetail> {
  const input = UpdateProductInput.parse(rawInput);

  let becameActive = false;
  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
      include: {
        categoryLinks: { select: { categoryId: true } },
        collectionLinks: { select: { collectionId: true, addedBy: true } },
        shippingProfileLinks: { select: { profileId: true } },
        propertyLinks: { select: { propertyId: true } },
        _count: { select: { variants: true, options: true } },
      },
    });
    if (!before) throw new CommerceNotFoundError('Product', productId);

    // Handle rename — only re-check uniqueness when actually changing.
    let nextHandle: string | undefined;
    if (input.handle !== undefined && input.handle !== before.handle) {
      nextHandle = await ensureUniqueHandle(tx, ctx.tenantId, input.handle, productId);
    }

    const statusChanging = input.status !== undefined && input.status !== before.status;
    const becomingActive = statusChanging && input.status === 'active';
    becameActive = becomingActive;

    // Typed attributes (docs/143). Partial semantics, mirroring the rest of this
    // update: an omitted field is left alone; a provided one is applied.
    //   - productTypeKey === null → clear the type AND wipe attributes ({}).
    //   - a type is set (new or unchanged) → re-validate the bag when either the
    //     bag or the type changed; switching type strips fields the new schema
    //     doesn't define (validator is forgiving), which is the right behavior.
    //   - no type now and none incoming → attributes can't be set (422).
    const typeChanging = input.productTypeKey !== undefined;
    const nextTypeKey = typeChanging ? input.productTypeKey : before.productTypeKey;
    let typedWrite: { productTypeKey?: string | null; attributes?: Prisma.InputJsonValue } = {};
    if (typeChanging && input.productTypeKey === null) {
      typedWrite = { productTypeKey: null, attributes: {} };
    } else if (nextTypeKey) {
      if (input.attributes !== undefined || typeChanging) {
        const bag = input.attributes ?? ((before.attributes ?? {}) as Record<string, unknown>);
        const validated = await resolveAndValidateAttributes(tx, nextTypeKey, bag);
        typedWrite = {
          ...(typeChanging ? { productTypeKey: nextTypeKey } : {}),
          attributes: validated as Prisma.InputJsonValue,
        };
      }
    } else if (input.attributes !== undefined && Object.keys(input.attributes).length > 0) {
      throw new CommerceValidationError(
        'Cannot set attributes on a product with no product type. Set a product type first.',
        [{ field: 'attributes', message: 'No product type' }]
      );
    }

    const updated = await tx.product.update({
      where: { id: productId },
      data: {
        ...typedWrite,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(nextHandle !== undefined ? { handle: nextHandle } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.productType !== undefined ? { productType: input.productType } : {}),
        ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.fulfillmentType !== undefined ? { fulfillmentType: input.fulfillmentType } : {}),
        ...(input.weight !== undefined ? { weightGrams: input.weight } : {}),
        ...(input.dimensions !== undefined
          ? {
              lengthMm: input.dimensions?.lengthMm ?? null,
              widthMm: input.dimensions?.widthMm ?? null,
              heightMm: input.dimensions?.heightMm ?? null,
            }
          : {}),
        ...(input.hazmatClass !== undefined ? { hazmatClass: input.hazmatClass } : {}),
        ...(input.requiresShipping !== undefined
          ? { requiresShipping: input.requiresShipping }
          : {}),
        ...(input.taxClass !== undefined ? { taxClass: input.taxClass } : {}),
        ...(input.originCountry !== undefined ? { originCountry: input.originCountry } : {}),
        ...(input.hsCode !== undefined ? { hsCode: input.hsCode } : {}),
        ...(input.defaultWarehouseId !== undefined
          ? { defaultWarehouseId: input.defaultWarehouseId }
          : {}),
        ...(input.metadata !== undefined
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
        ...(input.orderAheadDays !== undefined ? { orderAheadDays: input.orderAheadDays } : {}),
        ...(input.dailyLimit !== undefined ? { dailyLimit: input.dailyLimit } : {}),
        ...(input.deposit !== undefined ? depositToColumns(input.deposit) : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
        ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
        ...(input.ogImageId !== undefined ? { ogImageId: input.ogImageId } : {}),
        ...(becomingActive && before.publishedAt === null ? { publishedAt: new Date() } : {}),
      },
      include: {
        categoryLinks: { select: { categoryId: true } },
        collectionLinks: { select: { collectionId: true, addedBy: true } },
        shippingProfileLinks: { select: { profileId: true } },
        propertyLinks: { select: { propertyId: true } },
        _count: { select: { variants: true, options: true } },
      },
    });

    if (input.categoryIds !== undefined) {
      await tx.categoryProduct.deleteMany({ where: { productId } });
      if (input.categoryIds.length > 0) {
        await tx.categoryProduct.createMany({
          data: input.categoryIds.map((categoryId, idx) => ({
            categoryId,
            productId,
            isPrimary: idx === 0,
            position: idx,
          })),
        });
      }
    }
    if (input.collectionIds !== undefined) {
      // Only MANUAL collections may be assigned from the product side, and the
      // check is not pedantry: the write below stamps `addedBy: 'manual'`, so
      // accepting a rules-driven id would pin this product into a smart
      // collection permanently — the next reprojection leaves the manual row
      // alone, and the product never falls out when it stops matching. The
      // dedicated `collectionService.setProductCollections` has always refused
      // this; PATCH silently allowed it, which is the more likely path.
      if (input.collectionIds.length > 0) {
        const manualCount = await tx.productCollection.count({
          where: { id: { in: input.collectionIds }, type: 'manual', deletedAt: null },
        });
        if (manualCount !== input.collectionIds.length) {
          throw new CommerceValidationError(
            'Some collectionIds are unknown or rules-driven — a product can only be added by hand to a manual collection. Change the collection’s rule instead.',
            [{ field: 'collectionIds', message: 'Unknown or rules-driven collection' }]
          );
        }
      }
      await tx.collectionProduct.deleteMany({
        where: { productId, addedBy: 'manual' },
      });
      if (input.collectionIds.length > 0) {
        await tx.collectionProduct.createMany({
          data: input.collectionIds.map((collectionId, idx) => ({
            collectionId,
            productId,
            position: idx,
            addedBy: 'manual',
          })),
        });
      }
    }
    // At most ONE delivery group per product. The join table allows several,
    // and pricing cannot answer for a product in two groups — so this REPLACES
    // rather than adds, which is also the only shape the product editor can
    // show honestly. `null` clears it: the product ships the standard way.
    if (input.shippingProfileId !== undefined) {
      if (input.shippingProfileId) {
        const known = await tx.shippingProfile.count({
          where: { id: input.shippingProfileId },
        });
        if (known === 0) {
          throw new CommerceValidationError('That delivery group no longer exists.', [
            { field: 'shippingProfileId', message: 'Unknown delivery group' },
          ]);
        }
      }
      await tx.shippingProfileProduct.deleteMany({ where: { productId } });
      if (input.shippingProfileId) {
        await tx.shippingProfileProduct.create({
          data: { profileId: input.shippingProfileId, productId },
        });
      }
    }

    // Model B site scoping: full-replacement set. Empty array → no rows → visible
    // on all sites again.
    if (input.propertyIds !== undefined) {
      await tx.productProperty.deleteMany({ where: { productId } });
      if (input.propertyIds.length > 0) {
        await tx.productProperty.createMany({
          data: input.propertyIds.map((propertyId) => ({ propertyId, productId })),
        });
      }
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.product.updated',
      entityType: 'Product',
      entityId: updated.id,
      diff: { before: serializeProduct(before), after: serializeProduct(updated) },
    });

    // `updated` was read BEFORE the three membership writes above, so its link
    // sets describe the world as it was. An editor that seeds its form from this
    // response would therefore show the categories, collections and sites it
    // just replaced — and immediately look dirty again, or worse, re-send the
    // old set on the next save. Re-read them.
    const [categoryLinks, collectionLinks, propertyLinks] = await Promise.all([
      tx.categoryProduct.findMany({ where: { productId }, select: { categoryId: true } }),
      tx.collectionProduct.findMany({
        where: { productId },
        select: { collectionId: true, addedBy: true },
      }),
      tx.productProperty.findMany({ where: { productId }, select: { propertyId: true } }),
    ]);

    return { ...updated, categoryLinks, collectionLinks, propertyLinks };
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { productId: result.id, handle: result.handle, status: result.status },
  });

  if (becameActive) {
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'product.published',
      data: { productId: result.id, handle: result.handle },
    });
  }

  return toProductDetail(result);
}

export async function archive(ctx: ServiceContext, productId: string): Promise<void> {
  await transitionStatus(ctx, productId, 'archived', 'commerce.product.archived');
}

/** Undelete a soft-deleted product (and its tombstoned variants). Unlike the status
 *  transitions, this must see the deleted row, so it can't go through
 *  transitionStatus (which filters `deletedAt: null`). Idempotent: a live product is
 *  left as-is. Mirrors softDelete's variant cascade so the product comes back whole. */
export async function restore(ctx: ServiceContext, productId: string): Promise<void> {
  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.product.findFirst({ where: { id: productId } });
    if (!before) throw new CommerceNotFoundError('Product', productId);
    if (before.deletedAt === null) return before;

    const updated = await tx.product.update({
      where: { id: productId },
      data: { deletedAt: null, status: before.status === 'archived' ? 'draft' : before.status },
    });

    await tx.productVariant.updateMany({
      where: { productId, tenantId: ctx.tenantId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.product.restored',
      entityType: 'Product',
      entityId: updated.id,
      diff: { before: serializeProduct(before), after: serializeProduct(updated) },
    });

    return updated;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { productId: result.id, handle: result.handle, status: result.status },
  });
}

export async function publish(ctx: ServiceContext, productId: string): Promise<void> {
  await transitionStatus(ctx, productId, 'active', 'commerce.product.published');
}

export async function unpublish(ctx: ServiceContext, productId: string): Promise<void> {
  await transitionStatus(ctx, productId, 'draft', 'commerce.product.unpublished');
}

export async function softDelete(ctx: ServiceContext, productId: string): Promise<void> {
  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!before) throw new CommerceNotFoundError('Product', productId);

    const updated = await tx.product.update({
      where: { id: productId },
      data: { deletedAt: new Date(), status: 'archived' },
    });

    // Cascade the tombstone to the product's live variants. A soft-deleted product
    // must NOT leave live variants behind: a live variant under a deleted product is
    // an orphan whose SKU stays reserved (the SKU-uniqueness check ignores deletedAt)
    // with no owning live product — which then blocks a later reconcile/reinstall.
    // Hard delete is unsafe (cart lines pin variants via onDelete: Restrict), so we
    // tombstone them in lockstep; restore() brings them back together.
    await tx.productVariant.updateMany({
      where: { productId, tenantId: ctx.tenantId, deletedAt: null },
      data: { deletedAt: new Date(), isDefault: false },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.product.deleted',
      entityType: 'Product',
      entityId: updated.id,
      diff: { before: serializeProduct(before), after: serializeProduct(updated) },
    });

    return updated;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.deleted',
    data: { productId: result.id, handle: result.handle },
  });
}

// ─── Bulk operations ──────────────────────────────────────────────────

/**
 * Delete several products at once.
 *
 * The SAME tombstone as `softDelete`, applied per product inside one
 * transaction: the product and its live variants go together, because a live
 * variant under a deleted product is an orphan whose SKU stays reserved and
 * blocks a later reinstall.
 *
 * Products already gone are skipped rather than erroring the batch. Somebody
 * who ticked fifteen and had one deleted in another tab wants the fourteen
 * removed and a truthful count, not a failed operation and no way to tell which
 * one was the problem.
 */
export async function bulkSoftDelete(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ deleted: number; skipped: number }> {
  const input = BulkDeleteProductsInput.parse(rawInput);

  const removed = await withTenant(ctx, async (tx) => {
    const alive = await tx.product.findMany({
      where: { id: { in: input.productIds }, deletedAt: null },
    });
    const now = new Date();

    for (const before of alive) {
      const updated = await tx.product.update({
        where: { id: before.id },
        data: { deletedAt: now, status: 'archived' },
      });
      await tx.productVariant.updateMany({
        where: { productId: before.id, tenantId: ctx.tenantId, deletedAt: null },
        data: { deletedAt: now, isDefault: false },
      });
      await writeAuditLog({
        tx,
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        actorType: ctx.userId ? 'user' : 'system',
        action: 'commerce.product.deleted',
        entityType: 'Product',
        entityId: updated.id,
        diff: { before: serializeProduct(before), after: serializeProduct(updated) },
      });
    }

    return alive.map((p) => ({ id: p.id, handle: p.handle }));
  });

  await Promise.all(
    removed.map((p) =>
      publishCommerceEvent({
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        topic: 'product.deleted',
        data: { productId: p.id, handle: p.handle },
      })
    )
  );

  return { deleted: removed.length, skipped: input.productIds.length - removed.length };
}

export async function bulkUpdateStatus(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ updated: number }> {
  const input = BulkUpdateProductStatusInput.parse(rawInput);

  const { result, activatedHandles } = await withTenant(ctx, async (tx) => {
    // The subset that genuinely transitions INTO `active` — read BEFORE the write
    // so an already-active product doesn't re-announce (product.published below).
    const activating =
      input.status === 'active'
        ? await tx.product.findMany({
            where: { id: { in: input.productIds }, status: { not: 'active' }, deletedAt: null },
            select: { id: true, handle: true },
          })
        : [];

    const updateResult = await tx.product.updateMany({
      where: { id: { in: input.productIds }, deletedAt: null },
      data: {
        status: input.status,
        ...(input.status === 'active' ? { publishedAt: new Date() } : {}),
      },
    });
    for (const id of input.productIds) {
      await writeAuditLog({
        tx,
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        actorType: ctx.userId ? 'user' : 'system',
        action: 'commerce.product.status_changed',
        entityType: 'Product',
        entityId: id,
        diff: { after: { status: input.status } },
      });
    }
    return {
      result: { updated: updateResult.count },
      activatedHandles: new Map(activating.map((p) => [p.id, p.handle])),
    };
  });

  await Promise.all(
    input.productIds.map((productId) =>
      publishCommerceEvent({
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        topic: 'product.updated',
        data: { productId, change: 'status', status: input.status },
      })
    )
  );

  // Announce only the products that actually went live in this batch.
  await Promise.all(
    [...activatedHandles].map(([productId, handle]) =>
      publishCommerceEvent({
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        topic: 'product.published',
        data: { productId, handle },
      })
    )
  );

  return result;
}

export async function bulkTag(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ updated: number }> {
  const input = BulkTagProductsInput.parse(rawInput);
  if (input.addTags.length === 0 && input.removeTags.length === 0) {
    return { updated: 0 };
  }

  return withTenant(ctx, async (tx) => {
    const products = await tx.product.findMany({
      where: { id: { in: input.productIds }, deletedAt: null },
      select: { id: true, tags: true },
    });

    let updated = 0;
    for (const product of products) {
      const next = new Set(product.tags);
      input.addTags.forEach((t) => next.add(t));
      input.removeTags.forEach((t) => next.delete(t));
      const nextTags = [...next];
      if (sameTags(product.tags, nextTags)) continue;

      await tx.product.update({ where: { id: product.id }, data: { tags: nextTags } });
      await writeAuditLog({
        tx,
        tenantId: ctx.tenantId,
        actorId: ctx.userId ?? null,
        actorType: ctx.userId ? 'user' : 'system',
        action: 'commerce.product.tags_updated',
        entityType: 'Product',
        entityId: product.id,
        diff: { before: { tags: product.tags }, after: { tags: nextTags } },
      });
      updated++;
    }

    return { updated };
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────

type ProductWithIncludes = Product & {
  categoryLinks: { categoryId: string }[];
  collectionLinks: { collectionId: string; addedBy: string }[];
  shippingProfileLinks: { profileId: string }[];
  propertyLinks: { propertyId: string }[];
  _count: { variants: number; options: number };
};

function toProductDetail(p: ProductWithIncludes): ProductDetail {
  return {
    id: p.id,
    tenantId: p.tenantId,
    title: p.title,
    handle: p.handle,
    description: p.description,
    status: p.status as ProductStatus,
    productType: p.productType,
    productTypeKey: p.productTypeKey,
    attributes: (p.attributes ?? {}) as Record<string, unknown>,
    vendor: p.vendor,
    tags: p.tags,
    fulfillmentType: p.fulfillmentType,
    weightGrams: p.weightGrams,
    lengthMm: p.lengthMm,
    widthMm: p.widthMm,
    heightMm: p.heightMm,
    hazmatClass: p.hazmatClass,
    requiresShipping: p.requiresShipping,
    taxClass: p.taxClass,
    originCountry: p.originCountry,
    hsCode: p.hsCode,
    metadata: (p.metadata ?? {}) as Record<string, unknown>,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    ogImageId: p.ogImageId,
    defaultWarehouseId: p.defaultWarehouseId,
    priceMinCents: p.priceMinCents,
    priceMaxCents: p.priceMaxCents,
    inStock: p.inStock,
    averageRating: p.averageRating,
    reviewCount: p.reviewCount,
    variantCount: p._count.variants,
    optionCount: p._count.options,
    categoryIds: p.categoryLinks.map((c) => c.categoryId),
    collectionIds: p.collectionLinks.map((c) => c.collectionId),
    // The join table can hold several; the product editor and the rate matcher
    // both work in ONE, so the first is the answer and the write below is what
    // keeps there from being a second.
    shippingProfileId: p.shippingProfileLinks[0]?.profileId ?? null,
    collectionMemberships: p.collectionLinks.map((c) => ({
      collectionId: c.collectionId,
      // Anything the indexer did not stamp `rule` is a person's doing. Defaulting
      // to `manual` on an unknown value keeps an editor able to remove it, which
      // is the safe direction to be wrong in.
      addedBy: c.addedBy === 'rule' ? ('rule' as const) : ('manual' as const),
    })),
    marketListed: p.marketListed,
    marketCategory: p.marketCategory,
    orderAheadDays: p.orderAheadDays,
    dailyLimit: p.dailyLimit,
    deposit: depositFromColumns(p),
    propertyIds: p.propertyLinks.map((l) => l.propertyId),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    publishedAt: p.publishedAt?.toISOString() ?? null,
  };
}

async function transitionStatus(
  ctx: ServiceContext,
  productId: string,
  nextStatus: ProductStatus,
  auditAction: string
): Promise<void> {
  let becameActive = false;
  const result = await withTenant(ctx, async (tx) => {
    const before = await tx.product.findFirst({
      where: { id: productId, deletedAt: null },
    });
    if (!before) throw new CommerceNotFoundError('Product', productId);
    if (before.status === nextStatus) return before;

    // Reaching here means the status genuinely changed; a move INTO `active` is a
    // real publish moment (emitted below as product.published, distinct from the
    // noisy product.updated).
    becameActive = nextStatus === 'active';

    const updated = await tx.product.update({
      where: { id: productId },
      data: {
        status: nextStatus,
        ...(nextStatus === 'active' && before.publishedAt === null
          ? { publishedAt: new Date() }
          : {}),
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: auditAction,
      entityType: 'Product',
      entityId: updated.id,
      diff: {
        before: { status: before.status },
        after: { status: updated.status },
      },
    });

    return updated;
  });

  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'product.updated',
    data: { productId: result.id, change: 'status', status: result.status },
  });

  if (becameActive) {
    await publishCommerceEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      topic: 'product.published',
      data: { productId: result.id, handle: result.handle },
    });
  }
}

async function ensureUniqueHandle(
  tx: Prisma.TransactionClient,
  tenantId: string,
  seed: string,
  excludingProductId?: string
): Promise<string> {
  const base = seed.length > 0 ? seed.slice(0, 120) : 'product';
  for (let suffix = 0; suffix < 50; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const existing = await tx.product.findFirst({
      where: {
        tenantId,
        handle: candidate,
        ...(excludingProductId ? { NOT: { id: excludingProductId } } : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new CommerceConflictError(`Could not generate unique handle for "${seed}"`, 'handle');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((t, i) => t === sb[i]);
}

function serializeProduct(p: Product): Record<string, unknown> {
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    status: p.status,
    productType: p.productType,
    productTypeKey: p.productTypeKey,
    attributes: p.attributes ?? {},
    vendor: p.vendor,
    fulfillmentType: p.fulfillmentType,
    hazmatClass: p.hazmatClass,
    requiresShipping: p.requiresShipping,
    tags: p.tags,
    taxClass: p.taxClass,
    originCountry: p.originCountry,
    hsCode: p.hsCode,
    // Made to order (issue 026). In the audit diff on purpose: these three
    // decide what a customer is charged and when they are told they can
    // collect, so "who changed the deposit" has to be answerable.
    orderAheadDays: p.orderAheadDays,
    depositType: p.depositType,
    depositAmountCents: p.depositAmountCents,
    depositPercent: p.depositPercent,
    dailyLimit: p.dailyLimit,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    deletedAt: p.deletedAt?.toISOString() ?? null,
  };
}
