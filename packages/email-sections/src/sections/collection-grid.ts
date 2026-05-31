import { z } from 'zod';
import { EmptyBehavior, Uuid } from '../common';
import type { SectionField } from '../fields';

// Dynamic (tenant-level): shop-by-collection tiles linking into the catalog.
export const CollectionGridConfig = z.object({
  heading: z.string().max(120).default('Shop by collection'),
  collectionIds: z.array(Uuid).max(6).default([]),
  columns: z.number().int().min(1).max(3).default(3),
  onEmpty: EmptyBehavior.default('hide'),
});
export type CollectionGridConfig = z.infer<typeof CollectionGridConfig>;

export const collectionGridFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'collectionIds', label: 'Collections', type: 'collection', help: 'Pick up to six.' },
  { key: 'columns', label: 'Columns', type: 'range', min: 1, max: 3, step: 1 },
];
