'use client';

// One studio session per site, mounted above the dock.
//
// Above the dock is the whole point. A session held inside a pane would be one
// session per pane, which is exactly the arrangement this replaces — two panes,
// two drafts, two Saves. Held here, the theme pane and every page pane share one
// set of documents, so a color change repaints them all with nothing in between.
//
// It survives a pane closing and re-opening, and it survives a pane being torn
// into its own window: dockview moves the DOM, the React tree stays here.

'use no memo';

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { StudioSession, type SiteContext } from '@wizeworks/studio';
import { StudioProvider, type StudioHost } from '@wizeworks/studio/react';
import { MediaPickerProvider } from '../../surfaces/cms/media-picker';
import { useSilicaPieces } from './site-data';
import { tenantSymbolId } from './saved-pieces';
import { useActivePropertyId } from '../api/shell-data';
import { useStudioHostConfig } from './host';
import { toLayoutDoc, useLayout } from './layout-data';
import { useSiteSymbols } from './piece-data';
import { useStudioUnloadGuard } from './unsaved';

interface StudioBinding {
  session: StudioSession | null;
  host: StudioHost | null;
}

const StudioBindingContext = createContext<StudioBinding>({ session: null, host: null });

/**
 * The session for the active site.
 *
 * Re-created when the site changes, and only then. Switching sites is a different
 * business's documents — carrying the old session across would leave a page pane
 * resolving through another site's chrome, which looks like a rendering bug and
 * is a data one.
 */
export function StudioSessionProvider({ children }: { children: ReactNode }) {
  // The picture browser sits ABOVE the host, because the host is what hands it to
  // every builder: an image field that asks a business owner for a web address is
  // asking them to do a technical thing with their own photograph.
  return (
    <MediaPickerProvider source="content">
      <StudioBinding>{children}</StudioBinding>
    </MediaPickerProvider>
  );
}

function StudioBinding({ children }: { children: ReactNode }) {
  // The RESOLVED site, not the raw cookie. Without a session there is no
  // `<StudioProvider>`, and without that every builder pane waits forever on a
  // document that will never open — so a null here is the whole studio, dark.
  const propertyId = useActivePropertyId();
  const host = useStudioHostConfig();

  const sessionRef = useRef<{ propertyId: string | null; session: StudioSession } | null>(null);
  const session = useMemo(() => {
    if (!propertyId) return null;
    if (sessionRef.current?.propertyId === propertyId) return sessionRef.current.session;
    const context: SiteContext = { propertyId, layoutId: null, themeId: null };
    const next = new StudioSession(context);
    sessionRef.current = { propertyId, session: next };
    return next;
  }, [propertyId]);

  useSymbolLibrary(session, propertyId);
  useSiteChrome(session, propertyId);
  // A document can be unsaved with no pane open — the pane guards cannot see that.
  useStudioUnloadGuard(session);

  // ALL OR NOTHING, and the `host &&` is the load-bearing half. A pane asks this
  // context one question — "is there a session?" — and answers it by rendering
  // either a waiting state or something that reads the session through
  // `useSessionSnapshot`, which THROWS with no `<StudioProvider>` above it. The
  // provider needs BOTH halves, so handing out a session while the host is still
  // resolving hands every pane a yes to a question it is really asking about the
  // provider. Below, the two states are the same state.
  const binding = useMemo<StudioBinding>(
    () => (session && host ? { session, host } : { session: null, host: null }),
    [session, host]
  );

  if (!binding.session || !binding.host) {
    // Nothing to provide yet — the panes below render their own waiting state, and
    // an empty provider would make `useStudioSession()` throw inside them.
    return (
      <StudioBindingContext.Provider value={binding}>{children}</StudioBindingContext.Provider>
    );
  }

  return (
    <StudioBindingContext.Provider value={binding}>
      <StudioProvider session={binding.session} host={binding.host}>
        {children}
      </StudioProvider>
    </StudioBindingContext.Provider>
  );
}

/**
 * The session and host, or two nulls.
 *
 * Never one of each: a non-null `session` here means `<StudioProvider>` is mounted,
 * which is the only thing that makes `useSessionSnapshot`/`useDocSnapshot` safe to
 * call. Every pane gates on it for exactly that reason.
 */
export function useStudioBinding(): StudioBinding {
  return useContext(StudioBindingContext);
}

