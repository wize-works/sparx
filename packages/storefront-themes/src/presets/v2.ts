// Token Model v2 preset defaults (docs/33-token-model-v2.md §3, build §2).
//
// One v2 default set per theme, carrying each preset's v1 identity (primary/
// accent/fonts/container/radius) forward and adding the v2 surface tiers
// (base-100/200/300), neutral fill, themeable status colors, the radius trio,
// rhythm scale, and depth. Lives alongside the v1 `tokenDefaults` until the
// read path cuts over (§3). Values are intentionally hand-tuned per theme
// personality; snapshot tests lock them so the visual defaults don't drift.

import type { ThemeKey } from '../types';
import type { ThemePresetV2 } from '../v2/types';

// Status colors are themeable in v2 but ship sensible cross-theme defaults
// (merchants/presets can override per slot). Dark variants are brightened for
// legibility on dark surfaces. `-content` pairs are auto-derived.
const STATUS_LIGHT = { info: '#0284c7', success: '#16a34a', warning: '#d97706', danger: '#dc2626' };
const STATUS_DARK = { info: '#38bdf8', success: '#4ade80', warning: '#fbbf24', danger: '#f87171' };

export const THEME_DEFAULTS_V2: Record<ThemeKey, ThemePresetV2> = {
  // ── Apex — clean, modern, versatile default ──────────────────────────────
  apex: {
    shared: {
      fontHeading: 'Inter',
      fontBody: 'Inter',
      radiusSelector: '9999px',
      radiusField: '0.375rem',
      radiusBox: '0.5rem',
      borderWidth: '1px',
      spaceBase: '0.25rem',
      sizeField: '2.75rem',
      sizeSelector: '2rem',
      depth: 1,
      containerWidth: 'medium',
    },
    light: {
      base100: '#ffffff',
      base200: '#f8fafc',
      base300: '#eef2f7',
      baseContent: '#0f172a',
      primary: '#4f46e5',
      primaryContent: '#ffffff',
      secondary: '#14b8a6',
      accent: '#0ea5e9',
      neutral: '#0f172a',
      border: '#e2e8f0',
      ...STATUS_LIGHT,
    },
    dark: {
      base100: '#0b1120',
      base200: '#111827',
      base300: '#1b2538',
      baseContent: '#e2e8f0',
      primary: '#5b57ef',
      primaryContent: '#ffffff',
      secondary: '#2dd4bf',
      accent: '#38bdf8',
      neutral: '#e2e8f0',
      border: '#1f2937',
      ...STATUS_DARK,
    },
  },

  // ── Industrial — bold, high-contrast, technical (Gillett reference) ──────
  industrial: {
    shared: {
      fontHeading: 'Oswald',
      fontBody: 'Inter',
      radiusSelector: '0.125rem',
      radiusField: '0.125rem',
      radiusBox: '0.125rem',
      borderWidth: '2px',
      spaceBase: '0.25rem',
      sizeField: '2.875rem',
      sizeSelector: '2.125rem',
      depth: 0.6,
      containerWidth: 'wide',
    },
    light: {
      base100: '#ffffff',
      base200: '#fafafa',
      base300: '#f4f4f5',
      baseContent: '#18181b',
      primary: '#cc1010',
      primaryContent: '#ffffff',
      secondary: '#475569',
      accent: '#f59e0b',
      neutral: '#18181b',
      border: '#d4d4d8',
      ...STATUS_LIGHT,
    },
    dark: {
      base100: '#0a0a0a',
      base200: '#141414',
      base300: '#1f1f22',
      baseContent: '#fafafa',
      primary: '#dc2626',
      primaryContent: '#ffffff',
      secondary: '#64748b',
      accent: '#fbbf24',
      neutral: '#fafafa',
      border: '#27272a',
      ...STATUS_DARK,
    },
  },

  // ── Drift — editorial, image-forward, minimal ────────────────────────────
  drift: {
    shared: {
      fontHeading: 'Playfair Display',
      fontBody: 'Inter',
      radiusSelector: '0px',
      radiusField: '0px',
      radiusBox: '0px',
      borderWidth: '1px',
      spaceBase: '0.28rem',
      sizeField: '2.875rem',
      sizeSelector: '2.125rem',
      depth: 0.4,
      containerWidth: 'wide',
    },
    light: {
      base100: '#fafafa',
      base200: '#ffffff',
      base300: '#f0ede8',
      baseContent: '#1a1a1a',
      primary: '#111111',
      primaryContent: '#ffffff',
      secondary: '#6b7280',
      accent: '#b08968',
      neutral: '#1a1a1a',
      border: '#e5e0d8',
      ...STATUS_LIGHT,
    },
    dark: {
      base100: '#141414',
      base200: '#1c1c1c',
      base300: '#262626',
      baseContent: '#f0f0f0',
      primary: '#f5f5f5',
      primaryContent: '#111111',
      secondary: '#9ca3af',
      accent: '#c9a27e',
      neutral: '#f0f0f0',
      border: '#2a2a2a',
      ...STATUS_DARK,
    },
  },

  // ── Market — warm, artisan, community ────────────────────────────────────
  market: {
    shared: {
      fontHeading: 'Fraunces',
      fontBody: 'Nunito Sans',
      radiusSelector: '9999px',
      radiusField: '0.5rem',
      radiusBox: '0.75rem',
      borderWidth: '1px',
      spaceBase: '0.26rem',
      sizeField: '2.75rem',
      sizeSelector: '2rem',
      depth: 1.1,
      containerWidth: 'medium',
    },
    light: {
      base100: '#fffdf7',
      base200: '#fffdfa',
      base300: '#f5ecd9',
      baseContent: '#3a2e1f',
      primary: '#b45309',
      primaryContent: '#fffaf0',
      secondary: '#9a3412',
      accent: '#65a30d',
      neutral: '#3a2e1f',
      border: '#e7d8b8',
      ...STATUS_LIGHT,
    },
    dark: {
      base100: '#1a1206',
      base200: '#221608',
      base300: '#2e2010',
      baseContent: '#f5ecd9',
      primary: '#d97706',
      primaryContent: '#1a1206',
      secondary: '#c2410c',
      accent: '#84cc16',
      neutral: '#f5ecd9',
      border: '#3a2a14',
      ...STATUS_DARK,
    },
  },

  // ── Fleet — data-dense, professional, dashboard-like ─────────────────────
  fleet: {
    shared: {
      fontHeading: 'IBM Plex Sans',
      fontBody: 'IBM Plex Sans',
      radiusSelector: '0.25rem',
      radiusField: '0.25rem',
      radiusBox: '0.25rem',
      borderWidth: '1px',
      spaceBase: '0.22rem',
      sizeField: '2.5rem',
      sizeSelector: '1.875rem',
      depth: 0.5,
      containerWidth: 'full',
    },
    light: {
      base100: '#ffffff',
      base200: '#f8fafc',
      base300: '#eef2f7',
      baseContent: '#0f172a',
      primary: '#1d4ed8',
      primaryContent: '#ffffff',
      secondary: '#0e7490',
      accent: '#0891b2',
      neutral: '#0f172a',
      border: '#cbd5e1',
      ...STATUS_LIGHT,
    },
    dark: {
      base100: '#0f172a',
      base200: '#172033',
      base300: '#1e293b',
      baseContent: '#e2e8f0',
      primary: '#2563eb',
      primaryContent: '#ffffff',
      secondary: '#06b6d4',
      accent: '#22d3ee',
      neutral: '#e2e8f0',
      border: '#334155',
      ...STATUS_DARK,
    },
  },

  // ── Drop — bright, punchy, grid-first ────────────────────────────────────
  drop: {
    shared: {
      fontHeading: 'Poppins',
      fontBody: 'Inter',
      radiusSelector: '9999px',
      radiusField: '0.625rem',
      radiusBox: '1rem',
      borderWidth: '1px',
      spaceBase: '0.25rem',
      sizeField: '2.875rem',
      sizeSelector: '2.125rem',
      depth: 1.3,
      containerWidth: 'wide',
    },
    light: {
      base100: '#ffffff',
      base200: '#faf9fc',
      base300: '#f3f0f7',
      baseContent: '#18181b',
      primary: '#7c3aed',
      primaryContent: '#ffffff',
      secondary: '#06b6d4',
      accent: '#ec4899',
      neutral: '#18181b',
      border: '#e4e4e7',
      ...STATUS_LIGHT,
    },
    dark: {
      base100: '#0c0a13',
      base200: '#131019',
      base300: '#1d1827',
      baseContent: '#ededf0',
      primary: '#7c3aed',
      primaryContent: '#ffffff',
      secondary: '#22d3ee',
      accent: '#f472b6',
      neutral: '#ededf0',
      border: '#272233',
      ...STATUS_DARK,
    },
  },
};

export const DEFAULT_THEME_KEY_V2: ThemeKey = 'apex';

/** Resolve a theme key to its v2 defaults, falling back to apex for an unknown
 *  key (mirrors the v1 getTheme contract). */
export function getThemePresetV2(key: string): ThemePresetV2 {
  return THEME_DEFAULTS_V2[key as ThemeKey] ?? THEME_DEFAULTS_V2[DEFAULT_THEME_KEY_V2];
}

export const THEME_KEYS_V2: ThemeKey[] = ['apex', 'industrial', 'drift', 'market', 'fleet', 'drop'];
