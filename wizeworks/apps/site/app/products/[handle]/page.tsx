// Product detail page (PDP). Server-loads the product, resolves the merchant's
// `product`-scope layout (or the seeded default), and renders it through the
// shared SectionRenderer bound to this product. The interactive core, fitment,
// reviews, Q&A and related rail are all bound sections (docs/30 §4). Metadata,
// JSON-LD and breadcrumbs stay as page chrome around the composed template.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumbs } from '@/components/breadcrumbs';
import { SectionRenderer } from '@/components/section-renderer';
import { getPublishedSilicaCollection, treeHasHostNode } from '@/lib/silica';
import { buildSilicaHost, productToSilicaRecord, silicaSiteIdentity } from '@/lib/silica-data';
import { SilicaBody, SilicaFunctionalBody } from '@/components/silica-chrome';
import { SiteHostRenderer } from '@/components/silica-host-cores';
import {
  getProduct,
  listFitmentDomains,
  listProductQuestions,
  listProductReviews,
  listRelatedProducts,
  type PublicFitmentDomain,
  type PublicProductListItem,
  type PublicQuestion,
  type PublicReviewList,
} from '@/lib/commerce';
import { mediaUrl } from '@/lib/media';
import { ogImageUrl } from '@/lib/og';
import { applyRedirect } from '@/lib/redirects';
import { isSampleRequested, SAMPLE_PRODUCT, SAMPLE_PRODUCT_EXTRAS } from '@/lib/sample-data';
import { getPublishedSite, resolveTemplateSections } from '@/lib/site';
import { resolveActivePropertySlug, resolveSite } from '@/lib/site-context';

// NO `force-dynamic` (docs/127 §6). It was doing two things and only one was wanted:
// forcing dynamic rendering, and forcing `no-store` on every fetch beneath it — which
// overrode the revalidate window + purge tags each read in lib/* already declares. This
// route still renders per-request either way, because `resolveSite()` reads the Host
// header; what changed is that its data is now cached and purged on publish.

