// Collection detail = its products. Hero header on top, paginated grid below.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { Pagination } from '@/components/pagination';
import { ProductGrid } from '@/components/product-grid';
import { getCollection, listCollectionProducts } from '@/lib/commerce';
import { mediaUrl } from '@/lib/media';
import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ handle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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
  const page = Math.max(1, Number(one(sp.page) ?? '1') || 1);

  const collection = await getCollection(tenant.slug, handle);
  if (!collection) notFound();
  const { items, total, perPage } = await listCollectionProducts(tenant.slug, handle, page, 24);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const { defaultCurrency: currency, defaultLocale: locale } = tenant.storefront;
  const hero = mediaUrl(collection.heroMediaId, tenant.slug);

  return (
    <div className="sf-container">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Collections', href: '/collections' },
          { label: collection.name },
        ]}
      />

      <header
        style={{
          position: 'relative',
          borderRadius: 'var(--sf-radius-lg)',
          overflow: 'hidden',
          marginBottom: '2rem',
          background: hero ? undefined : 'var(--sf-bg-subtle)',
        }}
      >
        {hero ? (
          <img
            src={hero}
            alt=""
            aria-hidden="true"
            style={{ width: '100%', height: '260px', objectFit: 'cover', display: 'block' }}
          />
        ) : null}
        <div
          style={{
            padding: hero ? '2rem' : '2.5rem 0',
            ...(hero
              ? {
                  position: 'absolute',
                  inset: 'auto 0 0 0',
                  background: 'linear-gradient(transparent, rgb(0 0 0 / 0.6))',
                  color: '#fff',
                }
              : {}),
          }}
        >
          <h1 className="sf-h1" style={hero ? { color: '#fff' } : undefined}>
            {collection.name}
          </h1>
          {collection.description ? (
            <p style={{ marginTop: '0.5rem', maxWidth: '60ch', lineHeight: 1.6 }}>
              {collection.description}
            </p>
          ) : null}
        </div>
      </header>

      <div className="sf-toolbar">
        <span className="sf-toolbar__count">
          {total} {total === 1 ? 'product' : 'products'}
        </span>
      </div>

      <ProductGrid products={items} tenantSlug={tenant.slug} currency={currency} locale={locale} />

      {totalPages > 1 ? (
        <Pagination
          basePath={`/collections/${handle}`}
          currentParams={sp}
          page={page}
          totalPages={totalPages}
        />
      ) : null}
    </div>
  );
}
