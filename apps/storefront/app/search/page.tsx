// Search results. Full-text over title + description (Postgres FTS via the
// public products endpoint's `q` param; Typesense lands in a later phase).
// Shows a prominent search field, result count, sort, and a paginated grid.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { ProductGrid } from '@/components/product-grid';
import { SortSelect } from '@/components/sort-select';
import { listProducts, type ProductSort } from '@/lib/commerce';
import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Search' };

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const PER_PAGE = 24;

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const tenant = await resolveTenant();
  if (!tenant) notFound();

  const sp = (await searchParams) ?? {};
  const q = (one(sp.q) ?? '').trim();
  const sort = (one(sp.sort) ?? 'relevance') as ProductSort;
  const page = Math.max(1, Number(one(sp.page) ?? '1') || 1);

  const result = q
    ? await listProducts(tenant.slug, { q, sort, page, perPage: PER_PAGE })
    : { items: [], total: 0, page: 1, perPage: PER_PAGE };
  const totalPages = Math.max(1, Math.ceil(result.total / result.perPage));
  const { defaultCurrency: currency, defaultLocale: locale } = tenant.storefront;

  return (
    <div className="sf-container" style={{ paddingBlock: '2rem' }}>
      <h1 className="sf-h1" style={{ marginBottom: '1.25rem' }}>
        Search
      </h1>

      <form action="/search" role="search" className="sf-search" style={{ maxWidth: '560px' }}>
        <svg
          className="sf-search__icon"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search products…"
          aria-label="Search products"
        />
      </form>

      {!q ? (
        <EmptyState
          icon="🔎"
          title="Search the catalog"
          description="Type a product name, brand, or keyword above."
        />
      ) : result.items.length === 0 ? (
        <EmptyState
          icon="🤷"
          title={`No results for “${q}”`}
          description="Check your spelling or try a more general term."
          action={{ label: 'Browse all products', href: '/products' }}
        />
      ) : (
        <>
          <div className="sf-toolbar" style={{ marginTop: '1.5rem' }}>
            <span className="sf-toolbar__count">
              {result.total} {result.total === 1 ? 'result' : 'results'} for “{q}”
            </span>
            <SortSelect value={sort} />
          </div>
          <ProductGrid
            products={result.items}
            tenantSlug={tenant.slug}
            currency={currency}
            locale={locale}
          />
          {totalPages > 1 ? (
            <Pagination basePath="/search" currentParams={sp} page={page} totalPages={totalPages} />
          ) : null}
        </>
      )}
    </div>
  );
}