/**
 * Open the site's chrome into the session, once per site.
 *
 * Here rather than in the layout pane, because a PAGE pane needs it and the layout
 * pane may never be opened. Without it `resolveCanvas` finds no layout, falls back
 * to drawing the page bare, and an author sees a page with no header — which is
 * exactly what a page whose chrome was deliberately removed looks like. The two
 * states must not render the same, so the chrome is always loaded.
 *
 * `open` is idempotent, so the layout pane opening the same document later gets
 * this very store, unsaved edits and all.
 */
function useSiteChrome(session: StudioSession | null, propertyId: string | null): void {
  const layout = useLayout();
  const row = layout.data;

  useEffect(() => {
    if (!session || !row || !propertyId) return;
    session.open(toLayoutDoc(row, propertyId));
    const context = session.getSnapshot().context;
    if (context.layoutId === row.layoutId) return;
    session.setContext({ ...context, layoutId: row.layoutId });
  }, [session, row, propertyId]);
}

/**
 * Load every saved piece into the session, once per site.
 *
 * Up front, not per pane, and not only when the component builder is open. A layout
 * or a page can hold an instance of ANY saved piece, and a canvas that cannot find
 * the master draws "This saved design is no longer available" — which would be a lie
 * about a piece sitting safely in the library, and one an author would reasonably
 * act on by rebuilding something they never lost.
 *
 * TWO stores, one map, and the ids are the whole reason this is not one line:
 *
 *   · The tenant LIBRARY (`builder_components`) is shared by every site the business
 *     owns. A page refers to one under the derived id `tenant:<key>` — derived, not
 *     minted, because the same master is materialized into each site independently
 *     and a random id would differ per site and per session (`saved-pieces.ts`).
 *   · A site's OWN symbols (`builder_sites.silica_draft_symbols`) carry silica-minted
 *     ids with no colon, which is exactly what tells the two apart.
 *
 * Loading a library piece under its bare key — as this did at first — leaves every
 * `tenant:` instance on every page resolving to nothing. The canvas then reports the
 * piece as gone, which is the one failure mode this hook exists to prevent.
 */
function useSymbolLibrary(session: StudioSession | null, propertyId: string | null): void {
  const pieces = useSilicaPieces();
  const siteSymbols = useSiteSymbols();
  const library = pieces.data;
  const own = siteSymbols.data;

  useEffect(() => {
    if (!session || !propertyId || (!library && !own)) return;
    const base = { kind: 'component' as const, publishedAt: null, unpublished: false, propertyId };
    session.loadLibrary([
      ...Object.values(own ?? {}).map((symbol) => ({
        ...base,
        id: symbol.id,
        name: symbol.name,
        rev: 0,
        root: symbol.root,
      })),
      // The library LAST, so it wins on collision: a stale materialized copy can sit
      // in the stored per-site map from an earlier session, and drawing that instead
      // of the current master shows an old design on one site while the others moved
      // on. The library is the master by definition.
      ...(library ?? []).map((piece) => ({
        ...base,
        id: tenantSymbolId(piece.key),
        name: piece.name,
        rev: piece.version,
        root: piece.root,
        // Carried, not dropped. The piece's manage screen calls this "What it's
        // for" and tells the author it shows up "in this list and in the editor's
        // Add panel" — the Add panel is the studio's Insert rail, which reads it
        // back off the loaded document. Site-owned pieces above have no note to
        // carry: their store keeps a name and a tree and nothing else.
        note: piece.description,
      })),
    ]);
  }, [session, library, own, propertyId]);
}

/**
 * Keep the session's idea of what the site wears in step with the server's.
 *
 * Called by the panes that know — the theme pane when a look is applied, the
 * layout pane when it loads. The session cannot fetch: it is a plain object with
 * no transport, deliberately, so the same engine runs in a test with no server.
 */
export function useSyncSiteContext(patch: Partial<SiteContext>): void {
  const { session } = useStudioBinding();
  const themeId = patch.themeId ?? null;
  const layoutId = patch.layoutId ?? null;

  useEffect(() => {
    if (!session) return;
    const current = session.getSnapshot().context;
    const next: SiteContext = {
      propertyId: current.propertyId,
      themeId: patch.themeId === undefined ? current.themeId : themeId,
      layoutId: patch.layoutId === undefined ? current.layoutId : layoutId,
    };
    if (next.themeId === current.themeId && next.layoutId === current.layoutId) return;
    session.setContext(next);
    // `patch` is a fresh object every render; the two ids are what actually matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, themeId, layoutId]);
}
