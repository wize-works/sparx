'use client';

// Languages, and how far a product's wording has got in each of them.
//
// Its own file because none of this talks to the server. `translations-data.ts`
// owns the queries, the writes and the cache; everything here is a pure function
// over a language tag or a set of already-loaded rows — canonicalizing a tag the
// way the server will, naming it in the owner's words, and answering "is this
// language finished, and when was it last written".
//
// That second question is why the file exists at all. The coverage badge used to
// be built from a locale tag alone, which says a language EXISTS and nothing more
// — and a language exists the moment its NAME is saved, the one field a
// translation cannot be saved without. A barely-started translation and a
// finished one were the same green pill (issue 420).

import type { ProductTranslation } from './translations-data';

/**
 * Canonicalize a language tag the way the server does — language lowercase,
 * script Titlecase, region UPPERCASE.
 *
 * Done here as well so the editor can key a DRAFT row on the same string the
 * server will store. Without it, typing `en-us` creates a draft under `en-us`
 * that comes back from the save as `en-US`, and the language appears twice with
 * the operator's edit apparently lost.
 */
export function canonicalLocale(raw: string): string {
  const parts = raw.trim().replace(/_/g, '-').split('-').filter(Boolean);
  return parts
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      // Four letters is a SCRIPT (Hans, Cyrl) — Titlecase; two or three in a
      // later position is a REGION — uppercase.
      if (part.length === 4) return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      if (part.length === 2 || part.length === 3) return part.toUpperCase();
      return part.toLowerCase();
    })
    .join('-');
}

/** A language tag in the reader's own language ("Spanish (Mexico)"), falling
 *  back to the tag itself when the browser has no name for it. */
export function localeName(locale: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

/** Would the server accept this tag? Mirrors the BCP-47 shape the Locale schema
 *  enforces, so the editor can refuse it before spending a round trip. */
export function isValidLocale(raw: string): boolean {
  return /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/.test(canonicalLocale(raw));
}

/** A product's coverage as one readable phrase: "Not translated", "Spanish", or
 *  "Spanish, French +2". Names the first two languages and counts the rest so a
 *  row stays one line on a narrow pane. */
export function coverageSummary(rows: readonly ProductTranslation[]): string {
  if (rows.length === 0) return 'Not translated';
  const names = rows.map((row) => localeName(row.locale));
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${String(names.length - 2)}`;
}

/**
 * A language whose BODY TEXT is still the shop's own.
 *
 * The name is the only field a translation cannot be saved without, so "this
 * product has Spanish" and "this product has a Spanish name and an English
 * description" were the same green badge. A shopper reading the site in Spanish
 * sees the difference immediately; the owner never did.
 *
 * The two search fields are deliberately NOT counted. They fall back too, but to
 * words a shopper only meets on a results page, and flagging them would mark
 * almost every row unfinished — which would make the mark mean nothing.
 */
export function unfinishedLanguages(rows: readonly ProductTranslation[]): string[] {
  return rows.filter((row) => !row.description?.trim()).map((row) => localeName(row.locale));
}

/** What is unfinished, in a sentence a row can carry. Empty when nothing is. */
export function unfinishedNote(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0] ?? ''} has no description yet`;
  return `${String(names.length)} languages have no description yet`;
}

/** When this product's wording was last written in another language — the date a
 *  TRANSLATION screen means by "changed". Null when there is none. */
export function lastTranslatedAt(rows: readonly ProductTranslation[]): string | null {
  let latest: string | null = null;
  for (const row of rows) if (latest === null || row.updatedAt > latest) latest = row.updatedAt;
  return latest;
}
