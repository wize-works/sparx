// templateService + the templateId-native sectionService surface (Phase 3.3a,
// docs/handoffs/sitebuilder-phase3-spec.md §13). Covers resolve-or-create
// idempotency, "Customize" materialization (code default → real rows, no
// duplication on re-run), templateId-addressed section CRUD, scope safety, and
// the transitional pageKey alias still resolving.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sectionService, templateService } from '../../src/services/index.js';
import { SitebuilderValidationError } from '../../src/errors.js';
import { disposeTestContext, makeTestContext, type TestContext } from '../helpers.js';

describe('sitebuilder templates (3.3a)', () => {
  let test: TestContext;

  beforeAll(async () => {
    test = await makeTestContext('owner');
  });

  afterAll(async () => {
    await disposeTestContext(test);
  });

  it('getOrCreate — idempotent per (scope, key); distinct keys are distinct rows', async () => {
    const a = await templateService.getOrCreate(test.ctx, { scope: 'product' });
    const again = await templateService.getOrCreate(test.ctx, { scope: 'product' });
    expect(again.id).toBe(a.id);
    expect(a.scope).toBe('product');
    expect(a.key).toBe('default');
    expect(a.name).toBe('Product page');

    const slug = await templateService.getOrCreate(test.ctx, { scope: 'custom', key: 'about' });
    expect(slug.id).not.toBe(a.id);
    expect(slug.scope).toBe('custom');
    expect(slug.key).toBe('about');
    // custom/cms-page name defaults to the key.
    expect(slug.name).toBe('about');
  });

  it('list — all templates, and filtered by scope', async () => {
    const all = await templateService.list(test.ctx);
    expect(all.length).toBeGreaterThanOrEqual(2);

    const products = await templateService.list(test.ctx, 'product');
    expect(products.every((t) => t.scope === 'product')).toBe(true);
    expect(products).toHaveLength(1);
  });

  it('materializeDefault(product) — seeds the PDP default in order; re-run is a no-op', async () => {
    const template = await templateService.materializeDefault(test.ctx, { scope: 'product' });
    const sections = await sectionService.listForTemplate(test.ctx, template.id);
    expect(sections.map((s) => s.sectionType)).toEqual([
      'product-buy-box',
      'product-description',
      'product-fitment',
      'product-reviews',
      'product-questions',
      'product-related',
    ]);
    // Positions are 0..n in order.
    expect(sections.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5]);
    // Every materialized section carries the native template fields.
    expect(sections.every((s) => s.templateId === template.id && s.scope === 'product')).toBe(true);

    // Idempotent: a layout that already has sections is returned untouched.
    const again = await templateService.materializeDefault(test.ctx, { scope: 'product' });
    expect(again.id).toBe(template.id);
    const after = await sectionService.listForTemplate(test.ctx, template.id);
    expect(after).toHaveLength(6);
  });

  it('materializeDefault(collection) — seeds header + product grid', async () => {
    const template = await templateService.materializeDefault(test.ctx, { scope: 'collection' });
    const sections = await sectionService.listForTemplate(test.ctx, template.id);
    expect(sections.map((s) => s.sectionType)).toEqual([
      'collection-header',
      'collection-products',
    ]);
  });

  it('materializeDefault(home) — no code default → empty layout', async () => {
    const template = await templateService.materializeDefault(test.ctx, { scope: 'home' });
    const sections = await sectionService.listForTemplate(test.ctx, template.id);
    expect(sections).toHaveLength(0);
  });

  it('create by templateId — appends to the addressed layout', async () => {
    const collection = await templateService.getOrCreate(test.ctx, { scope: 'collection' });
    const before = await sectionService.listForTemplate(test.ctx, collection.id);

    const created = await sectionService.create(test.ctx, {
      templateId: collection.id,
      sectionType: 'rich-text',
    });
    expect(created.templateId).toBe(collection.id);
    expect(created.scope).toBe('collection');

    const after = await sectionService.listForTemplate(test.ctx, collection.id);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)?.id).toBe(created.id);
  });

  it('scope safety — a product-bound section is rejected in a collection layout', async () => {
    const collection = await templateService.getOrCreate(test.ctx, { scope: 'collection' });
    await expect(
      sectionService.create(test.ctx, {
        templateId: collection.id,
        sectionType: 'product-buy-box',
      })
    ).rejects.toBeInstanceOf(SitebuilderValidationError);
  });

  it('reorder by templateId — reverses the layout order', async () => {
    const product = await templateService.getOrCreate(test.ctx, { scope: 'product' });
    const sections = await sectionService.listForTemplate(test.ctx, product.id);
    const reversed = [...sections].reverse().map((s) => s.id);

    const result = await sectionService.reorder(test.ctx, {
      templateId: product.id,
      orderedIds: reversed,
    });
    expect(result.map((s) => s.id)).toEqual(reversed);
  });

  it('pageKey alias — create with no templateId still resolves home', async () => {
    const created = await sectionService.create(test.ctx, {
      pageKey: 'home',
      sectionType: 'hero',
      config: { heading: 'Welcome' },
    });
    expect(created.scope).toBe('home');
    expect(created.templateKey).toBe('default');
    expect(created.pageKey).toBe('home');
    expect(created.templateId).toBeTruthy();
  });
});
