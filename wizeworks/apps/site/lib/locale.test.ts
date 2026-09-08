// Which language a reader is reading in.
//
// The two pure halves of the resolver: parsing what a browser asked for, and
// matching it against what the shop has actually written. Both decide whether a
// translation a merchant spent an evening on is ever seen.

import { describe, expect, it } from 'vitest';
import { languageEndonym, matchLanguage, preferredLanguages } from './locale';

describe('what the browser asked for', () => {
  it('reads a plain header', () => {
    expect(preferredLanguages('es-ES,es;q=0.9,en;q=0.8')).toEqual(['es-ES', 'es', 'en']);
  });

  it('sorts by quality rather than by order', () => {
    expect(preferredLanguages('en;q=0.5,es;q=0.9')).toEqual(['es', 'en']);
  });

  it('drops the wildcard and anything refused outright', () => {
    expect(preferredLanguages('*,fr;q=0,de')).toEqual(['de']);
  });

  it('is empty when the browser said nothing', () => {
    expect(preferredLanguages(null)).toEqual([]);
    expect(preferredLanguages('')).toEqual([]);
  });
});

describe('matching it to what the shop has written', () => {
  it('takes the exact tag', () => {
    expect(matchLanguage('es-MX', ['es', 'es-MX'])).toBe('es-MX');
  });

  it('falls back to the bare language', () => {
    expect(matchLanguage('es-MX', ['es'])).toBe('es');
  });

  it('falls back to a regional variant', () => {
    expect(matchLanguage('es', ['es-MX'])).toBe('es-MX');
  });

  it('ignores case, because a browser sends es-ES and a merchant may type es-es', () => {
    expect(matchLanguage('ES-es', ['es-ES'])).toBe('es-ES');
  });

  it('offers nothing for a language nobody wrote', () => {
    expect(matchLanguage('fr', ['es'])).toBeUndefined();
  });

  it('offers nothing when the shop has written nothing', () => {
    expect(matchLanguage('es', [])).toBeUndefined();
  });
});

describe('naming a language to someone who reads it', () => {
  it('uses the language own name, not the English one', () => {
    expect(languageEndonym('es')).toBe('Español');
  });

  it('title-cases languages that name themselves lowercase', () => {
    expect(languageEndonym('fr')).toBe('Français');
  });

  it('falls back to the tag rather than throwing on junk', () => {
    expect(languageEndonym('qqq-ZZ')).toBeTruthy();
  });
});
