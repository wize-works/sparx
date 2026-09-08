import { describe, expect, it } from 'vitest';
import { isLayoutWrapper, layerRows, rowIcon, rowLabel } from './layer-tree';
import { el } from '../../testing/fixtures';

/** A footer as it really gets authored: three nested boxes before a word appears. */
const footer = () =>
  el('footer-root', [
    el('wrap', [el('cols', [el('col', [el('legal', ['© Bakery'], 'p')])])]),
    el('named', [el('inner', ['Hours'], 'span')]),
  ]);

describe('folding layout-only wrappers', () => {
  it('drops the scaffolding and lifts its children', () => {
    const simple = layerRows(footer(), { depth: 'simple' });
    const ids = simple.map((row) => row.id);
    // The three boxes exist on the canvas and are still every move's parent — they
    // just do not earn a row.
    expect(ids).not.toContain('wrap');
    expect(ids).not.toContain('cols');
    expect(ids).toContain('legal');
  });

  it('lists everything when asked to', () => {
    const all = layerRows(footer(), { depth: 'all' }).map((row) => row.id);
    expect(all).toContain('wrap');
    expect(all).toContain('cols');
  });

  it('keeps a wrapper that has a reason to be findable', () => {
    expect(isLayoutWrapper(el('x', [el('y')]))).toBe(true);
    expect(isLayoutWrapper({ ...el('x', [el('y')]), label: 'Hero' })).toBe(false);
    expect(isLayoutWrapper({ ...el('x', [el('y')]), locked: 'author' })).toBe(false);
    expect(isLayoutWrapper({ ...el('x', [el('y')]), instanceOf: 'sym' })).toBe(false);
    // Nothing inside it — folding would drop the only row for an empty box the
    // author is about to fill.
    expect(isLayoutWrapper(el('x', []))).toBe(false);
    // A section is a thing, not scaffolding, whatever it holds.
    expect(isLayoutWrapper(el('x', [el('y')], 'section'))).toBe(false);
  });

  it('never folds the root, even when it looks like a wrapper', () => {
    const rows = layerRows(el('root', [el('a', ['hi'])]), { depth: 'simple' });
    expect(rows[0]?.id).toBe('root');
  });
});

