'use client';

import * as React from 'react';
import { Menu } from 'lucide-react';
import { Button } from '../primitives/button';
import { Drawer, DrawerContent, DrawerTitle } from '../overlay/drawer';
import { useMediaQuery } from '../../hooks/use-media-query';

// SidebarAppShell is the canonical authenticated-app layout: pinned sidebar +
// top header + scrolling content. It owns the responsive concerns that
// every consumer would otherwise re-implement:
//
//   - Viewport-locked height (h-screen + overflow-hidden) so only the
//     content region scrolls; the sidebar and header stay parked.
//   - Skip-to-content link as the first focusable element (WCAG 2.4.1).
//     Target id is `main-content` — do not collide with it elsewhere.
//   - Focus moves to the content region on `pathname` change so keyboard
//     users don't have to re-traverse the sidebar (WCAG 2.4.3).
//   - Below `md`, the desktop sidebar hides and a hamburger in the header
//     opens an equivalent left-slide Drawer with the same nav tree. The
//     drawer auto-closes on `pathname` change.
//   - When `detail` is present:
//       md+: the main region splits into [content | drag handle | detail],
//            with a user-resizable ratio persisted in localStorage.
//       <md: detail renders as a right-slide overlay Drawer.
//     The detail content itself is opaque to the shell — it owns its own
//     header chrome (close button etc.) and calls `onDetailClose` to
//     dismiss.
//
// Navigation is a two-column model on desktop (docs/24 §5): a thin icon
// `rail` (module switching + Home/Search/Settings) and a `panel` whose
// contents follow context (a module's sections, or Favorites/Recents at the
// platform level). Below `md` both collapse into the hamburger Drawer, which
// renders the single vertical `mobileNav` tree instead.

const DETAIL_WIDTH_STORAGE_KEY = 'sparx:detail-width';
const DETAIL_WIDTH_DEFAULT = 40; // percent of main area
const DETAIL_WIDTH_MIN = 25;
const DETAIL_WIDTH_MAX = 65;

export interface SidebarAppShellProps {
  /** Desktop icon rail (md+) — module switcher + Home/Search/Settings. */
  rail: React.ReactNode;
  /** Desktop contextual panel (md+) — sections, or Favorites/Recents. */
  panel: React.ReactNode;
  /** Vertical nav tree rendered in the mobile drawer (below md). */
  mobileNav: React.ReactNode;
  /** Left-aligned header content (e.g. breadcrumbs). */
  headerStart?: React.ReactNode;
  /** Right-aligned content for the top header (user menu, etc). */
  headerActions?: React.ReactNode;
  /**
   * Optional right-pane content (a detail view, comments, etc.). When
   * present, the main region splits on md+ and renders as a Drawer
   * overlay below md. Pass `null` / undefined when there's nothing to
   * show — the shell handles the empty state.
   */
  detail?: React.ReactNode;
  /**
   * Fires when the user dismisses the detail pane (close button, ESC,
   * mobile drawer swipe-close, etc.). The caller is expected to clear
   * whatever state opened the detail (typically a URL query param).
   */
  onDetailClose?: () => void;
  /**
   * Current route pathname. When this changes the mobile drawer closes
   * and focus moves to the content region. Pass `usePathname()` from
   * `next/navigation`.
   */
  pathname?: string | null;
  /**
   * a11y label for the mobile drawer + hamburger trigger.
   * Defaults to "Primary navigation".
   */
  mobileNavLabel?: string;
  /** a11y label for the detail mobile overlay. Defaults to "Detail view". */
  detailMobileLabel?: string;
  children: React.ReactNode;
}

