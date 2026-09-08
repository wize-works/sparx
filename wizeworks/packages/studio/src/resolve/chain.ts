// Resolving theme → layout → page for a canvas.
//
// A page canvas has to draw the page as a visitor will see it, which means inside
// its chrome and in its theme — but only the page BODY is editable there. The
// chrome is context: real, live, and inert. This is the one place that
// distinction is computed, so no rail has to guess which half it is looking at.
//
// Nothing here is stored. The chain is resolved at draw time from whatever the
// session currently holds, which is why a token edit in the theme pane repaints a
// page pane without either of them knowing about the other.

import { composeFrame, type Node, type SymbolDef, type Theme } from '@wizeworks/silicaui-html';
import type { LayoutDoc, PageDoc, StudioDoc, TreeDoc } from '../documents/types';
import { NO_FRAME } from '../documents/types';
import { idOf } from '../tree/walk';
import type { StudioSession } from '../session/session';

export interface CanvasResolution {
  /** The tree to draw. */
  root: Node;
  /** The token set the canvas paints its `[data-theme]` island from. */
  theme: Theme;
  /**
   * The id of the subtree the author may edit. Everything outside it is context —
   * clicks select nothing, drops are refused, and the Navigator does not list it.
   * Undefined means the whole tree is editable.
   */
  editableRootId?: string;
  /** Saved-piece masters, for expanding the instances the tree holds. */
  symbols: Record<string, SymbolDef>;
  /** Set when the page asked for chrome the session could not find — so the canvas
   *  can say so instead of quietly drawing a page with no header. */
  missingLayoutId?: string;
}

export interface ResolveOptions {
  /**
   * The theme to use when the site wears none.
   *
   * It must be THE SAME VALUE the storefront falls back to, because the canvas
   * promising a color the served page does not paint is the one way a visual
   * builder can be confidently wrong. It used to say "derived from the tenant's
   * brand by the app" and the app duly derived one, months after the storefront
   * had stopped: an owner designed against #c77618 and shipped #e04631, with
   * nothing on either screen to say so (issue 271).
   */
  fallbackTheme: Theme;
}

/** Resolve whatever this document needs to be drawn on a canvas. */
export function resolveCanvas(
  session: StudioSession,
  doc: TreeDoc,
  opts: ResolveOptions
): CanvasResolution {
  const theme = resolveTheme(session, opts.fallbackTheme);
  const symbols = session.symbols();

  if (doc.kind !== 'page') {
    // A layout and a component are drawn as themselves. The layout's Outlet renders
    // as a labelled placeholder — there is no page to put in it, and picking one
    // would make the chrome look right against a body it does not always wrap.
    return { root: doc.root, theme, symbols };
  }

  const chrome = resolveChrome(session, doc);
  if (chrome.kind === 'bare') {
    return { root: doc.root, theme, symbols };
  }
  if (chrome.kind === 'missing') {
    return { root: doc.root, theme, symbols, missingLayoutId: chrome.layoutId };
  }

  const editableRootId = idOf(doc.root);
  return {
    // `composeFrame` splices the page body in at the Outlet, so the page's own root
    // object — and its id — survives into the composed tree. That id is what tells
    // the canvas which half it may edit.
    root: composeFrame(chrome.root, doc.root),
    theme,
    ...(editableRootId ? { editableRootId } : {}),
    symbols,
  };
}

type ChromeResolution =
  { kind: 'bare' } | { kind: 'found'; root: Node } | { kind: 'missing'; layoutId: string };

/**
 * Which chrome wraps this page.
 *
 * A dangling layout id resolves to NO chrome and is REPORTED, matching what the
 * store does: silently restoring the site default would put back the header the
 * author deliberately moved this page away from.
 */
function resolveChrome(session: StudioSession, page: PageDoc): ChromeResolution {
  if (page.frame === NO_FRAME) return { kind: 'bare' };

  if (page.frame === null) {
    const layout = session.layoutStore()?.current;
    return layout ? { kind: 'found', root: layout.root } : { kind: 'bare' };
  }

  const store = session.store({ kind: 'layout', id: page.frame });
  const layout = store?.current as LayoutDoc | undefined;
  return layout ? { kind: 'found', root: layout.root } : { kind: 'missing', layoutId: page.frame };
}

/** The theme the site currently wears, live from its store. */
export function resolveTheme(session: StudioSession, fallback: Theme): Theme {
  return session.themeStore()?.current.theme ?? fallback;
}

/** Does this document participate in the site chain at all? Email does not. */
export function inheritsSiteTheme(doc: StudioDoc): boolean {
  return doc.kind === 'layout' || doc.kind === 'page' || doc.kind === 'component';
}
