// Code-defined seeded default layouts (docs/handoffs/sitebuilder-phase3-spec.md §5).
//
// The day-one product/collection layout is a constant composition here, NOT
// seeded DB rows — honoring the platform's no-rows-until-used rule and giving
// exact parity with no per-tenant data migration. The storefront resolver (3.2)
// falls back to these when a tenant has published no template for the scope; the
// editor (3.3) materializes them into real SiteSection rows on first edit
// ("duplicate to edit"). Each entry mirrors today's hardcoded PDP/PLP order so
// the seeded default renders identically to the current storefront.

import { type SectionType, defaultSectionConfig } from './section-registry';

export interface DefaultTemplateSection {
  sectionType: SectionType;
  config: Record<string, unknown>;
}

function section(type: SectionType): DefaultTemplateSection {
  return { sectionType: type, config: defaultSectionConfig(type) };
}

// Product PDP order (apps/storefront/app/products/[handle]/page.tsx):
// buy box → description → compatibility → reviews → Q&A → related.
const PRODUCT_DEFAULT: DefaultTemplateSection[] = [
  section('product-buy-box'),
  section('product-description'),
  section('product-fitment'),
  section('product-reviews'),
  section('product-questions'),
  section('product-related'),
];

// Collection PLP order (apps/storefront/app/collections/[handle]/page.tsx):
// header → product grid.
const COLLECTION_DEFAULT: DefaultTemplateSection[] = [
  section('collection-header'),
  section('collection-products'),
];

export const DEFAULT_TEMPLATES: Record<'product' | 'collection', DefaultTemplateSection[]> = {
  product: PRODUCT_DEFAULT,
  collection: COLLECTION_DEFAULT,
};
