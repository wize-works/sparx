// Collection detail = its products. Resolves the merchant's `collection`-scope
// layout (or the seeded default) and renders it through the shared
// SectionRenderer bound to this collection: a header section + a product-grid
// section (count + grid + pagination). Metadata + breadcrumbs are page chrome.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { SectionRenderer } from '@/components/section-renderer';
import { getCollection, listCollectionProducts } from '@/lib/commerce';
import {
  isSampleRequested,
  SAMPLE_COLLECTION,
  SAMPLE_COLLECTION_PRODUCTS,
} from '@/lib/sample-data';
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

  // Sample-data preview (doc 36 §9): token-gated `sparxSampleData=1` renders the
  // collection layout against fixed SAMPLE_* fixtures so it can be designed
  // before any real collection exists. The layout still resolves from the
  // (draft) snapshot — only the bound data is swapped.
  const sample = isSampleRequested(sp);
  const collection = sample ? SAMPLE_COLLECTION : await getCollection(tenant.slug, handle);
  if (!collection) notFound();

  // The commerce:collection layout: the merchant's published one, or the seeded
  // default (parity). A site-preview token resolves the draft instead.
  const snapshot = await getPublishedSite(tenant.slug, one(sp.sparxSitePreview));
  const sections = resolveTemplateSections(snapshot, 'commerce:collection');

  // Page size comes from the product-grid section's config (default 24 = today).
  const gridSection = sections.find((s) => s.sectionType === 'collection-products');
  const requestedPerPage =
    typeof gridSection?.config.perPage === 'number' ? gridSection.config.perPage : 24;

  const { items, total, perPage } = sample
    ? {
        items: SAMPLE_COLLECTION_PRODUCTS.slice(0, requestedPerPage),
        total: SAMPLE_COLLECTION_PRODUCTS.length,
        perPage: requestedPerPage,
      }
    : await listCollectionProducts(tenant.slug, handle, page, requestedPerPage);
  const { defaultCurrency: currency, defaultLocale: locale } = tenant.storefront;

  return (
    <div className="sf-container">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Collections', href: '/collections' },
          { label: collection.name },
        ]}
      />

      <SectionRenderer
        sections={sections}
        ctx={{
          tenantSlug: tenant.slug,
          currency,
          locale,
          collection,
          collectionExtras: { items, total, page, perPage, currentParams: sp },
        }}
      />
    </div>
  );
}
