// DSers adapter — connects to the DSers REST API for AliExpress-sourced
// dropshipping. DSers uses a store-level API token.
//
// credentials shape:
//   apiToken — DSers API token from the DSers dashboard
//   storeId  — DSers store ID (numeric, provided as a string)
//
// DSers API docs: https://help.dsers.com/api

import type {
  Credentials,
  InventoryMap,
  NormalizedProduct,
  NormalizedProductVariant,
  Order,
  SupplierAdapter,
  SupplierOrderResult,
  TrackingInfo,
  TrackingEvent,
} from '../types.js';

export interface DsersCredentials {
  apiToken: string;
  storeId: string;
}

const BASE_URL = 'https://openapi.dserspro.com/api/v1';

interface DsersVariant {
  sku_id: string;
  variant_title: string;
  sale_price: number; // in dollars
  original_price: number; // AliExpress price
  stock: number;
  weight: number | null; // grams
  images?: string[];
}

interface DsersProduct {
  product_id: string;
  title: string;
  description: string;
  categories?: string[];
  tags?: string[];
  images?: string[];
  variants: DsersVariant[];
}

interface DsersOrderResponse {
  order_id: string;
  status: string;
  error_message?: string;
  tracking_number?: string;
  tracking_company?: string;
  tracking_url?: string;
}

interface DsersTrackingEvent {
  event_time: string;
  event_desc: string;
  location?: string;
}

export class DsersAdapter implements SupplierAdapter {
  private readonly creds: DsersCredentials;

  constructor(credentials: Credentials) {
    this.creds = credentials as unknown as DsersCredentials;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.creds.apiToken}`,
      'X-Store-Id': this.creds.storeId,
      'Content-Type': 'application/json',
    };
  }

  async authenticate(_credentials: Credentials): Promise<boolean> {
    if (!this.creds.apiToken || !this.creds.storeId) return false;
    try {
      const res = await fetch(`${BASE_URL}/products?page=1&page_size=1`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async *syncCatalog(_since?: Date): AsyncGenerator<NormalizedProduct> {
    let page = 1;
    const pageSize = 50;

    while (true) {
      const res = await fetch(`${BASE_URL}/products?page=${page}&page_size=${pageSize}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`DSers products fetch failed: ${res.status}`);

      const body = (await res.json()) as {
        data?: DsersProduct[];
        total?: number;
        has_more?: boolean;
      };
      const products = body.data ?? [];
      if (products.length === 0) break;

      for (const p of products) {
        yield {
          supplierProductId: p.product_id,
          title: p.title,
          description: p.description ?? null,
          category: p.categories?.[0] ?? null,
          tags: p.tags ?? [],
          imageUrls: p.images ?? [],
          variants: p.variants.map((v): NormalizedProductVariant => ({
            supplierSku: v.sku_id,
            title: v.variant_title,
            options: this.parseOptions(v.variant_title),
            costPriceCents: Math.round(v.original_price * 100),
            msrpCents: Math.round(v.sale_price * 100),
            inventoryQuantity: v.stock,
            weight: v.weight,
            imageUrls: v.images ?? [],
          })),
          raw: p as unknown as Record<string, unknown>,
        };
      }

      if (!body.has_more) break;
      page++;
    }
  }

  private parseOptions(variantTitle: string): Record<string, string> {
    const options: Record<string, string> = {};
    const parts = variantTitle.split(';').map((p) => p.trim());
    parts.forEach((part, i) => {
      const [key, value] = part.split(':').map((s) => s.trim());
      if (key && value) {
        options[key.toLowerCase()] = value;
      } else if (part) {
        options[`option${i + 1}`] = part;
      }
    });
    return options;
  }

  async submitOrder(order: Order): Promise<SupplierOrderResult> {
    const body = {
      store_id: this.creds.storeId,
      external_order_id: order.sparxOrderId,
      external_order_number: order.sparxOrderNumber,
      shipping_address: {
        name: order.shippingAddress.name,
        address1: order.shippingAddress.line1,
        address2: order.shippingAddress.line2 ?? '',
        city: order.shippingAddress.city,
        province: order.shippingAddress.region ?? '',
        zip: order.shippingAddress.postalCode,
        country_code: order.shippingAddress.countryCode,
        phone: order.shippingAddress.phone ?? '',
      },
      line_items: order.lineItems.map((li) => ({
        sku_id: li.supplierSku,
        quantity: li.quantity,
      })),
    };

    try {
      const res = await fetch(`${BASE_URL}/orders`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json()) as DsersOrderResponse;
      if (!res.ok) {
        return {
          supplierOrderId: `dsers-fail-${order.sparxOrderId}`,
          status: 'failed',
          errorMessage: data.error_message ?? `DSers API error: ${res.status}`,
        };
      }
      return {
        supplierOrderId: data.order_id,
        status: 'submitted',
      };
    } catch (err: any) {
      return {
        supplierOrderId: `dsers-fail-${order.sparxOrderId}`,
        status: 'failed',
        errorMessage: err?.message ?? 'Network error',
      };
    }
  }

  async getTrackingUpdate(supplierOrderId: string): Promise<TrackingInfo> {
    const res = await fetch(`${BASE_URL}/orders/${supplierOrderId}/tracking`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`DSers tracking fetch failed: ${res.status}`);

    const data = (await res.json()) as {
      order: DsersOrderResponse;
      events?: DsersTrackingEvent[];
    };
    const o = data.order;

    const events: TrackingEvent[] = (data.events ?? []).map((e) => ({
      timestamp: e.event_time,
      description: e.event_desc,
      location: e.location,
    }));

    return {
      supplierOrderId,
      trackingNumber: o.tracking_number ?? null,
      trackingUrl: o.tracking_url ?? null,
      carrier: o.tracking_company ?? null,
      status:
        o.status === 'shipped' ? 'shipped' : o.status === 'delivered' ? 'delivered' : 'pending',
      events,
    };
  }

  async checkInventory(skus: string[]): Promise<InventoryMap> {
    if (skus.length === 0) return {};
    try {
      const res = await fetch(`${BASE_URL}/inventory/check`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ sku_ids: skus }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return {};
      const data = (await res.json()) as { inventory: Record<string, number> };
      const result: InventoryMap = {};
      for (const sku of skus) {
        result[sku] = data.inventory[sku] ?? null;
      }
      return result;
    } catch {
      return {};
    }
  }
}
