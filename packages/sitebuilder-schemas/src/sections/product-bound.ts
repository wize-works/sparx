// Bound product-scope sections (docs/30 §4.2, docs/handoffs/sitebuilder-phase3-spec.md §4.2).
// Each schema holds PRESENTATION config only — the data resolves from the
// assigned product at render. Day one these re-house the existing PDP components
// (ProductDetail, FitmentTable, RatingStars/ReviewForm, QuestionForm, ProductCard),
// so the seeded default product template renders identically to today's PDP.

import { z } from 'zod';
import type { SectionField } from '../fields';

// product-buy-box — gallery + title/price + variants + add-to-cart (<ProductDetail>).
export const ProductBuyBoxConfig = z.object({
  galleryLayout: z.enum(['stacked', 'thumbs-left', 'thumbs-below']).default('thumbs-below'),
  stickyBuyBox: z.boolean().default(true),
  showVendor: z.boolean().default(true),
  showSku: z.boolean().default(false),
});
export type ProductBuyBoxConfig = z.infer<typeof ProductBuyBoxConfig>;

export const productBuyBoxFields: SectionField[] = [
  {
    key: 'galleryLayout',
    label: 'Gallery layout',
    type: 'select',
    options: [
      { label: 'Thumbnails below', value: 'thumbs-below' },
      { label: 'Thumbnails left', value: 'thumbs-left' },
      { label: 'Stacked', value: 'stacked' },
    ],
  },
  { key: 'stickyBuyBox', label: 'Sticky buy box on scroll', type: 'boolean' },
  { key: 'showVendor', label: 'Show vendor / brand', type: 'boolean' },
  { key: 'showSku', label: 'Show SKU', type: 'boolean' },
];

// product-description — the long-form description block (today's "Details").
export const ProductDescriptionConfig = z.object({
  heading: z.string().max(80).default('Details'),
  hideWhenEmpty: z.boolean().default(true),
});
export type ProductDescriptionConfig = z.infer<typeof ProductDescriptionConfig>;

export const productDescriptionFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'hideWhenEmpty', label: 'Hide when the product has no description', type: 'boolean' },
];

// product-fitment — domain-aware compatibility table (<FitmentTable>).
export const ProductFitmentConfig = z.object({
  heading: z.string().max(80).default('Compatibility'),
});
export type ProductFitmentConfig = z.infer<typeof ProductFitmentConfig>;

export const productFitmentFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
];

// product-reviews — rating summary (<RatingStars>) + write-a-review form.
export const ProductReviewsConfig = z.object({
  heading: z.string().max(80).default('Reviews'),
  showForm: z.boolean().default(true),
  emptyText: z.string().max(160).default('No reviews yet — be the first.'),
});
export type ProductReviewsConfig = z.infer<typeof ProductReviewsConfig>;

export const productReviewsFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'showForm', label: 'Show the write-a-review form', type: 'boolean' },
  { key: 'emptyText', label: 'Empty-state text', type: 'text' },
];

// product-questions — Q&A list + ask-a-question form (<QuestionForm>).
export const ProductQuestionsConfig = z.object({
  heading: z.string().max(80).default('Questions & answers'),
  showForm: z.boolean().default(true),
  emptyText: z.string().max(160).default('No questions yet — ask the first one.'),
});
export type ProductQuestionsConfig = z.infer<typeof ProductQuestionsConfig>;

export const productQuestionsFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'showForm', label: 'Show the ask-a-question form', type: 'boolean' },
  { key: 'emptyText', label: 'Empty-state text', type: 'text' },
];

// product-related — "you may also like" rail of related products (<ProductCard>).
export const ProductRelatedConfig = z.object({
  heading: z.string().max(80).default('You may also like'),
  limit: z.number().int().min(2).max(12).default(4),
});
export type ProductRelatedConfig = z.infer<typeof ProductRelatedConfig>;

export const productRelatedFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'limit', label: 'How many products', type: 'number', min: 2, max: 12 },
];
