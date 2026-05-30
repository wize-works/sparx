'use client';

// Mobile navigation — hamburger that opens a left slide-in panel. Only shown
// on narrow viewports (the desktop .sf-nav is hidden by media query). Closes
// on route selection, Escape, and backdrop click.

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { NavItem } from './site-header';

export function MobileNav({ nav, brand }: { nav: NavItem[]; brand: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="sf-iconbtn sf-nav__toggle"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {open ? (
        <div className="sf-drawer-backdrop" role="presentation">
          <button
            type="button"
            aria-label="Close mobile navigation"
            className="sf-drawer-backdrop__close"
            onClick={() => setOpen(false)}
          />
          <nav className="sf-drawer-panel sf-drawer-panel--left" aria-label="Mobile navigation">
            <div className="sf-drawer-panel__head">
              <span className="sf-header__brand">{brand}</span>
              <button
                type="button"
                className="sf-iconbtn"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="sf-drawer-panel__links">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
