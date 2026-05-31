// Renders an ordered, visible-filtered Site Builder section list by switching
// each section's `sectionType` against a component map. Unknown types are
// skipped gracefully (a snapshot may carry a section type this storefront
// version doesn't know how to render yet). Each section is themed purely via
// the `--sf-*` tokens injected in the layout — no raw Tailwind (brand rule).

import type { SectionSnapshot } from '@/lib/site';
import type {
  HeroConfig,
  FeaturedProductsConfig,
  CollectionGridConfig,
  RichTextConfig,
  ImageBannerConfig,
  TestimonialsConfig,
  EmailSignupConfig,
} from '@sparx/sitebuilder-schemas';

import { HeroSection } from './sections/hero';
import { FeaturedProductsSection } from './sections/featured-products';
import { CollectionGridSection } from './sections/collection-grid';
import { RichTextSection } from './sections/rich-text';
import { ImageBannerSection } from './sections/image-banner';
import { TestimonialsSection } from './sections/testimonials';
import { EmailSignupSection } from './sections/email-signup';

/** Everything a section needs from the tenant beyond its own config. */
export interface SectionContext {
  tenantSlug: string;
  currency: string;
  locale: string;
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
