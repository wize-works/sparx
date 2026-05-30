// Collection detail = its products. Hero block on top, paginated grid
// below. Reuses the shared ProductGrid component.

import { notFound } from 'next/navigation';
import Link from 'next/link';

import { ProductGrid } from '@/components/product-grid';
import { getCollection, listCollectionProducts } from '@/lib/commerce';
import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ handle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function generateMetadata({ params }: PageProps) {
  const tenant = await resolveTenant();
  if (!tenant) return {};
  const { handle } = await params;
  const collection = await getCollection(tenant.slug, handle);
  if (!collection) return {};
  return {
    title: collection.seoTitle ?? collection.name,
    description: collection.seoDescription ?? collection.description ?? undefined,
  };
}

export default async function CollectionDetailPage({ params, searchParams }: PageProps) {
  const tenant = await resolveTenant();
  if (!tenant) notFound();
  const { handle } = await params;
  const sp = (await searchParams) ?? {};
  const page = Number(pickString(sp.page) ?? '1');

  const collection = await getCollection(tenant.slug, handle);
  if (!collection) notFound();
  const { items, total, perPage } = await listCollectionProducts(tenant.slug, handle, page, 24);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <nav style={{ fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        <Link
          href="/collections"
          style={{ color: 'var(--color-text-muted, #6b7280)', textDecoration: 'none' }}
        >
          ← All collections
        </Link>
      </nav>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
          {collection.name}
        </h1>
        {collection.description && (
          <p
            style={{
              margin: '0.5rem 0 0',
              color: 'var(--color-text-secondary, #374151)',
              lineHeight: 1.6,
            }}
          >
            {collection.description}
          </p>
        )}
        <p
          style={{
            margin: '0.75rem 0 0',
            fontSize: '0.85rem',
            color: 'var(--color-text-muted, #6b7280)',
          }}
        >
          {total} {total === 1 ? 'product' : 'products'}
        </p>
      </header>
      <ProductGrid products={items} />
      {totalPages > 1 && (
        <nav
          style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: '3rem',
          }}
        >
          {page > 1 ? (
            <Link
              href={`/collections/${handle}?page=${page - 1}`}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: '1px solid var(--color-border-default, #d1d5db)',
                textDecoration: 'none',
                color: 'inherit',
                fontSize: '0.9rem',
              }}
            >
              ← Previous
            </Link>
          ) : null}
          <span style={{ color: 'var(--color-text-muted, #6b7280)', fontSize: '0.9rem' }}>
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/collections/${handle}?page=${page + 1}`}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: '1px solid var(--color-border-default, #d1d5db)',
                textDecoration: 'none',
                color: 'inherit',
                fontSize: '0.9rem',
              }}
            >
              Next →
            </Link>
          ) : null}
        </nav>
      )}
    </main>
  );
}
