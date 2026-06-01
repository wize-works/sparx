'use client';

// Live theme showcase — column 3 of the Brand & Theme center, and the merchant's
// THEME-EVALUATION surface. It's a dense component gallery (modelled on the
// daisyUI theme-builder board): every semantic colour, every control, every
// radius tier, depth, and type — all visible at once, themed by the merchant's
// compiled Token Model v2 (docs/33). The compiled CSS is SCOPED to
// `#sf-theme-preview` via buildThemeCssV2({ rootSelector }), so it styles only
// this preview (no iframe, no leakage), and everything reads `--sf-*` through the
// co-located `sfx-` classes exactly like the storefront does — so "what you see
// here" is "what the tokens render", spacing included.
//
// Layout is a balanced CSS-columns masonry: tiles of any height pack tightly with
// even column bottoms, so the board reads composed and never ragged. Content is
// generic and category-diverse on purpose — a theme evaluator must read as "any
// store, any vertical", not one industry.

import * as React from 'react';
import { Button } from '@sparx/ui';
import './theme-showcase.css';

type Mode = 'light' | 'dark';

// Preset/picker fonts that are Google-hosted — the only ones we can fetch for a
// true-to-life specimen. Anything else (e.g. Geist, system fonts) falls back to
// the --sf-font-fallback stack.
const GOOGLE_FONTS = new Set([
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Oswald',
  'Playfair Display',
  'Fraunces',
  'Nunito Sans',
  'IBM Plex Sans',
  'Merriweather',
  'Source Sans 3',
]);

const FONT_LINK_ID = 'sf-preview-fonts';

// Relative bar heights for the weekly-sales sparkline/chart (last bar is "hot").
const CHART = [34, 28, 46, 40, 58, 52, 70, 64, 82, 76, 96, 88];

