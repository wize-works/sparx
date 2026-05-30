// Storefront home. Renders (when present) the merchant's CMS `home` page on
// top, then a composed commerce homepage: hero, featured collections, and a
// fresh-products rail. A brand-new store with no content still gets a polished
// landing page rather than an empty shell.

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageView } from '@/components/page-view';
import { ProductCard } from '@/components/product-card';
import { listCollections, listProducts } from '@/lib/commerce';
import { getPageBySlug } from '@/lib/content';
import { mediaUrl } from '@/lib/media';
import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

interface RootPageProps {
  searchParams?: Promise<{ sparxPreview?: string }>;
}

export default async function StorefrontRoot({ searchParams }: RootPageProps) {
  const tenant = await resolveTenant();
  if (!tenant) notFound();

  const previewToken = (await searchParams)?.sparxPreview;
  const [cmsHome, collections, fresh] = await Promise.all([
    getPageBySlug(tenant.slug, 'home', previewToken ? { previewToken } : {}).catch(() => null),
    listCollections(tenant.slug).catch(() => []),
    listProducts(tenant.slug, { sort: 'newest', perPage: 8 }).catch(() => ({ items: [] })),
  ]);

  const featuredCollections = collections.filter((c) => c.featured).slice(0, 3);
  const collectionShelf =
    featuredCollections.length > 0 ? featuredCollections : collections.slice(0, 3);
  const { defaultCurrency: currency, defaultLocale: locale } = tenant.storefront;

  return (
    <>
      {cmsHome ? <PageView entry={cmsHome} /> : null}

      {!cmsHome ? (
        <section className="sf-container">
          <div className="sf-hero">
            <span className="sf-eyebrow">Welcome to {tenant.name}</span>
            <h1 className="sf-hero__title">Gear built to perform, priced to move.</h1>
            <p className="sf-hero__sub">
              Browse the full catalog, find exactly what fits, and check out in seconds.
            </p>
            <div className="sf-hero__cta">
              <Link href="/products" className="sf-btn sf-btn--primary sf-btn--lg">
                Shop all products
              </Link>
              <Link href="/collections" className="sf-btn sf-btn--secondary sf-btn--lg">
                Browse collections
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {collectionShelf.length > 0 ? (
        <section className="sf-container sf-section">
          <div className="sf-section__head">
            <h2 className="sf-h2">Shop by collection</h2>
            <Link href="/collections" className="sf-section__link">
              View all →
            </Link>
          </div>
          <div className="sf-grid">
            {collectionShelf.map((c) => {
              const hero = mediaUrl(c.heroMediaId, tenant.slug);
              return (
                <Link key={c.id} href={`/collections/${c.handle}`} className="sf-card">
                  <div className="sf-card__media">
                    {hero ? (
                      <img src={hero} alt={c.name} loading="lazy" decoding="async" />
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
        </section>
      ) : null}

      {fresh.items.length > 0 ? (
        <section className="sf-container sf-section">
          <div className="sf-section__head">
            <h2 className="sf-h2">New arrivals</h2>
            <Link href="/products?sort=newest" className="sf-section__link">
              Shop all →
            </Link>
          </div>
          <div className="sf-grid">
            {fresh.items.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                tenantSlug={tenant.slug}
                currency={currency}
                locale={locale}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
