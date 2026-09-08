// What is coming in, what has been promised, and what other systems are telling
// us about stock.

import type { WebhookEventDef } from './types';

export const SUPPLY_EVENTS: readonly WebhookEventDef[] = [
  /* ── Supply ────────────────────────────────────────────────────────────── */

  {
    key: 'inventory.purchase_order.late',
    label: 'Supplier order late',
    description: 'A purchase order passes the date the supplier promised it, and has not arrived.',
    group: 'Supply',
  },
  {
    key: 'inventory.backorder.created',
    label: 'Item promised without stock',
    description:
      'Something is sold that you cannot ship yet, so a promise to a named customer now exists.',
    group: 'Supply',
  },
  {
    key: 'inventory.backorder.allocated',
    label: 'Promise covered by new stock',
    description:
      'Arriving stock is assigned to somebody already waiting for it, in the order they were promised.',
    group: 'Supply',
  },

  /* ── Stock feeds ───────────────────────────────────────────────────────── */

  {
    key: 'inventory.source.created',
    label: 'Feed connected',
    description: 'A new supplier or warehouse feed is set up to send you stock figures.',
    group: 'Stock feeds',
  },
  {
    key: 'inventory.source.sync_started',
    label: 'Feed started',
    description: 'A scheduled pull from one of your feeds begins.',
    group: 'Stock feeds',
  },
  {
    key: 'inventory.source.sync_completed',
    label: 'Feed finished',
    description: 'A pull finishes, with how many lines it changed.',
    group: 'Stock feeds',
  },
  {
    key: 'inventory.source.error',
    label: 'Feed failed',
    description:
      'A feed could not be read. Until it is fixed, its figures are frozen at whatever they last were.',
    group: 'Stock feeds',
  },
  {
    key: 'inventory.source.stale',
    label: 'Feed went quiet',
    description:
      'A feed has not reported for long enough that its figures should no longer be relied on. Silence is not the same as no change, and this is the event that says so.',
    group: 'Stock feeds',
  },
  {
    key: 'inventory.source.recovered',
    label: 'Feed recovered',
    description: 'A feed that was failing or quiet starts reporting again.',
    group: 'Stock feeds',
  },
];
