'use client';

// Site Builder preview transport (Phase 2 §1).
//
// Mounted once in the storefront root layout. INERT on the live storefront — it
// only wakes up when the page is rendered inside the dashboard's preview iframe,
// detected by the `?sparxSitePreview=` token the Site Builder appends. With no
// token it renders null and attaches no listeners, so the public site pays
// nothing and can never be driven by a stray postMessage.
//
// In preview it opens a postMessage channel with the parent (the Site Builder):
//
//   parent → storefront
//     { type:'sparx-preview-theme',     css }                 live token CSS
//     { type:'sparx-preview-mode',      mode }                light/dark flip
//     { type:'sparx-highlight-section', sectionId|null }      hover / select ring
//   storefront → parent
//     { type:'sparx-preview-ready' }                          handshake on mount
//     { type:'sparx-section-selected',  sectionId, sectionType }   canvas click
//
// Live theme CSS lands in <style id="sparx-live">, appended AFTER the SSR theme
// block: its `:root` declarations win for whatever tokens it sets, while every
// untouched token keeps its server-rendered (brand-correct) value. Section
// selection is delegated off a single capture-phase click listener, so the
// section markup (data-section-id / data-section-type — see section-renderer)
// stays a pure server component.

import * as React from 'react';

const LIVE_STYLE_ID = 'sparx-live';
const SELECTED_CLASS = 'sparx-section-selected';

function isPreview(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('sparxSitePreview');
}

type InboundMessage =
  | { type: 'sparx-preview-theme'; css: string }
  | { type: 'sparx-preview-mode'; mode: 'light' | 'dark' }
  | { type: 'sparx-highlight-section'; sectionId: string | null };

// Validate + narrow an untrusted postMessage payload to one of our messages.
// Anything that doesn't match a known shape is ignored.
function asInbound(data: unknown): InboundMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case 'sparx-preview-theme':
      return typeof m.css === 'string' ? { type: m.type, css: m.css } : null;
    case 'sparx-preview-mode':
      return m.mode === 'light' || m.mode === 'dark' ? { type: m.type, mode: m.mode } : null;
    case 'sparx-highlight-section':
      return typeof m.sectionId === 'string' || m.sectionId === null
        ? { type: m.type, sectionId: m.sectionId }
        : null;
    default:
      return null;
  }
}

function injectThemeCss(css: string): void {
  let el = document.getElementById(LIVE_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = LIVE_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function highlightSection(sectionId: string | null): void {
  const prev = document.querySelector(`.${SELECTED_CLASS}`);
  if (prev) prev.classList.remove(SELECTED_CLASS);
  if (!sectionId) return;
  const next = document.querySelector(`[data-section-id="${CSS.escape(sectionId)}"]`);
  if (next) next.classList.add(SELECTED_CLASS);
}

export function PreviewBridge(): null {
  React.useEffect(() => {
    if (!isPreview()) return;
    const root = document.documentElement;
    root.setAttribute('data-sparx-preview', '');

    const onMessage = (e: MessageEvent) => {
      const msg = asInbound(e.data);
      if (!msg) return;
      switch (msg.type) {
        case 'sparx-preview-theme':
          injectThemeCss(msg.css);
          break;
        case 'sparx-preview-mode':
          root.setAttribute('data-theme', msg.mode);
          break;
        case 'sparx-highlight-section':
          highlightSection(msg.sectionId);
          break;
      }
    };

    // Capture phase: intercept a section click before any inner link/button
    // acts — in the editor, clicking a section SELECTS it, never navigates.
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const el = target?.closest('[data-section-id]') as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const sectionId = el.getAttribute('data-section-id') ?? '';
      const sectionType = el.getAttribute('data-section-type') ?? '';
      highlightSection(sectionId);
      window.parent?.postMessage({ type: 'sparx-section-selected', sectionId, sectionType }, '*');
    };

    window.addEventListener('message', onMessage);
    document.addEventListener('click', onClick, true);
    window.parent?.postMessage({ type: 'sparx-preview-ready' }, '*');

    return () => {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('click', onClick, true);
      root.removeAttribute('data-sparx-preview');
    };
  }, []);

  return null;
}
