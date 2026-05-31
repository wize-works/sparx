import { z } from 'zod';
import { EmptyBehavior } from '../common';
import type { SectionField } from '../fields';

// Personalized (per recipient): recommendations from the recipient's history,
// resolved at dispatch. Defaults to `alternate` so a recipient with no signal
// still sees store best-sellers rather than an empty block.
export const RecommendedProductsConfig = z.object({
  heading: z.string().max(120).default('Recommended for you'),
  basis: z.enum(['history', 'last-collection', 'segment-trending']).default('history'),
  columns: z.number().int().min(1).max(3).default(3),
  limit: z.number().int().min(1).max(12).default(3),
  onEmpty: EmptyBehavior.default('alternate'),
});
export type RecommendedProductsConfig = z.infer<typeof RecommendedProductsConfig>;

export const recommendedProductsFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  {
    key: 'basis',
    label: 'Recommend based on',
    type: 'select',
    options: [
      { label: 'Purchase + browse history', value: 'history' },
      { label: 'Same collection as last order', value: 'last-collection' },
      { label: "Trending in customer's segment", value: 'segment-trending' },
    ],
  },
  { key: 'columns', label: 'Columns', type: 'range', min: 1, max: 3, step: 1 },
  { key: 'limit', label: 'Max products', type: 'range', min: 1, max: 12, step: 1 },
  {
    key: 'onEmpty',
    label: 'When no recommendations',
    type: 'select',
    options: [
      { label: 'Show best-sellers', value: 'alternate' },
      { label: 'Hide this section', value: 'hide' },
    ],
  },
];
