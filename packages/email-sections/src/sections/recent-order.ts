import { z } from 'zod';
import { EmptyBehavior } from '../common';
import type { SectionField } from '../fields';

// Personalized (per recipient): the recipient's latest order, resolved at
// dispatch (send-time state — see docs/31 open question 13.4).
export const RecentOrderConfig = z.object({
  heading: z.string().max(120).default('Your recent order'),
  showStatus: z.boolean().default(true),
  showItems: z.boolean().default(true),
  onEmpty: EmptyBehavior.default('hide'),
});
export type RecentOrderConfig = z.infer<typeof RecentOrderConfig>;

export const recentOrderFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'showStatus', label: 'Show fulfillment status', type: 'boolean' },
  { key: 'showItems', label: 'Show line items', type: 'boolean' },
];
