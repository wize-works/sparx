'use client';

import * as React from 'react';
import { Menu } from 'lucide-react';
import { Button } from '../primitives/button';
import { Drawer, DrawerContent, DrawerTitle } from '../overlay/drawer';
import { Sidebar } from '../navigation/sidebar';

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
//
// The `sidebar` prop is rendered in BOTH the desktop sidebar and the
// mobile drawer, so pass content that renders identically in either
// context (header + nav + footer composed from SidebarHeader / nav
// sections / SidebarFooter is the intended shape).

export interface SidebarAppShellProps {
  /**
   * Contents of the sidebar — typically `<SidebarHeader>`, a nav region,
   * and `<SidebarFooter>`. Rendered in both the desktop sidebar and the
   * mobile drawer.
   */
  sidebar: React.ReactNode;
  /** Left-aligned header content (e.g. breadcrumbs). */
  headerStart?: React.ReactNode;
  /** Right-aligned content for the top header (user menu, etc). */
  headerActions?: React.ReactNode;
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
  children: React.ReactNode;
}

export function SidebarAppShell({
  sidebar,
  headerStart,
  headerActions,
  pathname,
  mobileNavLabel = 'Primary navigation',
  children,
}: SidebarAppShellProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const isFirstRender = React.useRef(true);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setMobileNavOpen(false);
    contentRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-[var(--color-bg-surface)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--color-text-primary)] focus:shadow-md focus:ring-2 focus:ring-[var(--color-border-focus)] focus:outline-none"
      >
        Skip to content
      </a>

      <Sidebar className="hidden md:flex">{sidebar}</Sidebar>

      <Drawer open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DrawerContent side="left" className="flex w-72 max-w-[85vw] flex-col gap-1 p-3" hideClose>
          <DrawerTitle className="sr-only">{mobileNavLabel}</DrawerTitle>
          {sidebar}
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
        <div
          ref={contentRef}
          id="main-content"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto focus:outline-none"
        >
          {children}
        </div>
      </main>
    </div>
  );
}
