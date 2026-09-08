// The search experience as ONE self-contained server component — the pinned
// `commerce.search` core (docs/122). It owns everything interactive about search: the
// query field, the Typesense-faceted sidebar, sort, the result grid + pagination, and
// the "pages & collections" strip. The /search route drops it into an editable silica
// shell via a host node, so a tenant restyles and surrounds search without touching the
// query logic. All filter state stays in the URL, so every result page is shareable.
//
// Extracted verbatim from the old app/search/page.tsx body (only the outer container +
// the page <h1> moved to the shell). It reads `searchParams` handed down by the route —
// a host core can't read the URL itself, so the route passes the resolved params in.

import { EmptyState } from '@/components/empty-state';
import { Pagination } from '@/components/pagination';
import { ProductGrid } from '@/components/product-grid';
import { SearchFacets } from '@/components/search-facets';
import { SortSelect } from '@/components/sort-select';
import {
  searchEverything,
  searchProducts,
  type ProductSort,
  type SiteSearchHit,
} from '@/lib/commerce';
import type { ResolvedSite } from '@/lib/site-context';

export type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const PER_PAGE = 24;

const dollarsToCents = (v: string | undefined): number | undefined => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
};

// Fallback names by entity type. A CMS hit carries the tenant's OWN name for its
// content type ("Blog post", "Event", "Job posting"), because one `cms_entry` can be
// any of ten kinds and the entity type alone cannot tell them apart.
const SITE_HIT_LABEL: Record<string, string> = {
  collection: 'Collection',
  cms_page: 'Page',
  cms_entry: 'Article',
};
const labelFor = (h: SiteSearchHit) => h.kind ?? SITE_HIT_LABEL[h.type] ?? 'Result';

export async function SearchExperience({
  site,
  searchParams,
}: {
  site: ResolvedSite;
  searchParams: SearchParams;
}) {
  const sp = searchParams;
  const q = (one(sp.q) ?? '').trim();
  const sort = (one(sp.sort) ?? 'relevance') as ProductSort;
  const page = Math.max(1, Number(one(sp.page) ?? '1') || 1);
  const minPrice = one(sp.minPrice);
  const maxPrice = one(sp.maxPrice);
  const vendor = one(sp.vendor);
  const productType = one(sp.productType);
  const fitmentMakes = one(sp.fitmentMakes);
  const fitmentModels = one(sp.fitmentModels);
  const fitmentEngines = one(sp.fitmentEngines);
  const inStock = one(sp.inStock) === 'true';

  // A search runs whenever there's a query OR any active filter — so the sidebar
  // can refine an empty query into a pure browse-by-facet experience.
  const hasCriteria =
    inStock ||
    [q, vendor, productType, fitmentMakes, fitmentModels, fitmentEngines, minPrice, maxPrice].some(
      (v) => Boolean(v)
    );

  // Kick off the universal "search everything" alongside the product search so it
  // runs concurrently; products appear in the grid below, this strip surfaces the rest.
  const siteSearch = q ? searchEverything(site.slug, q, 12) : Promise.resolve<SiteSearchHit[]>([]);

  const result = hasCriteria
    ? await searchProducts(site.slug, {
        q: q || undefined,
        sort,
        page,
        perPage: PER_PAGE,
        vendor,
        productType,
        fitmentMakes,
        fitmentModels,
        fitmentEngines,
        inStock: inStock || undefined,
        minPriceCents: dollarsToCents(minPrice),
        maxPriceCents: dollarsToCents(maxPrice),
      })
    : { items: [], total: 0, page: 1, perPage: PER_PAGE, facets: {} };

  const siteHits = (await siteSearch).filter((h) => h.type !== 'product');
  const totalPages = Math.max(1, Math.ceil(result.total / result.perPage));
  const { defaultCurrency: currency, defaultLocale: locale } = site.commerce;

  return (
    <>
      <form action="/search" role="search" className="relative w-full max-w-[560px]">
        <svg
          className="text-base-content pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
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
          className="input w-full pl-9"
        />
      </form>

      {siteHits.length > 0 ? (
        <section className="my-6">
          <h2 className="mb-2 text-base">Pages &amp; collections</h2>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {siteHits.map((h) => (
              <li key={h.url}>
                <a href={h.url} className="inline-flex items-baseline gap-2">
                  <span>{h.title}</span>
                  <span className="badge badge-sm">{labelFor(h)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!hasCriteria ? (
        <EmptyState
          icon="🔎"
          title="Search the catalog"
          description="Type a product name, brand, or part number above."
        />
      ) : (
        <div
          className="grid grid-cols-[248px_minmax(0,1fr)] items-start gap-[clamp(1.5rem,3vw,3rem)] py-[clamp(1.5rem,4vw,3rem)] max-[900px]:grid-cols-1"
          style={{ marginTop: '1.5rem' }}
        >
          <aside>
            <SearchFacets
              action="/search"
              facets={result.facets}
              values={{
                q,
                sort,
                vendor,
                productType,
                fitmentMakes,
                fitmentModels,
                fitmentEngines,
                minPrice,
                maxPrice,
                inStock,
              }}
            />
          </aside>
          <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              {/* PRODUCTS, said out loud. This line sits above the product grid and
                  counts only it, and the strip above can be showing pages and
                  collections that matched — so an unqualified "0 results for
                  returns" directly under a found Return Policy told the shopper
                  two opposite things at once. */}
              <span className="text-base-content text-sm">
                {result.total} {result.total === 1 ? 'product' : 'products'}
                {q ? ` for “${q}”` : ''}
              </span>
              <SortSelect value={sort} />
            </div>
            {result.items.length === 0 ? (
              <EmptyState
                icon="🤷"
                title={q ? `No products match “${q}”` : 'No matching products'}
                description={
                  siteHits.length > 0
                    ? 'Nothing in the shop, but the pages above matched.'
                    : 'Check your spelling or loosen the filters.'
                }
                action={{ label: 'Browse all products', href: '/products' }}
              />
            ) : (
              <>
                <ProductGrid
                  products={result.items}
                  tenantSlug={site.slug}
                  currency={currency}
                  locale={locale}
                />
                {totalPages > 1 ? (
                  <Pagination
                    basePath="/search"
                    currentParams={sp}
                    page={page}
                    totalPages={totalPages}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
