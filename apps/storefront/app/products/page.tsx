// Product listing page (PLP). Faceted, sortable, paginated — all state lives
// in the URL so every variant is SSR-cacheable. Filters: price, availability,
// generalized fitment (domain → category + range), free-text search. Sort +
// pagination via query params.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { FacetPanel, type FacetValues } from '@/components/facet-panel';
import { Pagination } from '@/components/pagination';
import { ProductGrid } from '@/components/product-grid';
import { SortSelect } from '@/components/sort-select';
import {
  listFitmentCategories,
  listFitmentDomains,
  listProducts,
  type ProductSort,
  type PublicFitmentCategory,
  type PublicFitmentDomain,
} from '@/lib/commerce';
import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Shop all products' };

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// Dollar string → integer cents, ignoring junk.
function dollarsToCents(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

const PER_PAGE = 24;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const tenant = await resolveTenant();
  if (!tenant) notFound();

  const sp = (await searchParams) ?? {};
  const q = one(sp.q);
  const sort = (one(sp.sort) ?? 'relevance') as ProductSort;
  const minPrice = one(sp.minPrice);
  const maxPrice = one(sp.maxPrice);
  const inStock = one(sp.inStock) === 'true';
  // Generalized fitment params (preferred) with legacy vehicle aliases.
  const fitmentDomain = one(sp.fitmentDomain);
  const fitmentCategory = one(sp.fitmentCategory) ?? one(sp.fitmentMake);
  const fitmentRangeValue = one(sp.fitmentRangeValue) ?? one(sp.fitmentYear);
  const page = Math.max(1, Number(one(sp.page) ?? '1') || 1);

  // Load the fitment domains, then resolve the active one + its categories so
  // the facet panel can render domain-appropriate labels and a range widget.
  const domains = await listFitmentDomains(tenant.slug).catch<PublicFitmentDomain[]>(() => []);
  const activeDomain = domains.find((d) => d.slug === fitmentDomain) ?? domains[0] ?? null;
  const categories = activeDomain
    ? await listFitmentCategories(tenant.slug, activeDomain.id).catch<PublicFitmentCategory[]>(
        () => []
      )
    : [];

  const result = await listProducts(tenant.slug, {
    ...(q ? { q } : {}),
    sort,
    ...(minPrice ? { minPriceCents: dollarsToCents(minPrice) } : {}),
    ...(maxPrice ? { maxPriceCents: dollarsToCents(maxPrice) } : {}),
    ...(inStock ? { inStock: true } : {}),
    ...(fitmentCategory ? { fitmentCategory } : {}),
    ...(fitmentRangeValue ? { fitmentRangeValue: Number(fitmentRangeValue) } : {}),
    page,
    perPage: PER_PAGE,
  });

  const totalPages = Math.max(1, Math.ceil(result.total / result.perPage));
  const { defaultCurrency: currency, defaultLocale: locale } = tenant.storefront;

  const facetValues: FacetValues = {
    q,
    sort,
    minPrice,
    maxPrice,
    inStock,
    ...(activeDomain ? { fitmentDomain: activeDomain.slug } : {}),
    fitmentCategory,
    fitmentRangeValue,
  };

  return (
    <div className="sf-container">
      <Breadcrumbs
        items={[{ label: 'Home', href: '/' }, { label: q ? `Search: ${q}` : 'All products' }]}
      />

      <header style={{ marginBottom: '0.5rem' }}>
        <h1 className="sf-h1">{q ? `Results for “${q}”` : 'All products'}</h1>
      </header>

      <div className="sf-plp">
        <aside>
          <FacetPanel
            action="/products"
            domains={domains}
            activeDomain={activeDomain}
            categories={categories}
            values={facetValues}
          />
        </aside>

        <div>
          <div className="sf-toolbar">
            <span className="sf-toolbar__count">
              {result.total} {result.total === 1 ? 'product' : 'products'}
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
            <Pagination
              basePath="/products"
              currentParams={sp}
              page={page}
              totalPages={totalPages}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
