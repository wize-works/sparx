// Section registry — the single source consulted by the editor (form generation
// + the scope-restricted section library), the service (config + scope
// validation), and the storefront (rendering). Adding a section means: write its
// schema + fields, then register it here with the scopes it's allowed in.

import { z } from 'zod';
import type { SectionField } from './fields';
import { HeroConfig, heroFields } from './sections/hero';
import { FeaturedProductsConfig, featuredProductsFields } from './sections/featured-products';
import { CollectionGridConfig, collectionGridFields } from './sections/collection-grid';
import { RichTextConfig, richTextFields } from './sections/rich-text';
import { ImageBannerConfig, imageBannerFields } from './sections/image-banner';
import { TestimonialsConfig, testimonialsFields } from './sections/testimonials';
import { EmailSignupConfig, emailSignupFields } from './sections/email-signup';
import {
  ProductBuyBoxConfig,
  productBuyBoxFields,
  ProductDescriptionConfig,
  productDescriptionFields,
  ProductFitmentConfig,
  productFitmentFields,
  ProductReviewsConfig,
  productReviewsFields,
  ProductQuestionsConfig,
  productQuestionsFields,
  ProductRelatedConfig,
  productRelatedFields,
} from './sections/product-bound';
import {
  CollectionHeaderConfig,
  collectionHeaderFields,
  CollectionProductsConfig,
  collectionProductsFields,
} from './sections/collection-bound';
import { getLayoutTarget, type TargetBinding } from './layout-targets';

