import { z } from 'zod';
import { EmptyBehavior, LinkUrl } from '../common';
import type { SectionField } from '../fields';

// Personalized (per recipient): the recipient's open cart, resolved at dispatch.
export const AbandonedCartConfig = z.object({
  heading: z.string().max(120).default('Still in your cart'),
  ctaLabel: z.string().max(80).default('Complete your order'),
  ctaHref: LinkUrl.default(''),
  showPrices: z.boolean().default(true),
  maxItems: z.number().int().min(1).max(10).default(5),
  onEmpty: EmptyBehavior.default('hide'),
});
export type AbandonedCartConfig = z.infer<typeof AbandonedCartConfig>;

export const abandonedCartFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'ctaLabel', label: 'Button label', type: 'text' },
  { key: 'ctaHref', label: 'Button links to', type: 'url', help: 'Defaults to the recovery link.' },
  { key: 'showPrices', label: 'Show prices', type: 'boolean' },
  { key: 'maxItems', label: 'Max items', type: 'range', min: 1, max: 10, step: 1 },
];
