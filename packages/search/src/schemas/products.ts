// Typesense schema for the products collection. Faceted fields include
// the fitment dimensions so the Gillett-style storefront filter renders
// instantly without round-tripping Postgres.

import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';

export const PRODUCTS_COLLECTION = 'products';

export function productsSchema(
  collectionName: string = PRODUCTS_COLLECTION
): CollectionCreateSchema {
  return {
    name: collectionName,
    fields: [
      // Hidden tenancy guard. Every query MUST filter on this — the
      // wrapper enforces it via `searchProducts({tenantId})`.
      { name: 'tenant_id', type: 'string', facet: false, index: true },

      { name: 'product_id', type: 'string', facet: false, index: true },
      { name: 'title', type: 'string', facet: false, sort: true, infix: true },
      { name: 'description', type: 'string', facet: false, optional: true },
      { name: 'handle', type: 'string', facet: false, index: true },
      { name: 'status', type: 'string', facet: true },
      { name: 'product_type', type: 'string', facet: true, optional: true },
      { name: 'vendor', type: 'string', facet: true, optional: true },
      { name: 'tags', type: 'string[]', facet: true, optional: true },
      { name: 'category_ids', type: 'string[]', facet: true, optional: true },
      { name: 'collection_ids', type: 'string[]', facet: true, optional: true },

      // Price + inventory facets (storefront price-range filter, in-stock toggle).
      { name: 'price_min_cents', type: 'int32', facet: true },
      { name: 'price_max_cents', type: 'int32', facet: true, sort: true },
      { name: 'in_stock', type: 'bool', facet: true },
      { name: 'currency', type: 'string', facet: true },

      // Variant SKU search support — the storefront ⌘K palette and the
      // dashboard product search both grep across SKUs.
      { name: 'skus', type: 'string[]', facet: false, optional: true },

      // Fitment — Gillett Diesel + every other auto/diesel/marine merchant.
      { name: 'fitment_makes', type: 'string[]', facet: true, optional: true },
      { name: 'fitment_models', type: 'string[]', facet: true, optional: true },
      { name: 'fitment_engines', type: 'string[]', facet: true, optional: true },
      { name: 'fitment_years', type: 'int32[]', facet: true, optional: true },

      // Image — first product image URL for the result tile.
      { name: 'image_url', type: 'string', facet: false, optional: true },

      // Sorting + recency.
      { name: 'created_at', type: 'int64', facet: false, sort: true },
      { name: 'updated_at', type: 'int64', facet: false, sort: true },
      { name: 'best_seller_rank', type: 'int32', facet: false, sort: true, optional: true },
    ],
    default_sorting_field: 'updated_at',
    token_separators: ['-', '_', '/', '.'],
    symbols_to_index: ['+'],
  };
}

export interface ProductSearchDocument {
  id: string; // typesense doc id: `${tenantId}:${productId}`
  tenant_id: string;
  product_id: string;
  title: string;
  description?: string;
  handle: string;
  status: 'draft' | 'active' | 'archived';
  product_type?: string;
  vendor?: string;
  tags?: string[];
  category_ids?: string[];
  collection_ids?: string[];
  price_min_cents: number;
  price_max_cents: number;
  in_stock: boolean;
  currency: string;
  skus?: string[];
  fitment_makes?: string[];
  fitment_models?: string[];
  fitment_engines?: string[];
  fitment_years?: number[];
  image_url?: string;
  created_at: number;
  updated_at: number;
  best_seller_rank?: number;
}
