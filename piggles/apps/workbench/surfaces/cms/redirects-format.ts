'use client';

// What a redirect MEANS, and the parsing around one.
//
// Split from `redirects-data.ts` under RULE #0.5. Everything here is pure: the
// words for a status code, the message for a refusal, a typed address nudged
// into shape, and the paste parser the bulk import runs. No queries, no cache —
// which is what makes it safe to lift out whole and to unit-test on its own.

import { apiErrorMessage } from '../../lib/api-error';

/** The HTTP status codes api-rest accepts. 301/308 mean "moved for good",
 *  302/307 mean "moved for now"; the 307/308 pair additionally preserves the
 *  request method, which matters for form and API paths. */
export type RedirectStatusCode = 301 | 302 | 307 | 308;
/* ── Saying what a redirect type means ──────────────────────────────────── */

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface RedirectTypeMeta {
  /** The word an owner would use, not the number. */
  label: string;
  /** The color that word wears on a `<Badge>`. */
  tone: Tone;
  /** One plain sentence on what choosing this actually does. */
  detail: string;
}

/**
 * What a status code means, in the words a business owner would use.
 *
 * Permanent (301/308) reads as a settled fact — info. Temporary (302/307) is a
 * transient state that someone will come back and undo — warning, so it stands
 * out in a list as the one that is not meant to last. 307/308 additionally keep
 * the request method; the list only ever needs the plain distinction, so both
 * fold into Permanent/Temporary.
 */
export function redirectTypeMeta(code: number): RedirectTypeMeta {
  switch (code) {
    case 302:
      return {
        label: 'Temporary',
        tone: 'warning',
        detail:
          'A short-term move. Search engines keep the old address on file and expect it back, so use this while a page is briefly away.',
      };
    case 307:
      return {
        label: 'Temporary',
        tone: 'warning',
        detail:
          'A short-term move that keeps the request exactly as it was — for form and checkout paths that are briefly away.',
      };
    case 308:
      return {
        label: 'Permanent',
        tone: 'info',
        detail:
          'A permanent move that keeps the request exactly as it was — for form and checkout paths that have moved for good.',
      };
    case 301:
      return {
        label: 'Permanent',
        tone: 'info',
        detail:
          'The old address has moved for good. Search engines update to the new one and pass on its standing.',
      };
    default:
      return {
        label: `Code ${String(code)}`,
        tone: 'neutral',
        detail: 'An uncommon redirect type set up elsewhere.',
      };
  }
}

/* ── Errors ─────────────────────────────────────────────────────────────── */

/**
 * The server's own sentence for a 4xx, shown verbatim: the redirect routes
 * explain the real problem ("A redirect from "/x" already exists", "A redirect
 * cannot point to itself", "Redirect would create a loop via …") far better than
 * a status code can. A 5xx carries no such sentence, so it falls back to the
 * caller's wording.
 */
export function redirectErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/**
 * Is this the "that address is already caught" refusal?
 *
 * Matched on the server's own sentence rather than a code, because the route
 * raises a bare `conflict(...)` with no machine-readable reason and three
 * different things share its 409 — a duplicate, a loop, and a chain too long.
 * Only the duplicate has somewhere for the person to go, so only it may offer
 * the way out. A wording change on the server turns the button off rather than
 * pointing it somewhere wrong, which is the safe direction to fail.
 */
export function isDuplicateRedirectError(error: unknown): boolean {
  return /already exists/i.test(redirectErrorMessage(error, ''));
}

/* ── Formatting + paths ─────────────────────────────────────────────────── */

/** Medium date, or an em dash for nothing. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/**
 * Nudge a typed address towards what the server accepts.
 *
 * Both paths must begin with "/". Someone typing "old-pricing" means "/old-pricing",
 * so we add the slash for them rather than bouncing the form. A full URL
 * (anything with "://") is left untouched so it can be flagged honestly — the
 * platform only redirects between paths on the same site, never off to another
 * address.
 */
export function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed.includes('://')) return trimmed;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
