// Bound collection-scope sections (docs/30 §4.2, docs/handoffs/sitebuilder-phase3-spec.md §4.2).
// Presentation config only — data resolves from the assigned collection (+ its
// paged product list) at render. Re-houses the existing PLP components
// (collection header, ProductGrid, Pagination) for day-one parity.

import { z } from 'zod';
import type { SectionField } from '../fields';

// collection-header — hero image + name + description for the collection.
export const CollectionHeaderConfig = z.object({
  showHeroImage: z.boolean().default(true),
  showDescription: z.boolean().default(true),
});
export type CollectionHeaderConfig = z.infer<typeof CollectionHeaderConfig>;

export const collectionHeaderFields: SectionField[] = [
  { key: 'showHeroImage', label: 'Show hero image', type: 'boolean' },
  { key: 'showDescription', label: 'Show description', type: 'boolean' },
];

// collection-products — count toolbar + product grid + pagination.
export const CollectionProductsConfig = z.object({
  perPage: z.number().int().min(4).max(48).default(24),
  showCount: z.boolean().default(true),
});
export type CollectionProductsConfig = z.infer<typeof CollectionProductsConfig>;

export const collectionProductsFields: SectionField[] = [
  { key: 'perPage', label: 'Products per page', type: 'number', min: 4, max: 48 },
  { key: 'showCount', label: 'Show product count', type: 'boolean' },
];
