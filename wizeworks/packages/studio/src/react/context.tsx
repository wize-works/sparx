'use client';

// Bridging the engine to React.
//
// Two contexts, deliberately separate. The SESSION is site-wide and every pane
// sees the same one; the STORE is the single document THIS pane is editing. A
// pane that conflated them would re-render on every keystroke in every other
// pane, which is the cost the session's own snapshot check exists to avoid.
//
// Everything reads through `useSyncExternalStore`, so a store handed a new
// snapshot re-renders exactly the components that asked for the part that moved.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { StudioDoc } from '../documents/types';
import type { DocSnapshot, DocumentStore } from '../session/document-store';
import type { SessionSnapshot, StudioSession } from '../session/session';
import { findNode, type AddressableNode } from '../tree/walk';
import { isTreeDoc } from '../documents/types';
import type { StudioHost } from './host';

const SessionContext = createContext<StudioSession | null>(null);
const HostContext = createContext<StudioHost | null>(null);
const StoreContext = createContext<DocumentStore | null>(null);

export function StudioProvider({
  session,
  host,
  children,
}: {
  session: StudioSession;
  host: StudioHost;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={session}>
      <HostContext.Provider value={host}>{children}</HostContext.Provider>
    </SessionContext.Provider>
  );
}

/** Scopes a subtree to one open document. One per builder pane. */
export function DocumentProvider({
  store,
  children,
}: {
  store: DocumentStore;
  children: ReactNode;
}) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStudioSession(): StudioSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useStudioSession must be used inside <StudioProvider>');
  return session;
}

/**
 * The host, or null where there is no provider.
 *
 * Not exported from the package's index: it exists for the few pieces that render
 * OUTSIDE an app — `StudioIcon` is used in every rail and inspector row, and a
 * throwing hook there would make the package untestable without an app around it,
 * which is exactly the property `host.ts` says it keeps.
 */
export function useHostOrNull(): StudioHost | null {
  return useContext(HostContext);
}

export function useStudioHost(): StudioHost {
  const host = useContext(HostContext);
  if (!host) throw new Error('useStudioHost must be used inside <StudioProvider>');
  return host;
}

/** Re-renders when the SET of dirty documents changes — never on a keystroke. */
export function useSessionSnapshot(): SessionSnapshot {
  const session = useStudioSession();
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

/**
 * A number that changes whenever anything OUTSIDE this pane's own document has
 * moved — the theme, the chrome, the saved-piece library.
 *
 * Put it in the dependency list of anything that resolves through the session.
 * Subscribing is not sufficient on its own: `resolveCanvas(session, doc)` is
 * memoized, and `session` is the same object forever, so without a value that
 * actually changes the memo holds its first answer for the life of the pane.
 */
export function useResolutionVersion(): number {
  const session = useStudioSession();
  return useSyncExternalStore(
    session.subscribeResolution,
    session.getResolutionVersion,
    session.getResolutionVersion
  );
}

export function useDocumentStore<D extends StudioDoc = StudioDoc>(): DocumentStore<D> {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useDocumentStore must be used inside <DocumentProvider>');
  return store as DocumentStore<D>;
}

export function useDocSnapshot<D extends StudioDoc = StudioDoc>(): DocSnapshot<D> {
  const store = useDocumentStore<D>();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** The document as it stands. Re-renders on every committed edit. */
export function useDoc<D extends StudioDoc = StudioDoc>(): D {
  return useDocSnapshot<D>().doc;
}

export function useSelection(): readonly string[] {
  return useDocSnapshot().selection;
}

/** The primary selected node, or undefined. */
export function useSelectedNode(): AddressableNode | undefined {
  const { doc, selection } = useDocSnapshot();
  const id = selection[0];
  return useMemo(() => {
    if (!id || !isTreeDoc(doc)) return undefined;
    return findNode(doc.root, id);
  }, [doc, id]);
}

/**
 * Every saved piece's name, keyed by the symbol id an instance references.
 *
 * The Navigator and the Inspector both name an instance row, and both used to
 * call it "Saved design" because the node carries only the id. The name has been
 * on the session all along — it is what the Add panel lists and what the canvas
 * resolves the design from — so this is the one lookup both share.
 *
 * `useResolutionVersion` is in the dependency list deliberately: the library
 * lives on the session, `session` is the same object forever, and a memo without
 * it would hold its first answer for the life of the pane — so a piece saved or
 * renamed mid-session would never reach the rows.
 */
export function useSymbolNames(): Readonly<Record<string, string>> {
  const session = useStudioSession();
  const version = useResolutionVersion();
  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, symbol] of Object.entries(session.symbols())) out[id] = symbol.name;
    return out;
    // `version` is the reason this recomputes; `session` never changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, version]);
}

export function useHistoryState(): { canUndo: boolean; canRedo: boolean } {
  const { canUndo, canRedo } = useDocSnapshot();
  return useMemo(() => ({ canUndo, canRedo }), [canUndo, canRedo]);
}

/** Whether this pane has work the server has not seen. */
export function useDirty(): boolean {
  return useDocSnapshot().dirty;
}

/**
 * Apply an edit to this pane's document.
 *
 * Handed back as a stable callback so a canvas can pass it to hundreds of nodes
 * without re-minting a handler per render.
 *
 * Pass `coalesce` — one key per control — to fold a continuous edit (a slider
 * drag, a color picked by eye) into a single undo step.
 */
export function useApply(): (
  label: string,
  ops: Parameters<DocumentStore['apply']>[1],
  coalesce?: string
) => boolean {
  const store = useDocumentStore();
  return useCallback((label, ops, coalesce) => store.apply(label, ops, coalesce), [store]);
}

export function useSelect(): (ids: readonly string[]) => void {
  const store = useDocumentStore();
  return useCallback((ids) => store.select(ids), [store]);
}
