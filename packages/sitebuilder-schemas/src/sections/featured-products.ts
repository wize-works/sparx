import { z } from 'zod';
import { Uuid, OptionalUuid } from '../common';
import type { SectionField } from '../fields';

export const FeaturedProductsConfig = z.object({
  heading: z.string().max(120).default('Featured products'),
  // collection: products from one collection; newest: latest published;
  // manual: an explicit product list.
  source: z.enum(['collection', 'newest', 'manual']).default('newest'),
  collectionId: OptionalUuid,
  productIds: z.array(Uuid).max(24).default([]),
  columns: z.number().int().min(1).max(4).default(4),
  limit: z.number().int().min(1).max(24).default(8),
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
    help: 'Used when "A collection" is selected.',
  },
  {
    key: 'productIds',
    label: 'Products',
    type: 'products',
    help: 'Used when "Hand-picked" is selected.',
  },
  { key: 'columns', label: 'Columns', type: 'range', min: 1, max: 4, step: 1 },
  { key: 'limit', label: 'Max products', type: 'range', min: 1, max: 24, step: 1 },
];
