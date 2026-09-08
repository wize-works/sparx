import { describe, expect, it } from 'vitest';
import type { Node as SilicaNode } from '@wizeworks/silicaui-html';
import { detachInstances, placesInstance } from './detach-instances';

const master = (): SilicaNode =>
  ({
    kind: 'element',
    tag: 'section',
    id: 'm-root',
    class: 'bg-primary',
    children: [{ kind: 'element', tag: 'h2', id: 'm-h', children: ['Opening hours'] }],
  }) as unknown as SilicaNode;

const page = (): SilicaNode =>
  ({
    kind: 'element',
    tag: 'div',
    id: 'page',
    children: [
      { kind: 'element', tag: 'div', id: 'keep', children: ['before'] },
      { kind: 'element', tag: 'div', id: 'i1', class: 'mt-8', instanceOf: 'tenant:hours' },
      { kind: 'element', tag: 'div', id: 'i2', instanceOf: 'tenant:hours' },
      { kind: 'element', tag: 'div', id: 'other', instanceOf: 'tenant:else' },
    ],
  }) as unknown as SilicaNode;

interface Placed {
  id?: string;
  tag?: string;
  class?: string;
  instanceOf?: string;
  children?: Placed[];
}
const kids = (root: SilicaNode): Placed[] => (root as unknown as Placed).children ?? [];

describe('deleting a piece that is still on a page', () => {
  it('inlines the design where the instance stood', () => {
    // The console's delete confirm promises the placements "stay exactly as they
    // look now". They did not: the master went, the instance stayed, and the page
    // rendered "This saved design is no longer available" where the work had been.
    const out = detachInstances(page(), 'tenant:hours', master())!;
    expect(out).toBeDefined();
    const [, first] = kids(out);
    expect(first?.instanceOf).toBeUndefined();
    expect(first?.tag).toBe('section');
    expect(first?.children?.[0]?.children?.[0]).toBe('Opening hours');
  });

  it('keeps the placement’s OWN classes, so nothing moves on the page', () => {
    const out = detachInstances(page(), 'tenant:hours', master())!;
    expect(kids(out)[1]?.class).toContain('mt-8');
    expect(kids(out)[1]?.class).toContain('bg-primary');
  });

  it('writes each class once, however many times the two sides share it', () => {
    // Save-as-piece leaves the instance wearing the very classes it handed to the
    // master, so a plain join wrote all of them twice — and every save-and-delete
    // round doubled it again.
    const shared = {
      kind: 'element',
      tag: 'div',
      id: 'r',
      children: [
        {
          kind: 'element',
          tag: 'div',
          id: 'i1',
          class: 'bg-primary px-6',
          instanceOf: 'tenant:hours',
        },
      ],
    } as unknown as SilicaNode;
    const out = detachInstances(shared, 'tenant:hours', master())!;
    const words = (kids(out)[0]?.class ?? '').split(' ');
    expect(words.filter((w) => w === 'bg-primary')).toHaveLength(1);
    expect(words).toContain('px-6');
  });

  it('gives each copy its own ids', () => {
    // The same piece twice on one page sharing ids is what silently disables
    // drag-reorder and trips React's duplicate-key guard.
    const out = detachInstances(page(), 'tenant:hours', master())!;
    expect(kids(out)[1]?.id).not.toBe(kids(out)[2]?.id);
    expect(kids(out)[1]?.children?.[0]?.id).not.toBe(kids(out)[2]?.children?.[0]?.id);
  });

  it('leaves every other piece’s instances alone', () => {
    const out = detachInstances(page(), 'tenant:hours', master())!;
    expect(kids(out)[3]?.instanceOf).toBe('tenant:else');
  });

  it('returns nothing when the page never placed it — no write, no churn', () => {
    expect(detachInstances(page(), 'tenant:absent', master())).toBeUndefined();
  });

  it('finds a placement nested deep, not just at the top', () => {
    const nested = {
      kind: 'element',
      tag: 'div',
      id: 'r',
      children: [{ kind: 'element', tag: 'div', id: 'w', children: [kids(page())[1]] }],
    } as unknown as SilicaNode;
    expect(placesInstance(nested, 'tenant:hours')).toBe(true);
    expect(placesInstance(nested, 'tenant:nope')).toBe(false);
    expect(detachInstances(nested, 'tenant:hours', master())).toBeDefined();
  });
});

describe('a page with nothing saved on it', () => {
  it('is skipped, not read through', () => {
    // Four pages on the development site have no tree at all. Reading through one
    // threw, which rolled back the whole delete — so a piece placed on two pages
    // could not be deleted and the failure surfaced as a bare 500.
    expect(detachInstances(null, 'tenant:hours', master())).toBeUndefined();
    expect(detachInstances(undefined, 'tenant:hours', master())).toBeUndefined();
    expect(placesInstance(null, 'tenant:hours')).toBe(false);
  });
});
