import { describe, it, expect } from 'vitest';
import {
  SECTION_TYPES,
  SECTION_REGISTRY,
  defaultSectionConfig,
  parseSectionConfig,
  getSectionDefinition,
  sectionsForTarget,
  isSectionAllowedInTarget,
} from './section-registry';
import { DEFAULT_TEMPLATES } from './default-templates';

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
    // New sections ship with placeholder copy so they look intentional before
    // the merchant edits them (rather than rendering blank).
    expect(hero.heading).toBe('Your headline goes here');
    expect(hero.ctaLabel).toBe('Shop now');
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

  it('restricts bound sections to matching targets, static sections to all targets', () => {
    // Static: addable in every target.
    expect(isSectionAllowedInTarget('hero', 'site:home')).toBe(true);
    expect(isSectionAllowedInTarget('hero', 'commerce:product')).toBe(true);
    expect(isSectionAllowedInTarget('hero', 'cms:content-type:abc-123')).toBe(true);
    // Bound product section: only in a target with a product binding.
    expect(isSectionAllowedInTarget('product-buy-box', 'commerce:product')).toBe(true);
    expect(isSectionAllowedInTarget('product-buy-box', 'site:home')).toBe(false);
    expect(isSectionAllowedInTarget('product-buy-box', 'commerce:collection')).toBe(false);
    // Bound collection section: only in a target with a collection binding.
    expect(isSectionAllowedInTarget('collection-products', 'commerce:collection')).toBe(true);
    expect(isSectionAllowedInTarget('collection-products', 'commerce:product')).toBe(false);
    // Unknown type / unknown target never allowed.
    expect(isSectionAllowedInTarget('not-real', 'site:home')).toBe(false);
    expect(isSectionAllowedInTarget('product-buy-box', 'not:a-target')).toBe(false);
  });

  it('sectionsForTarget returns static + that target’s bound sections only', () => {
    const product = sectionsForTarget('commerce:product').map((d) => d.type);
    expect(product).toContain('hero'); // static, allowed everywhere
    expect(product).toContain('product-buy-box'); // bound to product
    expect(product).not.toContain('collection-products'); // bound to collection

    const home = sectionsForTarget('site:home').map((d) => d.type);
    expect(home).toContain('hero');
    expect(home).not.toContain('product-buy-box');
    expect(home).not.toContain('collection-header');
  });

  it('bound sections carry a binding + read-only binding descriptors', () => {
    const buyBox = getSectionDefinition('product-buy-box');
    expect(buyBox?.binding).toBe('product');
    expect((buyBox?.bindings ?? []).length).toBeGreaterThan(0);
    // Static sections are unbound.
    expect(getSectionDefinition('hero')?.binding).toBeUndefined();
  });

  it('seeded default templates are valid, target-correct compositions', () => {
    for (const [targetId, sections] of Object.entries(DEFAULT_TEMPLATES)) {
      expect(sections.length).toBeGreaterThan(0);
      for (const s of sections) {
        // Each default section is allowed in its target and carries a real config.
        expect(isSectionAllowedInTarget(s.sectionType, targetId)).toBe(true);
        expect(() => parseSectionConfig(s.sectionType, s.config)).not.toThrow();
      }
    }
    // The product default leads with the buy box (parity with today's PDP).
    expect(DEFAULT_TEMPLATES['commerce:product'][0]?.sectionType).toBe('product-buy-box');
    expect(DEFAULT_TEMPLATES['commerce:collection'][0]?.sectionType).toBe('collection-header');
  });
});
