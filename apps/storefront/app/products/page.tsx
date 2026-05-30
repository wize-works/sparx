// Product listing page (PLP). Resolves the tenant from the Host, fetches
// the public product list with whatever filters arrived on the query
// string, and renders the grid + fitment filter.
//
// Phase 1 reads through api-rest's Prisma path, not Typesense — the
// indexer is wired and projecting in the background, but the storefront
// won't switch reads to Typesense until Phase 1.5 caching is in place.

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProductGrid } from '@/components/product-grid';
import { FitmentFilter } from '@/components/fitment-filter';
import { listProducts, listVehicleMakes } from '@/lib/commerce';
import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function ProductListingPage({ searchParams }: PageProps) {
  const tenant = await resolveTenant();
  if (!tenant) notFound();

  const params = (await searchParams) ?? {};
  const q = pickString(params.q);
  const vendor = pickString(params.vendor);
  const productType = pickString(params.productType);
  const tag = pickString(params.tag);
  const fitmentMake = pickString(params.fitmentMake);
  const fitmentYearStr = pickString(params.fitmentYear);
  const fitmentYear = fitmentYearStr ? Number(fitmentYearStr) : undefined;
  const page = Number(pickString(params.page) ?? '1');

  const [{ items, total, perPage }, makes] = await Promise.all([
    listProducts(tenant.slug, {
      q,
      vendor,
      productType,
      tag,
      fitmentMake,
      fitmentYear: Number.isFinite(fitmentYear) ? fitmentYear : undefined,
      page,
      perPage: 24,
    }),
    listVehicleMakes(tenant.slug),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <header
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}
      >
        <h1 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
          {q ? `Results for "${q}"` : 'Shop everything'}
        </h1>
        <p style={{ margin: 0, color: 'var(--color-text-muted, #6b7280)' }}>
          {total} {total === 1 ? 'product' : 'products'} from {tenant.name}
        </p>
        <FitmentFilter
          makes={makes}
          selectedMake={fitmentMake}
          selectedYear={Number.isFinite(fitmentYear) ? fitmentYear : undefined}
          formAction="/products"
        />
      </header>
      <ProductGrid products={items} />
      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          buildHref={(target) => {
            const usp = new URLSearchParams();
            for (const [key, value] of Object.entries(params)) {
              const v = pickString(value);
              if (v) usp.set(key, v);
            }
            usp.set('page', String(target));
            return `/products?${usp.toString()}`;
          }}
        />
      )}
    </main>
  );
}

function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (target: number) => string;
}) {
  const prev = page > 1 ? buildHref(page - 1) : null;
  const next = page < totalPages ? buildHref(page + 1) : null;
  return (
    <nav
      style={{
        display: 'flex',
        gap: '0.75rem',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: '3rem',
      }}
    >
      {prev ? (
        <Link href={prev} style={pageLinkStyle()}>
          ← Previous
        </Link>
      ) : (
        <span style={pageLinkStyleDisabled()}>← Previous</span>
      )}
      <span style={{ color: 'var(--color-text-muted, #6b7280)', fontSize: '0.9rem' }}>
        Page {page} of {totalPages}
      </span>
      {next ? (
        <Link href={next} style={pageLinkStyle()}>
          Next →
        </Link>
      ) : (
        <span style={pageLinkStyleDisabled()}>Next →</span>
      )}
    </nav>
  );
}

function pageLinkStyle(): React.CSSProperties {
  return {
    padding: '0.5rem 1rem',
    borderRadius: '6px',
    border: '1px solid var(--color-border-default, #d1d5db)',
    textDecoration: 'none',
    color: 'inherit',
    fontSize: '0.9rem',
  };
}

function pageLinkStyleDisabled(): React.CSSProperties {
  return {
    ...pageLinkStyle(),
    color: 'var(--color-text-muted, #9ca3af)',
    cursor: 'not-allowed',
  };
}
