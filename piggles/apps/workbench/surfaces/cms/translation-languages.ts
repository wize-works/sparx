'use client';

// The languages a shop can pick from, by name.
//
// WHY A LIST AND NOT A TEXT BOX. Adding a language used to mean typing a code —
// the field was labelled "Language code" and the help said "es, pt-BR, zh-Hans".
// The people this console is for know "Spanish", not BCP-47, and there is no way
// to guess that Simplified Chinese is `zh-Hans` (piggles issue 402).
//
// Naming is `Intl.DisplayNames`, so the names arrive in the reader's own
// language and nobody hand-maintains forty translations of "Portuguese".
//
// NOT AN EXHAUSTIVE LIST, and that is why the code box stays. This covers the
// languages a small shop actually sells in; anything else is still reachable by
// typing its code, so the list is a shortcut rather than a ceiling (RULE #1 —
// simplification never removes capability).

/** Common trade languages, plus the regional pairs that genuinely differ in
 *  shop copy (Brazilian vs European Portuguese, Latin American vs European
 *  Spanish, the two Chinese scripts). */
const COMMON = [
  'ar',
  'bn',
  'cs',
  'da',
  'de',
  'el',
  'en-GB',
  'es',
  'es-MX',
  'fi',
  'fr',
  'fr-CA',
  'he',
  'hi',
  'hu',
  'id',
  'it',
  'ja',
  'ko',
  'ms',
  'nl',
  'no',
  'pl',
  'pt',
  'pt-BR',
  'ro',
  'ru',
  'sv',
  'th',
  'tr',
  'uk',
  'vi',
  'zh-Hans',
  'zh-Hant',
] as const;

/** The value the "type a code instead" option carries. Not a language tag, and
 *  deliberately not one anybody could type: it never reaches the server. */
export const OTHER_LANGUAGE = '__other__';

/**
 * Value → label for the picker, minus the ones already on this product.
 *
 * Sorted by the NAME rather than the code, because that is the order someone
 * reading the list is scanning in.
 */
export function languageOptions(
  taken: readonly string[],
  name: (locale: string) => string
): Record<string, string> {
  const entries = COMMON.filter((tag) => !taken.includes(tag))
    .map((tag) => [tag, name(tag)] as const)
    .sort((a, b) => a[1].localeCompare(b[1]));
  return {
    ...Object.fromEntries(entries),
    [OTHER_LANGUAGE]: 'Another language…',
  };
}
