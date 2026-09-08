'use client';

// Client-side search autocomplete. The header search island debounces the query
// and hits the cross-tenant market suggest endpoint through the same-origin
// /api/sparx proxy — matching product titles + merchant names for the dropdown.
// Reads only; the actual search is a plain GET navigation to /products?q=.

const API_BASE = '/api/sparx/v1/public/market';

export interface SuggestProduct {
  slug: string;
  title: string;
  category: string;
}

export interface SuggestMerchant {
  slug: string;
  name: string;
}

export interface SuggestResult {
  products: SuggestProduct[];
  merchants: SuggestMerchant[];
}

const EMPTY: SuggestResult = { products: [], merchants: [] };

/** Fetch header suggestions for a query. Returns empty on any failure or a query
 *  shorter than two characters (the server's floor) — autocomplete never throws. */
export async function fetchSuggestions(q: string, signal?: AbortSignal): Promise<SuggestResult> {
  const query = q.trim();
  if (query.length < 2) return EMPTY;
  try {
    const res = await fetch(`${API_BASE}/products/suggest?q=${encodeURIComponent(query)}`, {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    });
    const body = (await res.json().catch(() => null)) as
      { success: true; data: SuggestResult } | { success: false } | null;
    if (!res.ok || !body || body.success === false) return EMPTY;
    return body.data;
  } catch {
    return EMPTY;
  }
}
