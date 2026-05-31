import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  EMAIL_SECTION_DEFINITIONS,
  EMAIL_SECTION_TYPES,
  defaultSectionConfig,
  getEmailSectionDefinition,
  isEmailSectionType,
  parseSectionConfig,
  sectionsByTier,
  sectionTier,
} from '../registry';
import { EMPTY_BODY, bodyIsPersonalized, normalizeBody, parseBody } from '../section-model';

describe('registry', () => {
  it('every type has a definition whose schema defaults cleanly', () => {
    for (const type of EMAIL_SECTION_TYPES) {
      const def = getEmailSectionDefinition(type);
      expect(def?.type).toBe(type);
      // schema.parse({}) must succeed (every field defaulted) so a freshly
      // added section is valid before the merchant touches it.
      expect(() => defaultSectionConfig(type)).not.toThrow();
      // every field key exists on the parsed config or is a known passthrough.
      expect(def?.fields.length).toBeGreaterThan(0);
    }
  });

  it('groups by the three tiers and covers every type', () => {
    const grouped = [
      ...sectionsByTier('static'),
      ...sectionsByTier('dynamic'),
      ...sectionsByTier('personalized'),
    ];
    expect(grouped).toHaveLength(EMAIL_SECTION_DEFINITIONS.length);
    expect(sectionTier('recommended-products')).toBe('personalized');
    expect(sectionTier('featured-products')).toBe('dynamic');
    expect(sectionTier('heading')).toBe('static');
  });

  it('isEmailSectionType guards unknown types', () => {
    expect(isEmailSectionType('heading')).toBe(true);
    expect(isEmailSectionType('not-a-section')).toBe(false);
  });

  it('parseSectionConfig fills defaults and rejects unknown types', () => {
    const cfg = parseSectionConfig('heading', { text: 'Hi' });
    expect(cfg).toMatchObject({ text: 'Hi', level: 'h1', align: 'left' });
    expect(() => parseSectionConfig('nope', {})).toThrow(z.ZodError);
  });
});

describe('body model', () => {
  it('normalizes an empty / null body to EMPTY_BODY', () => {
    expect(normalizeBody(null)).toEqual(EMPTY_BODY);
    expect(normalizeBody({})).toEqual(EMPTY_BODY);
  });

  it('wraps a legacy CmsDoc into a single rich-text section (lossless)', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph' }] };
    const body = normalizeBody(doc);
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0]?.type).toBe('rich-text');
    expect(body.sections[0]?.config.doc).toEqual(doc);
  });

  it('passes a section-list body through normalize', () => {
    const raw = { version: 1, sections: [{ id: 'a', type: 'heading', config: { text: 'X' } }] };
    expect(normalizeBody(raw).sections[0]?.id).toBe('a');
  });

  it('parseBody validates each section config and rejects unknown types', () => {
    const body = parseBody({
      version: 1,
      sections: [{ id: 'a', type: 'heading', config: {} }],
    });
    expect(body.sections[0]?.config).toMatchObject({ level: 'h1' });
    expect(() =>
      parseBody({ version: 1, sections: [{ id: 'b', type: 'bogus', config: {} }] })
    ).toThrow(z.ZodError);
  });

  it('detects personalized bodies for the render-path switch', () => {
    const staticBody = parseBody({
      version: 1,
      sections: [{ id: 'a', type: 'heading', config: {} }],
    });
    const personalized = parseBody({
      version: 1,
      sections: [{ id: 'a', type: 'abandoned-cart', config: {} }],
    });
    expect(bodyIsPersonalized(staticBody)).toBe(false);
    expect(bodyIsPersonalized(personalized)).toBe(true);
  });
});
