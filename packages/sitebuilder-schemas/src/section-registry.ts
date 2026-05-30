// Section registry — the single source consulted by the customizer (form
// generation + section library), the service (config validation), and the
// storefront (rendering). Adding a section means: write its schema + fields,
// then register it here.

import { z } from 'zod';
import type { SectionField } from './fields';
import { HeroConfig, heroFields } from './sections/hero';
import { FeaturedProductsConfig, featuredProductsFields } from './sections/featured-products';
import { CollectionGridConfig, collectionGridFields } from './sections/collection-grid';
import { RichTextConfig, richTextFields } from './sections/rich-text';
import { ImageBannerConfig, imageBannerFields } from './sections/image-banner';
import { TestimonialsConfig, testimonialsFields } from './sections/testimonials';
import { EmailSignupConfig, emailSignupFields } from './sections/email-signup';

export const SECTION_TYPES = [
  'hero',
  'featured-products',
  'collection-grid',
  'rich-text',
  'image-banner',
  'testimonials',
  'email-signup',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export const SectionTypeEnum = z.enum(SECTION_TYPES);

export interface SectionDefinition {
  type: SectionType;
  label: string;
  description: string;
  // lucide-react icon name; the dashboard maps it to a component.
  icon: string;
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
