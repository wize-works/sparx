import { describe, it, expect } from 'vitest';
import {
  SECTION_TYPES,
  SECTION_REGISTRY,
  defaultSectionConfig,
  parseSectionConfig,
  getSectionDefinition,
} from './section-registry';

describe('section registry', () => {
  it('registers a definition for every section type', () => {
    for (const type of SECTION_TYPES) {
      const def = SECTION_REGISTRY[type];
      expect(def.type).toBe(type);
      expect(def.fields.length).toBeGreaterThan(0);
      expect(def.label).toBeTruthy();
    }
  });

  it('produces a fully-defaulted config for a new section', () => {
    const hero = defaultSectionConfig('hero');
    expect(hero.align).toBe('center');
    expect(hero.overlayOpacity).toBe(40);
    expect(hero.heading).toBe('');
  });

  it('validates and fills section config from partial input', () => {
    const cfg = parseSectionConfig('featured-products', { heading: 'New In', columns: 3 });
    expect(cfg.heading).toBe('New In');
    expect(cfg.columns).toBe(3);
    expect(cfg.source).toBe('newest');
    expect(cfg.limit).toBe(8);
  });

  it('rejects an unknown section type', () => {
    expect(() => parseSectionConfig('not-real', {})).toThrow();
    expect(getSectionDefinition('not-real')).toBeUndefined();
  });

  it('enforces config bounds (columns 1..4)', () => {
    expect(() => parseSectionConfig('featured-products', { columns: 9 })).toThrow();
  });
});
