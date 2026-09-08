// What a location IS, in the words the console uses for it: the kinds of place,
// how a kind reads, whether one is open or closed, where it is, and what the
// server's refusals mean in plain language.

import { ApiError } from '@wizeworks/api-client';
import type { Tone } from './data';
import type { Location } from './locations-data';
import { apiErrorMessage } from '../../lib/api-error';

export const LOCATION_TYPES = [
  {
    value: 'owned',
    label: 'Your own place',
    hint: 'A warehouse, shop or unit you run yourself.',
  },
  {
    value: '3pl',
    label: 'Run by a partner',
    hint: 'A fulfillment company stores your stock and ships it for you.',
  },
  {
    value: 'dropship',
    label: 'Shipped by a supplier',
    hint: 'Stock you never hold — a supplier ships each order straight to the customer.',
  },
  {
    value: 'virtual',
    label: 'On paper only',
    hint: 'Not a real building — a holding place for stock in transit or counted elsewhere.',
  },
] as const;

const TYPE_LABEL = new Map<string, string>(LOCATION_TYPES.map((t) => [t.value, t.label]));
const TYPE_HINT = new Map<string, string>(LOCATION_TYPES.map((t) => [t.value, t.hint]));

/** A location's kind as a short label, for a badge or a select. */
export function locationTypeLabel(type: string): string {
  return TYPE_LABEL.get(type) ?? 'Location';
}

/** A one-line explanation of a kind, for a field description. */
export function locationTypeHint(type: string): string {
  return TYPE_HINT.get(type) ?? '';
}

export interface LocationState {
  label: string;
  tone: Tone;
}

/** Whether a location is in use, as a state with its own color. */
export function locationState(location: { isActive: boolean }): LocationState {
  return location.isActive
    ? { label: 'In use', tone: 'success' }
    : { label: 'Closed', tone: 'warning' };
}

/** The town-and-country line for a location, or null when it has no address —
 *  which a virtual or freshly-seeded location legitimately does not. */
export function locationPlace(
  location: Pick<Location, 'city' | 'region' | 'country'>
): string | null {
  const parts = [location.city, location.region, location.country].filter((part): part is string =>
    Boolean(part?.trim())
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

/* ── Errors ─────────────────────────────────────────────────────────────── */

/**
 * The server's own sentence for a 4xx, shown verbatim: these routes name the
 * exact problem ("Warehouse code "MAIN" is already in use", "Cannot archive a
 * warehouse that still holds stock…") far better than anything this side could
 * infer from a status code. A 5xx carries no such sentence, so it falls back to
 * the caller's wording.
 */
export function locationErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/** The field a conflict was about, when the server named one — used to put the
 *  "already in use" message under the code box rather than in a banner. */
export function conflictField(error: unknown): string | null {
  if (
    error instanceof ApiError &&
    error.code === 'CONFLICT' &&
    error.details !== null &&
    typeof error.details === 'object' &&
    'field' in error.details
  ) {
    const field = (error.details as { field?: unknown }).field;
    return typeof field === 'string' ? field : null;
  }
  return null;
}

/** True when the location behind the edit pane no longer exists. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
