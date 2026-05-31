import { describe, it, expect } from 'vitest';
import {
  SECTION_TYPES,
  SECTION_REGISTRY,
  SCOPES,
  defaultSectionConfig,
  parseSectionConfig,
  getSectionDefinition,
  sectionsForScope,
  isSectionAllowedInScope,
} from './section-registry';
import { DEFAULT_TEMPLATES } from './default-templates';

describe('section registry', () => {
  it('registers a definition for every section type', () => {
    for (const type of SECTION_TYPES) {
      const def = SECTION_REGISTRY[type];
      expect(def.type).toBe(type);
      expect(def.fields.length).toBeGreaterThan(0);
      expect(def.label).toBeTruthy();
      // Every section declares at least one scope it's allowed in.
      expect(def.scopes.length).toBeGreaterThan(0);
      for (const scope of def.scopes) expect(SCOPES).toContain(scope);
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

  it('restricts bound sections to their scope, static sections to all scopes', () => {
    // Static: addable everywhere.
    expect(isSectionAllowedInScope('hero', 'home')).toBe(true);
    expect(isSectionAllowedInScope('hero', 'product')).toBe(true);
    // Bound product section: only in a product layout.
    expect(isSectionAllowedInScope('product-buy-box', 'product')).toBe(true);
    expect(isSectionAllowedInScope('product-buy-box', 'home')).toBe(false);
    expect(isSectionAllowedInScope('product-buy-box', 'collection')).toBe(false);
    // Bound collection section: only in a collection layout.
    expect(isSectionAllowedInScope('collection-products', 'collection')).toBe(true);
    expect(isSectionAllowedInScope('collection-products', 'product')).toBe(false);
    // Unknown type / unknown scope never allowed.
    expect(isSectionAllowedInScope('not-real', 'home')).toBe(false);
    expect(isSectionAllowedInScope('hero', 'not-a-scope')).toBe(false);
  });

  it('sectionsForScope returns static + that scope’s bound sections only', () => {
    const product = sectionsForScope('product').map((d) => d.type);
    expect(product).toContain('hero'); // static, allowed everywhere
    expect(product).toContain('product-buy-box'); // bound to product
    expect(product).not.toContain('collection-products'); // bound to collection

    const home = sectionsForScope('home').map((d) => d.type);
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

  it('seeded default templates are valid, scope-correct compositions', () => {
    for (const [scope, sections] of Object.entries(DEFAULT_TEMPLATES)) {
      expect(sections.length).toBeGreaterThan(0);
      for (const s of sections) {
        // Each default section is allowed in its scope and carries a real config.
        expect(isSectionAllowedInScope(s.sectionType, scope)).toBe(true);
        expect(() => parseSectionConfig(s.sectionType, s.config)).not.toThrow();
      }
    }
    // The product default leads with the buy box (parity with today's PDP).
    expect(DEFAULT_TEMPLATES.product[0]?.sectionType).toBe('product-buy-box');
    expect(DEFAULT_TEMPLATES.collection[0]?.sectionType).toBe('collection-header');
  });
});
