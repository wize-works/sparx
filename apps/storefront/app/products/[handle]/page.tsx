// Product detail page (PDP). Server-loads the product, then hands the
// interactive core (gallery + variants + add-to-cart) to <ProductDetail>.
// Below the fold: description, fitment (domain-aware), reviews summary, and a
// related-products rail. Emits Product + Breadcrumb JSON-LD for SEO.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { FitmentTable } from '@/components/fitment-table';
import { ProductCard } from '@/components/product-card';
import { ProductDetail } from '@/components/product-detail';
import { RatingStars } from '@/components/rating-stars';
import { ReviewForm } from '@/components/review-form';
import {
  getProduct,
  listFitmentDomains,
  listRelatedProducts,
  type PublicFitmentDomain,
} from '@/lib/commerce';
import { mediaUrl } from '@/lib/media';
import { resolveTenant } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const tenant = await resolveTenant();
  if (!tenant) return {};
  const { handle } = await params;
  const product = await getProduct(tenant.slug, handle);
  if (!product) return {};
  const image = mediaUrl(product.images[0]?.mediaAssetId ?? null, tenant.slug);
  return {
    title: product.seoTitle ?? product.title,
    description: product.seoDescription ?? product.description ?? undefined,
    openGraph: {
      title: product.seoTitle ?? product.title,
      description: product.seoDescription ?? product.description ?? undefined,
      ...(image ? { images: [{ url: image }] } : {}),
    },
  };
}

export default async function ProductDetailPage({ params }: PageProps) {
  const tenant = await resolveTenant();
  if (!tenant) notFound();
  const { handle } = await params;
  const product = await getProduct(tenant.slug, handle);
  if (!product) notFound();

  const related = await listRelatedProducts(tenant.slug, product, 4);
  const { defaultCurrency: currency, defaultLocale: locale, showStockBelow } = tenant.storefront;

  // Fitment rows carry a domain slug + label but not the per-level labels
  // (Make/Model/Engine). Fetch the domains (cached) and map by slug so the
  // table can render vertical-appropriate column headers.
  const fitmentDomains = product.fitments.length
    ? await listFitmentDomains(tenant.slug).catch<PublicFitmentDomain[]>(() => [])
    : [];
  const domainsBySlug = Object.fromEntries(fitmentDomains.map((d) => [d.slug, d]));

  const primaryImage = mediaUrl(product.images[0]?.mediaAssetId ?? null, tenant.slug);
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.description ?? undefined,
    ...(primaryImage ? { image: [primaryImage] } : {}),
    ...(product.vendor ? { brand: { '@type': 'Brand', name: product.vendor } } : {}),
    ...(product.reviewCount > 0 && product.averageRating != null
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.averageRating,
            reviewCount: product.reviewCount,
          },
        }
      : {}),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: currency,
      lowPrice: (product.priceMinCents ?? 0) / 100,
      highPrice: (product.priceMaxCents ?? product.priceMinCents ?? 0) / 100,
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };

  return (
    <div className="sf-container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />

      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Products', href: '/products' },
          { label: product.title },
        ]}
      />

      <ProductDetail
        product={product}
        tenantSlug={tenant.slug}
        currency={currency}
        locale={locale}
        showStockBelow={showStockBelow}
      />

      {/* Description */}
      {product.description ? (
        <section className="sf-section sf-container--prose" style={{ paddingInline: 0 }}>
          <h2 className="sf-h2" style={{ marginBottom: '1rem' }}>
            Details
          </h2>
          <div className="sparx-content" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
            {product.description}
          </div>
        </section>
      ) : null}

      {/* Fitment — domain-aware (vehicle / pet / device / …) */}
      {product.fitments.length > 0 ? (
        <section className="sf-section">
          <h2 className="sf-h2" style={{ marginBottom: '1rem' }}>
            Compatibility
          </h2>
          <FitmentTable fitments={product.fitments} domainsBySlug={domainsBySlug} />
        </section>
      ) : null}

      {/* Reviews */}
      <section className="sf-section">
        <h2 className="sf-h2" style={{ marginBottom: '1rem' }}>
          Reviews
        </h2>
        {product.reviewCount > 0 && product.averageRating != null ? (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}
          >
            <RatingStars rating={product.averageRating} count={product.reviewCount} />
          </div>
        ) : (
          <p className="sf-muted" style={{ marginBottom: '1.25rem' }}>
            No reviews yet — be the first.
          </p>
        )}
        <ReviewForm tenantSlug={tenant.slug} handle={product.handle} />
      </section>

      {/* Related */}
      {related.length > 0 ? (
        <section className="sf-section">
          <div className="sf-section__head">
            <h2 className="sf-h2">You may also like</h2>
          </div>
          <div className="sf-grid">
            {related.map((p) => (
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
    </div>
  );
}
