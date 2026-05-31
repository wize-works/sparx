// Email section registry — the single source consulted by the composer (palette
// + form generation), the service (config validation + data resolution routing),
// and the renderer (type → React Email component). Adding a section means: write
// its schema + fields, then register it here with its tier.
//
// Structural twin of @sparx/sitebuilder-schemas' SECTION_REGISTRY, plus `tier`
// (docs/31 §4, §8). The two converge into a shared kernel later (§12).

import { z } from 'zod';
import type { SectionField } from './fields';

import { HeadingConfig, headingFields } from './sections/heading';
import { RichTextConfig, richTextFields } from './sections/rich-text';
import { ImageConfig, imageFields } from './sections/image';
import { ButtonConfig, buttonFields } from './sections/button';
import { DividerConfig, dividerFields } from './sections/divider';
import { SpacerConfig, spacerFields } from './sections/spacer';
import { FeaturedProductsConfig, featuredProductsFields } from './sections/featured-products';
import { CollectionGridConfig, collectionGridFields } from './sections/collection-grid';
import { LatestBlogPostsConfig, latestBlogPostsFields } from './sections/latest-blog-posts';
import { ActivePromotionConfig, activePromotionFields } from './sections/active-promotion';
import { AbandonedCartConfig, abandonedCartFields } from './sections/abandoned-cart';
import {
  RecommendedProductsConfig,
  recommendedProductsFields,
} from './sections/recommended-products';
import { RecentOrderConfig, recentOrderFields } from './sections/recent-order';
import { LoyaltyPointsConfig, loyaltyPointsFields } from './sections/loyalty-points';

export const EMAIL_SECTION_TYPES = [
  // static
  'heading',
  'rich-text',
  'image',
  'button',
  'divider',
  'spacer',
  // dynamic (tenant-level)
  'featured-products',
  'collection-grid',
  'latest-blog-posts',
  'active-promotion',
  // personalized (per recipient)
  'abandoned-cart',
  'recommended-products',
  'recent-order',
  'loyalty-points',
] as const;

export type EmailSectionType = (typeof EMAIL_SECTION_TYPES)[number];

export const EmailSectionTypeEnum = z.enum(EMAIL_SECTION_TYPES);

// The data-binding tier — drives palette grouping, the on-block badge, and the
// render pipeline (docs/31 §4, §7). `static` renders once; `dynamic` resolves
// tenant data once per send; `personalized` resolves per recipient at dispatch.
export type SectionTier = 'static' | 'dynamic' | 'personalized';

export interface EmailSectionDefinition {
  type: EmailSectionType;
  tier: SectionTier;
  label: string;
  description: string;
  // lucide-react icon name; the dashboard maps it to a component.
  icon: string;
  schema: z.ZodType;
  fields: SectionField[];
}

