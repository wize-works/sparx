// pageLayoutService + the pageLayoutId-native sectionService surface, now keyed
// by layout TARGET ids (docs/36 §4, docs/handoffs/sitebuilder-pb-spec.md). Covers
// resolve-or-create idempotency, "Customize" materialization (code default → real
// rows, no duplication on re-run), pageLayoutId-addressed section CRUD, target
// safety, and (targetId, key) addressing.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sectionService, pageLayoutService } from '../../src/services/index.js';
import { SitebuilderValidationError } from '../../src/errors.js';
import { disposeTestContext, makeTestContext, type TestContext } from '../helpers.js';

describe('sitebuilder page layouts', () => {
  let test: TestContext;

  beforeAll(async () => {
    test = await makeTestContext('owner');
  });

  afterAll(async () => {
    await disposeTestContext(test);
  });

  it('getOrCreate — idempotent per (targetId, key); distinct keys are distinct rows', async () => {
    const a = await pageLayoutService.getOrCreate(test.ctx, { targetId: 'commerce:product' });
    const again = await pageLayoutService.getOrCreate(test.ctx, { targetId: 'commerce:product' });
    expect(again.id).toBe(a.id);
    expect(a.targetId).toBe('commerce:product');
    expect(a.key).toBe('default');
    expect(a.name).toBe('Product page');

    const slug = await pageLayoutService.getOrCreate(test.ctx, {
      targetId: 'cms:content-page',
      key: 'about',
    });
    expect(slug.id).not.toBe(a.id);
    expect(slug.targetId).toBe('cms:content-page');
    expect(slug.key).toBe('about');
    // A standalone content page's name defaults to the key.
    expect(slug.name).toBe('about');
  });

  it('list — all layouts, and filtered by target', async () => {
    const all = await pageLayoutService.list(test.ctx);
    expect(all.length).toBeGreaterThanOrEqual(2);

    const products = await pageLayoutService.list(test.ctx, 'commerce:product');
    expect(products.every((t) => t.targetId === 'commerce:product')).toBe(true);
    expect(products).toHaveLength(1);
  });

  it('materializeDefault(commerce:product) — seeds the PDP default in order; re-run is a no-op', async () => {
    const template = await pageLayoutService.materializeDefault(test.ctx, {
      targetId: 'commerce:product',
    });
    const sections = await sectionService.listForPageLayout(test.ctx, template.id);
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
    // Every materialized section carries the native layout fields.
    expect(
      sections.every((s) => s.pageLayoutId === template.id && s.targetId === 'commerce:product')
    ).toBe(true);

    // Idempotent: a layout that already has sections is returned untouched.
    const again = await pageLayoutService.materializeDefault(test.ctx, {
      targetId: 'commerce:product',
    });
    expect(again.id).toBe(template.id);
    const after = await sectionService.listForPageLayout(test.ctx, template.id);
    expect(after).toHaveLength(6);
  });

  it('materializeDefault(commerce:collection) — seeds header + product grid', async () => {
    const template = await pageLayoutService.materializeDefault(test.ctx, {
      targetId: 'commerce:collection',
    });
    const sections = await sectionService.listForPageLayout(test.ctx, template.id);
    expect(sections.map((s) => s.sectionType)).toEqual([
      'collection-header',
      'collection-products',
    ]);
  });

  it('materializeDefault(site:home) — no code default → empty layout', async () => {
    const template = await pageLayoutService.materializeDefault(test.ctx, {
      targetId: 'site:home',
    });
    const sections = await sectionService.listForPageLayout(test.ctx, template.id);
    expect(sections).toHaveLength(0);
  });

  it('create by pageLayoutId — appends to the addressed layout', async () => {
    const collection = await pageLayoutService.getOrCreate(test.ctx, {
      targetId: 'commerce:collection',
    });
    const before = await sectionService.listForPageLayout(test.ctx, collection.id);

    const created = await sectionService.create(test.ctx, {
      pageLayoutId: collection.id,
      sectionType: 'rich-text',
    });
    expect(created.pageLayoutId).toBe(collection.id);
    expect(created.targetId).toBe('commerce:collection');

    const after = await sectionService.listForPageLayout(test.ctx, collection.id);
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)?.id).toBe(created.id);
  });

  it('target safety — a product-bound section is rejected in a collection layout', async () => {
    const collection = await pageLayoutService.getOrCreate(test.ctx, {
      targetId: 'commerce:collection',
    });
    await expect(
      sectionService.create(test.ctx, {
        pageLayoutId: collection.id,
        sectionType: 'product-buy-box',
      })
    ).rejects.toBeInstanceOf(SitebuilderValidationError);
  });

  it('reorder by pageLayoutId — reverses the layout order', async () => {
    const product = await pageLayoutService.getOrCreate(test.ctx, { targetId: 'commerce:product' });
    const sections = await sectionService.listForPageLayout(test.ctx, product.id);
    const reversed = [...sections].reverse().map((s) => s.id);

    const result = await sectionService.reorder(test.ctx, {
      pageLayoutId: product.id,
      orderedIds: reversed,
    });
    expect(result.map((s) => s.id)).toEqual(reversed);
  });

  it('create by target — resolves/creates the (targetId, key) layout', async () => {
    const created = await sectionService.create(test.ctx, {
      targetId: 'site:home',
      sectionType: 'hero',
      config: { heading: 'Welcome' },
    });
    expect(created.targetId).toBe('site:home');
    expect(created.templateKey).toBe('default');
    expect(created.pageLayoutId).toBeTruthy();
  });

  it('create with neither pageLayoutId nor targetId — rejected', async () => {
    await expect(sectionService.create(test.ctx, { sectionType: 'hero' })).rejects.toBeInstanceOf(
      SitebuilderValidationError
    );
  });
});
