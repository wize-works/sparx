// Token Model v2 → CSS custom properties (docs/33-token-model-v2.md §6).
//
// Emits the canonical `--sf-*` vocabulary from a compiled token set, plus:
//   • derived expressions (hover/active/tint, text tiers) as `color-mix(in
//     oklab …)` referencing the canonical base vars — no precompute needed,
//   • a `--sf-space-*` scale derived from `--sf-space-base`,
//   • depth-scaled shadow vars,
//   • LEGACY ALIASES (`--sf-bg`, `--sf-surface`, `--sf-radius`, …) mapping the
//     names today's storefront.css reads onto the canonical vars. The aliases
//     are `var()` references, so they follow each canonical var's per-mode
//     value automatically. §4 refactors storefront.css onto the canonical names
//     and these aliases go away.

import type { CompiledColorTokensV2, CompiledThemeV2, SharedTokensV2 } from './types';

// Named container widths → the CSS length they compile to (a raw length passes
// through unchanged).
const CONTAINER_WIDTHS: Record<string, string> = {
  narrow: '52rem',
  medium: '72rem',
  wide: '90rem',
  full: '100%',
};

// The --sf-space-N scale (Tailwind-aligned multiples of the base unit). Each is
// a calc() off --sf-space-base, so shifting the base reflows the whole site.
const SPACE_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24] as const;

function fontStack(name: string): string {
  return `'${name.replace(/'/g, '')}', var(--sf-font-fallback)`;
}

function containerLength(width: string): string {
  return CONTAINER_WIDTHS[width] ?? width;
}

/** Canonical per-mode color vars (base + every resolved `-content`). */
export function colorVars(c: CompiledColorTokensV2): Record<string, string> {
  return {
    '--sf-base-100': c.base100,
    '--sf-base-200': c.base200,
    '--sf-base-300': c.base300,
    '--sf-base-content': c.baseContent,
    '--sf-primary': c.primary,
    '--sf-primary-content': c.primaryContent,
    '--sf-secondary': c.secondary,
    '--sf-secondary-content': c.secondaryContent,
    '--sf-accent': c.accent,
    '--sf-accent-content': c.accentContent,
    '--sf-neutral': c.neutral,
    '--sf-neutral-content': c.neutralContent,
    '--sf-info': c.info,
    '--sf-info-content': c.infoContent,
    '--sf-success': c.success,
    '--sf-success-content': c.successContent,
    '--sf-warning': c.warning,
    '--sf-warning-content': c.warningContent,
    '--sf-danger': c.danger,
    '--sf-danger-content': c.dangerContent,
    '--sf-border': c.border,
  };
}

/** Shared (mode-independent) vars: type, shape, rhythm scale, depth, container,
 *  derived color expressions, and the legacy aliases. */
export function sharedVars(s: SharedTokensV2): Record<string, string> {
  const out: Record<string, string> = {
    // Type
    '--sf-font-heading': fontStack(s.fontHeading),
    '--sf-font-body': fontStack(s.fontBody),
    // Shape
    '--sf-radius-selector': s.radiusSelector,
    '--sf-radius-field': s.radiusField,
    '--sf-radius-box': s.radiusBox,
    '--sf-border-width': s.borderWidth,
    // Rhythm
    '--sf-space-base': s.spaceBase,
    '--sf-size-field': s.sizeField,
    '--sf-size-selector': s.sizeSelector,
    // Effect
    '--sf-depth': String(s.depth),
    // Layout
    '--sf-container': containerLength(s.containerWidth),
  };

  for (const n of SPACE_STEPS) {
    out[`--sf-space-${n}`] = `calc(var(--sf-space-base) * ${n})`;
  }

  // Derived color expressions (follow the per-mode canonical vars).
  out['--sf-primary-hover'] = 'color-mix(in oklab, var(--sf-primary) 86%, black)';
  out['--sf-primary-active'] = 'color-mix(in oklab, var(--sf-primary) 74%, black)';
  out['--sf-primary-tint'] = 'color-mix(in oklab, var(--sf-primary) 8%, transparent)';
  out['--sf-accent-tint'] = 'color-mix(in oklab, var(--sf-accent) 8%, transparent)';

  // Depth-scaled shadows (override storefront.css's hardcoded set).
  out['--sf-shadow-sm'] =
    '0 1px 2px rgb(0 0 0 / calc(0.04 * var(--sf-depth))), 0 1px 3px rgb(0 0 0 / calc(0.06 * var(--sf-depth)))';
  out['--sf-shadow-md'] =
    '0 4px 12px -2px rgb(0 0 0 / calc(0.08 * var(--sf-depth))), 0 2px 6px -2px rgb(0 0 0 / calc(0.05 * var(--sf-depth)))';
  out['--sf-shadow-lg'] = '0 18px 40px -12px rgb(0 0 0 / calc(0.18 * var(--sf-depth)))';

  // ── Legacy aliases (removed in §4) ──────────────────────────────────────
  out['--sf-bg'] = 'var(--sf-base-100)';
  out['--sf-surface'] = 'var(--sf-base-200)';
  out['--sf-bg-subtle'] = 'var(--sf-base-300)';
  out['--sf-text'] = 'var(--sf-base-content)';
  out['--sf-text-secondary'] =
    'color-mix(in oklab, var(--sf-base-content) 78%, var(--sf-base-100))';
  out['--sf-text-muted'] = 'color-mix(in oklab, var(--sf-base-content) 55%, var(--sf-base-100))';
  out['--sf-text-tertiary'] = 'color-mix(in oklab, var(--sf-base-content) 40%, var(--sf-base-100))';
  out['--sf-on-primary'] = 'var(--sf-primary-content)';
  out['--sf-border-strong'] = 'color-mix(in oklab, var(--sf-border), var(--sf-base-content) 35%)';
  out['--sf-radius'] = 'var(--sf-radius-box)';
  out['--sf-radius-sm'] = 'var(--sf-radius-field)';
  out['--sf-radius-lg'] = 'var(--sf-radius-box)';
  out['--sf-max'] = 'var(--sf-container)';

  return out;
}

/** Merged shared + one mode's colors — convenient for a single :root injection
 *  when dark mode isn't being split out. */
export function compiledToCssVars(
  compiled: CompiledThemeV2,
  mode: 'light' | 'dark'
): Record<string, string> {
  return { ...sharedVars(compiled.shared), ...colorVars(compiled[mode]) };
}

function declBlock(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join('');
}

export interface BuildThemeCssOptions {
  /** Selector for the light/shared block. Default `:root`. */
  rootSelector?: string;
}

/**
 * Build the full storefront theme stylesheet: shared + light at :root, dark
 * colors under an explicit `[data-theme="dark"]` opt-in AND the system
 * preference (unless the user forced light). Shared vars are emitted once.
 */
export function buildThemeCssV2(
  compiled: CompiledThemeV2,
  opts: BuildThemeCssOptions = {}
): string {
  const root = opts.rootSelector ?? ':root';
  const light = declBlock({ ...sharedVars(compiled.shared), ...colorVars(compiled.light) });
  const dark = declBlock(colorVars(compiled.dark));
  return [
    `${root}{${light}}`,
    `${root}[data-theme="dark"]{${dark}}`,
    `@media (prefers-color-scheme:dark){${root}:not([data-theme="light"]){${dark}}}`,
  ].join('');
}
