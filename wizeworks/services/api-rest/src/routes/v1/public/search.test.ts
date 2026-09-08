// Public "search everything" — what a shopper can find on a tenant's own site.
//
// Both of these pin a defect that shipped as silence (issue 378). A shop's pages
// and articles were absent from every search its own visitors ran: `cms_entry` was
// not in the public type list, and the `cms_page` branch resolved against a
// deprecated table holding zero rows. Nothing errored, nothing logged, and the
// screen offered "Browse all products" on a site whose footer links a Return Policy.

import { describe, expect, it } from 'vitest';

import { PUBLIC_ENTITY_TYPES, pathFrom } from './search.js';

describe('PUBLIC_ENTITY_TYPES', () => {
  it('includes the CMS articles a shop writes', () => {
    expect(PUBLIC_ENTITY_TYPES).toContain('cms_entry');
  });

  it('includes the standalone pages a shop publishes', () => {
    expect(PUBLIC_ENTITY_TYPES).toContain('cms_page');
  });

  it('still covers the commerce records', () => {
    expect(PUBLIC_ENTITY_TYPES).toContain('product');
    expect(PUBLIC_ENTITY_TYPES).toContain('collection');
  });

  it('leaves out categories, which have no storefront page', () => {
    expect(PUBLIC_ENTITY_TYPES).not.toContain('category');
  });
});

describe('pathFrom', () => {
  it('builds a blog post address from its type pattern', () => {
    expect(pathFrom('/blog/{slug}', 'caring-for-knitwear')).toBe('/blog/caring-for-knitwear');
  });

  it('builds a top-level page address', () => {
    expect(pathFrom('/{slug}', 'returns-policy')).toBe('/returns-policy');
  });

  it('handles the deeper patterns the seeded types declare', () => {
    expect(pathFrom('/case-studies/{slug}', 'a-b')).toBe('/case-studies/a-b');
    expect(pathFrom('/careers/{slug}', 'cutter')).toBe('/careers/cutter');
    expect(pathFrom('/team/{slug}', 'ines')).toBe('/team/ines');
  });

  it('leaves a pattern with no placeholder alone rather than losing the slug', () => {
    // Better a wrong-but-real address than one silently missing its slug.
    expect(pathFrom('/press', 'anything')).toBe('/press');
  });

  it('replaces only the first placeholder, so a slug cannot be injected twice', () => {
    expect(pathFrom('/{slug}/{slug}', 'x')).toBe('/x/{slug}');
  });
});