// Load the active heading/body fonts so the preview types render in the real
// faces. One shared <link>, rewritten as the selection changes.
function useShowcaseFonts(heading: string | null, body: string | null) {
  React.useEffect(() => {
    const families = Array.from(
      new Set([heading, body].filter((f): f is string => !!f && GOOGLE_FONTS.has(f)))
    );
    if (families.length === 0) return;
    const href = `https://fonts.googleapis.com/css2?${families
      .map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700`)
      .join('&')}&display=swap`;
    let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = FONT_LINK_ID;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }, [heading, body]);
}

export interface ThemeShowcaseProps {
  /** Compiled, scoped theme CSS (buildThemeCssV2 with rootSelector '#sf-theme-preview'). */
  css: string;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  brandName: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  headingFont: string | null;
  bodyFont: string | null;
}

export function ThemeShowcase({
  css,
  mode,
  onModeChange,
  brandName,
  logoLightUrl,
  logoDarkUrl,
  headingFont,
  bodyFont,
}: ThemeShowcaseProps) {
  useShowcaseFonts(headingFont, bodyFont);
  const logoUrl = mode === 'dark' ? (logoDarkUrl ?? logoLightUrl) : logoLightUrl;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">Preview</span>
        <div className="flex rounded-md border border-[var(--color-border-default)] p-0.5">
          {(['light', 'dark'] as const).map((m) => (
            <Button
              key={m}
              size="xs"
              variant={mode === m ? 'soft' : 'ghost'}
              onClick={() => onModeChange(m)}
              aria-pressed={mode === m}
            >
              {m === 'light' ? '☀ Light' : '☾ Dark'}
            </Button>
          ))}
        </div>
      </div>

      {/* The compiled theme, scoped to this subtree only. */}
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] shadow-sm">
        <div id="sf-theme-preview" data-theme={mode}>
          {/* Storefront header chrome */}
          <header className="sfx-header">
            <span className="sfx-logo">
              {logoUrl ? (
                <img src={logoUrl} alt={brandName ?? 'Brand logo'} />
              ) : (
                (brandName ?? 'Your Brand')
              )}
            </span>
            <nav className="sfx-nav ml-1">
              <span className="sfx-nav-link">Shop</span>
              <span className="sfx-nav-link">Collections</span>
              <span className="sfx-nav-link">Journal</span>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <button className="sfx-pill" type="button">
                Search
              </button>
              <button className="sfx-btn sfx-btn-primary sfx-btn-sm" type="button">
                Cart · 2
              </button>
            </div>
          </header>

          <div className="sfx-board">
            <div className="sfx-masonry">
              {/* ── Typography specimen ─────────────────────────────────────── */}
              <Tile>
                <p className="sfx-eyebrow">Spring lookbook</p>
                <h3 className="sfx-h sfx-display">Designed to be lived in.</h3>
                <p className="sfx-body">
                  Considered pieces for every room, path, and pursuit — made to last and easy to
                  love.
                </p>
                <span className="sfx-link">Read the story →</span>
              </Tile>

              {/* ── Buttons (colour × treatment) ────────────────────────────── */}
              <Tile title="Buttons">
                <div className="sfx-cluster">
                  <button className="sfx-btn sfx-btn-primary" type="button">
                    Primary
                  </button>
                  <button className="sfx-btn sfx-btn-secondary" type="button">
                    Secondary
                  </button>
                  <button className="sfx-btn sfx-btn-accent" type="button">
                    Accent
                  </button>
                </div>
                <div className="sfx-cluster">
                  <button className="sfx-btn sfx-btn-soft-primary" type="button">
                    Soft
                  </button>
                  <button className="sfx-btn sfx-btn-outline" type="button">
                    Outline
                  </button>
                  <button className="sfx-btn sfx-btn-ghost" type="button">
                    Ghost
                  </button>
                </div>
              </Tile>

              {/* ── Badges & chips ──────────────────────────────────────────── */}
              <Tile title="Badges & tags">
                <div className="sfx-cluster">
                  <span className="sfx-badge sfx-badge-primary">Primary</span>
                  <span className="sfx-badge sfx-badge-info">Info</span>
                  <span className="sfx-badge sfx-badge-success">Success</span>
                  <span className="sfx-badge sfx-badge-warning">Warning</span>
                  <span className="sfx-badge sfx-badge-danger">Danger</span>
                  <span className="sfx-badge sfx-badge-neutral">Neutral</span>
                </div>
                <div className="sfx-cluster">
                  <span className="sfx-chip">
                    Shoes <span className="sfx-chip-x">×</span>
                  </span>
                  <span className="sfx-chip">
                    Bags <span className="sfx-chip-x">×</span>
                  </span>
                  <span className="sfx-chip">
                    Under $50 <span className="sfx-chip-x">×</span>
                  </span>
                </div>
              </Tile>

              {/* ── Alerts (status surfaces) ────────────────────────────────── */}
              <Tile title="Notifications">
                <div className="sfx-alert sfx-alert-info">You have 9 new messages.</div>
                <div className="sfx-alert sfx-alert-success">Payout of $2,310 is on its way.</div>
                <div className="sfx-alert sfx-alert-warning">Your domain renews in 6 days.</div>
                <div className="sfx-alert sfx-alert-danger">A payment was disputed.</div>
              </Tile>

              {/* ── Product card ────────────────────────────────────────────── */}
              <Tile>
                <div className="sfx-media">
                  <span className="sfx-cat absolute bottom-2 left-2">Apparel</span>
                  <span className="sfx-badge sfx-badge-danger absolute top-2 right-2">Sale</span>
                </div>
                <div className="sfx-cluster">
                  <span className="sfx-stars">★★★★★</span>
                  <span className="sfx-muted">(212)</span>
                </div>
                <h4 className="sfx-h sfx-h3">Alpine Wool Overcoat</h4>
                <div className="sfx-baseline">
                  <span className="sfx-price">$268</span>
                  <span className="sfx-price-was">$320</span>
                </div>
                <button className="sfx-btn sfx-btn-primary sfx-btn-block" type="button">
                  Add to cart
                </button>
              </Tile>

              {/* ── Revenue stat + sparkline ────────────────────────────────── */}
              <Tile>
                <span className="sfx-muted">May revenue</span>
                <div className="sfx-baseline">
                  <span className="sfx-stat-num">$48,250</span>
                  <span className="sfx-delta-up">↑ 21%</span>
                </div>
                <div className="sfx-bars">
                  {CHART.map((h, i) => (
                    <span
                      key={i}
                      className={`sfx-bar${i === CHART.length - 1 ? 'sfx-bar-hot' : ''}`}
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </Tile>

              {/* ── Weekly sales (chart + actions) ──────────────────────────── */}
              <Tile title="Weekly sales">
                <p className="sfx-muted">
                  Volume reached <strong>$12,450</strong> — up 15% on last week.
                </p>
                <div className="sfx-bars">
                  {CHART.map((h, i) => (
                    <span key={i} className="sfx-bar" style={{ height: `${h}%` }} />
                  ))}
                </div>
                <div className="sfx-cluster">
                  <button className="sfx-btn sfx-btn-soft-primary sfx-btn-sm" type="button">
                    Charts
                  </button>
                  <button className="sfx-btn sfx-btn-neutral sfx-btn-sm" type="button">
                    Details
                  </button>
                </div>
              </Tile>

              {/* ── Score ring + progress ───────────────────────────────────── */}
              <Tile title="Store health">
                <div className="sfx-between">
                  <div className="sfx-stack">
                    <span className="sfx-muted">Page score</span>
                    <span className="sfx-badge sfx-badge-success w-fit">All good</span>
                  </div>
                  <Ring percent={91} />
                </div>
                <div className="sfx-stack">
                  <div className="sfx-between">
                    <span className="sfx-muted">Setup checklist</span>
                    <span className="sfx-muted">4 / 6</span>
                  </div>
                  <div className="sfx-progress">
                    <span style={{ width: '66%' }} />
                  </div>
                </div>
              </Tile>

              {/* ── Recent orders (status badges) ───────────────────────────── */}
              <Tile title="Recent orders">
                <div className="sfx-stack">
                  <OrderRow name="Naomi Brooks" tone="success" status="Paid" />
                  <OrderRow name="Theo Marsh" tone="info" status="Shipped" />
                  <OrderRow name="Priya Nair" tone="warning" status="Pending" />
                  <OrderRow name="Marco Diaz" tone="danger" status="Refunded" />
                </div>
              </Tile>

              {/* ── Pricing ─────────────────────────────────────────────────── */}
              <Tile>
                <div className="sfx-between">
                  <h4 className="sfx-h sfx-h3">Growth plan</h4>
                  <span className="sfx-badge sfx-badge-primary">Popular</span>
                </div>
                <div className="sfx-tabs">
                  <span className="sfx-tab">Monthly</span>
                  <span className="sfx-tab" data-active="true">
                    Yearly
                  </span>
                </div>
                <div className="sfx-baseline">
                  <span className="sfx-stat-num">$39</span>
                  <span className="sfx-muted">/mo</span>
                </div>
                <div className="sfx-stack">
                  <Feature>Unlimited products</Feature>
                  <Feature>Custom domain &amp; SSL</Feature>
                  <Feature>Abandoned-cart recovery</Feature>
                </div>
                <button className="sfx-btn sfx-btn-accent sfx-btn-block" type="button">
                  Start free trial
                </button>
              </Tile>

              {/* ── Create account (inputs, selectors) ──────────────────────── */}
              <Tile title="Create your account">
                <div className="sfx-stack">
                  <span className="sfx-label">Email address</span>
                  <input
                    className="sfx-input"
                    placeholder="you@example.com"
                    readOnly
                    aria-label="Email address (preview)"
                  />
                </div>
                <div className="sfx-stack">
                  <span className="sfx-label">Password</span>
                  <input
                    className="sfx-input"
                    type="password"
                    value="supersecret"
                    readOnly
                    aria-label="Password (preview)"
                  />
                </div>
                <Opt
                  control={
                    <span className="sfx-check" data-on="true" aria-hidden>
                      ✓
                    </span>
                  }
                >
                  I agree to the terms
                </Opt>
                <Opt control={<span className="sfx-switch" data-on="true" aria-hidden />}>
                  Email me product updates
                </Opt>
                <button className="sfx-btn sfx-btn-primary sfx-btn-block" type="button">
                  Create account
                </button>
              </Tile>

              {/* ── Selectors (checkbox / radio / toggle states) ────────────── */}
              <Tile title="Choose a plan">
                <Opt control={<span className="sfx-radio" data-on="true" aria-hidden />}>
                  Standard shipping — Free
                </Opt>
                <Opt control={<span className="sfx-radio" aria-hidden />}>Express — $9</Opt>
                <Opt control={<span className="sfx-radio" aria-hidden />}>Same day — $19</Opt>
                <hr className="sfx-divider" />
                <Opt
                  control={
                    <span className="sfx-check" data-on="true" aria-hidden>
                      ✓
                    </span>
                  }
                >
                  Gift wrap
                </Opt>
                <Opt control={<span className="sfx-check" aria-hidden />}>Add a note</Opt>
                <div className="sfx-between">
                  <span>Save card for later</span>
                  <span className="sfx-switch" data-on="true" aria-hidden />
                </div>
              </Tile>

              {/* ── Price range (slider) ────────────────────────────────────── */}
              <Tile title="Price range">
                <div className="sfx-between">
                  <span className="sfx-muted">$0</span>
                  <span className="sfx-price">$120</span>
                  <span className="sfx-muted">$250</span>
                </div>
                <div className="sfx-slider">
                  <span className="sfx-slider-fill" style={{ width: '48%' }} />
                  <span className="sfx-slider-thumb" style={{ left: '48%' }} />
                </div>
                <div className="sfx-input-group">
                  <input
                    className="sfx-input"
                    placeholder="Search products"
                    readOnly
                    aria-label="Search (preview)"
                  />
                  <button className="sfx-btn sfx-btn-primary" type="button">
                    Find
                  </button>
                </div>
              </Tile>

              {/* ── Tabs + content ──────────────────────────────────────────── */}
              <Tile>
                <div className="sfx-tabs">
                  <span className="sfx-tab">Description</span>
                  <span className="sfx-tab" data-active="true">
                    Details
                  </span>
                  <span className="sfx-tab">Reviews</span>
                </div>
                <p className="sfx-body">
                  Midweight Italian wool, fully lined, with a relaxed drop shoulder. Dry clean only.
                </p>
                <div className="sfx-cluster">
                  <span className="sfx-pill" data-active="true">
                    S
                  </span>
                  <span className="sfx-pill">M</span>
                  <span className="sfx-pill">L</span>
                  <span className="sfx-pill">XL</span>
                </div>
              </Tile>

              {/* ── Chat ────────────────────────────────────────────────────── */}
              <Tile title="Support">
                <div className="sfx-chat sfx-chat-in">Hi! Does the wool coat run true to size?</div>
                <div className="sfx-chat sfx-chat-out">
                  It does — size up if you&rsquo;re between sizes.
                </div>
                <div className="sfx-chat sfx-chat-in">Perfect, ordering now. Thanks!</div>
              </Tile>

              {/* ── Onboarding steps ────────────────────────────────────────── */}
              <Tile title="Launch checklist">
                <Step state="done">Add your first product</Step>
                <Step state="done">Connect a payment provider</Step>
                <Step state="now">Pick a theme</Step>
                <Step state="todo">Connect your domain</Step>
                <Step state="todo">Go live</Step>
              </Tile>

              {/* ── Admin menu ──────────────────────────────────────────────── */}
              <Tile title="Admin">
                <nav className="sfx-menu">
                  <MenuItem active>Dashboard</MenuItem>
                  <MenuItem count="148">Products</MenuItem>
                  <MenuItem count="29">Messages</MenuItem>
                  <MenuItem count="7">Discounts</MenuItem>
                  <MenuItem>Settings</MenuItem>
                </nav>
              </Tile>

              {/* ── Post composer (textarea) ────────────────────────────────── */}
              <Tile title="Write a post">
                <div className="sfx-cluster">
                  <span className="sfx-badge sfx-badge-neutral">B</span>
                  <span className="sfx-badge sfx-badge-neutral">I</span>
                  <span className="sfx-badge sfx-badge-neutral">U</span>
                </div>
                <textarea
                  className="sfx-textarea"
                  placeholder="What's new with your store?"
                  readOnly
                  aria-label="Post body (preview)"
                />
                <div className="sfx-cluster">
                  <button className="sfx-btn sfx-btn-outline sfx-btn-sm" type="button">
                    Save draft
                  </button>
                  <button className="sfx-btn sfx-btn-primary sfx-btn-sm" type="button">
                    Publish
                  </button>
                </div>
              </Tile>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tile + small building blocks ───────────────────────────────────────────

function Tile({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="sfx-card sfx-tile">
      {title ? <span className="sfx-tile-title">{title}</span> : null}
      {children}
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <span className="sfx-cluster" style={{ fontSize: '0.82rem' }}>
      <span className="sfx-badge sfx-badge-success">✓</span>
      {children}
    </span>
  );
}

function Opt({ control, children }: { control: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="sfx-opt">
      {control}
      {children}
    </label>
  );
}

function OrderRow({
  name,
  tone,
  status,
}: {
  name: string;
  tone: 'success' | 'info' | 'warning' | 'danger';
  status: string;
}) {
  return (
    <div className="sfx-between" style={{ fontSize: '0.82rem' }}>
      <span>{name}</span>
      <span className={`sfx-badge sfx-badge-solid-${tone}`}>{status}</span>
    </div>
  );
}

function MenuItem({
  children,
  count,
  active,
}: {
  children: React.ReactNode;
  count?: string;
  active?: boolean;
}) {
  return (
    <span className="sfx-menu-item" data-active={active ? 'true' : 'false'}>
      {children}
      {count ? <span className="sfx-menu-count">{count}</span> : null}
    </span>
  );
}

function Ring({ percent }: { percent: number }) {
  return (
    <div
      className="sfx-ring"
      style={{
        background: `conic-gradient(var(--sf-success) ${percent}%, var(--sf-base-300) 0)`,
      }}
    >
      <span>{percent}</span>
    </div>
  );
}

function Step({ state, children }: { state: 'done' | 'now' | 'todo'; children: React.ReactNode }) {
  const mark = state === 'done' ? '✓' : state === 'now' ? '●' : '';
  return (
    <div className={`sfx-step sfx-step-${state}`}>
      <span className="sfx-step-dot" aria-hidden>
        {mark}
      </span>
      {children}
    </div>
  );
}
