'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE PRODUCT-TRANSLATIONS DATA LAYER
//
// This surface lives in Content (localization is a content concern) but reads
// and writes COMMERCE product data — a product's words in another language. It
// owns its own `['cms','translations']` key tree and its own fetches rather
// than importing the commerce product data layer, so the two modules stay
// decoupled: nothing here reaches into `surfaces/commerce`, and a change there
// cannot silently reshape a row here.
//
// The trade-off of that decoupling is that a save in THIS surface does not
// refresh a translations tab that might be open in the commerce product editor
// (it keys the same rows under `['commerce','products',…]`). That is acceptable
// — the two are rarely open together, and each carries its own Refresh — and it
// is the price of not coupling eight parallel modules through one cache.
//
// ── Coverage on the list, and the N+1 it forces ──────────────────────────
//
// The list shows, per product, which languages it is already written in. The
// products list endpoint does NOT carry that (see productService.list — it
// returns catalog columns, no translation join), and there is no tenant-wide
// "translations across products" read. So coverage is fetched per product, for
// the ONE page on screen, via `useQueries` — bounded by the page size, run in
// parallel, and keyed IDENTICALLY to `useProductTranslations` so each row's
// fetch is the same cache entry the editor reads when you open it (open a
// product and its coverage is already in hand; close and reopen the list and it
// is still warm). The production-correct fix is a `translationLocales` field on
// the product list serializer — noted for the API, not faked with a heavier
// client. Until then this is the honest bound: light, cached, page-scoped.
//
// ── PUT is whole-row, and that is load-bearing ───────────────────────────
//
// The upsert endpoint stores the WHOLE row for a locale: an omitted optional
// field is written as NULL, not left at its previous value. That is what makes
// "clear the Spanish search description" expressible without a second verb — so
// `useSaveTranslation` always sends all four fields, and no caller may hand it a
// partial. See the editor's save for the trimming that turns "" into that NULL.
// ══════════════════════════════════════════════════════════════════════════

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';

/* ── Shapes ─────────────────────────────────────────────────────────────── */

/** Stored lifecycle, in the words the storefront acts on. */
export type ProductStatus = 'draft' | 'active' | 'archived';

/** A row in the worklist. Names only what the list reads — the products list
 *  endpoint returns far more, and this ignores it. */
export interface TranslatableProduct {
  id: string;
  title: string;
  handle: string;
  status: ProductStatus;
  updatedAt: string;
}

/**
 * The product's OWN copy — the default language, the thing every translation is
 * translated FROM. Read-only here; the product editor owns changing it.
 */
export interface ProductSource {
  id: string;
  title: string;
  handle: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  status: ProductStatus;
}

