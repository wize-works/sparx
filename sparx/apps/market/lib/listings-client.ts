// Browser-side resolution of market listing slugs → product cards, via the
// same-origin proxy. Shared by the guest-personalization surfaces (favorites,
// recently-viewed) that hold a list of slugs in localStorage and need to hydrate
// them into renderable cards. market_listings stores absolute image URLs, so the
// raw card is ready to render as-is (no media resolution needed here).

import type { ProductCardData } from '@/components/product-card';

const API_BASE = '/api/sparx/v1/public/market';

interface RawCard extends Omit<ProductCardData, never> {
  category?: string | null;
}

/** Resolve saved slugs to product cards (server preserves the requested order). */
export async function fetchListingsBySlugs(slugs: string[]): Promise<ProductCardData[]> {
  if (slugs.length === 0) return [];
  try {
    const res = await fetch(
      `${API_BASE}/products/by-slugs?slugs=${encodeURIComponent(slugs.join(','))}`,
      { cache: 'no-store' }
    );
    const body = (await res.json().catch(() => null)) as
      { success: true; data: { items: RawCard[] } } | { success: false } | null;
    if (!res.ok || !body || body.success === false) return [];
    return body.data.items.map((c) => ({
      slug: c.slug,
      title: c.title,
      imageUrl: c.imageUrl,
      priceMinCents: c.priceMinCents,
      priceMaxCents: c.priceMaxCents,
      currency: c.currency,
      merchantName: c.merchantName,
      merchantSlug: c.merchantSlug,
      inStock: c.inStock,
      averageRating: c.averageRating,
      reviewCount: c.reviewCount,
      bestSellerRank: c.bestSellerRank,
      lowStock: c.lowStock,
      featured: c.featured,
    }));
  } catch {
    return [];
  }
}
