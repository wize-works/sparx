// Serving a product in the reader's language.
//
// The matching rules are the part that decides whether a merchant has to write
// every regional variant of a language before anyone sees any of them, and the
// per-field fallback is a promise the console editor makes out loud ("Anything
// you leave empty falls back to your own words"). Both are pinned here.

import { describe, expect, it } from 'vitest';
import {
  applyTranslation,
  baseLanguage,
  pickTranslation,
  translationSelect,
} from './product-locale';

const es = {
  locale: 'es',
  title: 'Jersey Marlow',
  description: 'De lana de cordero.',
  seoTitle: null,
  seoDescription: null,
};
const esMx = { ...es, locale: 'es-MX', title: 'Suéter Marlow' };

const product = {
  title: 'Marlow Knit',
  description: 'A heavyweight lambswool crew.',
  seoTitle: 'Marlow Knit — Juniper Row',
  seoDescription: 'Knitted to order.',
};

describe('choosing which translation to serve', () => {
  it('prefers the exact tag', () => {
    expect(pickTranslation([es, esMx], 'es-MX')?.locale).toBe('es-MX');
  });

  it('falls back to the bare language, so es-MX reads the shop es copy', () => {
    expect(pickTranslation([es], 'es-MX')?.locale).toBe('es');
  });

  it('falls back to any regional variant, so es reads es-MX rather than English', () => {
    expect(pickTranslation([esMx], 'es')?.locale).toBe('es-MX');
  });

  it('finds nothing in a different language', () => {
    expect(pickTranslation([es], 'fr')).toBeUndefined();
  });

  it('reads the base of a tag', () => {
    expect(baseLanguage('zh-Hans-CN')).toBe('zh');
    expect(baseLanguage('de')).toBe('de');
  });
});

describe('overlaying it onto the product', () => {
  it('replaces the fields the translation carries', () => {
    const row = applyTranslation({ ...product, translations: [es] }, 'es');
    expect(row.title).toBe('Jersey Marlow');
    expect(row.description).toBe('De lana de cordero.');
  });

  it('falls back PER FIELD, which is what the editor promises', () => {
    const row = applyTranslation({ ...product, translations: [es] }, 'es');
    expect(row.seoTitle).toBe('Marlow Knit — Juniper Row');
    expect(row.seoDescription).toBe('Knitted to order.');
  });

  it('treats a blank translated field as cleared, not as an empty page', () => {
    const blank = { ...es, description: '   ' };
    const row = applyTranslation({ ...product, translations: [blank] }, 'es');
    expect(row.description).toBe('A heavyweight lambswool crew.');
  });

  it('leaves the product untouched when nobody asked for a language', () => {
    const row = applyTranslation({ ...product, translations: [es] }, undefined);
    expect(row.title).toBe('Marlow Knit');
  });

  it('leaves the product untouched when the language has no row', () => {
    const row = applyTranslation({ ...product, translations: [es] }, 'fr');
    expect(row.title).toBe('Marlow Knit');
  });
});

describe('the select', () => {
  it('asks for nothing at all when no language was requested', () => {
    expect(translationSelect(undefined)).toEqual({});
  });

  it('asks for every row in the LANGUAGE, so the fallback needs no second query', () => {
    const select = translationSelect('es-MX') as {
      translations: { where: { locale: { startsWith: string } } };
    };
    expect(select.translations.where.locale.startsWith).toBe('es');
  });
});
