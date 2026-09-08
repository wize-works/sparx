// Spocket adapter — connects to the Spocket REST API to sync products and
// submit orders. Spocket uses a per-account API key for authentication.
//
// credentials shape:
//   apiKey — Spocket API key from the Spocket dashboard

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

export interface SpocketCredentials {
  apiKey: string;
}

const BASE_URL = 'https://api.spocket.co/v2';

interface SpocketVariant {
  id: string | number;
  sku: string;
  price: number; // retail price (MSRP)
  cost: number; // dropship cost
  inventory: number;
  weight: number | null;
  option1?: string;
  option2?: string;
  image?: string;
}

interface SpocketProduct {
  id: string | number;
  title: string;
  description: string;
  category?: string;
  tags?: string[];
  images: Array<{ src: string }>;
  variants: SpocketVariant[];
}

interface SpocketTrackingEvent {
  created_at: string;
  message: string;
  location?: string;
}

interface SpocketOrderResponse {
  id: string | number;
  status: string;
  error?: string;
  tracking_number?: string;
  tracking_url?: string;
  events?: SpocketTrackingEvent[];
}

export class SpocketAdapter implements SupplierAdapter {
  private readonly creds: SpocketCredentials;

  constructor(credentials: Credentials) {
    this.creds = credentials as unknown as SpocketCredentials;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.creds.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async authenticate(_credentials: Credentials): Promise<boolean> {
    if (!this.creds.apiKey) return false;
    try {
      const res = await fetch(`${BASE_URL}/products?per_page=1`, {
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
    const perPage = 100;

    while (true) {
      const res = await fetch(`${BASE_URL}/products?page=${page}&per_page=${perPage}`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`Spocket products fetch failed: ${res.status}`);

      const body = (await res.json()) as { products?: SpocketProduct[]; total_count?: number };
      const products = body.products ?? [];
      if (products.length === 0) break;

      for (const p of products) {
        yield {
          supplierProductId: String(p.id),
          title: p.title,
          description: p.description ?? null,
          category: p.category ?? null,
          tags: p.tags ?? [],
          imageUrls: p.images.map((i) => i.src),
          variants: p.variants.map((v): NormalizedProductVariant => ({
            supplierSku: v.sku,
            title: [v.option1, v.option2].filter(Boolean).join(' / '),
            options: {
              ...(v.option1 ? { option1: v.option1 } : {}),
              ...(v.option2 ? { option2: v.option2 } : {}),
            },
            costPriceCents: Math.round(v.cost * 100),
            msrpCents: Math.round(v.price * 100),
            inventoryQuantity: v.inventory,
            weight: v.weight ? Math.round(v.weight * 453.592) : null, // lbs → grams
            imageUrls: v.image ? [v.image] : [],
          })),
          raw: p as unknown as Record<string, unknown>,
        };
      }

      const fetched = page * perPage;
      const total = body.total_count ?? 0;
      if (fetched >= total) break;
      page++;
    }
  }

  async submitOrder(order: Order): Promise<SupplierOrderResult> {
    const body = {
      order: {
        external_id: order.sparxOrderId,
        shipping_address: {
          name: order.shippingAddress.name,
          address1: order.shippingAddress.line1,
          address2: order.shippingAddress.line2,
          city: order.shippingAddress.city,
          province: order.shippingAddress.region,
          zip: order.shippingAddress.postalCode,
          country_code: order.shippingAddress.countryCode,
          phone: order.shippingAddress.phone,
        },
        line_items: order.lineItems.map((li) => ({
          sku: li.supplierSku,
          quantity: li.quantity,
        })),
      },
    };

    try {
      const res = await fetch(`${BASE_URL}/orders`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json()) as SpocketOrderResponse;
      if (!res.ok) {
        return {
          supplierOrderId: `spocket-fail-${order.sparxOrderId}`,
          status: 'failed',
          errorMessage: data.error ?? `Spocket API error: ${res.status}`,
        };
      }
      return {
        supplierOrderId: String(data.id),
        status: 'submitted',
      };
    } catch (err: any) {
      return {
        supplierOrderId: `spocket-fail-${order.sparxOrderId}`,
        status: 'failed',
        errorMessage: err?.message ?? 'Network error',
      };
    }
  }

  async getTrackingUpdate(supplierOrderId: string): Promise<TrackingInfo> {
    const res = await fetch(`${BASE_URL}/orders/${supplierOrderId}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Spocket tracking fetch failed: ${res.status}`);

    const data = (await res.json()) as SpocketOrderResponse;
    const events: TrackingEvent[] = (data.events ?? []).map((e) => ({
      timestamp: e.created_at,
      description: e.message,
      location: e.location,
    }));

    return {
      supplierOrderId,
      trackingNumber: data.tracking_number ?? null,
      trackingUrl: data.tracking_url ?? null,
      carrier: null,
      status:
        data.status === 'shipped'
          ? 'shipped'
          : data.status === 'delivered'
            ? 'delivered'
            : 'pending',
      events,
    };
  }

  async checkInventory(skus: string[]): Promise<InventoryMap> {
    // Spocket doesn't expose a bulk inventory endpoint; return empty and rely
    // on the catalog sync to keep quantities up to date.
    void skus;
    return {};
  }
}
