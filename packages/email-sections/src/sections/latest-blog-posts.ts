import { z } from 'zod';
import { EmptyBehavior } from '../common';
import type { SectionField } from '../fields';

// Dynamic (tenant-level): the most recent CMS `post`-typed entries.
export const LatestBlogPostsConfig = z.object({
  heading: z.string().max(120).default('From the blog'),
  limit: z.number().int().min(1).max(6).default(3),
  layout: z.enum(['list', 'grid']).default('list'),
  showExcerpt: z.boolean().default(true),
  onEmpty: EmptyBehavior.default('hide'),
});
export type LatestBlogPostsConfig = z.infer<typeof LatestBlogPostsConfig>;

export const latestBlogPostsFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'limit', label: 'Posts to show', type: 'range', min: 1, max: 6, step: 1 },
  {
    key: 'layout',
    label: 'Layout',
    type: 'select',
    options: [
      { label: 'List', value: 'list' },
      { label: 'Grid', value: 'grid' },
    ],
  },
  { key: 'showExcerpt', label: 'Show excerpt', type: 'boolean' },
];
