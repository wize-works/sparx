// Typesense schema for the customers collection. Dashboard ⌘K palette
// and the CRM customers list both read from this — the underlying CRM
// service is the source of truth, this is a denormalized read mirror.

import type { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';

export const CUSTOMERS_COLLECTION = 'customers';

export function customersSchema(
  collectionName: string = CUSTOMERS_COLLECTION
): CollectionCreateSchema {
  return {
    name: collectionName,
    fields: [
      { name: 'tenant_id', type: 'string', facet: false, index: true },
      { name: 'customer_id', type: 'string', facet: false, index: true },
      { name: 'full_name', type: 'string', facet: false, sort: true, infix: true },
      { name: 'email', type: 'string', facet: false, infix: true },
      { name: 'phone', type: 'string', facet: false, optional: true },
      { name: 'company', type: 'string', facet: true, optional: true },
      { name: 'type', type: 'string', facet: true },
      { name: 'b2b_account_id', type: 'string', facet: true, optional: true },
      { name: 'tags', type: 'string[]', facet: true, optional: true },
      { name: 'total_spent_cents', type: 'int64', facet: false, sort: true },
      { name: 'order_count', type: 'int32', facet: false, sort: true },
      { name: 'last_order_at', type: 'int64', facet: false, sort: true, optional: true },
      { name: 'created_at', type: 'int64', facet: false, sort: true },
    ],
    default_sorting_field: 'total_spent_cents',
  };
}

export interface CustomerSearchDocument {
  id: string; // `${tenantId}:${customerId}`
  tenant_id: string;
  customer_id: string;
  full_name: string;
  email: string;
  phone?: string;
  company?: string;
  type: 'prospect' | 'retail' | 'b2b';
  b2b_account_id?: string;
  tags?: string[];
  total_spent_cents: number;
  order_count: number;
  last_order_at?: number;
  created_at: number;
}
