// Serving a product in the language the reader asked for.
//
// WHY THIS EXISTS. Merchants have been able to translate a product since the
// `ProductTranslation` table shipped — a console pane, REST routes and MCP tools
// all write one, and the pane promises in three places that "shoppers reading
// your site in Spanish will see your words". Nothing ever read the rows back.
// The public catalog had no locale at all, so every translation anyone typed was
// invisible to every visitor (piggles issue 401).
//
// PER FIELD, NOT PER ROW. A translation row may carry only a name, and the
// editor says so out loud: "Anything you leave empty falls back to your own
// words." So an absent or blank field falls through to the product's own copy
// rather than blanking the page.
//
// MATCHING IS BY LANGUAGE, THEN EXACT. Someone asking for `es-MX` should read a
// shop's `es` copy rather than English; someone asking for `es` should get `es`
// over `es-MX` when both exist. Anything else means a merchant has to write
// every regional variant before anyone sees any of them.

import { z } from 'zod';

/** The BCP-47 shape the write side already enforces, so a junk `?locale=` is
 *  refused at the edge rather than turning into a wasted join. */
export const LocaleParam = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/)
  .optional();

/** The base language of a tag: `es-MX` → `es`. */
export function baseLanguage(locale: string): string {
  return locale.split('-')[0] ?? locale;
}

/**
 * The Prisma select for a product's candidate translations.
 *
 * Every row in the requested LANGUAGE is fetched, not just the exact tag, so
 * `pickTranslation` can fall back within the language without a second query.
 * Returns `{}` when no locale was asked for, which keeps the untranslated read
 * byte-for-byte what it was.
 */
export function translationSelect(locale: string | undefined) {
  if (!locale) return {};
  return {
    translations: {
      where: { locale: { startsWith: baseLanguage(locale) } },
      select: {
        locale: true,
        title: true,
        description: true,
        seoTitle: true,
        seoDescription: true,
      },
    },
  } as const;
}

export interface TranslationRow {
  locale: string;
  title: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

/** The best row for `locale`: the exact tag, else the bare language, else the
 *  first regional variant of it. */
export function pickTranslation(
  rows: readonly TranslationRow[],
  locale: string
): TranslationRow | undefined {
  const base = baseLanguage(locale);
  return (
    rows.find((row) => row.locale === locale) ??
    rows.find((row) => row.locale === base) ??
    rows.find((row) => baseLanguage(row.locale) === base)
  );
}

/** An empty string is not a translation — the editor stores a cleared field as
 *  NULL, and a whitespace-only one means the same thing to a reader. */
function useOr(translated: string | null | undefined, own: string | null): string | null {
  if (typeof translated !== 'string' || translated.trim() === '') return own;
  return translated;
}

interface Translatable {
  title: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  translations?: readonly TranslationRow[];
}

/**
 * Overlay the reader's language onto one product row.
 *
 * The candidate rows are left ON the returned object rather than stripped,
 * because both public mappers (`publicProduct`, `mapFullProduct`) build their
 * response explicitly field by field and never spread the row — so the
 * candidates are working data that cannot reach a response, and removing them
 * would only fight the Prisma payload types for nothing.
 */
export function applyTranslation<T extends Translatable>(row: T, locale: string | undefined): T {
  if (!locale || !row.translations || row.translations.length === 0) return row;
  const match = pickTranslation(row.translations, locale);
  if (!match) return row;
  return {
    ...row,
    title: useOr(match.title, row.title) ?? row.title,
    description: useOr(match.description, row.description),
    seoTitle: useOr(match.seoTitle, row.seoTitle),
    seoDescription: useOr(match.seoDescription, row.seoDescription),
  };
}
