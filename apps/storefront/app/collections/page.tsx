// Collection index — every published collection for the tenant, featured
// first. Both manual and rules-driven collections appear; the storefront only
// sees the materialized membership so the distinction is invisible to shoppers.

import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { EmptyState } from '@/components/empty-state';
import { listCollections } from '@/lib/commerce';
import { mediaUrl } from '@/lib/media';
import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Collections' };

export default async function CollectionListingPage() {
  const tenant = await resolveTenant();
  if (!tenant) notFound();

  const collections = await listCollections(tenant.slug);

  return (
    <div className="sf-container">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Collections' }]} />
      <header style={{ marginBottom: '2rem' }}>
        <h1 className="sf-h1">Collections</h1>
        <p className="sf-muted" style={{ marginTop: '0.5rem' }}>
          Curated lineups from {tenant.name}.
        </p>
      </header>

      {collections.length === 0 ? (
        <EmptyState
          icon="❖"
          title="No collections yet"
          description="Check back soon, or browse the full catalog."
          action={{ label: 'Shop all products', href: '/products' }}
        />
      ) : (
        <div className="sf-grid">
          {collections.map((c) => {
            const hero = mediaUrl(c.heroMediaId, tenant.slug);
            return (
              <Link key={c.id} href={`/collections/${c.handle}`} className="sf-card">
                <div className="sf-card__media">
                  {c.featured ? <span className="sf-badge">Featured</span> : null}
                  {hero ? (
                    <Image
                      src={hero}
                      alt={c.name}
                      fill
                      sizes="(max-width: 860px) 50vw, 33vw"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="sf-card__media sf-card__media--empty" aria-hidden="true">
                      <span style={{ fontSize: '2rem' }}>❖</span>
                    </div>
                  )}
                </div>
                <div className="sf-card__body">
                  <span className="sf-card__title">{c.name}</span>
                  {c.description ? <span className="sf-muted">{c.description}</span> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
