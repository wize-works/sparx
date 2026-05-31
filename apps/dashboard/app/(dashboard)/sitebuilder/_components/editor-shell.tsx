'use client';

// The Site Builder editor shell (Phase 2 §2).
//
// Lives in `/sitebuilder/layout.tsx`, so it PERSISTS across scope navigations
// (the contextual-panel module nav switches the child route = the inspector;
// this shell — and its canvas iframe — stay mounted). Scopes drive the canvas
// through `useEditorCanvas()` rather than embedding their own preview, so the
// live storefront never reloads when you hop Theme → Pages → Header & footer.
//
// Layout: docked inspector (the routed `children`) on the left, the one live
// canvas on the right. Below `lg` the two stack to a single column with an
// Edit / Preview switch (the builder must be usable on a phone). The canvas is
// shown only for scopes in CANVAS_SCOPES — Brand (self-contained board) and
// Publishing (versions/schedule) render full-width with no preview.
//
// The shell owns the §1 preview transport on the dashboard side: it posts
// `sparx-preview-mode` / `sparx-preview-theme` / `sparx-highlight-section` to
// the iframe and re-emits the last mode + theme CSS whenever the storefront
// announces `sparx-preview-ready` (so a reload/navigation never drops live
// state). It surfaces `sparx-section-selected` to subscribers.

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Button, ScrollArea, cn } from '@sparx/ui';
import { ExternalLink, Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react';

type Mode = 'light' | 'dark';

interface SectionSelection {
  sectionId: string;
  sectionType: string;
}

export interface EditorCanvasApi {
  /** Flip the preview between light and dark without reloading. */
  setMode: (mode: Mode) => void;
  /** Inject compiled theme CSS into the preview's <style id="sparx-live">. */
  setThemeCss: (css: string | null) => void;
  /** Outline a section in the canvas (null clears). */
  highlightSection: (sectionId: string | null) => void;
  /** Point the canvas at a storefront path (e.g. "/", "/about"). Reloads it. */
  setPreviewPath: (path: string) => void;
  /** Force a canvas reload (re-fetches the draft snapshot). */
  reload: () => void;
  /** Subscribe to in-canvas section clicks. Returns an unsubscribe fn. */
  onSectionSelected: (cb: (selection: SectionSelection) => void) => () => void;
  /** The mode the preview is currently showing. */
  mode: Mode;
}

const EditorCanvasContext = React.createContext<EditorCanvasApi | null>(null);

/** Access the persistent canvas from a scope inspector. Throws if used outside
 *  the Site Builder editor shell (a client component under /sitebuilder). */
export function useEditorCanvas(): EditorCanvasApi {
  const ctx = React.useContext(EditorCanvasContext);
  if (!ctx) throw new Error('useEditorCanvas must be used within the Site Builder EditorShell');
  return ctx;
}

// Scopes that show the live canvas. Grows as each scope migrates onto the
// persistent preview; un-listed routes render their inspector full-width. The
// module root ('/sitebuilder', the Overview) matches EXACTLY — it must not
// prefix-swallow its children; other scopes match themselves + descendants.
const ROOT = '/sitebuilder';
const CANVAS_SCOPES: readonly string[] = [
  ROOT,
  '/sitebuilder/design',
  '/sitebuilder/navigation',
  '/sitebuilder/homepage',
  '/sitebuilder/products',
  '/sitebuilder/collections',
  '/sitebuilder/pages',
];

function showsCanvas(pathname: string | null): boolean {
  if (!pathname) return false;
  return CANVAS_SCOPES.some((s) =>
    s === ROOT ? pathname === ROOT : pathname === s || pathname.startsWith(`${s}/`)
  );
}

const DEVICES = [
  { id: 'desktop', label: 'Desktop', icon: Monitor, width: null },
  { id: 'tablet', label: 'Tablet', icon: Tablet, width: 820 },
  { id: 'mobile', label: 'Mobile', icon: Smartphone, width: 390 },
] as const;

export interface EditorShellProps {
  slug: string;
  storefrontUrl: string;
  previewToken: string | null;
  /** Initial preview mode (from the site's appearance policy). */
  initialMode?: Mode;
  children: React.ReactNode;
}

export function EditorShell({
  slug,
  storefrontUrl,
  previewToken,
  initialMode = 'light',
  children,
}: EditorShellProps) {
  const pathname = usePathname();
  const canvasVisible = showsCanvas(pathname);

  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const subscribers = React.useRef(new Set<(s: SectionSelection) => void>());
  // Last live state, re-emitted on `sparx-preview-ready` so a reload/navigation
  // never drops the merchant's in-progress mode + theme edits.
  const lastMode = React.useRef<Mode>(initialMode);
  const lastCss = React.useRef<string | null>(null);

  const [mode, setModeState] = React.useState<Mode>(initialMode);
  const [device, setDevice] = React.useState<(typeof DEVICES)[number]['id']>('desktop');
  const [path, setPath] = React.useState('/');
  const [nonce, setNonce] = React.useState(0);
  // Mobile single-column: which pane is showing.
  const [mobilePane, setMobilePane] = React.useState<'edit' | 'preview'>('edit');

  const post = React.useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*');
  }, []);

  // Receive section selections + the readiness handshake from the canvas.
  React.useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as Record<string, unknown> | null;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'sparx-preview-ready') {
        // Re-assert live state the fresh document doesn't know about yet.
        post({ type: 'sparx-preview-mode', mode: lastMode.current });
        if (lastCss.current) post({ type: 'sparx-preview-theme', css: lastCss.current });
      } else if (
        data.type === 'sparx-section-selected' &&
        typeof data.sectionId === 'string' &&
        typeof data.sectionType === 'string'
      ) {
        const selection = { sectionId: data.sectionId, sectionType: data.sectionType };
        subscribers.current.forEach((cb) => cb(selection));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post]);

  const api = React.useMemo<EditorCanvasApi>(
    () => ({
      mode,
      setMode: (next) => {
        lastMode.current = next;
        setModeState(next);
        post({ type: 'sparx-preview-mode', mode: next });
      },
      setThemeCss: (css) => {
        lastCss.current = css;
        post({ type: 'sparx-preview-theme', css: css ?? '' });
      },
      highlightSection: (sectionId) => {
        post({ type: 'sparx-highlight-section', sectionId });
      },
      setPreviewPath: (next) => {
        setPath(next);
      },
      reload: () => {
        setNonce((n) => n + 1);
      },
      onSectionSelected: (cb) => {
        subscribers.current.add(cb);
        return () => subscribers.current.delete(cb);
      },
    }),
    [mode, post]
  );

  // Inspector full-width for non-canvas scopes (Brand, Publishing, and any route
  // not yet migrated). The context is still provided so those pages can mount
  // without special-casing.
  if (!canvasVisible) {
    return (
      <EditorCanvasContext.Provider value={api}>
        <div className="px-6 py-8 lg:px-10">{children}</div>
      </EditorCanvasContext.Provider>
    );
  }

  const query = `tenant=${encodeURIComponent(slug)}${
    previewToken ? `&sparxSitePreview=${encodeURIComponent(previewToken)}` : ''
  }`;
  const src = `${storefrontUrl}${path}?${query}&v=${nonce}`;
  const openUrl = `${storefrontUrl}${path}?${query}`;

  const canvas = (
    <Canvas
      iframeRef={iframeRef}
      src={src}
      openUrl={openUrl}
      nonce={nonce}
      device={device}
      onDevice={setDevice}
      mode={mode}
      onMode={api.setMode}
      onReload={api.reload}
    />
  );

  const inspector = (
    <ScrollArea className="h-full">
      <div className="px-5 py-6">{children}</div>
    </ScrollArea>
  );

  return (
    <EditorCanvasContext.Provider value={api}>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        {/* Mobile-only Edit/Preview switch; on lg both panes show side by side. */}
        <PaneSwitch pane={mobilePane} onChange={setMobilePane} className="lg:hidden" />
        <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(320px,400px)_1fr]">
          <div
            className={cn(
              'h-full min-h-0 border-[var(--color-border-default)] lg:block lg:border-r',
              mobilePane === 'edit' ? 'block' : 'hidden'
            )}
          >
            {inspector}
          </div>
          <div
            className={cn('h-full min-h-0 lg:block', mobilePane === 'preview' ? 'block' : 'hidden')}
          >
            {canvas}
          </div>
        </div>
      </div>
    </EditorCanvasContext.Provider>
  );
}

