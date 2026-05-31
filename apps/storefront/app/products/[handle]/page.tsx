// Product detail page (PDP). Server-loads the product, resolves the merchant's
// `product`-scope layout (or the seeded default), and renders it through the
// shared SectionRenderer bound to this product. The interactive core, fitment,
// reviews, Q&A and related rail are all bound sections (docs/30 §4). Metadata,
// JSON-LD and breadcrumbs stay as page chrome around the composed template.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { SectionRenderer } from '@/components/section-renderer';
import {
  getProduct,
  listFitmentDomains,
  listProductQuestions,
  listRelatedProducts,
  type PublicFitmentDomain,
} from '@/lib/commerce';
import { mediaUrl } from '@/lib/media';
import { getPublishedSite, resolveTemplateSections } from '@/lib/site';
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

export default async function ProductDetailPage({ params, searchParams }: PageProps) {
  const tenant = await resolveTenant();
  if (!tenant) notFound();
  const { handle } = await params;
  const sp = (await searchParams) ?? {};
  const product = await getProduct(tenant.slug, handle);
  if (!product) notFound();

  // The product-scope layout: the merchant's published one, or the seeded
  // default (parity). A site-preview token resolves the draft instead.
  const snapshot = await getPublishedSite(tenant.slug, one(sp.sparxSitePreview));
  const sections = resolveTemplateSections(snapshot, 'product');

  // Fetch only the supplementary data the resolved layout renders. The related
  // rail's count comes from its section config (default 4 — today's behavior).
  const relatedSection = sections.find((s) => s.sectionType === 'product-related');
  const relatedLimit =
    typeof relatedSection?.config.limit === 'number' ? relatedSection.config.limit : 4;
  const needsQuestions = sections.some((s) => s.sectionType === 'product-questions');
  const needsFitment =
    product.fitments.length > 0 && sections.some((s) => s.sectionType === 'product-fitment');

  const [related, questions] = await Promise.all([
    relatedSection ? listRelatedProducts(tenant.slug, product, relatedLimit) : Promise.resolve([]),
    needsQuestions ? listProductQuestions(tenant.slug, product.handle) : Promise.resolve([]),
  ]);

  // Fitment rows carry a domain slug + label but not the per-level labels
  // (Make/Model/Engine). Fetch the domains (cached) and map by slug so the
  // table can render vertical-appropriate column headers.
  const fitmentDomains = needsFitment
    ? await listFitmentDomains(tenant.slug).catch<PublicFitmentDomain[]>(() => [])
    : [];
  const fitmentDomainsBySlug = Object.fromEntries(fitmentDomains.map((d) => [d.slug, d]));

  const { defaultCurrency: currency, defaultLocale: locale, showStockBelow } = tenant.storefront;

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

      <SectionRenderer
        sections={sections}
        ctx={{
          tenantSlug: tenant.slug,
          currency,
          locale,
          showStockBelow,
          product,
          productExtras: { related, questions, fitmentDomainsBySlug },
        }}
      />
    </div>
  );
}
