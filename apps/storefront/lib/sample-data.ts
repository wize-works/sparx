// Code-defined sample storefront data for the Site Builder preview (doc 36 §9).
//
// A merchant can't design a product / collection layout before the store has
// data — and the storefront only serves `status:'active'` items, so even a draft
// product 404s. These fixed SAMPLE_* fixtures are fed into SectionContext when a
// preview asks for sample data, so the bound sections render against believable
// data regardless of the real catalog.
//
// Gated: honored ONLY in preview (a `sparxSitePreview` token present) AND when
// `sparxSampleData=1` — the public storefront never sees it. The renderer needs
// nothing special; bound sections resolve purely from SectionContext, so this is
// just an alternate data source for the same render path.

import type {
  PublicCollection,
  PublicFitmentDomain,
  PublicProduct,
  PublicProductListItem,
  PublicQuestion,
} from '@/lib/commerce';

const SAMPLE_AT = '2026-01-02T00:00:00.000Z';

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/** True when the request is a preview AND explicitly asks for sample data. The
 *  token gate keeps this off the public storefront entirely. */
export function isSampleRequested(sp: Record<string, string | string[] | undefined>): boolean {
  return first(sp.sparxSampleData) === '1' && Boolean(first(sp.sparxSitePreview));
}

// A reusable list-card fixture (the related rail + the collection grid).
function sampleListItem(i: number): PublicProductListItem {
  const base = 2400 + i * 350;
  return {
    id: `sample-item-${i}`,
    title: `Sample Product ${i}`,
    handle: `sample-product-${i}`,
    description: 'Sample product so you can see how cards lay out before real data exists.',
    vendor: 'Sparx Sample Co.',
    productType: 'Sample',
    tags: ['sample'],
    priceMinCents: base,
    priceMaxCents: base,
    compareAtCents: i % 2 === 0 ? base + 800 : null,
    inStock: true,
    averageRating: 4 + (i % 10) / 10,
    reviewCount: 12 + i * 7,
    primaryImageId: null,
    seoTitle: null,
    seoDescription: null,
    updatedAt: SAMPLE_AT,
  };
}

export const SAMPLE_PRODUCT: PublicProduct = {
  id: 'sample-product',
  title: 'Sample Product — Pro HD Oil Filter',
  handle: 'sample-product',
  description:
    'This is sample product copy. Use it to design your product page layout — the sections, ' +
    'their order, and how everything looks — before you have real products. Every published ' +
    'product renders through this same layout.',
  vendor: 'Sparx Sample Co.',
  productType: 'Filters',
  tags: ['sample', 'featured'],
  priceMinCents: 2499,
  priceMaxCents: 3499,
  compareAtCents: 3999,
  inStock: true,
  averageRating: 4.6,
  reviewCount: 128,
  primaryImageId: null,
  seoTitle: null,
  seoDescription: null,
  updatedAt: SAMPLE_AT,
  fulfillmentType: 'physical',
  weightGrams: 450,
  dimensions: { lengthMm: 120, widthMm: 90, heightMm: 90 },
  options: [
    {
      id: 'sample-opt-grade',
      name: 'Grade',
      displayType: 'pill',
      position: 0,
      values: [
        { id: 'sample-val-std', value: 'Standard', swatchHex: null, position: 0 },
        { id: 'sample-val-hd', value: 'Heavy Duty', swatchHex: null, position: 1 },
      ],
    },
  ],
  variants: [
    {
      id: 'sample-var-std',
      sku: 'SAMPLE-STD',
      title: 'Standard',
      priceCents: 2499,
      compareAtPriceCents: 3999,
      isDefault: true,
      inventoryPolicy: 'deny',
      optionValueIds: ['sample-val-std'],
      available: 42,
      inStock: true,
    },
    {
      id: 'sample-var-hd',
      sku: 'SAMPLE-HD',
      title: 'Heavy Duty',
      priceCents: 3499,
      compareAtPriceCents: null,
      isDefault: false,
      inventoryPolicy: 'deny',
      optionValueIds: ['sample-val-hd'],
      available: 8,
      inStock: true,
    },
  ],
  images: [],
  fitments: [
    {
      id: 'sample-fit-1',
      domainSlug: 'vehicle',
      domainLabel: 'Vehicle',
      rangeUnit: 'year',
      category: 'Ford',
      item: 'F-250',
      variant: '6.7L Power Stroke',
      rangeMin: 2017,
      rangeMax: 2022,
      notes: null,
    },
    {
      id: 'sample-fit-2',
      domainSlug: 'vehicle',
      domainLabel: 'Vehicle',
      rangeUnit: 'year',
      category: 'Ram',
      item: '2500',
      variant: '6.7L Cummins',
      rangeMin: 2019,
      rangeMax: 2023,
      notes: null,
    },
  ],
};

export const SAMPLE_PRODUCT_EXTRAS: {
  related: PublicProductListItem[];
  questions: PublicQuestion[];
  fitmentDomainsBySlug: Record<string, PublicFitmentDomain>;
} = {
  related: [1, 2, 3, 4].map((i) => sampleListItem(i)),
  questions: [
    {
      id: 'sample-q-1',
      displayName: 'Jordan M.',
      body: 'Does this fit a 2020 model? Want to be sure before I order.',
      createdAt: SAMPLE_AT,
      helpfulCount: 6,
      answers: [
        {
          id: 'sample-a-1',
          body: 'Yes — it covers 2017–2022. The Heavy Duty grade is a great choice for towing.',
          isOfficial: true,
          createdAt: SAMPLE_AT,
        },
      ],
    },
    {
      id: 'sample-q-2',
      displayName: 'Sam R.',
      body: 'How often should this be replaced?',
      createdAt: SAMPLE_AT,
      helpfulCount: 2,
      answers: [],
    },
  ],
  fitmentDomainsBySlug: {
    vehicle: {
      id: 'sample-domain-vehicle',
      slug: 'vehicle',
      displayName: 'Vehicle',
      description: null,
      iconKey: null,
      labels: { l1: 'Make', l2: 'Model', l3: 'Engine', range: 'Year' },
      rangeUnit: 'year',
      isGlobal: true,
    },
  },
};

export const SAMPLE_COLLECTION: PublicCollection = {
  id: 'sample-collection',
  name: 'Sample Collection',
  handle: 'sample-collection',
  description:
    'A sample collection so you can design your collection page layout — the header and the ' +
    'product grid — before you have real collections.',
  heroMediaId: null,
  featured: true,
  seoTitle: null,
  seoDescription: null,
  ogImageId: null,
};

export const SAMPLE_COLLECTION_PRODUCTS: PublicProductListItem[] = Array.from(
  { length: 8 },
  (_, idx) => sampleListItem(idx + 1)
);