/** One language's copy of a product, exactly as the server serialises it. */
export interface ProductTranslation {
  id: string;
  productId: string;
  locale: string;
  title: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ── The query-key tree ─────────────────────────────────────────────────── */

export interface ProductQuery {
  q?: string;
  status?: ProductStatus;
  /** Show retired products too. The server hides them unless asked. */
  includeArchived?: boolean;
  take: number;
  skip: number;
}

export const translationKeys = {
  all: ['cms', 'translations'] as const,
  products: (query: ProductQuery) => [...translationKeys.all, 'products', query] as const,
  source: (id: string) => [...translationKeys.all, 'source', id] as const,
  /** The languages authored for one product. Keyed on the product id ALONE (no
   *  enclosing query object), so the list's coverage fetch and the editor's read
   *  land on the same entry and share one request. */
  locales: (id: string) => [...translationKeys.all, 'locales', id] as const,
};

/* ── Reads ──────────────────────────────────────────────────────────────── */

export function useTranslatableProducts(query: ProductQuery) {
  return useQuery({
    queryKey: translationKeys.products(query),
    queryFn: () =>
      api.list<TranslatableProduct>('/v1/commerce/products', {
        ...(query.q ? { q: query.q } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.includeArchived ? { include_archived: true } : {}),
        // A worklist is read down the alphabet, not newest-first.
        sort_by: 'title',
        order: 'asc',
        take: query.take,
        skip: query.skip,
      }),
    // Keep the current window on screen while the next loads, so paging and
    // filtering don't blink the table out to empty and back.
    placeholderData: (previous) => previous,
  });
}

/** The product's own (default-language) copy — what the editor translates from. */
export function useProductSource(id: string) {
  return useQuery({
    queryKey: translationKeys.source(id),
    queryFn: () => api.get<ProductSource>(`/v1/commerce/products/${id}`),
    enabled: id !== '',
    // A 404 means the product is gone, not that the server is broken — surface it
    // rather than retrying it into a generic failure.
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/** The query options for ONE product's translations, shared by the editor's read
 *  and the list's per-row coverage fetch so both hit the same cache entry. */
function translationsQuery(
  id: string
): UseQueryOptions<ProductTranslation[], Error, ProductTranslation[], readonly unknown[]> {
  return {
    queryKey: translationKeys.locales(id),
    queryFn: () => api.get<ProductTranslation[]>(`/v1/commerce/products/${id}/translations`),
    enabled: id !== '',
  };
}

/** Every language authored for one product. */
export function useProductTranslations(id: string) {
  return useQuery(translationsQuery(id));
}

/**
 * The languages each product on the current page is written in — one light,
 * cached request per row (see the header note on why this can't be one call).
 *
 * Returns a map from product id to the sorted locale tags, plus a flag while any
 * row is still resolving, so the list can show a settling state rather than
 * flashing "Not translated" under a product that simply hasn't loaded yet.
 */
export function useCoverage(ids: string[]): {
  byProduct: Map<string, ProductTranslation[]>;
  loading: boolean;
} {
  const results = useQueries({
    queries: ids.map((id) => translationsQuery(id)),
  });

  // The WHOLE row per language, not just its tag. The tag alone answers "does a
  // language exist here", and a language exists the moment its NAME is saved —
  // the one required field — so a barely-started translation and a finished one
  // came back identical. Everything needed to tell them apart (the description,
  // both search fields, and when the language was last written) is already in
  // this response; only the `.map(row => row.locale)` threw it away.
  const byProduct = new Map<string, ProductTranslation[]>();
  let loading = false;
  ids.forEach((id, index) => {
    const result = results[index];
    if (!result) return;
    if (result.data) {
      byProduct.set(
        id,
        [...result.data].sort((a, b) => a.locale.localeCompare(b.locale))
      );
    } else if (result.isLoading) {
      loading = true;
    }
  });

  return { byProduct, loading };
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

/** The ONE way this cluster says "a language changed": refresh that product's
 *  locales, which is both the editor's read AND the list row's coverage. */
function useInvalidateTranslations() {
  const queryClient = useQueryClient();
  return (productId: string) => {
    void queryClient.invalidateQueries({ queryKey: translationKeys.locales(productId) });
  };
}

/* ── Writes ─────────────────────────────────────────────────────────────── */

/** One language's copy, whole-row (see the header note). All four fields, always. */
export interface TranslationInput {
  locale: string;
  title: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

export function useSaveTranslation(productId: string) {
  const invalidate = useInvalidateTranslations();
  return useMutation({
    mutationFn: (input: TranslationInput) =>
      api.put<ProductTranslation>(
        `/v1/commerce/products/${productId}/translations/${encodeURIComponent(input.locale)}`,
        {
          title: input.title,
          description: input.description,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
        }
      ),
    onSuccess: () => {
      invalidate(productId);
    },
  });
}

/**
 * Save several languages in one atomic round trip — the server writes them in a
 * single transaction, so a payload where the last locale is invalid leaves none
 * of the earlier ones written. Each entry is whole-row, exactly like the single
 * save.
 */
export function useSaveTranslationsBulk(productId: string) {
  const invalidate = useInvalidateTranslations();
  return useMutation({
    mutationFn: (translations: TranslationInput[]) =>
      api.post<ProductTranslation[]>(`/v1/commerce/products/${productId}/translations/bulk`, {
        translations: translations.map((entry) => ({
          locale: entry.locale,
          title: entry.title,
          description: entry.description,
          seoTitle: entry.seoTitle,
          seoDescription: entry.seoDescription,
        })),
      }),
    onSuccess: () => {
      invalidate(productId);
    },
  });
}

export function useDeleteTranslation(productId: string) {
  const invalidate = useInvalidateTranslations();
  return useMutation({
    mutationFn: (locale: string) =>
      api.delete(`/v1/commerce/products/${productId}/translations/${encodeURIComponent(locale)}`),
    onSuccess: () => {
      invalidate(productId);
    },
  });
}

/* ── Locale + coverage ──────────────────────────────────────────────────── */

// Moved to `translations-locale.ts` (pure, no server) and re-exported here so
// the cluster still has one front door.
export {
  canonicalLocale,
  coverageSummary,
  isValidLocale,
  lastTranslatedAt,
  localeName,
  unfinishedLanguages,
  unfinishedNote,
} from './translations-locale';

/* ── Errors ─────────────────────────────────────────────────────────────── */

/** The server's own sentence for a 4xx, shown verbatim — these routes name the
 *  real problem ("Invalid locale", "Body locale does not match path locale")
 *  better than a status code. A 5xx carries no sentence, so it falls back. */
export function translationErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/* ── Formatting + status ────────────────────────────────────────────────── */

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/** How a product's lifecycle reads to an owner, with the tone for its badge. */
export function productStatusState(status: ProductStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'active':
      return { label: 'On sale', tone: 'success' };
    case 'archived':
      return { label: 'Retired', tone: 'neutral' };
    case 'draft':
    default:
      return { label: 'Draft', tone: 'info' };
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}
