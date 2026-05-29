// Search API — typed wrappers around Typesense's search() that enforce
// tenant filtering and shape the response for the storefront / dashboard.

import type { SearchParams } from 'typesense/lib/Typesense/Types';

import { getClient } from './client';
import {
  CUSTOMERS_COLLECTION,
  type CustomerSearchDocument,
  ORDERS_COLLECTION,
  type OrderSearchDocument,
  PRODUCTS_COLLECTION,
  type ProductSearchDocument,
} from './schemas';

// Typesense's SearchParams is generic over (TDoc, Infix). We don't need
// either to be strict here since we shape the response ourselves; use
// `object` so any field set is acceptable.
type AnySearchParams = SearchParams<object, string>;

export interface SearchHit<T> {
  document: T;
  highlights?: Record<string, { snippet?: string; matched_tokens?: unknown }>;
  textMatch?: number;
}

export interface SearchResult<T> {
  hits: SearchHit<T>[];
  found: number;
  page: number;
  perPage: number;
  facetCounts: { fieldName: string; counts: { value: string; count: number }[] }[];
}

export interface ProductSearchInput {
  tenantId: string;
  q?: string;
  /** Composed by the storefront ("vendor:=Bosch && tag:=injectors"). */
  filterBy?: string;
  /** Comma-separated facet field list. */
  facetBy?: string;
  sortBy?: string;
  page?: number;
  perPage?: number;
  // Fitment-specific filters; the wrapper composes them into filterBy
  // so the storefront doesn't have to learn Typesense's grammar.
  fitmentMakes?: string[];
  fitmentModels?: string[];
  fitmentEngines?: string[];
  fitmentYear?: number;
}

function joinFilter(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' && ');
}

function buildProductFilter(input: ProductSearchInput): string {
  const parts: (string | null)[] = [`tenant_id:=${input.tenantId}`, 'status:=active'];
  if (input.fitmentMakes?.length) {
    parts.push(`fitment_makes:=[${input.fitmentMakes.map((s) => `\`${s}\``).join(',')}]`);
  }
  if (input.fitmentModels?.length) {
    parts.push(`fitment_models:=[${input.fitmentModels.map((s) => `\`${s}\``).join(',')}]`);
  }
  if (input.fitmentEngines?.length) {
    parts.push(`fitment_engines:=[${input.fitmentEngines.map((s) => `\`${s}\``).join(',')}]`);
  }
  if (input.fitmentYear) {
    parts.push(`fitment_years:=${input.fitmentYear}`);
  }
  if (input.filterBy) parts.push(input.filterBy);
  return joinFilter(parts);
}

export async function searchProducts(
  input: ProductSearchInput
): Promise<SearchResult<ProductSearchDocument>> {
  const params: AnySearchParams = {
    q: input.q && input.q.length > 0 ? input.q : '*',
    query_by: 'title,description,skus,tags,vendor',
    query_by_weights: '4,2,3,2,2',
    filter_by: buildProductFilter(input),
    facet_by:
      input.facetBy ?? 'vendor,product_type,tags,fitment_makes,fitment_models,fitment_engines',
    sort_by: input.sortBy ?? '_text_match:desc,best_seller_rank:asc,updated_at:desc',
    page: input.page ?? 1,
    per_page: input.perPage ?? 24,
  };
  const result = await getClient().collections(PRODUCTS_COLLECTION).documents().search(params);
  return shape<ProductSearchDocument>(result, params);
}

export interface CustomerSearchInput {
  tenantId: string;
  q: string;
  page?: number;
  perPage?: number;
}

export async function searchCustomers(
  input: CustomerSearchInput
): Promise<SearchResult<CustomerSearchDocument>> {
  const params: AnySearchParams = {
    q: input.q,
    query_by: 'full_name,email,company,phone',
    query_by_weights: '4,3,3,2',
    filter_by: `tenant_id:=${input.tenantId}`,
    page: input.page ?? 1,
    per_page: input.perPage ?? 20,
  };
  const result = await getClient().collections(CUSTOMERS_COLLECTION).documents().search(params);
  return shape<CustomerSearchDocument>(result, params);
}

export interface OrderSearchInput {
  tenantId: string;
  q: string;
  page?: number;
  perPage?: number;
}

export async function searchOrders(
  input: OrderSearchInput
): Promise<SearchResult<OrderSearchDocument>> {
  const params: AnySearchParams = {
    q: input.q,
    query_by: 'order_number,customer_name,customer_email,item_titles,item_skus',
    query_by_weights: '5,3,3,2,2',
    filter_by: `tenant_id:=${input.tenantId}`,
    page: input.page ?? 1,
    per_page: input.perPage ?? 20,
  };
  const result = await getClient().collections(ORDERS_COLLECTION).documents().search(params);
  return shape<OrderSearchDocument>(result, params);
}

// ─── Multi-collection (⌘K palette) ────────────────────────────────────

export interface PaletteResult {
  products: SearchHit<ProductSearchDocument>[];
  customers: SearchHit<CustomerSearchDocument>[];
  orders: SearchHit<OrderSearchDocument>[];
}

export async function palette(input: {
  tenantId: string;
  q: string;
  limitPerCollection?: number;
}): Promise<PaletteResult> {
  const limit = input.limitPerCollection ?? 5;
  const result = (await getClient().multiSearch.perform({
    searches: [
      {
        collection: PRODUCTS_COLLECTION,
        q: input.q,
        query_by: 'title,skus,vendor,tags',
        filter_by: `tenant_id:=${input.tenantId} && status:=active`,
        per_page: limit,
      },
      {
        collection: CUSTOMERS_COLLECTION,
        q: input.q,
        query_by: 'full_name,email,company',
        filter_by: `tenant_id:=${input.tenantId}`,
        per_page: limit,
      },
      {
        collection: ORDERS_COLLECTION,
        q: input.q,
        query_by: 'order_number,customer_name,customer_email',
        filter_by: `tenant_id:=${input.tenantId}`,
        per_page: limit,
      },
    ],
  })) as unknown as { results: { hits?: unknown[] }[] };
  const [productsRes, customersRes, ordersRes] = result.results;
  return {
    products: (productsRes?.hits ?? []) as unknown as SearchHit<ProductSearchDocument>[],
    customers: (customersRes?.hits ?? []) as unknown as SearchHit<CustomerSearchDocument>[],
    orders: (ordersRes?.hits ?? []) as unknown as SearchHit<OrderSearchDocument>[],
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function shape<T>(raw: unknown, params: AnySearchParams): SearchResult<T> {
  const result = raw as {
    found?: number;
    hits?: { document: T; highlights?: unknown; text_match?: number }[];
    facet_counts?: {
      field_name: string;
      counts: { value: string; count: number }[];
    }[];
  };
  return {
    found: result.found ?? 0,
    page: params.page ?? 1,
    perPage: params.per_page ?? 24,
    hits: (result.hits ?? []).map((h) => ({
      document: h.document,
      highlights: h.highlights as Record<string, { snippet?: string }>,
      textMatch: h.text_match,
    })),
    facetCounts: (result.facet_counts ?? []).map((f) => ({
      fieldName: f.field_name,
      counts: f.counts,
    })),
  };
}
