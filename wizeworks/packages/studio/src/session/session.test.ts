import { describe, expect, it } from 'vitest';
import type { Node } from '@wizeworks/silicaui-html';
import { walk } from '@wizeworks/silicaui-html';
import { StudioSession } from './session';
import { componentDoc, layoutDoc, themeDoc } from '../testing/fixtures';

const CONTEXT = { propertyId: 'property-1', layoutId: 'layout-1', themeId: 'theme-1' };

/** A stored tree of the shape the database really holds for 20 of 34 layouts:
 *  correct in every way except that no node carries an id. */
function idFree(): Node {
  const strip = (node: Node): Node => {
    if (node.kind !== 'element') return node;
    const { id: _id, ...rest } = node;
    return {
      ...rest,
      children: (node.children ?? []).map((c) => (typeof c === 'string' ? c : strip(c))),
    };
  };
  return strip(layoutDoc().root);
}

function ids(root: Node): string[] {
  const found: string[] = [];
  walk(root, (n) => {
    if (n.kind === 'outlet') return;
    const id = (n as { id?: string }).id;
    if (id) found.push(id);
  });
  return found;
}

describe('opening a document that was stored without ids', () => {
  it('gives every node one, so the Navigator and the canvas can address it', () => {
    // Without this the layout builder draws a full header and footer over a Layers
    // rail reading "Nothing here yet", and no click on the canvas selects anything —
    // the editor is inert and nothing anywhere reports a problem.
    const session = new StudioSession(CONTEXT);
    const stored = idFree();
    expect(ids(stored)).toHaveLength(0);

    const store = session.open(layoutDoc({ root: stored }));
    const healed = ids(store.current.root);

    expect(healed.length).toBeGreaterThan(0);
    expect(new Set(healed).size).toBe(healed.length);
  });

  it('opens clean, so healing is not mistaken for the author having edited', () => {
    const session = new StudioSession(CONTEXT);
    const store = session.open(layoutDoc({ root: idFree() }));
    expect(store.dirty).toBe(false);
  });

  it('leaves the ids of a healthy tree exactly as they were', () => {
    // Re-minting would sever every React key, every drop target, and the
    // correspondence a blueprint merge keys on.
    const session = new StudioSession(CONTEXT);
    const doc = layoutDoc();
    const before = ids(doc.root);

    const store = session.open(doc);
    expect(ids(store.current.root)).toEqual(before);
  });

  it('does not touch a document that has no tree', () => {
    const session = new StudioSession(CONTEXT);
    const doc = themeDoc();
    expect(session.open(doc).current).toBe(doc);
  });

  it('hands the SAME store to a second pane, healed once', () => {
    const session = new StudioSession(CONTEXT);
    const first = session.open(layoutDoc({ root: idFree() }));
    const second = session.open(layoutDoc({ root: idFree() }));
    expect(second).toBe(first);
    expect(ids(second.current.root)).toEqual(ids(first.current.root));
  });
});

describe('watching everything a canvas resolves through', () => {
  // A canvas resolves theme → chrome → saved pieces out of the session, and the
  // session is ONE object for the life of the site. Nothing about that object's
  // identity moves when its interior does, so a canvas memoized on it alone
  // answers once and never again: a piece saved a moment ago renders as "This
  // saved design is no longer available", and a token edited in the theme pane
  // never reaches an open page. This counter is what a canvas depends on instead.

  it('moves when the saved-piece library lands', () => {
    const session = new StudioSession(CONTEXT);
    let heard = 0;
    session.subscribeResolution(() => {
      heard += 1;
    });
    const before = session.getResolutionVersion();

    session.loadLibrary([componentDoc({ id: 'tenant:welcome_band', name: 'Welcome band' })]);

    expect(session.getResolutionVersion()).toBeGreaterThan(before);
    expect(heard).toBe(1);
    expect(session.symbols()['tenant:welcome_band']?.name).toBe('Welcome band');
  });

  it("gives back the author's own note about a piece", () => {
    // The piece's manage screen asks "What it's for" and then promises the answer
    // shows up "in this list and in the editor's Add panel". The Add panel reads it
    // through here, because `symbols()` narrows a piece to what the canvas needs.
    const session = new StudioSession(CONTEXT);
    session.loadLibrary([
      componentDoc({ id: 'tenant:contact_form', note: 'The contact form. Bottom of Contact.' }),
      componentDoc({ id: 'tenant:plain', note: null }),
      componentDoc({ id: 'tenant:blank', note: '   ' }),
    ]);

    expect(session.pieceNote('tenant:contact_form')).toBe('The contact form. Bottom of Contact.');
    // Nothing written, whitespace, and a piece that was never loaded all read the
    // same way: no note. The palette falls back to its own sentence for all three.
    expect(session.pieceNote('tenant:plain')).toBeUndefined();
    expect(session.pieceNote('tenant:blank')).toBeUndefined();
    expect(session.pieceNote('tenant:never_loaded')).toBeUndefined();
  });

  it('prefers an OPEN piece over the loaded library copy', () => {
    // Same live-first rule as `symbols()`, and for the same reason: the library is
    // loaded once per session, so a piece opened afterwards holds the fresher copy.
    // Insert must read that one, or the rail describes a piece as it was on load.
    const session = new StudioSession(CONTEXT);
    session.loadLibrary([componentDoc({ id: 'tenant:contact_form', note: 'Old words' })]);
    session.open(componentDoc({ id: 'tenant:contact_form', note: 'New words' }));

    expect(session.pieceNote('tenant:contact_form')).toBe('New words');
  });

  it('moves on EVERY edit in another pane, not just the first', () => {
    // The dirty-set channel deliberately publishes once, when a document goes
    // from clean to dirty. A page canvas repainting on the first keystroke in the
    // theme pane and then freezing is worse than not repainting at all.
    const session = new StudioSession(CONTEXT);
    const theme = session.open(themeDoc());
    let heard = 0;
    session.subscribeResolution(() => {
      heard += 1;
    });

    for (const value of ['#111111', '#222222', '#333333']) {
      theme.apply('Primary', [
        { kind: 'theme.setToken', mode: 'light', token: '--color-primary', value },
      ]);
    }

    expect(heard).toBe(3);
  });

  it('stops calling a listener that unsubscribed', () => {
    const session = new StudioSession(CONTEXT);
    let heard = 0;
    const off = session.subscribeResolution(() => {
      heard += 1;
    });
    session.loadLibrary([componentDoc()]);
    off();
    session.loadLibrary([componentDoc({ id: 'component-2' })]);
    expect(heard).toBe(1);
  });

  it('moves when the site changes which chrome or theme it wears', () => {
    const session = new StudioSession(CONTEXT);
    const before = session.getResolutionVersion();
    session.setContext({ propertyId: 'property-1', layoutId: 'layout-2', themeId: 'theme-1' });
    expect(session.getResolutionVersion()).toBeGreaterThan(before);
  });
});