describe('naming a row', () => {
  it('prefers the name the author gave it', () => {
    expect(rowLabel({ ...el('x', ['Some words']), label: 'Hero' })).toBe('Hero');
  });

  it('falls back to the words it holds', () => {
    expect(rowLabel(el('x', ['Fresh bread daily']))).toBe('Fresh bread daily');
  });

  it('truncates a paragraph rather than blowing out the rail', () => {
    const long = 'a'.repeat(80);
    expect(rowLabel(el('x', [long])).length).toBeLessThanOrEqual(40);
  });

  it('says what kind of thing it is in plain English, never a tag', () => {
    // A business owner has no reason to know what an `<aside>` is.
    expect(rowLabel(el('x', [el('y')], 'aside'))).toBe('Side panel');
    expect(rowLabel(el('x', [el('y')], 'nav'))).toBe('Menu');
    expect(rowLabel(el('x', [el('y')], 'div'))).toBe('Group');
  });

  it('says which screens a row is for, when it is only for some', () => {
    // The header holds its menu twice and calls both of them "Menu": the row for
    // wider screens, and the panel behind the hamburger. Neither is on the canvas
    // at the width you are previewing, so an owner repointed one link and left the
    // other on the old destination (issue 269). These are the two real class sets.
    const panel = { ...el('x', [el('y')], 'nav'), class: 'flex flex-col gap-1 @md:hidden' };
    const wide = { ...el('x', [el('y')], 'nav'), class: 'hidden items-center gap-6 @md:flex' };
    expect(rowLabel(panel)).toBe('Menu on a phone');
    expect(rowLabel(wide)).toBe('Menu on a bigger screen');
  });

  it('works without silica’s container-query prefix too', () => {
    expect(rowLabel({ ...el('x', [el('y')], 'div'), class: 'md:hidden' })).toBe('Group on a phone');
    expect(rowLabel({ ...el('x', [el('y')], 'div'), class: 'hidden lg:block' })).toBe(
      'Group on a bigger screen'
    );
  });

  it('says nothing about screens when the classes do not', () => {
    // `hidden` on its own is a node the author hid outright, not a responsive rule,
    // and a node that is both hidden-from and shown-from is too tangled to summarise.
    expect(rowLabel({ ...el('x', [el('y')], 'nav'), class: 'flex gap-4' })).toBe('Menu');
    expect(rowLabel({ ...el('x', [el('y')], 'nav'), class: 'hidden' })).toBe('Menu');
    expect(rowLabel({ ...el('x', [el('y')], 'nav'), class: 'hidden @md:flex @lg:hidden' })).toBe(
      'Menu'
    );
  });

  it('leaves a name the author gave it alone', () => {
    // Their word for it beats ours, even when ours carries more information.
    const named = { ...el('x', [el('y')], 'nav'), class: '@md:hidden', label: 'Main menu' };
    expect(rowLabel(named)).toBe('Main menu');
  });

  it('calls a live region by its registry name, not its key', () => {
    // A shop owner adding customer questions to her product page got two rows
    // reading `commerce.product-revi…` and `commerce.product-que…` among rows called
    // "Product name" and "Shipping & delivery". The Inspector's identity header
    // showed the same string, truncated to `commerce….`
    const reviews = { ...el('x'), kind: 'host' as const, component: 'commerce.product-reviews' };
    const questions = {
      ...el('y'),
      kind: 'host' as const,
      component: 'commerce.product-questions',
    };
    expect(rowLabel(reviews)).toBe('Reviews and ratings');
    expect(rowLabel(questions)).toBe('Questions and answers');
  });

  it('shows an unregistered key as itself rather than hiding it', () => {
    // A key with no registry entry is a half-built core. Naming it "Live region"
    // would make that indistinguishable from a working one.
    const unknown = { ...el('x'), kind: 'host' as const, component: 'not.a.real.core' };
    expect(rowLabel(unknown)).toBe('not.a.real.core');
  });

  it('lets the author rename a live region', () => {
    // The registry name is a fallback, not a lock: `node.label` still wins.
    const renamed = {
      ...el('x'),
      kind: 'host' as const,
      component: 'commerce.product-questions',
      label: 'Ask the maker',
    };
    expect(rowLabel(renamed)).toBe('Ask the maker');
  });

  it('calls an instance by the name its author gave the piece', () => {
    // She typed "Send me a message" and the row said "Saved design" — a category
    // where her own word belonged, and the same word on every piece she saved.
    expect(rowLabel({ ...el('x'), instanceOf: 'sym' }, 'Send me a message')).toBe(
      'Send me a message'
    );
    expect(rowIcon({ ...el('x'), instanceOf: 'sym' })).toBe('shared');
  });

  it('falls back when the master has no name to give', () => {
    // Not loaded yet, or deleted. "Saved design" is then the honest answer; a
    // blank row would be worse than a category.
    expect(rowLabel({ ...el('x'), instanceOf: 'sym' })).toBe('Saved design');
    expect(rowLabel({ ...el('x'), instanceOf: 'sym' }, undefined)).toBe('Saved design');
  });

  it('still prefers a name the author put on the layer itself', () => {
    const named = { ...el('x'), instanceOf: 'sym', label: 'Footer band' };
    expect(rowLabel(named, 'Send me a message')).toBe('Footer band');
  });

  it('reads a bare box by what it does', () => {
    expect(rowIcon({ ...el('x', [el('y')]), class: 'grid grid-cols-2' })).toBe('grid');
    expect(rowIcon({ ...el('x', [el('y')]), class: 'flex gap-4' })).toBe('stack');
    expect(rowIcon(el('x', [el('y')]))).toBe('box');
  });
});

describe('instances', () => {
  it('does not list a master’s insides', () => {
    const root = el('root', [{ ...el('inst', [el('leaked', ['nope'])]), instanceOf: 'sym' }]);
    const ids = layerRows(root, { depth: 'all' }).map((row) => row.id);
    // Editing the master belongs to the component pane; rows here would offer
    // edits that either detach the piece or change every other instance silently.
    expect(ids).toContain('inst');
    expect(ids).not.toContain('leaked');
  });

  it('names each piece on the page, so three pieces are not three identical rows', () => {
    const root = el('root', [
      { ...el('a'), instanceOf: 'tenant:hours' },
      { ...el('b'), instanceOf: 'tenant:message' },
      { ...el('c'), instanceOf: 'tenant:unknown' },
    ]);
    const rows = layerRows(root, {
      depth: 'all',
      symbolNames: { 'tenant:hours': 'Opening hours', 'tenant:message': 'Send me a message' },
    });
    expect(rows.map((r) => r.label)).toEqual([
      'Group',
      'Opening hours',
      'Send me a message',
      // No name for this one, so the category is still the answer.
      'Saved design',
    ]);
  });
});

describe('editability', () => {
  it('marks rows outside the editable set', () => {
    const rows = layerRows(el('root', [el('a', ['x'])]), {
      depth: 'all',
      editableIds: new Set(['root']),
    });
    expect(rows.find((row) => row.id === 'root')?.editable).toBe(true);
    expect(rows.find((row) => row.id === 'a')?.editable).toBe(false);
  });
});
