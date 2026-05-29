// Indexer — upserts and deletes one document at a time. The
// commerce-indexer Cloud Run worker consumes product.*, variant.*,
// inventory.adjusted, customer.*, and order.* events and routes them
// through these functions. Batching for full reindex passes is in
// ./bulk.ts.

import type { Client } from 'typesense';

import {
  CUSTOMERS_COLLECTION,
  type CustomerSearchDocument,
  ORDERS_COLLECTION,
  type OrderSearchDocument,
  PRODUCTS_COLLECTION,
  type ProductSearchDocument,
} from './schemas';

import { getClient } from './client';

function client(): Client {
  return getClient();
}

// ─── Products ────────────────────────────────────────────────────────

export async function upsertProduct(doc: ProductSearchDocument): Promise<void> {
  await client().collections(PRODUCTS_COLLECTION).documents().upsert(doc);
}

export async function deleteProduct(tenantId: string, productId: string): Promise<void> {
  await client().collections(PRODUCTS_COLLECTION).documents(`${tenantId}:${productId}`).delete();
}

// ─── Customers ───────────────────────────────────────────────────────

export async function upsertCustomer(doc: CustomerSearchDocument): Promise<void> {
  await client().collections(CUSTOMERS_COLLECTION).documents().upsert(doc);
}

export async function deleteCustomer(tenantId: string, customerId: string): Promise<void> {
  await client().collections(CUSTOMERS_COLLECTION).documents(`${tenantId}:${customerId}`).delete();
}

// ─── Orders ──────────────────────────────────────────────────────────

export async function upsertOrder(doc: OrderSearchDocument): Promise<void> {
  await client().collections(ORDERS_COLLECTION).documents().upsert(doc);
}

export async function deleteOrder(tenantId: string, orderId: string): Promise<void> {
  await client().collections(ORDERS_COLLECTION).documents(`${tenantId}:${orderId}`).delete();
}
