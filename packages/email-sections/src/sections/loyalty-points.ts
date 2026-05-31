import { z } from 'zod';
import { EmptyBehavior, LinkUrl } from '../common';
import type { SectionField } from '../fields';

// Personalized (per recipient): the recipient's loyalty / rewards balance,
// resolved at dispatch.
export const LoyaltyPointsConfig = z.object({
  heading: z.string().max(120).default('Your rewards'),
  ctaLabel: z.string().max(80).default('View rewards'),
  ctaHref: LinkUrl.default(''),
  onEmpty: EmptyBehavior.default('hide'),
});
export type LoyaltyPointsConfig = z.infer<typeof LoyaltyPointsConfig>;

export const loyaltyPointsFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'ctaLabel', label: 'Button label', type: 'text' },
  { key: 'ctaHref', label: 'Button links to', type: 'url', placeholder: 'https://…' },
];
