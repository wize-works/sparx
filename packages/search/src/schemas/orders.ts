// Typesense schema for the orders collection. Dashboard ⌘K palette
// searches across order number, customer name/email, and item titles.

import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';

export const ORDERS_COLLECTION = 'orders';

export function ordersSchema(collectionName: string = ORDERS_COLLECTION): CollectionCreateSchema {
  return {
    name: collectionName,
    fields: [
      { name: 'tenant_id', type: 'string', facet: false, index: true },
      { name: 'order_id', type: 'string', facet: false, index: true },
      { name: 'order_number', type: 'string', facet: false, sort: true, infix: true },
      { name: 'customer_id', type: 'string', facet: true, optional: true },
      { name: 'customer_name', type: 'string', facet: false, optional: true },
      { name: 'customer_email', type: 'string', facet: false, optional: true },
      { name: 'b2b_account_id', type: 'string', facet: true, optional: true },
      { name: 'channel', type: 'string', facet: true },
      { name: 'status', type: 'string', facet: true },
      { name: 'payment_status', type: 'string', facet: true },
      { name: 'fulfillment_status', type: 'string', facet: true, optional: true },
      { name: 'item_titles', type: 'string[]', facet: false, optional: true },
      { name: 'item_skus', type: 'string[]', facet: false, optional: true },
      { name: 'tags', type: 'string[]', facet: true, optional: true },
      { name: 'total_cents', type: 'int64', facet: false, sort: true },
      { name: 'currency', type: 'string', facet: true },
      { name: 'placed_at', type: 'int64', facet: false, sort: true },
    ],
    default_sorting_field: 'placed_at',
  };
}

export interface OrderSearchDocument {
  id: string; // `${tenantId}:${orderId}`
  tenant_id: string;
  order_id: string;
  order_number: string;
  customer_id?: string;
  customer_name?: string;
  customer_email?: string;
  b2b_account_id?: string;
  channel: string;
  status: string;
  payment_status: string;
  fulfillment_status?: string;
  item_titles?: string[];
  item_skus?: string[];
  tags?: string[];
  total_cents: number;
  currency: string;
  placed_at: number;
}
