import { z } from 'zod';
import { EmptyBehavior, OptionalUuid, Uuid } from '../common';
import type { SectionField } from '../fields';

// Dynamic (tenant-level): resolved once per send. Same source model as the Site
// Builder's featured-products, capped for email layout (max 3 columns).
export const FeaturedProductsConfig = z.object({
  heading: z.string().max(120).default('Featured products'),
  source: z.enum(['newest', 'collection', 'manual']).default('newest'),
  collectionId: OptionalUuid,
  productIds: z.array(Uuid).max(12).default([]),
  columns: z.number().int().min(1).max(3).default(3),
  limit: z.number().int().min(1).max(12).default(3),
  onEmpty: EmptyBehavior.default('hide'),
});
export type FeaturedProductsConfig = z.infer<typeof FeaturedProductsConfig>;

export const featuredProductsFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  {
    key: 'source',
    label: 'Products from',
    type: 'select',
    options: [
      { label: 'Newest', value: 'newest' },
      { label: 'A collection', value: 'collection' },
      { label: 'Hand-picked', value: 'manual' },
    ],
  },
  {
    key: 'collectionId',
    label: 'Collection',
    type: 'collection',
    showWhen: { key: 'source', equals: 'collection' },
  },
  {
    key: 'productIds',
    label: 'Products',
    type: 'products',
    showWhen: { key: 'source', equals: 'manual' },
  },
  { key: 'columns', label: 'Columns', type: 'range', min: 1, max: 3, step: 1 },
  { key: 'limit', label: 'Max products', type: 'range', min: 1, max: 12, step: 1 },
];
