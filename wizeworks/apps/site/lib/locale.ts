// Which language this reader is reading in.
//
// WHY THIS EXISTS. A merchant could translate a product for a year and nobody
// could ever see it: `ProductTranslation` rows were written by the console, the
// REST API and MCP, and read by nothing. The storefront had no notion of a
// reader's language at all — `commerce.defaultLocale` was only ever a number and
// date format (piggles issue 401).
//
// THE CHOICE IS THE VISITOR'S, AND IT IS SHAREABLE. `?lang=es` picks a language
// and is remembered in a cookie by proxy.ts, so a link a merchant sends to a
// Spanish-speaking customer opens in Spanish. `?lang=` with no value goes back
// to the shop's own words. With no choice made, the browser's own
// `Accept-Language` is honored — which is what "shoppers reading your site in
// Spanish see your words" means for someone who never touches a switcher.
//
// A LANGUAGE THE SHOP HAS NOT WRITTEN IS NOT OFFERED. Everything here is matched
// against `site.languages`, which api-rest derives from the translations that
// actually exist. Asking for one nobody wrote returns undefined, and undefined
// means the shop's own words rather than a page of empty fields.

import { headers } from 'next/headers';
import { resolveSite } from './site-context';

/** The base language of a tag: `es-MX` → `es`. */
function base(tag: string): string {
  return (tag.split('-')[0] ?? tag).toLowerCase();
}

/**
 * The best of `available` for one requested tag: the exact tag, then the bare
 * language, then any regional variant of it. Case-insensitive on the way in
 * because a browser sends `es-ES` and a merchant may have typed `es-es`.
 */
export function matchLanguage(requested: string, available: readonly string[]): string | undefined {
  const want = requested.trim();
  if (want === '') return undefined;
  const lower = want.toLowerCase();
  return (
    available.find((tag) => tag.toLowerCase() === lower) ??
    available.find((tag) => tag.toLowerCase() === base(want)) ??
    available.find((tag) => base(tag) === base(want))
  );
}

/** Parse `Accept-Language` into tags, best-quality first. */
export function preferredLanguages(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      const quality = q ? Number.parseFloat(q.trim().slice(2)) : 1;
      return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    .filter((entry) => entry.tag !== '' && entry.tag !== '*' && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.tag);
}

/**
 * The language to read this request in, or undefined for the shop's own words.
 *
 * Undefined is the honest answer for a single-language shop and for a request
 * asking for something nobody has written, and it is what keeps an untranslated
 * storefront byte-for-byte what it was.
 */
export async function resolveReaderLocale(): Promise<string | undefined> {
  const site = await resolveSite();
  const available = site?.languages ?? [];
  if (available.length === 0) return undefined;

  const head = await headers();
  const chosen = head.get('x-sparx-lang');
  if (chosen) return matchLanguage(chosen, available);

  for (const tag of preferredLanguages(head.get('accept-language'))) {
    const match = matchLanguage(tag, available);
    if (match) return match;
  }
  return undefined;
}

/** A language's name IN ITSELF — "Español", not "Spanish" — title-cased. Someone
 *  who cannot read the current page cannot read the English name of their own
 *  language, which is what makes a switcher usable at all. */
export function languageEndonym(tag: string): string {
  let name = tag;
  try {
    name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag;
  } catch {
    name = tag;
  }
  return name.charAt(0).toUpperCase() + name.slice(1);
}