export function SidebarAppShell({
  rail,
  panel,
  mobileNav,
  headerStart,
  headerActions,
  detail,
  onDetailClose,
  pathname,
  mobileNavLabel = 'Primary navigation',
  detailMobileLabel = 'Detail view',
  children,
}: SidebarAppShellProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const isFirstRender = React.useRef(true);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const detailWidth = useDetailWidth();

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setMobileNavOpen(false);
    contentRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  const showInlineDetail = Boolean(detail) && isDesktop;
  const showOverlayDetail = Boolean(detail) && !isDesktop;

  return (
    <div className="flex h-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-[var(--color-bg-surface)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--color-text-primary)] focus:shadow-md focus:ring-2 focus:ring-[var(--color-border-focus)] focus:outline-none"
      >
        Skip to content
      </a>

      <div className="hidden md:flex">
        <nav
          aria-label={mobileNavLabel}
          className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-[var(--color-border-default)] bg-[var(--color-bg-surface)] py-2"
        >
          {rail}
        </nav>
        <div className="flex h-full w-60 shrink-0 flex-col border-r border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
          {panel}
        </div>
      </div>

      <Drawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DrawerContent side="left" className="flex w-72 max-w-[85vw] flex-col gap-1 p-3" hideClose>
          <DrawerTitle className="sr-only">{mobileNavLabel}</DrawerTitle>
          {mobileNav}
        </DrawerContent>
      </Drawer>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4">
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            aria-label={`Open ${mobileNavLabel.toLowerCase()}`}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="h-4 w-4" />
          </Button>
          {headerStart ? (
            <div className="min-w-0 flex-1">{headerStart}</div>
          ) : (
            <div className="flex-1" />
          )}
          {headerActions ? (
            <div className="flex shrink-0 items-center gap-1">{headerActions}</div>
          ) : null}
        </header>

        {showInlineDetail ? (
          <div className="flex min-h-0 flex-1">
            <div
              ref={contentRef}
              id="main-content"
              tabIndex={-1}
              style={{ flexBasis: `${100 - detailWidth.value}%` }}
              className="min-w-0 overflow-y-auto focus:outline-none"
            >
              {children}
            </div>
            <DetailDragHandle width={detailWidth} />
            <aside
              aria-label={detailMobileLabel}
              style={{ flexBasis: `${detailWidth.value}%` }}
              className="min-w-0 overflow-y-auto border-l border-[var(--color-border-default)] bg-[var(--color-bg-surface)]"
            >
              {detail}
            </aside>
          </div>
        ) : (
          <div
            ref={contentRef}
            id="main-content"
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto focus:outline-none"
          >
            {children}
          </div>
        )}
      </main>

      {showOverlayDetail && (
        <Drawer
          open={showOverlayDetail}
          onOpenChange={(open) => {
            if (!open) onDetailClose?.();
          }}
        >
          <DrawerContent
            side="right"
            className="flex w-full max-w-md flex-col overflow-y-auto"
            hideClose
          >
            <DrawerTitle className="sr-only">{detailMobileLabel}</DrawerTitle>
            {detail}
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

// ── Resizable detail width ─────────────────────────────────

interface DetailWidthState {
  value: number;
  setValue: (next: number) => void;
}

function useDetailWidth(): DetailWidthState {
  const [value, setValueState] = React.useState<number>(DETAIL_WIDTH_DEFAULT);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DETAIL_WIDTH_STORAGE_KEY);
      if (raw) {
        const n = Number.parseFloat(raw);
        if (Number.isFinite(n) && n >= DETAIL_WIDTH_MIN && n <= DETAIL_WIDTH_MAX) {
          setValueState(n);
        }
      }
    } catch {
      // storage disabled — fall back to default
    }
  }, []);

  const setValue = React.useCallback((next: number) => {
    const clamped = Math.min(DETAIL_WIDTH_MAX, Math.max(DETAIL_WIDTH_MIN, next));
    setValueState(clamped);
    try {
      window.localStorage.setItem(DETAIL_WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      // ignore — in-memory state still updates
    }
  }, []);

  return { value, setValue };
}

function DetailDragHandle({ width }: { width: DetailWidthState }) {
  const startRef = React.useRef<{ clientX: number; widthAtStart: number } | null>(null);

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    startRef.current = { clientX: e.clientX, widthAtStart: width.value };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev: MouseEvent) {
      if (!startRef.current) return;
      const containerWidth = e.currentTarget.parentElement?.clientWidth ?? 0;
      if (containerWidth === 0) return;
      const deltaPx = ev.clientX - startRef.current.clientX;
      // Dragging right shrinks the detail pane (detail is on the right).
      const deltaPct = (deltaPx / containerWidth) * 100;
      width.setValue(startRef.current.widthAtStart - deltaPct);
    }
    function onUp() {
      startRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      width.setValue(width.value + 2);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      width.setValue(width.value - 2);
    }
  }

  // WAI-ARIA: `role="separator"` with `aria-valuenow` IS interactive (it's
  // a resize handle / window splitter). jsx-a11y's rule doesn't model this
  // exception — disable the two affected rules on the element.
  return (
    /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label="Resize detail pane"
      aria-valuemin={DETAIL_WIDTH_MIN}
      aria-valuemax={DETAIL_WIDTH_MAX}
      aria-valuenow={width.value}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
      className="group relative w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-[var(--color-border-default)] focus-visible:bg-[var(--color-border-focus)] focus-visible:outline-none"
    >
      <div className="absolute inset-y-0 -right-1 -left-1" />
    </div>
    /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  );
}