function Canvas({
  iframeRef,
  src,
  openUrl,
  nonce,
  device,
  onDevice,
  mode,
  onMode,
  onReload,
}: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  src: string;
  openUrl: string;
  nonce: number;
  device: (typeof DEVICES)[number]['id'];
  onDevice: (id: (typeof DEVICES)[number]['id']) => void;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onReload: () => void;
}) {
  const deviceWidth = DEVICES.find((d) => d.id === device)?.width ?? null;
  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-subtle)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border-default)] px-3 py-2">
        <div className="flex gap-0.5">
          {DEVICES.map((d) => {
            const Icon = d.icon;
            return (
              <Button
                key={d.id}
                size="sm"
                variant={device === d.id ? 'soft' : 'ghost'}
                onClick={() => onDevice(d.id)}
                aria-label={d.label}
                aria-pressed={device === d.id}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <ModeSwitch mode={mode} onChange={onMode} />
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={onReload}
          >
            Refresh
          </Button>
          <Button
            asChild
            size="sm"
            variant="ghost"
            leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
          >
            <a href={openUrl} target="_blank" rel="noreferrer">
              Open
            </a>
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto p-4">
        <iframe
          key={nonce}
          ref={iframeRef}
          title="Storefront preview"
          src={src}
          className="h-full w-full rounded-lg border border-[var(--color-border-default)] bg-white shadow-sm"
          style={deviceWidth ? { width: deviceWidth, maxWidth: '100%' } : undefined}
        />
      </div>
    </div>
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex rounded-md border border-[var(--color-border-default)] p-0.5">
      {(['light', 'dark'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          className={
            mode === m
              ? 'rounded bg-[var(--module-active)] px-2 py-0.5 text-xs text-white'
              : 'rounded px-2 py-0.5 text-xs text-[var(--color-text-muted)]'
          }
        >
          {m === 'light' ? '☀ Light' : '☾ Dark'}
        </button>
      ))}
    </div>
  );
}

function PaneSwitch({
  pane,
  onChange,
  className,
}: {
  pane: 'edit' | 'preview';
  onChange: (p: 'edit' | 'preview') => void;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-1 border-b border-[var(--color-border-default)] p-2', className)}>
      {(['edit', 'preview'] as const).map((p) => (
        <Button
          key={p}
          size="sm"
          variant={pane === p ? 'solid' : 'ghost'}
          onClick={() => onChange(p)}
          className="flex-1"
        >
          {p === 'edit' ? 'Edit' : 'Preview'}
        </Button>
      ))}
    </div>
  );
}