export const SECTION_TYPES = [
  // Static (authored content; allowed in any scope)
  'hero',
  'featured-products',
  'collection-grid',
  'rich-text',
  'image-banner',
  'testimonials',
  'email-signup',
  // Bound — product scope (resolve from the assigned product)
  'product-buy-box',
  'product-description',
  'product-fitment',
  'product-reviews',
  'product-questions',
  'product-related',
  // Bound — collection scope (resolve from the assigned collection)
  'collection-header',
  'collection-products',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export const SectionTypeEnum = z.enum(SECTION_TYPES);

// A read-only data binding shown in the inspector for a bound section — what the
// section pulls from the assigned item (doc 30 §4.2; the editor's "Data
// bindings" panel). Display-only metadata; not validated against config.
export interface SectionBinding {
  label: string;
  path: string;
}

export interface SectionDefinition {
  type: SectionType;
  label: string;
  description: string;
  // lucide-react icon name; the dashboard maps it to a component.
  icon: string;
  // Set on bound sections — the assigned item their data resolves from. A
  // section with NO binding is static (allowed in every target); a bound section
  // is allowed only in targets that declare the same binding (docs/36 §4.1, §4.3).
  binding?: TargetBinding;
  // Read-only data bindings surfaced in the inspector (bound sections only).
  bindings?: SectionBinding[];
  schema: z.ZodType;
  fields: SectionField[];
}

export const SECTION_REGISTRY: Record<SectionType, SectionDefinition> = {
  hero: {
    type: 'hero',
    label: 'Hero',
    description: 'Full-width banner with a heading, copy, and a call to action.',
    icon: 'Megaphone',
    schema: HeroConfig,
    fields: heroFields,
  },
  'featured-products': {
    type: 'featured-products',
    label: 'Featured products',
    description: 'A grid of products from a collection, your newest, or hand-picked.',
    icon: 'ShoppingBag',
    schema: FeaturedProductsConfig,
    fields: featuredProductsFields,
  },
  'collection-grid': {
    type: 'collection-grid',
    label: 'Collection grid',
    description: 'Shop-by-collection tiles linking into your catalog.',
    icon: 'LayoutGrid',
    schema: CollectionGridConfig,
    fields: collectionGridFields,
  },
  'rich-text': {
    type: 'rich-text',
    label: 'Rich text',
    description: 'A formatted text block for storytelling or details.',
    icon: 'Type',
    schema: RichTextConfig,
    fields: richTextFields,
  },
  'image-banner': {
    type: 'image-banner',
    label: 'Image banner',
    description: 'An image with optional overlay text and a link.',
    icon: 'Image',
    schema: ImageBannerConfig,
    fields: imageBannerFields,
  },
  testimonials: {
    type: 'testimonials',
    label: 'Testimonials',
    description: 'Social proof from your customers, with optional ratings.',
    icon: 'Quote',
    schema: TestimonialsConfig,
    fields: testimonialsFields,
  },
  'email-signup': {
    type: 'email-signup',
    label: 'Email signup',
    description: 'Collect newsletter subscribers with an inline form.',
    icon: 'Mail',
    schema: EmailSignupConfig,
    fields: emailSignupFields,
  },
  'product-buy-box': {
    type: 'product-buy-box',
    label: 'Buy box',
    description: 'Gallery, title, price, variants, and add-to-cart for the product.',
    icon: 'ShoppingCart',
    binding: 'product',
    bindings: [
      { label: 'Gallery', path: 'product.images' },
      { label: 'Title', path: 'product.title' },
      { label: 'Price', path: 'product.price' },
      { label: 'Variants & options', path: 'product.variants' },
      { label: 'Availability', path: 'product.inStock' },
    ],
    schema: ProductBuyBoxConfig,
    fields: productBuyBoxFields,
  },
  'product-description': {
    type: 'product-description',
    label: 'Description',
    description: "The product's long-form description.",
    icon: 'AlignLeft',
    binding: 'product',
    bindings: [{ label: 'Description', path: 'product.description' }],
    schema: ProductDescriptionConfig,
    fields: productDescriptionFields,
  },
  'product-fitment': {
    type: 'product-fitment',
    label: 'Compatibility',
    description: 'A domain-aware fitment table (vehicle / pet / device / …).',
    icon: 'Wrench',
    binding: 'product',
    bindings: [{ label: 'Fitments', path: 'product.fitments' }],
    schema: ProductFitmentConfig,
    fields: productFitmentFields,
  },
  'product-reviews': {
    type: 'product-reviews',
    label: 'Reviews',
    description: 'Rating summary and a write-a-review form.',
    icon: 'Star',
    binding: 'product',
    bindings: [
      { label: 'Average rating', path: 'product.averageRating' },
      { label: 'Review count', path: 'product.reviewCount' },
    ],
    schema: ProductReviewsConfig,
    fields: productReviewsFields,
  },
  'product-questions': {
    type: 'product-questions',
    label: 'Questions & answers',
    description: 'Published customer questions and a form to ask a new one.',
    icon: 'MessageCircleQuestion',
    binding: 'product',
    bindings: [{ label: 'Questions', path: 'product.questions' }],
    schema: ProductQuestionsConfig,
    fields: productQuestionsFields,
  },
  'product-related': {
    type: 'product-related',
    label: 'Related products',
    description: 'A "you may also like" rail of related products.',
    icon: 'Boxes',
    binding: 'product',
    bindings: [{ label: 'Related', path: 'product.related' }],
    schema: ProductRelatedConfig,
    fields: productRelatedFields,
  },
  'collection-header': {
    type: 'collection-header',
    label: 'Collection header',
    description: 'Hero image, name, and description for the collection.',
    icon: 'PanelTop',
    binding: 'collection',
    bindings: [
      { label: 'Name', path: 'collection.name' },
      { label: 'Description', path: 'collection.description' },
      { label: 'Hero image', path: 'collection.heroMediaId' },
    ],
    schema: CollectionHeaderConfig,
    fields: collectionHeaderFields,
  },
  'collection-products': {
    type: 'collection-products',
    label: 'Product grid',
    description: 'The collection’s products with a count and pagination.',
    icon: 'Grid3x3',
    binding: 'collection',
    bindings: [
      { label: 'Products', path: 'collection.products' },
      { label: 'Total / pages', path: 'collection.total' },
    ],
    schema: CollectionProductsConfig,
    fields: collectionProductsFields,
  },
};

export const SECTION_DEFINITIONS: SectionDefinition[] = SECTION_TYPES.map(
  (t) => SECTION_REGISTRY[t]
);

export function isSectionType(value: string): value is SectionType {
  return (SECTION_TYPES as readonly string[]).includes(value);
}

export function getSectionDefinition(type: string): SectionDefinition | undefined {
  return isSectionType(type) ? SECTION_REGISTRY[type] : undefined;
}

/** Whether a section type may be added to a layout of the given target (docs/36
 *  §4.1). A static section (no binding) is allowed in every target; a bound
 *  section is allowed only in targets that declare the same binding. */
export function isSectionAllowedInTarget(type: string, targetId: string): boolean {
  const def = getSectionDefinition(type);
  if (!def) return false;
  if (!def.binding) return true;
  const target = getLayoutTarget(targetId);
  return !!target && target.binding === def.binding;
}

/** The section definitions addable within a target (the editor's section library). */
export function sectionsForTarget(targetId: string): SectionDefinition[] {
  return SECTION_DEFINITIONS.filter((d) => isSectionAllowedInTarget(d.type, targetId));
}

/**
 * Validates + fills defaults for a section's config. Throws ZodError on bad
 * input; callers map that to their transport's validation envelope.
 */
export function parseSectionConfig(type: string, raw: unknown): Record<string, unknown> {
  const def = getSectionDefinition(type);
  if (!def) {
    throw new z.ZodError([
      {
        code: 'custom',
        message: `Unknown section type: ${type}`,
        path: ['sectionType'],
        input: type,
      },
    ]);
  }
  return def.schema.parse(raw ?? {}) as Record<string, unknown>;
}

/** The fully-defaulted config for a freshly-added section of `type`. */
export function defaultSectionConfig(type: SectionType): Record<string, unknown> {
  return SECTION_REGISTRY[type].schema.parse({}) as Record<string, unknown>;
}
