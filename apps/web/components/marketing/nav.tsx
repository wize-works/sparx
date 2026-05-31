'use client';

import { useState } from 'react';
import { Button } from '@sparx/ui';
import { Wordmark } from './primitives';

const LINKS = ['Platform', 'Modules', 'Pricing', 'Docs', 'Customers'] as const;

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '20px',
          paddingBottom: '20px',
          paddingLeft: 'var(--gutter-page)',
          paddingRight: 'var(--gutter-page)',
          borderBottom: '1px solid var(--color-border-default)',
          backgroundColor: 'var(--color-bg-page)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'saturate(150%) blur(8px)',
          gap: '16px',
        }}
      >
        <Wordmark />

        <div
          className="mkt-hide-on-tablet"
          style={{ display: 'flex', alignItems: 'center', gap: '36px' }}
        >
          {LINKS.map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase()}`}
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 400,
                fontSize: '14px',
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                transition: 'color var(--transition-base)',
              }}
            >
              {link}
            </a>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="mkt-hide-on-mobile" style={{ display: 'inline-flex' }}>
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </span>
          <Button variant="solid" size="sm" style={{ backgroundColor: '#0A0A0A' }}>
            Start free
          </Button>
          <button
            type="button"
            className="mkt-tablet-down-only-flex"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            style={{
              width: 36,
              height: 36,
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-page)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>

      {open ? (
        <div className="mkt-mobile-drawer" style={{ display: 'flex' }}>
          {LINKS.map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase()}`}
              onClick={() => setOpen(false)}
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: '18px',
                color: 'var(--color-text-primary)',
                textDecoration: 'none',
                padding: '14px 0',
                borderBottom: '1px solid var(--color-border-default)',
              }}
            >
              {link}
            </a>
          ))}
          <a
            href="/signin"
            onClick={() => setOpen(false)}
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: '18px',
              color: 'var(--color-text-secondary)',
              textDecoration: 'none',
              padding: '14px 0',
            }}
          >
            Sign in
          </a>
        </div>
      ) : null}
    </>
  );
}

function MenuIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 7H21M3 12H21M3 17H21" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 5L19 19M5 19L19 5" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}
