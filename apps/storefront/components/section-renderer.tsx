// Renders an ordered, visible-filtered Site Builder section list by switching
// each section's `sectionType` against a component map. Unknown types are
// skipped gracefully (a snapshot may carry a section type this storefront
// version doesn't know how to render yet). Each section is themed purely via
// the `--sf-*` tokens injected in the layout — no raw Tailwind (brand rule).
//
// Phase 3: bound sections (product/collection scope) resolve from the assigned
// item supplied on the context (docs/handoffs/sitebuilder-phase3-spec.md §6).
// Static sections ignore the binding; bound sections render nothing when their
// binding is absent.

import type { SectionSnapshot } from '@/lib/site';
import type {
  HeroConfig,
  FeaturedProductsConfig,
  CollectionGridConfig,
  RichTextConfig,
  ImageBannerConfig,
  TestimonialsConfig,
  EmailSignupConfig,
  ProductBuyBoxConfig,
  ProductDescriptionConfig,
  ProductFitmentConfig,
  ProductReviewsConfig,
  ProductQuestionsConfig,
  ProductRelatedConfig,
  CollectionHeaderConfig,
  CollectionProductsConfig,
} from '@sparx/sitebuilder-schemas';

import type {
  PublicProduct,
  PublicProductListItem,
  PublicQuestion,
  PublicCollection,
  PublicFitmentDomain,
} from '@/lib/commerce';

import { HeroSection } from './sections/hero';
import { FeaturedProductsSection } from './sections/featured-products';
import { CollectionGridSection } from './sections/collection-grid';
import { RichTextSection } from './sections/rich-text';
import { ImageBannerSection } from './sections/image-banner';
import { TestimonialsSection } from './sections/testimonials';
import { EmailSignupSection } from './sections/email-signup';
import { ProductBuyBoxSection } from './sections/product-buy-box';
import { ProductDescriptionSection } from './sections/product-description';
import { ProductFitmentSection } from './sections/product-fitment';
import { ProductReviewsSection } from './sections/product-reviews';
import { ProductQuestionsSection } from './sections/product-questions';
import { ProductRelatedSection } from './sections/product-related';
import { CollectionHeaderSection } from './sections/collection-header';
import { CollectionProductsSection } from './sections/collection-products';

/** Everything a section needs from the tenant beyond its own config. */
export interface SectionContext {
  tenantSlug: string;
  currency: string;
  locale: string;
  // Tenant storefront display setting (PDP buy box "only N left" threshold).
  showStockBelow?: number;
  // Product binding — present only when rendering a `product`-scope template.
  product?: PublicProduct;
  productExtras?: {
    related: PublicProductListItem[];
    questions: PublicQuestion[];
    fitmentDomainsBySlug: Record<string, PublicFitmentDomain>;
  };
  // Collection binding — present only when rendering a `collection`-scope template.
  collection?: PublicCollection;
  collectionExtras?: {
    items: PublicProductListItem[];
    total: number;
    page: number;
    perPage: number;
    currentParams: Record<string, string | string[] | undefined>;
  };
}

// Published configs are validated + defaulted at publish time (the section
// service parses against the registry schema before snapshotting), so a cast
// here is safe — we never receive a partial config from the public endpoint.
function renderSection(section: SectionSnapshot, ctx: SectionContext): React.ReactNode {
  const c = section.config;
  switch (section.sectionType) {
    case 'hero':
      return <HeroSection config={c as unknown as HeroConfig} ctx={ctx} />;
    case 'featured-products':
      return <FeaturedProductsSection config={c as unknown as FeaturedProductsConfig} ctx={ctx} />;
    case 'collection-grid':
      return <CollectionGridSection config={c as unknown as CollectionGridConfig} ctx={ctx} />;
    case 'rich-text':
      return <RichTextSection config={c as unknown as RichTextConfig} />;
    case 'image-banner':
      return <ImageBannerSection config={c as unknown as ImageBannerConfig} ctx={ctx} />;
    case 'testimonials':
      return <TestimonialsSection config={c as unknown as TestimonialsConfig} ctx={ctx} />;
    case 'email-signup':
      return <EmailSignupSection config={c as unknown as EmailSignupConfig} />;
    case 'product-buy-box':
      return <ProductBuyBoxSection config={c as unknown as ProductBuyBoxConfig} ctx={ctx} />;
    case 'product-description':
      return (
        <ProductDescriptionSection config={c as unknown as ProductDescriptionConfig} ctx={ctx} />
      );
    case 'product-fitment':
      return <ProductFitmentSection config={c as unknown as ProductFitmentConfig} ctx={ctx} />;
    case 'product-reviews':
      return <ProductReviewsSection config={c as unknown as ProductReviewsConfig} ctx={ctx} />;
    case 'product-questions':
      return <ProductQuestionsSection config={c as unknown as ProductQuestionsConfig} ctx={ctx} />;
    case 'product-related':
      return <ProductRelatedSection config={c as unknown as ProductRelatedConfig} ctx={ctx} />;
    case 'collection-header':
      return <CollectionHeaderSection config={c as unknown as CollectionHeaderConfig} ctx={ctx} />;
    case 'collection-products':
      return (
        <CollectionProductsSection config={c as unknown as CollectionProductsConfig} ctx={ctx} />
      );
    default:
      // Unknown section type — skip rather than crash the page.
      return null;
  }
}

export function SectionRenderer({
  sections,
  ctx,
}: {
  sections: SectionSnapshot[];
  ctx: SectionContext;
}) {
  return (
    <>
      {sections.map((section) => (
        // data-section-* lets the Site Builder preview bridge resolve a click to
        // a section without each section having to become a client component.
        <div key={section.id} data-section-id={section.id} data-section-type={section.sectionType}>
          {renderSection(section, ctx)}
        </div>
      ))}
    </>
  );
}
