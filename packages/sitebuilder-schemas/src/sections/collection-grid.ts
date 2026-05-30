import { z } from 'zod';
import { Uuid } from '../common';
import type { SectionField } from '../fields';

export const CollectionGridConfig = z.object({
  heading: z.string().max(120).default('Shop by collection'),
  // featured: collections flagged featured; manual: an explicit list.
  source: z.enum(['featured', 'manual']).default('featured'),
  collectionIds: z.array(Uuid).max(12).default([]),
  columns: z.number().int().min(1).max(4).default(3),
  limit: z.number().int().min(1).max(12).default(6),
});
export type CollectionGridConfig = z.infer<typeof CollectionGridConfig>;

export const collectionGridFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  {
    key: 'source',
    label: 'Collections from',
    type: 'select',
    options: [
      { label: 'Featured collections', value: 'featured' },
      { label: 'Hand-picked', value: 'manual' },
    ],
  },
  {
    key: 'collectionIds',
    label: 'Collections',
    type: 'products',
    help: 'Used when "Hand-picked" is selected.',
  },
  { key: 'columns', label: 'Columns', type: 'range', min: 1, max: 4, step: 1 },
  { key: 'limit', label: 'Max collections', type: 'range', min: 1, max: 12, step: 1 },
];
