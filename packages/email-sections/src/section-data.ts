// The resolved-data contract between the resolver and the renderer (docs/31 §7).
//
// The resolver (@sparx/email-platform `resolveSectionData`) reaches into
// Commerce/CMS/CRM and produces one of these per section instance; the renderer
// (@sparx/email `renderSections`) is pure `(config, data) → React Email` and
// never fetches. The resolver also applies each section's `onEmpty` policy, so
// the renderer simply omits a section whose data is empty/null.
//
// Types only — keeps this package zod-free of React and importable by both
// sides. Money/dates arrive pre-formatted as display strings (the resolver owns
// locale/currency); the renderer never formats.

export interface ProductCardData {
  title: string;
  priceLabel: string;
  url: string;
  imageUrl?: string;
}

export interface CartLineData {
  title: string;
  quantity: number;
  priceLabel?: string;
  imageUrl?: string;
}

export interface BlogPostData {
  title: string;
  url: string;
  excerpt?: string;
  imageUrl?: string;
  dateLabel?: string;
}

export interface CollectionTileData {
  title: string;
  url: string;
  imageUrl?: string;
}

export interface PromotionData {
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export interface OrderSummaryData {
  numberLabel: string;
  statusLabel?: string;
  dateLabel?: string;
  totalLabel?: string;
  url?: string;
  items?: CartLineData[];
}

export interface LoyaltyData {
  pointsLabel: string;
  tierName?: string;
  ctaHref?: string;
}

// Discriminated by `kind` (not section type) so several section types can share
// a data shape — featured-products and recommended-products both render
// `products`; abandoned-cart renders `cart`. A renderer reads the kind it
// expects and omits itself on a mismatch / empty payload.
export type SectionData =
  | { kind: 'none' }
  | { kind: 'rich-text'; html: string }
  | { kind: 'image'; src?: string }
  | { kind: 'products'; products: ProductCardData[]; isFallback?: boolean }
  | { kind: 'collections'; collections: CollectionTileData[] }
  | { kind: 'blog'; posts: BlogPostData[] }
  | { kind: 'promotion'; promotion: PromotionData | null }
  | { kind: 'cart'; lines: CartLineData[]; recoverUrl?: string }
  | { kind: 'order'; order: OrderSummaryData | null }
  | { kind: 'loyalty'; loyalty: LoyaltyData | null };

/** Resolved data keyed by section instance id. */
export type SectionDataMap = Record<string, SectionData>;

/** The data `kind` a given section type renders (drives resolver routing). */
export const SECTION_DATA_KIND: Record<string, SectionData['kind']> = {
  heading: 'none',
  'rich-text': 'rich-text',
  image: 'image',
  button: 'none',
  divider: 'none',
  spacer: 'none',
  'featured-products': 'products',
  'collection-grid': 'collections',
  'latest-blog-posts': 'blog',
  'active-promotion': 'promotion',
  'abandoned-cart': 'cart',
  'recommended-products': 'products',
  'recent-order': 'order',
  'loyalty-points': 'loyalty',
};
