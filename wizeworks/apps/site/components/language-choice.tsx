// Reading this shop in another language.
//
// A shop that has translated nothing renders NOTHING here — not an empty bar, not
// a switcher with one entry. `site.languages` is derived from the translations
// that actually exist, so this appears exactly when there is somewhere to go.
//
// Plain links, no client state. Each one carries `?lang=`, which proxy.ts turns
// into a cookie, so the choice sticks for the rest of the visit AND the link is
// shareable — a merchant can send a Spanish-speaking customer a Spanish link.
// `?lang=` with no value is the way back to the shop's own words.
//
// A server component on purpose: a language switcher that needs JavaScript to
// work is one a search-engine crawler cannot follow.

import { languageEndonym } from '@/lib/locale';

export function LanguageChoice({
  languages,
  current,
  ownLanguageLabel,
}: {
  /** The languages this shop's catalogue is written in, beyond its own words. */
  languages: string[];
  /** The one being read now, or undefined for the shop's own words. */
  current: string | undefined;
  /** What to call the untranslated original — the shop's own language, named in
   *  itself, so the way back is as readable as the way out. */
  ownLanguageLabel: string;
}) {
  if (languages.length === 0) return null;
  return (
    <nav
      aria-label="Language"
      className="border-base-300 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t px-4 py-5 text-sm"
    >
      <a
        href="?lang="
        aria-current={current === undefined ? 'true' : undefined}
        className={current === undefined ? 'font-semibold underline' : 'hover:underline'}
      >
        {ownLanguageLabel}
      </a>
      {languages.map((tag) => (
        <a
          key={tag}
          href={`?lang=${encodeURIComponent(tag)}`}
          lang={tag}
          hrefLang={tag}
          aria-current={current === tag ? 'true' : undefined}
          className={current === tag ? 'font-semibold underline' : 'hover:underline'}
        >
          {languageEndonym(tag)}
        </a>
      ))}
    </nav>
  );
}
