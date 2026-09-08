// What happens to the numbers on the shelf, and to the work on the floor.

import type { WebhookEventDef } from './types';

export const STOCK_EVENTS: readonly WebhookEventDef[] = [
  /* ── Stock ─────────────────────────────────────────────────────────────── */

  {
    key: 'inventory.adjusted',
    label: 'Stock changed',
    description:
      'Any quantity moves, for any reason — a sale, a delivery, a count, a correction. The busiest of these by a wide margin; take it when another system needs to mirror your numbers, not when a person needs telling.',
    group: 'Stock',
  },
  {
    key: 'inventory.low',
    label: 'Stock running low',
    description: 'An item drops to the level you said counts as low, and is worth reordering.',
    group: 'Stock',
  },
  {
    key: 'inventory.depleted',
    label: 'Stock ran out',
    description: 'An item reaches zero at a location and can no longer be sold from it.',
    group: 'Stock',
  },
  {
    key: 'inventory.count.completed',
    label: 'Count posted',
    description:
      'A stock count is applied and the figures on the shelf become the figures in the system.',
    group: 'Stock',
  },
  {
    key: 'inventory.reconciliation.drift',
    label: 'Numbers stopped adding up',
    description:
      'The running total for an item no longer matches the sum of its movements. This is the alarm that says a figure somewhere cannot be trusted.',
    group: 'Stock',
  },
  {
    key: 'inventory.oversell.blocked',
    label: 'Oversell prevented',
    description:
      'Someone tried to buy more than you actually had and was stopped. Worth watching — a run of these is demand you are turning away.',
    group: 'Stock',
  },
  {
    key: 'inventory.classification.changed',
    label: 'Item importance changed',
    description:
      'An item moves between top value, mid value and long tail, or its demand becomes predictable enough to forecast.',
    group: 'Stock',
  },
  {
    key: 'inventory.lot.expiring',
    label: 'Batch nearing expiry',
    description: 'A batch crosses into the window where it needs shifting before it is unsellable.',
    group: 'Stock',
  },

  /* ── Warehouse ─────────────────────────────────────────────────────────── */

  {
    key: 'inventory.bin.moved',
    label: 'Stock moved shelf',
    description:
      'Stock is put away or moved between shelves inside one location. The location total does not change — nothing entered or left the building.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.pick_list.created',
    label: 'Picking started',
    description: 'A picking run is raised and the work is ready for somebody on the floor.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.pick_list.completed',
    label: 'Picking finished',
    description: 'Every line on a picking run is accounted for and the run is closed.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.pick.short',
    label: 'Shelf came up short',
    description:
      'A picker found fewer than the system promised. The earliest honest warning that a number is wrong, straight from the floor.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.package.packed',
    label: 'Box packed',
    description: 'A box is sealed and verified against what the order asked for.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.transfer.shipped',
    label: 'Transfer sent',
    description: 'Stock leaves one of your locations bound for another and is now in transit.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.transfer.received',
    label: 'Transfer arrived',
    description: 'Stock in transit lands at the receiving location and is sellable again.',
    group: 'Warehouse',
  },
  {
    key: 'inventory.assembly.completed',
    label: 'Build finished',
    description:
      'A build run is completed: the components come off the shelf and the finished item goes on.',
    group: 'Warehouse',
  },
];
