import { z } from 'zod';
import { EmptyBehavior, LinkUrl } from '../common';
import type { SectionField } from '../fields';

// Dynamic (tenant-level): the merchant's current promotion / discount banner.
// Resolved from the active commerce promotion at send time; `alternate` shows
// the authored fallback copy when none is running.
export const ActivePromotionConfig = z.object({
  heading: z.string().max(120).default('This week only'),
  ctaLabel: z.string().max(80).default('Shop the sale'),
  ctaHref: LinkUrl.default(''),
  fallbackText: z.string().max(240).default(''),
  onEmpty: EmptyBehavior.default('hide'),
});
export type ActivePromotionConfig = z.infer<typeof ActivePromotionConfig>;

export const activePromotionFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'ctaLabel', label: 'Button label', type: 'text' },
  { key: 'ctaHref', label: 'Button links to', type: 'url', placeholder: 'https://…' },
  {
    key: 'fallbackText',
    label: 'Fallback copy',
    type: 'textarea',
    help: 'Shown when no promotion is running (if "show alternate" is set below).',
  },
  {
    key: 'onEmpty',
    label: 'When no promotion is active',
    type: 'select',
    options: [
      { label: 'Hide this section', value: 'hide' },
      { label: 'Show fallback copy', value: 'alternate' },
    ],
  },
];