export const EMAIL_SECTION_REGISTRY: Record<EmailSectionType, EmailSectionDefinition> = {
  heading: {
    type: 'heading',
    tier: 'static',
    label: 'Heading',
    description: 'A title or section header.',
    icon: 'Heading',
    schema: HeadingConfig,
    fields: headingFields,
  },
  'rich-text': {
    type: 'rich-text',
    tier: 'static',
    label: 'Rich text',
    description: 'Formatted copy written with the editor.',
    icon: 'Type',
    schema: RichTextConfig,
    fields: richTextFields,
  },
  image: {
    type: 'image',
    tier: 'static',
    label: 'Image',
    description: 'A single image with an optional link.',
    icon: 'Image',
    schema: ImageConfig,
    fields: imageFields,
  },
  button: {
    type: 'button',
    tier: 'static',
    label: 'Button',
    description: 'A call-to-action button.',
    icon: 'MousePointerClick',
    schema: ButtonConfig,
    fields: buttonFields,
  },
  divider: {
    type: 'divider',
    tier: 'static',
    label: 'Divider',
    description: 'A horizontal rule with spacing.',
    icon: 'Minus',
    schema: DividerConfig,
    fields: dividerFields,
  },
  spacer: {
    type: 'spacer',
    tier: 'static',
    label: 'Spacer',
    description: 'Vertical breathing room.',
    icon: 'MoveVertical',
    schema: SpacerConfig,
    fields: spacerFields,
  },
  'featured-products': {
    type: 'featured-products',
    tier: 'dynamic',
    label: 'Featured products',
    description: 'A grid of products — newest, a collection, or hand-picked.',
    icon: 'ShoppingBag',
    schema: FeaturedProductsConfig,
    fields: featuredProductsFields,
  },
  'collection-grid': {
    type: 'collection-grid',
    tier: 'dynamic',
    label: 'Collection grid',
    description: 'Shop-by-collection tiles.',
    icon: 'LayoutGrid',
    schema: CollectionGridConfig,
    fields: collectionGridFields,
  },
  'latest-blog-posts': {
    type: 'latest-blog-posts',
    tier: 'dynamic',
    label: 'Latest blog posts',
    description: 'Your most recent articles.',
    icon: 'Newspaper',
    schema: LatestBlogPostsConfig,
    fields: latestBlogPostsFields,
  },
  'active-promotion': {
    type: 'active-promotion',
    tier: 'dynamic',
    label: 'Active promotion',
    description: 'Your current sale or discount banner.',
    icon: 'Tag',
    schema: ActivePromotionConfig,
    fields: activePromotionFields,
  },
  'abandoned-cart': {
    type: 'abandoned-cart',
    tier: 'personalized',
    label: 'Abandoned cart',
    description: "The recipient's open cart, with a recovery CTA.",
    icon: 'ShoppingCart',
    schema: AbandonedCartConfig,
    fields: abandonedCartFields,
  },
  'recommended-products': {
    type: 'recommended-products',
    tier: 'personalized',
    label: 'Recommended for you',
    description: "Picks from the recipient's history.",
    icon: 'Sparkles',
    schema: RecommendedProductsConfig,
    fields: recommendedProductsFields,
  },
  'recent-order': {
    type: 'recent-order',
    tier: 'personalized',
    label: 'Recent order',
    description: "The recipient's latest order summary.",
    icon: 'Package',
    schema: RecentOrderConfig,
    fields: recentOrderFields,
  },
  'loyalty-points': {
    type: 'loyalty-points',
    tier: 'personalized',
    label: 'Loyalty points',
    description: "The recipient's rewards balance.",
    icon: 'Award',
    schema: LoyaltyPointsConfig,
    fields: loyaltyPointsFields,
  },
};

export const EMAIL_SECTION_DEFINITIONS: EmailSectionDefinition[] = EMAIL_SECTION_TYPES.map(
  (t) => EMAIL_SECTION_REGISTRY[t]
);

export function isEmailSectionType(value: string): value is EmailSectionType {
  return (EMAIL_SECTION_TYPES as readonly string[]).includes(value);
}

export function getEmailSectionDefinition(type: string): EmailSectionDefinition | undefined {
  return isEmailSectionType(type) ? EMAIL_SECTION_REGISTRY[type] : undefined;
}

export function sectionTier(type: string): SectionTier | undefined {
  return getEmailSectionDefinition(type)?.tier;
}

/** Definitions for one tier, in registry order — used by the palette groups. */
export function sectionsByTier(tier: SectionTier): EmailSectionDefinition[] {
  return EMAIL_SECTION_DEFINITIONS.filter((d) => d.tier === tier);
}

/**
 * Validates + fills defaults for a section's config. Throws ZodError on bad
 * input; callers map that to their transport's validation envelope.
 */
export function parseSectionConfig(type: string, raw: unknown): Record<string, unknown> {
  const def = getEmailSectionDefinition(type);
  if (!def) {
    throw new z.ZodError([
      {
        code: 'custom',
        message: `Unknown email section type: ${type}`,
        path: ['type'],
        input: type,
      },
    ]);
  }
  return def.schema.parse(raw ?? {}) as Record<string, unknown>;
}

/** The fully-defaulted config for a freshly-added section of `type`. */
export function defaultSectionConfig(type: EmailSectionType): Record<string, unknown> {
  return EMAIL_SECTION_REGISTRY[type].schema.parse({}) as Record<string, unknown>;
}