interface PageProps {
  params: Promise<{ handle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const site = await resolveSite();
  if (!site) return {};
  const { handle } = await params;
  const product = await getProduct(site.slug, handle);
  if (!product) return {};
  // The product photo is the best OG image; fall back to a tenant-branded
  // generated card (docs/50 §5) only when the product has no image.
  const image =
    mediaUrl(product.images[0]?.mediaAssetId ?? null, site.slug) ??
    ogImageUrl({
      title: product.seoTitle ?? product.title,
      eyebrow: 'Product',
      brand: site.name,
      accent: site.theme?.colorPrimary,
      platformBrand: site.platformBrand,
    });
  // hreflang, so a search engine indexes the Spanish page as the Spanish page
  // rather than as a duplicate of the English one. Only emitted for a shop that
  // has actually written another language; `x-default` points at the shop's own
  // words, which is what a reader with no matching language should land on.
  const languages: Record<string, string> = {};
  for (const tag of site.languages) languages[tag] = `/products/${handle}?lang=${tag}`;
  const alternates =
    site.languages.length > 0
      ? {
          canonical: `/products/${handle}`,
          languages: { ...languages, 'x-default': `/products/${handle}` },
        }
      : undefined;

  return {
    title: product.seoTitle ?? product.title,
    description: product.seoDescription ?? product.description ?? undefined,
    ...(alternates ? { alternates } : {}),
    openGraph: {
      title: product.seoTitle ?? product.title,
      description: product.seoDescription ?? product.description ?? undefined,
      images: [{ url: image }],
    },
  };
}

export default async function ProductDetailPage({ params, searchParams }: PageProps) {
  const site = await resolveSite();
  if (!site) notFound();
  const { handle } = await params;
  const sp = (await searchParams) ?? {};

  // Sample-data preview (doc 36 §9): a token-gated `sparxSampleData=1` makes the
  // page render against fixed SAMPLE_* fixtures so a merchant can design the
  // product layout before any real product exists. The layout still resolves
  // from the (draft) snapshot — only the bound data is swapped.
  const sample = isSampleRequested(sp);
  // A `?sparxPreview=<token>` link (minted from the dashboard) authorizes the
  // read to return a DRAFT product so an editor can preview before publishing.
  const previewToken = one(sp.sparxPreview);
  const product = sample ? SAMPLE_PRODUCT : await getProduct(site.slug, handle, previewToken);
  if (!product) {
    if (!sample) await applyRedirect(site.slug, `/products/${handle}`);
    notFound();
  }

  // The silica engine's published `commerce.product` collection template wins over
  // every path below (docs/118 Stage 6): it renders the PDP through the shared
  // silica walker — the interactive buy box included — with THIS product injected as
  // the `product` object scope (a collection-of-one). Null when no silica product
  // template is published, so the storefront falls through to the sparx builder
  // collection / legacy section paths unchanged. Sample-data previews keep the
  // legacy path (they design against fixtures before a real product exists).
  if (!sample) {
    const silicaTemplate = await getPublishedSilicaCollection(
      site.slug,
      'commerce.product',
      product.id,
      // A site-preview token resolves the DRAFT template, so an author restyling the
      // product page can see it before it goes live — the same rule the home and page
      // routes follow. The legacy `getPublishedSite` read below already honoured this.
      // `recordSubtype` is the product's typed product-type key (docs/143 Option B): the
      // resolver picks this product's TYPE-specific page (e.g. the Apparel product page)
      // when the tenant authored one, else the default product page.
      {
        ...(one(sp.sparxSitePreview) ? { previewToken: one(sp.sparxSitePreview) } : {}),
        ...(product.productTypeKey ? { recordSubtype: product.productTypeKey } : {}),
      }
    );
    if (silicaTemplate) {
      // No `searchParams`: a product detail page is one record, so nothing paginates.
      const { resolver } = await buildSilicaHost(site.slug, silicaTemplate.root, {
        record: {
          key: 'product',
          // The commerce block travels with the record because the made-to-order
          // sentences need it: the money's currency and locale, and whether this
          // website takes any money at all (issues 184 + 185).
          value: productToSilicaRecord(product, site.slug, site.commerce),
        },
        currency: site.commerce.defaultCurrency,
        locale: site.commerce.defaultLocale,
        // A PDP binds `site.*` too — "questions? call us" beside an add-to-cart is
        // an ordinary thing for a product template to author.
        site: silicaSiteIdentity(site),
      });
      // Bare, like the catch-all route — the root layout's silica chrome frames it
      // at the Outlet; the template owns its own section widths.
      //
      // A template carrying a host core takes the REACT walk, exactly as the home and
      // catch-all routes do. `toHtml` lowers a host node to an empty
      // `<div data-sui-host>` and mounts nothing, so the string path renders a video, a
      // map, a brand mark or a pager as a blank gap — silently, with the block still
      // present and selectable in the builder. This route was the last one still taking
      // the string path unconditionally, which mattered little while nobody could open
      // the product page; now that it has an address and appears in the page switcher,
      // it is an ordinary page an author will drop ordinary blocks onto.
      if (treeHasHostNode(silicaTemplate.root)) {
        return (
          <SilicaFunctionalBody
            root={silicaTemplate.root}
            symbols={silicaTemplate.symbols}
            host={resolver}
            // No `searchParams` and no `paging` for the same reason the resolver has
            // none: one record, nothing to page. `recordHandle`/`recordId` are what a
            // per-record core would resolve against.
            renderHost={SiteHostRenderer({ site, recordHandle: handle, recordId: product.id })}
          />
        );
      }
      return (
        <SilicaBody root={silicaTemplate.root} symbols={silicaTemplate.symbols} host={resolver} />
      );
    }
  }

  // The sparx-builder per-record tier that used to sit here is GONE (docs/127 §6): it
  // lived inside the same `if (!sample)` guard as the silica branch above, and within
  // that guard `getPublishedSilicaCollection` cannot return null — api-rest 404s when
  // no template is published, and the client answers that 404 with the code-authored
  // `commerce.product` record template, which always exists (`RECORD_TEMPLATES`).
  //
  // The LEGACY SECTION path below is a different matter and stays: `sample` skips the
  // silica branch entirely, so a merchant designing a product page against fixtures —
  // before any real product exists — still lands here. Deleting it would take that
  // feature with it.

  // The commerce:product layout: the merchant's published one, or the seeded
  // default (parity). A site-preview token resolves the draft instead. In preview
  // only, `sparxLayoutKey` forces a specific alternate layout onto the canvas
  // (gated to the preview token — a public visitor can't pin a layout via query).
  const snapshot = await getPublishedSite(
    site.slug,
    one(sp.sparxSitePreview),
    (await resolveActivePropertySlug()) ?? undefined
  );
  const forcedKey = one(sp.sparxSitePreview) ? one(sp.sparxLayoutKey) : undefined;
  const sections = resolveTemplateSections(snapshot, 'commerce:product', product.id, forcedKey);

  // Fetch only the supplementary data the resolved layout renders. The related
  // rail's count comes from its section config (default 4 — today's behavior).
  const relatedSection = sections.find((s) => s.sectionType === 'product-related');
  const relatedLimit =
    typeof relatedSection?.config.limit === 'number' ? relatedSection.config.limit : 4;
  const needsQuestions = sections.some((s) => s.sectionType === 'product-questions');
  const needsReviews = sections.some((s) => s.sectionType === 'product-reviews');
  const needsFitment =
    product.fitments.length > 0 && sections.some((s) => s.sectionType === 'product-fitment');

  const emptyReviews: PublicReviewList = { summary: { averageRating: 0, total: 0 }, items: [] };

  let related: PublicProductListItem[];
  let questions: PublicQuestion[];
  let reviews: PublicReviewList;
  let fitmentDomainsBySlug: Record<string, PublicFitmentDomain>;
  if (sample) {
    // Fixtures only — no fetch. Still honor which sections the layout includes.
    related = relatedSection ? SAMPLE_PRODUCT_EXTRAS.related.slice(0, relatedLimit) : [];
    questions = needsQuestions ? SAMPLE_PRODUCT_EXTRAS.questions : [];
    reviews = needsReviews ? SAMPLE_PRODUCT_EXTRAS.reviews : emptyReviews;
    fitmentDomainsBySlug = needsFitment ? SAMPLE_PRODUCT_EXTRAS.fitmentDomainsBySlug : {};
  } else {
    const [r, q, rev] = await Promise.all([
      relatedSection ? listRelatedProducts(site.slug, product, relatedLimit) : Promise.resolve([]),
      needsQuestions ? listProductQuestions(site.slug, product.handle) : Promise.resolve([]),
      needsReviews ? listProductReviews(site.slug, product.handle) : Promise.resolve(emptyReviews),
    ]);
    related = r;
    questions = q;
    reviews = rev;
    // Fitment rows carry a domain slug + label but not the per-level labels
    // (Make/Model/Engine). Fetch the domains (cached) and map by slug so the
    // table can render vertical-appropriate column headers.
    const fitmentDomains = needsFitment
      ? await listFitmentDomains(site.slug).catch<PublicFitmentDomain[]>(() => [])
      : [];
    fitmentDomainsBySlug = Object.fromEntries(fitmentDomains.map((d) => [d.slug, d]));
  }

  const { defaultCurrency: currency, defaultLocale: locale, showStockBelow } = site.commerce;

  const primaryImage = mediaUrl(product.images[0]?.mediaAssetId ?? null, site.slug);
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
    <div className="mx-auto w-full max-w-6xl px-6">
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
          tenantSlug: site.slug,
          currency,
          locale,
          showStockBelow,
          product,
          productExtras: { related, questions, reviews, fitmentDomainsBySlug },
        }}
        definitions={snapshot?.definitions ?? []}
      />
    </div>
  );
}
