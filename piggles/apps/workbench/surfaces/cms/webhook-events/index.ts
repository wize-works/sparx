// The one human catalogue of events a person can be notified about.
//
// Keys are wire values; everything read on screen comes from here, worded for a
// business owner — "Content published", not `content.entry.published`. Grouped
// so the picker lays them out under plain headings.
//
// Split by domain rather than kept in one list because the file was 340 lines
// of it. `check-webhook-events.mjs` reads this directory and holds it against
// the server's allow-list, so a key added here and nowhere else fails the build.

import { CONTENT_EVENTS } from './content';
import { SELLING_EVENTS } from './selling';
import { STOCK_EVENTS } from './stock';
import { SUPPLY_EVENTS } from './supply';
import type { WebhookEventDef, WebhookEventGroup } from './types';

export type { WebhookEventDef, WebhookEventGroup, WebhookEventKey } from './types';

export const WEBHOOK_EVENTS: readonly WebhookEventDef[] = [
  ...SELLING_EVENTS,
  ...CONTENT_EVENTS,
  ...STOCK_EVENTS,
  ...SUPPLY_EVENTS,
];

/** Heading order in the picker. Selling first: a shop owner scanning this list
 *  is looking for "somebody bought something" before anything else. */
export const WEBHOOK_EVENT_GROUPS: readonly WebhookEventGroup[] = [
  'Selling',
  'Content',
  'Files',
  'Redirects',
  'Stock',
  'Warehouse',
  'Supply',
  'Stock feeds',
];

const EVENT_LABELS = new Map<string, string>(WEBHOOK_EVENTS.map((e) => [e.key, e.label]));

/** The plain-language name for an event key, or the raw key for one this build
 *  does not recognise (a subscription saved by a newer release). */
export function eventLabel(key: string): string {
  return EVENT_LABELS.get(key) ?? key;
}
